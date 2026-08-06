/**
 * Confere que a aba do COWORK não é uma porta dos fundos para o motor de ações.
 *
 * Até agora o agente que clica e digita só podia ser acionado de um jeito: conversando no chat e
 * esperando o modelo decidir chamar a ferramenta. Esse caminho passa por validarPlano(), que é
 * onde moram o teto de passos, a exclusão de ações de arquivo/terminal e a recusa de dinheiro.
 *
 * Abrir um SEGUNDO acionador — uma aba onde a pessoa digita a tarefa — é exatamente o tipo de
 * mudança que costuma criar um caminho paralelo sem as travas do primeiro: o código novo lê o
 * plano, acha que já validou o suficiente, e executa. É isso que estes casos existem para impedir.
 *
 * O que eles conferem, nesta ordem:
 *
 *   1. Que o plano só sai daqui depois de passar pela MESMA validação do caminho antigo, com a
 *      mesma mensagem — duas explicações diferentes para a mesma regra é como uma delas
 *      envelhece sem ninguém notar.
 *   2. Que DINHEIRO é recusado, mesmo quando escrito de formas diferentes, e mesmo quando o
 *      modelo devolve um plano aparentemente inocente com o passo de pagamento no meio.
 *   3. Que uma resposta mal formada do modelo vira uma explicação em português, e não um plano
 *      pela metade nem um "deu erro" mudo.
 *
 * Como rodar:
 *   node scripts/conferir-plano-do-cowork.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-cowork-'));
const saida = path.join(pastaTemp, 'plano.mjs');

/**
 * O localStorage não existe no Node, e o módulo o usa para o histórico. Um de mentira, aqui,
 * deixa o histórico ser conferido de verdade em vez de ficar sem cobertura nenhuma.
 */
const guardado = new Map();
globalThis.localStorage = {
  getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
  setItem: (k, v) => guardado.set(k, String(v)),
  removeItem: (k) => guardado.delete(k)
};

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/planoDoCowork.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const {
  lerPlanoDoModelo, resumirPlano, INSTRUCAO_PARA_PLANEJAR,
  lerHistorico, guardarNoHistorico, limparHistorico
} = await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const passo = (acao, descricao, args = {}) => ({ acao, descricao, args, esperaDaTela: 'mudar' });
const resposta = (obj) => JSON.stringify(obj);

// ====== 1) O CAMINHO FELIZ ======
{
  const p = lerPlanoDoModelo('abrir o navegador', resposta({
    passos: [passo('abrir', 'Abrir o navegador', { caminho: 'chrome' }), passo('clicar', 'Clicar na barra de endereços')]
  }));
  registrar('um plano válido sai com os passos e sem recusa',
    !p.recusa && p.passos.length === 2 && p.passos[0].acao === 'abrir',
    `${p.passos.length} passo(s)`);

  registrar('a tarefa original volta junto do plano',
    p.tarefa === 'abrir o navegador', p.tarefa);

  registrar('a espera da tela vem preenchida em todo passo',
    p.passos.every(x => ['mudar', 'permanecer', 'qualquer'].includes(x.esperaDaTela)),
    'nenhum passo fica sem dizer o que esperar da tela');
}

// ====== 2) DINHEIRO NÃO PASSA ======
// O passo de pagamento no MEIO de um plano inocente é o caso que importa: o começo é banal, e um
// código que só olhasse o primeiro passo deixaria passar.
{
  const p = lerPlanoDoModelo('comprar um fone', resposta({
    passos: [
      passo('abrir', 'Abrir a loja no navegador', { caminho: 'https://loja.exemplo' }),
      passo('clicar', 'Clicar no fone que aparecer'),
      passo('clicar', 'Finalizar compra com o cartão salvo')
    ]
  }));
  registrar('um passo de pagamento no meio do plano derruba o plano inteiro',
    !!p.recusa && p.passos.length === 0, p.recusa?.slice(0, 70));

  registrar('a recusa de dinheiro explica que quem paga é a pessoa',
    /quem paga é a pessoa/i.test(p.recusa || ''), 'a mensagem do validador chegou intacta');
}

{
  const variantes = [
    ['pix', passo('digitar', 'Digitar a chave PIX do destinatário')],
    ['transferência', passo('clicar', 'Clicar em Transferência entre contas')],
    ['boleto', passo('clicar', 'Clicar para gerar o boleto')],
    ['assinatura', passo('clicar', 'Clicar em assinar plano premium')]
  ];
  const recusadas = variantes.filter(([, ps]) =>
    !!lerPlanoDoModelo('teste', resposta({ passos: [ps] })).recusa);
  registrar('dinheiro é pego escrito de várias formas',
    recusadas.length === variantes.length,
    `${recusadas.length}/${variantes.length} recusadas`);
}

{
  // Nos ARGUMENTOS, não na descrição: quem tentasse contornar escreveria a descrição limpa.
  const p = lerPlanoDoModelo('teste', resposta({
    passos: [{ acao: 'digitar', descricao: 'Preencher o campo', args: { texto: 'meu pix é 123' } }]
  }));
  registrar('dinheiro escondido nos argumentos também é pego',
    !!p.recusa, 'a descrição limpa não salva o passo');
}

// ====== 3) AÇÕES QUE NÃO ENTRAM NO LAÇO ======
{
  const foraDoLaco = ['terminal', 'apagar', 'mover', 'escrever_arquivo', 'renomear'];
  const recusadas = foraDoLaco.filter(a =>
    !!lerPlanoDoModelo('teste', resposta({ passos: [passo(a, 'Fazer alguma coisa no arquivo')] })).recusa);
  registrar('arquivo e terminal continuam fora do plano automático',
    recusadas.length === foraDoLaco.length,
    `${recusadas.length}/${foraDoLaco.length} recusadas`);
}

// ====== 4) OS TETOS DO MOTOR VALEM AQUI TAMBÉM ======
{
  const muitos = Array.from({ length: 30 }, (_, i) => passo('clicar', `Clicar no item ${i + 1}`));
  const p = lerPlanoDoModelo('clicar em tudo', resposta({ passos: muitos }));
  registrar('um plano acima do teto de 25 passos é recusado antes de rodar',
    !!p.recusa && /25/.test(p.recusa), p.recusa?.slice(0, 60));
}

{
  const p = lerPlanoDoModelo('teste', resposta({ passos: [{ acao: 'clicar', args: { x: 500, y: 500 } }] }));
  registrar('passo sem descrição é recusado',
    !!p.recusa && /descri/i.test(p.recusa),
    'um passo sem descrição é um passo que o usuário não consegue acompanhar');
}

// ====== 5) RESPOSTA RUIM DO MODELO VIRA EXPLICAÇÃO, NÃO PLANO PELA METADE ======
{
  const casosRuins = [
    ['vazia', ''],
    ['só espaços', '   \n  '],
    ['conversa em vez de JSON', 'Claro! Vou abrir o navegador para você.'],
    ['JSON quebrado', '{"passos": [{"acao": "clicar"'],
    ['sem a lista de passos', '{"resposta": "ok"}']
  ];
  const todasExplicadas = casosRuins.every(([, texto]) => {
    const p = lerPlanoDoModelo('teste', texto);
    return p.passos.length === 0 && !!p.recusa && p.recusa.length > 20;
  });
  registrar('resposta ruim do modelo vira uma explicação em português',
    todasExplicadas, `${casosRuins.length} formatos ruins, todos com motivo escrito`);
}

{
  // O modelo às vezes embrulha o JSON numa cerca de markdown. Isso é formatação, não erro.
  const p = lerPlanoDoModelo('teste', '```json\n{"passos":[{"acao":"abrir","descricao":"Abrir o navegador","args":{}}]}\n```');
  registrar('o JSON dentro de cerca de markdown é lido normalmente',
    !p.recusa && p.passos.length === 1, 'a cerca não atrapalha');
}

{
  // A recusa do PRÓPRIO modelo é uma resposta legítima, e o motivo dele é o que a pessoa lê.
  const p = lerPlanoDoModelo('faz aí', resposta({ passos: [], recusa: 'Preciso saber qual programa abrir.' }));
  registrar('a recusa do próprio modelo chega ao usuário com o motivo dele',
    p.recusa === 'Preciso saber qual programa abrir.', p.recusa);
}

// ====== 6) A INSTRUÇÃO CONTA AS MESMAS REGRAS QUE O VALIDADOR APLICA ======
// Um modelo que não conhece as travas devolve plano recusado, e a pessoa refaz o pedido sem saber
// por quê. Repetir as regras na instrução é o que faz o primeiro plano já sair aproveitável.
{
  const fala = (t) => INSTRUCAO_PARA_PLANEJAR.toLowerCase().includes(t);
  registrar('a instrução avisa o modelo das travas que ele vai encontrar',
    fala('25 passos') && fala('dinheiro') && fala('terminal') && fala('descricao'),
    'teto, dinheiro, terminal e descrição obrigatória estão na instrução');
}

// ====== 7) O HISTÓRICO ======
{
  limparHistorico();
  const item = (tarefa, quando) => ({
    id: Math.random().toString(36).slice(2), tarefa, quando,
    passos: [passo('abrir', 'Abrir o navegador')], desfecho: 'concluida'
  });

  guardarNoHistorico(item('abrir o youtube', 1));
  guardarNoHistorico(item('abrir o gmail', 2));
  const lista = lerHistorico();
  registrar('a tarefa mais recente fica no topo do histórico',
    lista.length === 2 && lista[0].tarefa === 'abrir o gmail', lista.map(l => l.tarefa).join(' | '));

  guardarNoHistorico(item('ABRIR O YOUTUBE', 3));
  const depois = lerHistorico();
  registrar('repetir a mesma tarefa sobe a linha em vez de duplicar',
    depois.length === 2 && depois[0].tarefa === 'ABRIR O YOUTUBE',
    `${depois.length} linha(s): ${depois.map(l => l.tarefa).join(' | ')}`);

  registrar('os passos ficam guardados, para repetir sem remontar o plano',
    depois[0].passos.length === 1 && depois[0].passos[0].acao === 'abrir',
    'o trabalho caro do modelo não é jogado fora');

  for (let i = 0; i < 30; i++) guardarNoHistorico(item(`tarefa ${i}`, 10 + i));
  registrar('o histórico não cresce sem limite',
    lerHistorico().length === 20, `${lerHistorico().length} itens guardados`);

  limparHistorico();
  registrar('limpar o histórico esvazia de verdade', lerHistorico().length === 0, 'zerado');
}

{
  // localStorage cheio não pode derrubar uma execução que deu certo: histórico é conforto.
  const original = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  let quebrou = false;
  try {
    guardarNoHistorico({ id: 'x', tarefa: 'teste', quando: 1, passos: [], desfecho: 'concluida' });
  } catch { quebrou = true; }
  globalThis.localStorage.setItem = original;
  registrar('histórico que não cabe no navegador não derruba a execução',
    !quebrou, 'guardar falhou em silêncio, como deve');
}

// ====== 8) O RESUMO ======
{
  const p = lerPlanoDoModelo('t', resposta({ passos: [passo('abrir', 'Abrir o navegador'), passo('clicar', 'Clicar em Entrar')] }));
  const r = resumirPlano(p);
  registrar('o resumo de uma linha diz quantos passos e quais',
    r.includes('2 passo') && r.includes('Abrir o navegador') && r.includes('Clicar em Entrar'), r);
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
