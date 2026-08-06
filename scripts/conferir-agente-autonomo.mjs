/**
 * Confere o agente que decide olhando — e, principalmente, onde ele PARA.
 *
 * O motor anterior seguia uma lista escrita antes de começar. Este decide a próxima ação a cada
 * volta, com a foto da janela à frente. Isso resolve o problema que motivou a mudança (um passo
 * que faltava no plano fazia a tarefa parar no meio) e cria um problema novo, que é o que a maior
 * parte destes casos vigia: um agente que decide sozinho pode decidir errado sozinho, em laço,
 * rápido, no computador de alguém.
 *
 * Os três grupos de caso, em ordem de importância:
 *
 *   1. AS TRAVAS — dinheiro, arquivo e terminal são recusados ANTES de tocar na máquina, pela
 *      mesma função que o plano fixo usa (validarPasso). Se a aba nova tivesse ganhado uma
 *      validação própria, seria aqui que apareceria.
 *   2. OS FREIOS — repetição, falhas seguidas, teto de ações, teto de tempo e o botão de parar.
 *      Um laço autônomo sem eles não é uma automação, é um acidente com testemunha.
 *   3. O COMPORTAMENTO QUE JUSTIFICA A MUDANÇA — que uma falha volta para o modelo e ele tenta
 *      outro caminho, e que "a tela não mudou" informa a decisão seguinte em vez de encerrar a
 *      tarefa. Sem estes dois, trocar o plano fixo por este laço não teria valido nada.
 *
 * Como rodar:
 *   node scripts/conferir-agente-autonomo.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-agente-'));
const saida = path.join(pastaTemp, 'agente.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/agenteAutonomo.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { trabalharAteConcluir, lerDecisao, LIMITES_DO_AGENTE, INSTRUCAO_DO_AGENTE } =
  await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

/**
 * Um computador de mentira, com o mínimo para o laço rodar de verdade.
 *
 * A tela muda quando uma ação é executada e fica parada quando não é — as duas metades importam.
 * Uma tela que muda sempre faria a espera nunca terminar; uma que nunca muda faria toda ação
 * parecer sem efeito. Assim a conferência por foto do motor se comporta como numa tela real.
 */
function computadorDeMentira(opcoes = {}) {
  const estado = {
    executadas: [],
    decisoesPedidas: [],
    janelaAtual: 'Navegador',
    tempo: 0,
    tela: 0
  };
  const assinatura = () => Uint8Array.from({ length: 16 }, (_, i) => (estado.tela * 37 + i * 5) % 256);

  return {
    estado,
    deps: {
      agora: () => (estado.tempo += 10),
      dormir: async () => { estado.tempo += 10; },
      fotografar: async () => assinatura(),
      fotografarJanela: async () => `data:image/png;base64,FOTO-${estado.tela}`,
      cancelado: () => !!opcoes.cancelado?.(estado),
      trocarJanela: async (titulo) => {
        const r = opcoes.trocarJanela ? opcoes.trocarJanela(titulo, estado) : { titulo };
        if (!r.error) estado.janelaAtual = r.titulo;
        return r;
      },
      executar: async (acao, args) => {
        estado.executadas.push({ acao, args });
        const r = opcoes.executar ? opcoes.executar(acao, args, estado) : { success: true };
        // Ação que deu certo mexe na tela; ação que falhou, não.
        if (!r?.error && !opcoes.telaNaoMuda) estado.tela++;
        return r;
      },
      decidir: async (objetivo, foto, historico) => {
        estado.decisoesPedidas.push({ objetivo, foto, historico: historico.map(h => ({ ok: h.ok, relato: h.relato })) });
        return opcoes.decidir(estado, historico);
      }
    }
  };
}

/** Uma lista de decisões, devolvidas em ordem; a última se repete se o laço pedir mais. */
const roteiro = (...decisoes) => {
  let i = 0;
  return () => JSON.stringify(decisoes[Math.min(i++, decisoes.length - 1)]);
};

const decisao = (acao, args, pensamento = `Vou ${acao}`) => ({ acao, args, pensamento, esperaDaTela: 'mudar' });

// ============================================================================
// 1) A LEITURA DA DECISÃO
// ============================================================================
{
  const boa = lerDecisao(JSON.stringify(decisao('clicar', { alvo: 'o botão Entrar' }, 'Vejo o botão Entrar no meio da tela')));
  registrar('uma decisão bem formada é lida com ação, argumentos e motivo',
    boa.decisao?.acao === 'clicar' && boa.decisao?.args?.alvo === 'o botão Entrar' && !!boa.decisao?.pensamento,
    boa.decisao?.pensamento);

  const comCerca = lerDecisao('```json\n{"acao":"tecla","args":{"tecla":"enter"},"pensamento":"O campo está preenchido"}\n```');
  registrar('o JSON dentro de cerca de markdown é lido normalmente',
    comCerca.decisao?.acao === 'tecla', 'a cerca não atrapalha');

  const comConversa = lerDecisao('Claro! Aqui vai:\n{"acao":"rolar","args":{"direcao":"down"},"pensamento":"Preciso ver mais abaixo"}\nEspero ter ajudado.');
  registrar('o objeto é achado mesmo com conversa em volta',
    comConversa.decisao?.acao === 'rolar', 'o modelo falante não trava o laço');

  const semMotivo = lerDecisao(JSON.stringify({ acao: 'clicar', args: {} }));
  registrar('decisão sem motivo escrito é recusada',
    !semMotivo.decisao && /sem dizer por quê/.test(semMotivo.problema || ''),
    'o motivo é o que o usuário lê enquanto ele trabalha');

  const ruins = ['', '   ', 'não sei o que fazer', '{"acao":'];
  registrar('resposta ruim do modelo vira explicação, não decisão pela metade',
    ruins.every(t => { const r = lerDecisao(t); return !r.decisao && (r.problema || '').length > 20; }),
    `${ruins.length} formatos ruins, todos com motivo escrito`);
}

// ============================================================================
// 2) O CAMINHO FELIZ, E A RESPOSTA QUE A TAREFA PEDIA
// ============================================================================
{
  const { estado, deps } = computadorDeMentira({
    decidir: roteiro(
      decisao('abrir', { caminho: 'https://studio.youtube.com' }, 'Preciso abrir o Studio primeiro'),
      decisao('clicar', { alvo: 'a aba Análises' }, 'Vejo o menu da esquerda com Análises'),
      decisao('concluir', { resposta: 'O gráfico dos últimos 28 dias mostra 12.400 visualizações, alta de 18%.' }, 'Li o gráfico na tela')
    )
  });

  const r = await trabalharAteConcluir('analisar o gráfico do meu canal', deps);

  registrar('a tarefa termina quando o agente diz que terminou',
    r.motivo === 'concluido', r.motivo);

  registrar('a RESPOSTA lida da tela é o resultado, não um detalhe do registro',
    r.resumo.includes('12.400 visualizações'), r.resumo.slice(0, 60));

  registrar('cada volta guarda o motivo em português, para o relatório',
    r.voltas.every(v => v.pensamento && v.pensamento.length > 3),
    r.voltas.map(v => v.acao).join(' → '));

  registrar('só as ações de mexer no computador foram executadas',
    estado.executadas.map(e => e.acao).join(',') === 'abrir,clicar',
    `executadas: ${estado.executadas.map(e => e.acao).join(', ')}`);
}

// ============================================================================
// 3) DECIDE OLHANDO: A FOTO ATUAL VAI EM TODA RODADA
// ============================================================================
{
  const { estado, deps } = computadorDeMentira({
    decidir: roteiro(
      decisao('clicar', { alvo: 'x' }, 'primeira'),
      decisao('clicar', { alvo: 'y' }, 'segunda'),
      decisao('concluir', { resposta: 'pronto' }, 'terminei')
    )
  });
  await trabalharAteConcluir('tarefa', deps);

  const fotos = estado.decisoesPedidas.map(d => d.foto);
  registrar('toda decisão recebe uma foto',
    fotos.every(f => typeof f === 'string' && f.startsWith('data:image')), `${fotos.length} decisões, ${fotos.length} fotos`);

  registrar('a foto de cada rodada é NOVA, e não a mesma reaproveitada',
    new Set(fotos).size === fotos.length, fotos.join(' '));

  registrar('o objetivo vai inteiro em toda rodada, e não só na primeira',
    estado.decisoesPedidas.every(d => d.objetivo === 'tarefa'), 'o alvo não se perde no meio');
}

// ============================================================================
// 4) O QUE JUSTIFICA A MUDANÇA: UMA FALHA VOLTA E ELE TENTA OUTRO CAMINHO
// ============================================================================
// Este é o caso que o plano fixo não tinha como passar: lá, o passo falho encerrava a execução.
{
  let tentativas = 0;
  const { estado, deps } = computadorDeMentira({
    executar: (acao, args) => {
      if (acao === 'clicar' && args.alvo === 'o botão que não existe') {
        tentativas++;
        return { error: 'Não achei "o botão que não existe" nesta janela.' };
      }
      return { success: true };
    },
    decidir: (estadoAtual, historico) => {
      // O agente "vê" a falha no histórico e muda de caminho — como o modelo faria.
      const falhou = historico.some(h => !h.ok);
      if (!falhou) return JSON.stringify(decisao('clicar', { alvo: 'o botão que não existe' }, 'Vou tentar pelo botão'));
      if (historico.length < 3) return JSON.stringify(decisao('abrir', { caminho: 'https://exemplo/atalho' }, 'O botão não estava lá; vou pelo endereço direto'));
      return JSON.stringify(decisao('concluir', { resposta: 'Cheguei pelo outro caminho.' }, 'Consegui'));
    }
  });

  const r = await trabalharAteConcluir('chegar lá', deps);

  registrar('uma ação que falha NÃO encerra a tarefa',
    r.motivo === 'concluido', r.motivo);

  registrar('a falha volta para o modelo, que muda de caminho',
    estado.executadas.some(e => e.acao === 'abrir' && e.args.caminho.includes('atalho')),
    `tentou o botão ${tentativas}x e depois foi pelo endereço`);

  const viuAFalha = estado.decisoesPedidas.some(d => d.historico.some(h => !h.ok));
  registrar('o histórico entregue ao modelo marca o que falhou',
    viuAFalha, 'ele decide sabendo o que não funcionou');
}

// ============================================================================
// 5) "A TELA NÃO MUDOU" INFORMA A PRÓXIMA DECISÃO, EM VEZ DE ENCERRAR
// ============================================================================
// O motor de plano fixo para aqui, e está certo: lá os passos seguintes foram escritos supondo
// que este pegou. Aqui a próxima ação ainda vai ser decidida olhando — parar seria jogar fora
// justamente a capacidade que este laço tem a mais.
{
  const { deps } = computadorDeMentira({
    telaNaoMuda: true,
    decidir: roteiro(
      decisao('clicar', { alvo: 'algo' }, 'tentando'),
      decisao('clicar', { alvo: 'outra coisa' }, 'a tela não mudou, vou tentar outro alvo'),
      decisao('concluir', { resposta: 'feito' }, 'agora sim')
    )
  });
  const r = await trabalharAteConcluir('tarefa', deps);

  registrar('clique que não muda a tela não encerra a tarefa',
    r.motivo === 'concluido', r.motivo);

  registrar('o relatório diz que a tela não mudou, para explicar a decisão seguinte',
    r.voltas.some(v => /não mudou/i.test(v.relato)),
    r.voltas.map(v => v.relato).find(t => /não mudou/i.test(t)) || '(não disse)');
}

// ============================================================================
// 6) AS TRAVAS: DINHEIRO E TERMINAL
// ============================================================================
{
  const { estado, deps } = computadorDeMentira({
    decidir: roteiro(decisao('clicar', { alvo: 'o botão' }, 'Vou finalizar a compra no cartão'))
  });
  const r = await trabalharAteConcluir('comprar', deps);

  registrar('uma ação com dinheiro encerra o laço antes de executar',
    r.motivo === 'acao-recusada' && estado.executadas.length === 0,
    `${estado.executadas.length} ação(ões) executadas`);

  registrar('a recusa de dinheiro diz que quem paga é a pessoa',
    /quem paga é a pessoa/i.test(r.resumo), r.resumo.slice(0, 70));

  registrar('a recusa entra no relatório, e não some em silêncio',
    r.voltas.length === 1 && !r.voltas[0].ok, 'a linha da recusa aparece na tela');
}

{
  const foraDoLaco = ['terminal', 'apagar', 'mover', 'escrever_arquivo', 'renomear'];
  const recusadas = [];
  for (const acao of foraDoLaco) {
    const { estado, deps } = computadorDeMentira({
      decidir: roteiro(decisao(acao, { caminho: '/tmp/x' }, 'mexer no arquivo'))
    });
    const r = await trabalharAteConcluir('tarefa', deps);
    if (r.motivo === 'acao-recusada' && estado.executadas.length === 0) recusadas.push(acao);
  }
  registrar('arquivo e terminal continuam fora do laço automático',
    recusadas.length === foraDoLaco.length, `${recusadas.length}/${foraDoLaco.length} recusadas`);
}

{
  // A menção a dinheiro nos ARGUMENTOS, com o motivo escrito limpo — quem tentasse contornar
  // escreveria assim.
  const { estado, deps } = computadorDeMentira({
    decidir: roteiro(decisao('digitar', { texto: 'minha chave pix é 123' }, 'Preencher o campo'))
  });
  const r = await trabalharAteConcluir('tarefa', deps);
  registrar('dinheiro escondido nos argumentos também é pego',
    r.motivo === 'acao-recusada' && estado.executadas.length === 0, 'o motivo limpo não salva a ação');
}

// ============================================================================
// 7) OS FREIOS
// ============================================================================
{
  // Preso: decide sempre a mesma coisa e a tela nunca avança.
  const { estado, deps } = computadorDeMentira({
    telaNaoMuda: true,
    decidir: roteiro(decisao('clicar', { alvo: 'o mesmo botão' }, 'clicando de novo'))
  });
  const r = await trabalharAteConcluir('tarefa', deps);

  registrar('repetir a mesma decisão sem avançar encerra o laço',
    r.motivo === 'repeticao', r.motivo);

  registrar('a repetição para em poucas voltas, e não só no teto de ações',
    estado.executadas.length <= LIMITES_DO_AGENTE.maxRepeticoes + 1,
    `${estado.executadas.length} ações antes de parar (teto de ações é ${LIMITES_DO_AGENTE.maxPassos})`);

  registrar('a mensagem da repetição diz o que ele estava tentando',
    /clicando de novo/.test(r.resumo), r.resumo.slice(0, 80));
}

{
  // Sempre falhando, sempre diferente: o freio aqui é o de falhas seguidas.
  let n = 0;
  const { estado, deps } = computadorDeMentira({
    executar: () => ({ error: 'não deu' }),
    decidir: roteiro(
      decisao('clicar', { alvo: 'a' }, 'tentativa 1'),
      decisao('clicar', { alvo: 'b' }, 'tentativa 2'),
      decisao('clicar', { alvo: 'c' }, 'tentativa 3'),
      decisao('clicar', { alvo: 'd' }, 'tentativa 4')
    )
  });
  const r = await trabalharAteConcluir('tarefa', deps);
  registrar('falhas seguidas encerram o laço',
    r.motivo === 'falhas-seguidas' && estado.executadas.length === LIMITES_DO_AGENTE.maxFalhasSeguidas,
    `parou em ${estado.executadas.length} falhas (teto ${LIMITES_DO_AGENTE.maxFalhasSeguidas})`);
}

{
  // Nunca conclui, sempre diferente, sempre dando certo: sobra o teto de ações.
  let n = 0;
  const { estado, deps } = computadorDeMentira({
    decidir: () => JSON.stringify(decisao('clicar', { alvo: `alvo ${n++}` }, `passo ${n}`))
  });
  const r = await trabalharAteConcluir('tarefa sem fim', deps);
  registrar('o teto de ações encerra uma tarefa que não termina',
    r.motivo === 'teto-de-voltas' && estado.executadas.length === LIMITES_DO_AGENTE.maxPassos,
    `${estado.executadas.length} ações (teto ${LIMITES_DO_AGENTE.maxPassos})`);

  registrar('o teto conta o que foi feito em vez de sumir sem explicação',
    /relatório/i.test(r.resumo), r.resumo.slice(0, 70));
}

{
  // O relógio anda depressa: o teto de tempo pega antes do de ações.
  let n = 0;
  const computador = computadorDeMentira({
    decidir: () => JSON.stringify(decisao('clicar', { alvo: `alvo ${n++}` }, `passo ${n}`))
  });
  computador.deps.agora = () => (computador.estado.tempo += 40000);
  const r = await trabalharAteConcluir('tarefa longa', computador.deps);
  registrar('o teto de tempo encerra uma tarefa que se arrasta',
    r.motivo === 'teto-de-tempo', `${r.motivo} em ${Math.round(r.duracaoTotalMs / 1000)}s simulados`);
}

{
  // O botão de parar do usuário, apertado no meio.
  let voltas = 0;
  const computador = computadorDeMentira({
    cancelado: (estado) => estado.executadas.length >= 2,
    decidir: () => JSON.stringify(decisao('clicar', { alvo: `alvo ${voltas++}` }, `passo ${voltas}`))
  });
  const r = await trabalharAteConcluir('tarefa', computador.deps);
  registrar('o botão de parar interrompe o laço na hora',
    r.motivo === 'parado-pelo-usuario' && computador.estado.executadas.length === 2,
    `${computador.estado.executadas.length} ações antes da parada`);
}

{
  // O modelo respondendo lixo: o laço não fica pedindo para sempre.
  const { estado, deps } = computadorDeMentira({ decidir: () => 'não entendi o pedido' });
  const r = await trabalharAteConcluir('tarefa', deps);
  registrar('resposta ilegível do modelo, repetida, encerra o laço',
    r.motivo === 'sem-decisao' && estado.executadas.length === 0,
    `${estado.decisoesPedidas.length} tentativas, nenhuma ação executada`);
}

// ============================================================================
// 8) TROCAR DE JANELA É DECISÃO DELE
// ============================================================================
{
  const { estado, deps } = computadorDeMentira({
    trocarJanela: (titulo) => titulo.includes('Studio') ? { titulo: 'YouTube Studio' } : { error: `Não achei janela com "${titulo}".` },
    decidir: roteiro(
      decisao('abrir', { caminho: 'https://studio.youtube.com' }, 'Abrindo o Studio'),
      decisao('trocar_janela', { tituloContem: 'Studio' }, 'Agora preciso olhar a janela que abriu'),
      decisao('concluir', { resposta: 'estou na janela certa' }, 'pronto')
    )
  });
  const r = await trabalharAteConcluir('ir para o Studio', deps);

  registrar('o agente troca de janela sozinho depois de abrir algo',
    r.motivo === 'concluido' && estado.janelaAtual === 'YouTube Studio', estado.janelaAtual);

  registrar('a troca de janela aparece no relatório',
    r.voltas.some(v => v.acao === 'trocar_janela' && /YouTube Studio/.test(v.relato)),
    r.voltas.find(v => v.acao === 'trocar_janela')?.relato);
}

{
  const { deps } = computadorDeMentira({
    trocarJanela: () => ({ error: 'Não achei nenhuma janela com "Planilha" no título. Abertas agora: Navegador' }),
    decidir: roteiro(
      decisao('trocar_janela', { tituloContem: 'Planilha' }, 'preciso da planilha'),
      decisao('trocar_janela', { tituloContem: 'Planilha' }, 'tentando de novo')
    )
  });
  const r = await trabalharAteConcluir('tarefa', deps);
  registrar('janela que não existe vira erro explicado, com as abertas listadas',
    /Abertas agora/.test(r.resumo) || r.voltas.some(v => /Abertas agora/.test(v.relato)),
    'a pessoa vê o que ele procurou e o que havia');
}

// ============================================================================
// 9) ABRIR TRÊS ABAS DO MESMO SITE — O ERRO QUE ACONTECEU DE VERDADE
// ============================================================================
// Relato de uso: pedido "analise uma coisa no YouTube", o agente abriu TRÊS abas do YouTube sem
// fazer mais nada. O mecanismo: ele manda abrir, a foto seguinte ainda é da janela anterior (a
// nova acabou de nascer), ele conclui que não pegou, e manda abrir de novo. E de novo.
{
  const { estado, deps } = computadorDeMentira({
    decidir: roteiro(
      decisao('abrir', { caminho: 'https://youtube.com' }, 'Vou abrir o YouTube'),
      decisao('abrir', { caminho: 'https://youtube.com' }, 'Acho que não abriu, vou abrir de novo'),
      decisao('abrir', { caminho: 'https://youtube.com' }, 'Ainda não vejo, abrindo mais uma vez'),
      decisao('concluir', { resposta: 'pronto' }, 'agora vi')
    )
  });
  const r = await trabalharAteConcluir('analisar uma coisa no YouTube', deps);

  const aberturas = estado.executadas.filter(e => e.acao === 'abrir').length;
  registrar('o mesmo endereço é aberto UMA vez, por mais que ele insista',
    aberturas === 1, `${aberturas} abertura(s) para 3 decisões de abrir`);

  registrar('a insistência vira aviso no relatório, e não uma aba nova',
    r.voltas.filter(v => v.acao === 'abrir' && /JÁ ESTÁ ABERTO/.test(v.relato || '')).length === 2,
    'as duas repetições foram recusadas com explicação');

  registrar('a recusa de reabrir não encerra a tarefa',
    r.motivo === 'concluido', `${r.motivo} — ele segue e termina`);

  registrar('o aviso diz o que fazer no lugar de abrir de novo',
    r.voltas.some(v => /trocar_janela/.test(v.relato || '')),
    'aponta para olhar a janela certa');
}

{
  // Endereços DIFERENTES continuam podendo ser abertos: a trava é contra repetir, não contra abrir.
  const { estado, deps } = computadorDeMentira({
    decidir: roteiro(
      decisao('abrir', { caminho: 'https://youtube.com' }, 'primeiro site'),
      decisao('abrir', { caminho: 'https://studio.youtube.com' }, 'agora o Studio'),
      decisao('concluir', { resposta: 'ok' }, 'pronto')
    )
  });
  await trabalharAteConcluir('tarefa', deps);
  registrar('abrir coisas diferentes continua permitido',
    estado.executadas.filter(e => e.acao === 'abrir').length === 2,
    'a trava é contra repetir o mesmo, não contra abrir');
}

{
  // Uma abertura que FALHOU pode ser tentada de novo: ela não abriu nada.
  let vezes = 0;
  const { estado, deps } = computadorDeMentira({
    executar: (acao) => (acao === 'abrir' && ++vezes === 1) ? { error: 'programa não encontrado' } : { success: true },
    decidir: roteiro(
      decisao('abrir', { caminho: 'meu-app' }, 'abrindo'),
      decisao('abrir', { caminho: 'meu-app' }, 'falhou, tentando outra vez'),
      decisao('concluir', { resposta: 'ok' }, 'pronto')
    )
  });
  await trabalharAteConcluir('tarefa', deps);
  registrar('uma abertura que falhou pode ser tentada de novo',
    estado.executadas.filter(e => e.acao === 'abrir').length === 2,
    'só conta como aberto o que abriu mesmo');
}

// ============================================================================
// 10) A INSTRUÇÃO CONTA AS REGRAS QUE O CÓDIGO APLICA
// ============================================================================
{
  const t = INSTRUCAO_DO_AGENTE.toLowerCase();
  registrar('a instrução manda decidir UMA ação por vez, olhando a foto',
    t.includes('uma única próxima ação') && t.includes('foto'),
    'nada de plano escrito de antemão');

  registrar('a instrução avisa das travas que o código aplica',
    t.includes('dinheiro nunca') && t.includes('terminal') && t.includes('pensamento'),
    'dinheiro, terminal e motivo obrigatório estão lá');

  registrar('a instrução proíbe coordenada chutada no clique',
    t.includes('nunca passe x/y'), 'a posição é medida na hora, não escrita de memória');

  registrar('a instrução exige LER a informação antes de concluir',
    t.includes('concluir sem a informação'), 'tarefa de descobrir só acaba com a resposta na mão');

  registrar('a instrução avisa para abrir cada coisa uma vez só',
    t.includes('abra cada coisa uma vez só') && t.includes('nunca mande abrir de novo'),
    'a regra que o código aplica também está escrita para o modelo');
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
