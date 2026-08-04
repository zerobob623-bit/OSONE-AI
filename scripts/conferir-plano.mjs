/**
 * Confere o motor que executa uma sequência de passos no computador sozinho.
 *
 * O pedido era: o agente planeja a tarefa, e a cada clique calcula quanto tempo o próximo vai
 * levar para carregar, em laço, até concluir sem perguntar passo a passo. O que este conferidor
 * mede é justamente isso — e, principalmente, ONDE O LAÇO PARA.
 *
 * Um laço que clica sozinho no computador de alguém não pode ter só o caminho feliz. Um plano
 * escrito sobre uma suposição errada não erra uma vez: erra em laço, rápido, e cada erro muda a
 * tela de um jeito que o passo seguinte não previu. Metade dos casos aqui é sobre parar.
 *
 * O motor é puro e recebe relógio, sono e tela por parâmetro, então tudo abaixo roda determinístico
 * e em milissegundos — sem navegador e sem mexer em computador nenhum.
 *
 * Como rodar:
 *   node scripts/conferir-plano.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-plano-'));
const saida = path.join(pastaTemp, 'plano.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/planoDeAcoes.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { executarPlano, validarPlano, LIMITES_PADRAO, acharMencaoADinheiro } = await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

/**
 * Um computador de mentira com relógio controlado.
 *
 * `carregamentos` diz quanto tempo CADA passo leva para a tela parar de mudar. É esse número que o
 * motor precisa descobrir sozinho, medindo — ele nunca o recebe.
 */
function criarComputador({ carregamentos = {}, falharNoPasso = -1, telaNaoMudaNoPasso = -1,
                          falharAteATentativa = Infinity, naoMudarAteATentativa = Infinity } = {}) {
  let t = 1_000_000;
  let passo = -1;
  let mudaAte = 0;
  let versaoDaTela = 0;
  const executados = [];
  // Tentativas por passo: é o que separa "este passo falhou" de "este passo falhou DE NOVO", e
  // sem essa distinção não dá para testar o novo comportamento de tentar outra vez.
  const tentativasPorPasso = {};

  const deps = {
    agora: () => t,
    dormir: async (ms) => { t += ms; },
    fotografar: async () => {
      // A assinatura muda enquanto a tela "carrega"; depois disso ela fica igual, e é essa
      // igualdade entre duas fotos seguidas que o motor usa para saber que acabou.
      //
      // Os bytes são espalhados por um gerador semeado pela marca, e não derivados letra a letra
      // dela: com derivação direta, "parada-0" e "parada-1" diferiam num único byte de dezesseis,
      // e o motor lia isso como "a tela mal mudou" — a tela de mentira é que era parecida demais
      // consigo mesma, e não o motor que estava errado.
      const marca = t < mudaAte ? `carregando-${t}` : `parada-${versaoDaTela}`;
      let semente = 0;
      for (let i = 0; i < marca.length; i++) semente = (semente * 31 + marca.charCodeAt(i)) >>> 0;
      const a = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        semente = (semente * 1664525 + 1013904223) >>> 0;
        a[i] = semente % 256;
      }
      return a;
    },
    executar: async (acao, args) => {
      // Um passo novo começa quando a descrição muda; repetições do mesmo passo não avançam.
      const chave = JSON.stringify({ acao, args });
      if (executados.length === 0 || executados[executados.length - 1].chave !== chave) passo++;
      tentativasPorPasso[passo] = (tentativasPorPasso[passo] || 0) + 1;
      const tentativa = tentativasPorPasso[passo];
      executados.push({ acao, args, chave, passo, tentativa });
      t += 30; // a ida ao agente local

      if (passo === falharNoPasso && tentativa <= falharAteATentativa) {
        return { error: 'o agente local recusou a ação' };
      }
      const telaFicaParada = passo === telaNaoMudaNoPasso && tentativa <= naoMudarAteATentativa;
      if (!telaFicaParada) {
        versaoDaTela++;
        mudaAte = t + (carregamentos[passo] ?? 500);
      }
      return { ok: true };
    }
  };
  return { deps, executados, relogio: () => t };
}

// Cada passo leva uma marca própria nos argumentos: é assim que o computador de mentira sabe
// distinguir "passo novo" de "o MESMO passo tentado de novo" — sem isso, dois cliques seguidos
// seriam indistinguíveis e não haveria como testar a repetição.
const passo = (acao, descricao, extra = {}) => ({ acao, descricao, args: { marca: descricao }, ...extra });

// 1) O laço vai até o fim sozinho, sem perguntar nada.
{
  const { deps, executados } = criarComputador({ carregamentos: { 0: 400, 1: 2200, 2: 300 } });
  const r = await executarPlano([
    passo('clicar', 'Abrir o menu'),
    passo('clicar', 'Entrar em Configurações'),
    passo('digitar', 'Escrever o nome')
  ], deps);
  registrar('executa a sequência inteira sozinho, sem parar para perguntar',
    r.motivo === 'concluido' && executados.length === 3,
    `${r.passosExecutados}/${r.totalDePassos} passos, motivo "${r.motivo}"`);
}

// 2) A espera é MEDIDA, não chutada: cada passo tem um tempo de carregamento diferente.
{
  const { deps } = criarComputador({ carregamentos: { 0: 300, 1: 2500, 2: 300 } });
  const r = await executarPlano([
    passo('clicar', 'Passo rápido'),
    passo('clicar', 'Passo lento'),
    passo('clicar', 'Passo rápido de novo')
  ], deps);
  const [p0, p1, p2] = r.passos;
  // O passo lento tem de ser medido como bem mais demorado que os rápidos.
  registrar('mede tempos diferentes para passos diferentes, em vez de usar um valor fixo',
    p1.esperaMedidaMs > p0.esperaMedidaMs * 2 && p1.esperaMedidaMs > p2.esperaMedidaMs * 2,
    `medidos: ${Math.round(p0.esperaMedidaMs)}ms, ${Math.round(p1.esperaMedidaMs)}ms, ${Math.round(p2.esperaMedidaMs)}ms`);
}

// 3) A previsão APRENDE: repetindo a mesma ação, a previsão se aproxima do tempo real.
{
  const carregamentos = {};
  for (let i = 0; i < 6; i++) carregamentos[i] = 2000;   // sempre 2s
  const { deps } = criarComputador({ carregamentos });
  const r = await executarPlano(
    Array.from({ length: 6 }, (_, i) => passo('clicar', `Clique ${i + 1}`)), deps);

  const primeiro = r.passos[0];
  const ultimo = r.passos[5];
  const erroInicial = Math.abs(primeiro.esperaPrevistaMs - 2000);
  const erroFinal = Math.abs(ultimo.esperaPrevistaMs - 2000);
  registrar('a previsão de espera se calibra ao longo do plano',
    erroFinal < erroInicial,
    `previa ${Math.round(primeiro.esperaPrevistaMs)}ms no 1º e ${Math.round(ultimo.esperaPrevistaMs)}ms no 6º (real 2000ms)`);
}

// 4) Calibrada, a espera custa MENOS fotos — senão a conta sai mais cara que a espera.
{
  const carregamentos = {};
  for (let i = 0; i < 8; i++) carregamentos[i] = 1800;
  const { deps } = criarComputador({ carregamentos });
  const r = await executarPlano(
    Array.from({ length: 8 }, (_, i) => passo('clicar', `Clique ${i + 1}`)), deps);
  /**
   * A asserção é sobre a FAIXA em que as medições assentam, e não sobre a 8ª ser menor que a 1ª.
   *
   * A previsão oscila em volta do valor real de propósito: ela sobe quando erra para baixo e desce
   * quando erra para cima, e comparar dois pontos soltos dessa oscilação reprova ou aprova por
   * sorte. O que importa é que nenhuma medição dispare para longe do tempo real — era exatamente
   * isso que acontecia antes, com a medição inflando a si mesma até 9s num carregamento de 1,8s.
   */
  const medidas = r.passos.map(p => p.esperaMedidaMs);
  const ultimas = medidas.slice(-4);
  const piorDasUltimas = Math.max(...ultimas);
  registrar('as medições assentam perto do tempo real, sem inflar a cada rodada',
    piorDasUltimas < 1800 * 2,
    `últimas 4: ${ultimas.map(m => Math.round(m) + 'ms').join(', ')} (carregamento real 1800ms)`);
}

// 5) PARA quando um passo falha — não segue em cima do erro.
{
  const { deps, executados } = criarComputador({ falharNoPasso: 1 });
  const r = await executarPlano([
    passo('clicar', 'Primeiro'), passo('clicar', 'Segundo'), passo('clicar', 'Terceiro')
  ], deps);
  const doSegundo = executados.filter(e => e.passo === 1).length;
  registrar('passo que falha sempre é TENTADO DE NOVO e só então o plano para',
    (r.motivo === 'erro-no-passo' || r.motivo === 'falhas-seguidas') && doSegundo === 3
      && !executados.some(e => e.passo === 2),
    `${doSegundo} tentativa(s) no passo 2; motivo "${r.motivo}"; o passo 3 ${executados.some(e => e.passo === 2) ? 'RODOU' : 'não rodou'}`);
}

// 6) PARA quando a tela não muda — o clique não pegou.
{
  const { deps, executados } = criarComputador({ telaNaoMudaNoPasso: 1 });
  const r = await executarPlano([
    passo('clicar', 'Primeiro'), passo('clicar', 'Clique que não pega'), passo('clicar', 'Terceiro')
  ], deps);
  const doSegundo = executados.filter(e => e.passo === 1).length;
  registrar('clique que não pega é repetido e, sem confirmar, o plano para',
    r.motivo === 'passo-nao-confirmado' && doSegundo === 3 && !executados.some(e => e.passo === 2),
    `${doSegundo} tentativa(s); motivo "${r.motivo}"`);
}

// 7) O motivo da parada volta escrito, para o modelo replanejar com informação real.
{
  const { deps } = criarComputador({ telaNaoMudaNoPasso: 0 });
  const r = await executarPlano([passo('clicar', 'Abrir o menu'), passo('clicar', 'Depois')], deps);
  registrar('a parada explica o que houve, quantas vezes tentou, e manda replanejar',
    /não mudou nenhuma vez/.test(r.resumo) && /tentativa/.test(r.resumo) && /refaça o plano/i.test(r.resumo),
    r.resumo.slice(0, 90) + '…');
}

// 8) O botão de parar do usuário interrompe o laço.
{
  const { deps, executados } = criarComputador();
  let n = 0;
  deps.cancelado = () => { n++; return n > 2; };
  const r = await executarPlano(
    Array.from({ length: 8 }, (_, i) => passo('clicar', `Clique ${i + 1}`)), deps);
  registrar('o pedido de parar do usuário interrompe o laço no meio',
    r.motivo === 'parado-pelo-usuario' && executados.length < 8,
    `motivo "${r.motivo}", executou ${executados.length} de 8`);
}

// 9) Teto de tempo: uma tela que nunca para não prende o computador para sempre.
{
  const { deps } = criarComputador({ carregamentos: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i, 19000])) });
  const r = await executarPlano(
    Array.from({ length: 20 }, (_, i) => passo('clicar', `Clique ${i + 1}`)),
    deps, { limites: { ...LIMITES_PADRAO, maxTotalMs: 30000 } });
  registrar('o teto de tempo interrompe o plano em vez de rodar sem fim',
    r.motivo === 'teto-de-tempo',
    `motivo "${r.motivo}" após ${Math.round(r.duracaoTotalMs / 1000)}s`);
}

// 10) Plano grande demais é recusado ANTES de tocar no computador.
{
  const grande = Array.from({ length: 40 }, (_, i) => passo('clicar', `Clique ${i + 1}`));
  const problema = validarPlano(grande);
  registrar('plano acima do teto de passos é recusado antes de executar',
    !!problema && /teto/.test(problema),
    problema || 'aceitou um plano de 40 passos');
}

// 11) Apagar arquivo e rodar terminal NÃO entram num laço automático.
{
  const proibidas = ['apagar', 'terminal', 'escrever_arquivo', 'mover', 'renomear'];
  const recusadas = proibidas.filter(a => !!validarPlano([passo(a, 'algo perigoso')]));
  registrar('ações de arquivo e terminal ficam fora do laço automático',
    recusadas.length === proibidas.length,
    `${recusadas.length}/${proibidas.length} recusadas`);
}

// 12) Passo sem descrição é recusado: é o texto que o usuário lê enquanto o PC se mexe sozinho.
{
  const problema = validarPlano([{ acao: 'clicar', args: {}, descricao: '' }]);
  registrar('passo sem descrição é recusado',
    !!problema && /descrição/.test(problema),
    problema || 'aceitou passo mudo');
}

// 13) Ação que não mexe na tela não gasta espera nenhuma.
{
  const { deps } = criarComputador();
  const r = await executarPlano([passo('mover_mouse', 'Só posicionar o cursor', { esperaDaTela: 'qualquer' })], deps);
  registrar('ação que não mexe na tela não gasta tempo esperando',
    r.motivo === 'concluido' && r.passos[0].esperaMedidaMs === 0,
    `espera de ${r.passos[0].esperaMedidaMs}ms`);
}

// 14) O relatório traz previsto E medido em cada passo — é o que torna a conta auditável.
{
  const { deps } = criarComputador({ carregamentos: { 0: 900 } });
  const r = await executarPlano([passo('clicar', 'Um clique')], deps);
  const p = r.passos[0];
  registrar('o relatório mostra o previsto e o medido de cada passo',
    typeof p.esperaPrevistaMs === 'number' && typeof p.esperaMedidaMs === 'number' && p.esperaMedidaMs > 0,
    `previa ${Math.round(p.esperaPrevistaMs)}ms, mediu ${Math.round(p.esperaMedidaMs)}ms`);
}

// 15) DINHEIRO NÃO ENTRA NO LAÇO. É a única coisa que o motor faz sem exceção.
{
  const tentativas = [
    'Clicar em Finalizar compra',
    'Clicar no botão Pagar agora',
    'Digitar o número do cartão de crédito',
    'Confirmar a transferência PIX',
    'Clicar em Assinar plano premium',
    'Abrir o app do banco e ver o saldo',
    'Preencher o CVV',
    'Gerar o boleto'
  ];
  const recusadas = tentativas.filter(d => !!validarPlano([passo('clicar', d)]));
  registrar('passo que envolve dinheiro é recusado antes de tocar no computador',
    recusadas.length === tentativas.length,
    `${recusadas.length}/${tentativas.length} recusadas`);
}

// 16) O dinheiro também é procurado nos ARGUMENTOS, não só na descrição.
{
  const problema = validarPlano([
    { acao: 'digitar', descricao: 'Preencher o campo', args: { texto: '4111 1111 1111 1111 cvv 123' } }
  ]);
  registrar('menção a dinheiro escondida nos argumentos também é pega',
    !!problema && /dinheiro/i.test(problema),
    problema ? 'recusado' : 'PASSOU: o motor executaria');
}

// 17) A recusa explica o que fazer em vez de só negar.
{
  const problema = validarPlano([passo('clicar', 'Clicar em Pagar')]);
  registrar('a recusa de pagamento diz que o passo final é do usuário',
    /quem paga é a pessoa/i.test(problema || ''),
    (problema || '').slice(-60));
}

// 18) Tarefa comum não pode ser barrada por palavra parecida — a trava não pode virar estorvo.
{
  const comuns = [
    'Clicar na aba Documentos',
    'Digitar o nome do arquivo',
    'Abrir o navegador e pesquisar receita de bolo',
    'Rolar a página até o final',
    'Clicar no botão Salvar'
  ];
  const barradas = comuns.filter(d => !!validarPlano([passo('clicar', d)]));
  registrar('tarefa comum não é barrada por engano pela trava de dinheiro',
    barradas.length === 0,
    barradas.length ? `barrou por engano: ${barradas.join(' | ')}` : 'nenhuma barrada');
}

// 19) O CASO CENTRAL DO PEDIDO: falhou uma vez, tenta de novo, dá certo, e SEGUE.
{
  const { deps, executados } = criarComputador({ falharNoPasso: 1, falharAteATentativa: 1 });
  const r = await executarPlano([
    passo('clicar', 'Primeiro'), passo('clicar', 'Falha só na primeira vez'), passo('clicar', 'Terceiro')
  ], deps);
  const doSegundo = executados.filter(e => e.passo === 1).length;
  registrar('passo que falha uma vez é repetido, dá certo e o plano SEGUE até o fim',
    r.motivo === 'concluido' && doSegundo === 2 && r.passos.length === 3,
    `motivo "${r.motivo}"; o passo 2 levou ${doSegundo} tentativa(s); ${r.passos.length} passos concluídos`);
}

// 20) Clique que não pega na primeira mas pega na segunda também segue.
{
  const { deps } = criarComputador({ telaNaoMudaNoPasso: 0, naoMudarAteATentativa: 1 });
  const r = await executarPlano([passo('clicar', 'Clique teimoso'), passo('clicar', 'Depois')], deps);
  registrar('clique que só pega na segunda tentativa não derruba o plano',
    r.motivo === 'concluido' && r.passos[0].tentativas === 2,
    `motivo "${r.motivo}"; primeiro passo em ${r.passos[0].tentativas} tentativa(s)`);
}

// 21) O relatório diz quantas tentativas cada passo levou — é o que revela plano frágil.
{
  const { deps } = criarComputador({ falharNoPasso: 0, falharAteATentativa: 1 });
  const r = await executarPlano([passo('clicar', 'Um'), passo('clicar', 'Dois')], deps);
  registrar('o relatório registra as tentativas de cada passo e avisa no resumo',
    r.passos[0].tentativas === 2 && r.passos[1].tentativas === 1 && /precisaram de mais de uma tentativa/.test(r.resumo),
    `tentativas: ${r.passos.map(p => p.tentativas).join(', ')}`);
}

// 22) 'permanecer' que mudou NÃO é repetido: agir de novo sobre uma tela já errada piora.
{
  const { deps, executados } = criarComputador();
  const r = await executarPlano([passo('clicar', 'Não devia mudar nada', { esperaDaTela: 'permanecer' })], deps);
  registrar('passo que mudou a tela sem dever não é repetido',
    r.motivo === 'tela-inesperada' && executados.length === 1,
    `${executados.length} tentativa(s); motivo "${r.motivo}"`);
}

// 23) O botão de parar interrompe MESMO no meio das tentativas.
{
  const { deps, executados } = criarComputador({ falharNoPasso: 0 });
  let n = 0;
  deps.cancelado = () => { n++; return n > 3; };
  const r = await executarPlano([passo('clicar', 'Um'), passo('clicar', 'Dois')], deps);
  registrar('parar interrompe também no meio das tentativas de um passo',
    r.motivo === 'parado-pelo-usuario' && executados.length < 6,
    `motivo "${r.motivo}", ${executados.length} execução(ões)`);
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
