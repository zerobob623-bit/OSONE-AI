/**
 * Confere o que acontece quando a resposta do modelo ACABA NO MEIO.
 *
 * Relatado assim: "o código não está sendo finalizado". Não era o modelo se recusando a escrever
 * — era o pedido não caber numa resposta só. O modelo escreve até o limite de tokens de saída e
 * para, a API devolve finishReason 'MAX_TOKENS', e isso não é erro: nada falhava, nada tentava de
 * novo. O OSONE CODE gravava o pedaço e seguia em frente anunciando sucesso.
 *
 * Duas consequências, e as duas passavam despercebidas:
 *
 * 1) ARQUIVO DESTRUÍDO. Cortada no meio de uma edição, a resposta ficava sem o '>>>>>>> REPLACE'.
 *    Uma leitura que só reconhece blocos INTEIROS não via bloco nenhum, quem chamava concluía
 *    "então isto é o arquivo inteiro" e gravava o texto cru — com os marcadores '<<<<<<< SEARCH'
 *    dentro — por cima de um arquivo que funcionava.
 *
 * 2) MEIO ARQUIVO ENTREGUE COMO PRONTO. Um jogo que termina no meio do <script> era salvo e
 *    anunciado como "✨ Jogo Finalizado & Testado com Sucesso".
 *
 * Os casos aqui cobrem o lado do cliente (o que acontece com o texto depois que ele chega) e a
 * emenda de continuações do servidor, que é o conserto de verdade: mandar o modelo continuar de
 * onde parou até o arquivo fechar.
 *
 * Como rodar:
 *   node scripts/conferir-codigo-cortado.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-cortado-'));
const saida = path.join(pastaTemp, 'codeEdits.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/codeEdits.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { applyModelCodeResponse, lerBlocosSearchReplace, pareceDocumentoIncompleto } =
  await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const bloco = (busca, troca) => `<<<<<<< SEARCH\n${busca}\n=======\n${troca}\n>>>>>>> REPLACE`;
const JOGO = '<!DOCTYPE html>\n<html>\n<body>\n<h1>Meu jogo</h1>\n<script>let vidas = 3;</script>\n</body>\n</html>';
// O que a API devolve quando estoura o limite no meio de um bloco: nunca chega o '>>>>>>> REPLACE'.
const CORTADA_NO_BLOCO = '<<<<<<< SEARCH\nlet vidas = 3;\n=======\nlet vidas = 3;\nlet pontos = 0;\nfunction desenhar() {\n  ctx.fillRect(0, 0, 10, 10);';

// ====== 1) O ARQUIVO NÃO PODE SER DESTRUÍDO POR UMA RESPOSTA PELA METADE ======
{
  const r = applyModelCodeResponse(CORTADA_NO_BLOCO, JOGO);
  const temMarcadores = /<<<<<<<|>>>>>>>|\n=======\n/.test(r.content);
  registrar('resposta cortada no meio do bloco NÃO grava meia edição por cima do arquivo',
    r.content === JOGO && !temMarcadores,
    r.content === JOGO ? 'arquivo preservado intacto' : 'ARQUIVO SOBRESCRITO com o texto cru');
}

{
  const r = applyModelCodeResponse(CORTADA_NO_BLOCO, JOGO);
  registrar('resposta cortada é relatada como cortada, e não como sucesso',
    r.respostaCortada === true && r.hadFailures === true,
    `respostaCortada=${r.respostaCortada}, hadFailures=${r.hadFailures}`);
}

// ====== 2) OS MARCADORES NUNCA VIRAM CÓDIGO, NEM NUM ARQUIVO VAZIO ======
{
  const r = applyModelCodeResponse(CORTADA_NO_BLOCO, '');
  const temMarcadores = /<<<<<<<|>>>>>>>/.test(r.content);
  registrar('arquivo vazio: aproveita o pedaço escrito, sem os marcadores, e avisa que está cortado',
    !temMarcadores && r.content.includes('let pontos = 0;') && r.respostaCortada === true,
    temMarcadores ? 'MARCADORES gravados como se fossem código' : JSON.stringify(r.content.slice(0, 40) + '…'));
}

// ====== 3) O CORTE NÃO PODE APAGAR AS EDIÇÕES QUE JÁ TINHAM CHEGADO INTEIRAS ======
{
  const original = 'const a = 1;\nconst b = 2;';
  const resposta = bloco('const a = 1;', 'const a = 10;') + '\n' + CORTADA_NO_BLOCO;
  const r = applyModelCodeResponse(resposta, original);
  registrar('bloco inteiro antes do corte é aplicado; o bloco cortado é descartado',
    r.content === 'const a = 10;\nconst b = 2;' && r.respostaCortada === true,
    JSON.stringify(r.content));
}

// ====== 4) CORTE ANTES DO '=======': NÃO HÁ NADA A SALVAR, E NADA PODE SER GRAVADO ======
{
  const r = applyModelCodeResponse('<<<<<<< SEARCH\nlet vidas = 3;\nlet pon', JOGO);
  registrar('corte antes do separador não grava nada e preserva o arquivo',
    r.content === JOGO && r.respostaCortada === true,
    r.content === JOGO ? 'arquivo preservado' : 'ARQUIVO danificado');
}

// ====== 5) RESPOSTA INTEIRA CONTINUA PASSANDO LIMPA (sem alarme falso) ======
{
  const r = applyModelCodeResponse(bloco('let vidas = 3;', 'let vidas = 5;'), JOGO);
  registrar('resposta inteira continua aplicando e NÃO é marcada como cortada',
    r.content.includes('let vidas = 5;') && r.respostaCortada === false && !r.hadFailures,
    `respostaCortada=${r.respostaCortada}`);
}

{
  const leitura = lerBlocosSearchReplace(bloco('a', 'b') + '\n' + bloco('c', 'd'));
  registrar('a leitura de blocos inteiros não regrediu',
    leitura.edits.length === 2 && leitura.cortada === false,
    `${leitura.edits.length} blocos, cortada=${leitura.cortada}`);
}

// ====== 6) O DOCUMENTO QUE ABRE E NÃO FECHA É RECONHECIDO ======
{
  const meio = '<!DOCTYPE html>\n<html>\n<body>\n<script>\nfunction desenhar() {\n  ctx.fillRect(';
  registrar('documento HTML que termina no meio é reconhecido como incompleto',
    pareceDocumentoIncompleto(meio) === true && pareceDocumentoIncompleto(JOGO) === false,
    `cortado=${pareceDocumentoIncompleto(meio)}, inteiro=${pareceDocumentoIncompleto(JOGO)}`);
}

{
  // Alarme falso aqui ensinaria o usuário a ignorar o aviso: código que não é documento passa.
  const naoEhDocumento = 'export function somar(a, b) {\n  return a + b;\n}';
  registrar('código que não é um documento HTML não dispara alarme falso',
    pareceDocumentoIncompleto(naoEhDocumento) === false && pareceDocumentoIncompleto('') === false,
    'nem JS solto nem texto vazio são acusados');
}

// ====== 7) A EMENDA DE CONTINUAÇÕES DO SERVIDOR ======
// O servidor manda o modelo continuar de onde parou e emenda os pedaços. O risco da emenda é o
// modelo reescrever as últimas linhas ao "retomar o fio": emendar sem olhar duplicaria uma
// função dentro do arquivo, o que quebra tudo — pior do que o corte original.
{
  const arquivo = path.join(RAIZ, 'server.ts');
  const fonte = fs.readFileSync(arquivo, 'utf-8');
  const inicio = fonte.indexOf('function emendarContinuacao');
  const fim = fonte.indexOf('\n  }', inicio);
  const corpo = fonte.slice(fonte.indexOf('{', inicio), fim + 4);
  // eslint-disable-next-line no-new-func
  const emendar = new Function(`return function emendarContinuacao(inicio, continuacao) ${corpo}`)();

  const parte1 = 'function desenhar() {\n  ctx.fillRect(0, 0, 10, 10);\n  ctx.fillStyle = "red";';
  const parte2 = '  ctx.fillStyle = "red";\n}\n// fim\n';
  const emendado = emendar(parte1, parte2);
  const vezes = emendado.split('ctx.fillStyle = "red";').length - 1;
  registrar('a emenda desconta o trecho que o modelo repetiu ao retomar',
    vezes === 1 && emendado.endsWith('// fim\n'),
    `"ctx.fillStyle" aparece ${vezes}x no resultado`);

  const semSobreposicao = emendar('abc', 'def');
  registrar('sem sobreposição, a emenda apenas concatena',
    semSobreposicao === 'abcdef', semSobreposicao);

  const soUmLado = emendar('', 'só isto');
  registrar('emendar com um dos lados vazio devolve o outro lado',
    soUmLado === 'só isto' && emendar('só isto', '') === 'só isto', soUmLado);
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
