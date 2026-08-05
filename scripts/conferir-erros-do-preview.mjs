/**
 * Confere que o erro real da execução vira um pedido de conserto que a IA consegue cumprir.
 *
 * Antes disto, o erro morria na tela. O preview capturava `TypeError: ctx is undefined` com linha
 * e coluna, mostrava numa aba, e ali acabava — a IA nunca ficava sabendo. Clicar em "Corrigir
 * BUGS" mandava o modelo procurar um defeito que ele não tinha como ver, e o que voltava era
 * palpite: mexidas em código que estava certo, enquanto a linha que quebrava continuava lá.
 *
 * O detalhe que faz este arquivo existir: o número da linha NÃO SERVE sozinho. O preview executa
 * o projeto montado — o styles.css e o script.js entram embutidos no HTML —, então a linha 312 do
 * preview não é a linha 312 de arquivo nenhum do repositório. Mandar esse número para a IA é
 * mandá-la olhar para o lugar errado com toda a confiança. O que se manda é o TEXTO da linha, que
 * é o mesmo dos dois lados.
 *
 * Como rodar:
 *   node scripts/conferir-erros-do-preview.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-erros-'));
const saida = path.join(pastaTemp, 'errosDoPreview.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/errosDoPreview.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { montarPedidoDeCorrecao, juntarProblemas, linhaDoCodigo, ehRuido } = await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

// O projeto MONTADO, como o preview o executa: o script.js embutido dentro do HTML. É por isso
// que a numeração daqui não bate com a de nenhum arquivo do repositório.
const MONTADO = `<!DOCTYPE html>
<html>
<head><style>body { margin: 0; }</style></head>
<body>
<canvas id="pista"></canvas>
<script>
const ctx = document.getElementById('pista').getContext('2d');
function desenhar() { ctx.fillRect(kart.x, kart.y, 20, 20); }
desenhar();
</script>
</body></html>`;
const LINHA_QUE_FALHA = 8; // a do fillRect com 'kart' indefinido

// ====== 1) O PEDIDO CARREGA O TEXTO DA LINHA, NÃO O NÚMERO ======
{
  const pedido = montarPedidoDeCorrecao(
    [{ mensagem: 'ReferenceError: kart is not defined', linha: LINHA_QUE_FALHA, coluna: 24, tipo: 'erro' }],
    MONTADO, 'index.html');

  registrar('o pedido leva a mensagem exata que o navegador registrou',
    pedido.includes('ReferenceError: kart is not defined'), 'mensagem presente');

  registrar('o pedido leva o TEXTO da linha que falhou, que é o que existe nos dois lados',
    pedido.includes('function desenhar() { ctx.fillRect(kart.x, kart.y, 20, 20); }'),
    'a IA consegue localizar o trecho sem depender da numeração');

  registrar('o pedido AVISA que o número da linha não corresponde ao arquivo',
    /não por número de linha|numeração dele não corresponde/i.test(pedido),
    'a instrução evita que o modelo conte linhas do arquivo errado');
}

// ====== 2) SEM ERRO, NÃO SE INCOMODA O MODELO ======
{
  registrar('sem nenhum problema, não há pedido',
    montarPedidoDeCorrecao([], MONTADO, 'index.html') === '', 'string vazia');
}

{
  // Aviso não é defeito. Mandar "consertar" um aviso costuma produzir alteração onde não havia
  // problema — e é o app que estaria pedindo isso, não o usuário.
  const soAvisos = montarPedidoDeCorrecao(
    [{ mensagem: 'Este laço pode ficar lento', tipo: 'aviso' }], MONTADO, 'index.html');
  registrar('só avisos não geram pedido de conserto',
    soAvisos === '', soAvisos === '' ? 'nenhum pedido' : 'PEDIU conserto de um aviso');
}

{
  // Mas quando há erro, o aviso entra como contexto — pode ser a pista do que houve.
  const pedido = montarPedidoDeCorrecao([
    { mensagem: 'TypeError: ctx is undefined', linha: 7, tipo: 'erro' },
    { mensagem: 'Este laço pode ficar lento', tipo: 'aviso' }
  ], MONTADO, 'index.html');
  registrar('havendo erro, os avisos vão junto como contexto — marcados como não sendo o defeito',
    pedido.includes('Este laço pode ficar lento') && /não são o defeito/i.test(pedido),
    'aviso presente e rotulado');
}

// ====== 3) ERRO DENTRO DO LAÇO DO JOGO: 60 POR SEGUNDO ======
// Sem agrupar, o pedido seria mil vezes a mesma frase, empurrando o código de verdade para fora
// do contexto do modelo.
{
  const mil = Array.from({ length: 1000 }, () =>
    ({ mensagem: 'TypeError: kart is undefined', linha: LINHA_QUE_FALHA, tipo: 'erro' }));
  const juntos = juntarProblemas(mil);
  registrar('mil repetições do mesmo erro viram uma entrada só',
    juntos.length === 1 && juntos[0].vezes === 1000, `${juntos.length} entrada(s), ${juntos[0]?.vezes} ocorrências`);

  const pedido = montarPedidoDeCorrecao(mil, MONTADO, 'index.html');
  const quantasVezesNoTexto = pedido.split('TypeError: kart is undefined').length - 1;
  registrar('o pedido cita o erro uma vez só, e informa quantas vezes ele aconteceu',
    quantasVezesNoTexto === 1 && pedido.includes('1000 vezes'),
    `citado ${quantasVezesNoTexto}x no pedido`);

  registrar('a repetição é sinalizada como pista de que o erro está num laço',
    /dentro de um laço/i.test(pedido), 'a IA sabe onde procurar');
}

{
  const variados = juntarProblemas([
    { mensagem: 'Erro A', linha: 1, tipo: 'erro' },
    { mensagem: 'Erro B', linha: 2, tipo: 'erro' },
    { mensagem: 'Erro A', linha: 1, tipo: 'erro' }
  ]);
  registrar('erros diferentes continuam separados',
    variados.length === 2, `${variados.length} erro(s) distinto(s)`);
}

// ====== 4) RUÍDO QUE NÃO É DEFEITO DO USUÁRIO ======
// O aviso do Tailwind por CDN aparece em TODO projeto gerado pelo OSONE. Deixá-lo passar faria a
// tarja vermelha viver acesa e o botão de conserto mandar a IA "consertar" uma escolha do próprio
// app — o pior tipo de trabalho inútil, porque parece legítimo.
{
  const ruido = 'cdn.tailwindcss.com should not be used in production';
  registrar('o aviso do Tailwind por CDN é reconhecido como ruído',
    ehRuido(ruido) === true, 'ignorado');

  const juntos = juntarProblemas([
    { mensagem: ruido, tipo: 'aviso' },
    { mensagem: 'TypeError: de verdade', linha: 7, tipo: 'erro' }
  ]);
  registrar('o ruído é descartado e o erro de verdade permanece',
    juntos.length === 1 && juntos[0].mensagem === 'TypeError: de verdade',
    `${juntos.length} problema(s) relevante(s)`);
}

{
  const soRuido = montarPedidoDeCorrecao(
    [{ mensagem: 'cdn.tailwindcss.com should not be used in production', tipo: 'aviso' }],
    MONTADO, 'index.html');
  registrar('uma tela só com ruído não gera pedido nenhum',
    soRuido === '', soRuido === '' ? 'nenhum pedido' : 'PEDIU conserto de ruído');
}

// ====== 5) A LEITURA DA LINHA ======
{
  registrar('a linha é lida pelo número que o navegador reporta (base 1)',
    linhaDoCodigo(MONTADO, LINHA_QUE_FALHA).includes('fillRect'),
    linhaDoCodigo(MONTADO, LINHA_QUE_FALHA).slice(0, 50));
}

{
  registrar('linha fora do arquivo não inventa conteúdo',
    linhaDoCodigo(MONTADO, 9999) === '' && linhaDoCodigo(MONTADO, 0) === '' && linhaDoCodigo(MONTADO) === '',
    'devolve vazio em vez de chutar');
}

{
  // Erro sem número de linha (console.error do próprio código) ainda vira pedido útil.
  const pedido = montarPedidoDeCorrecao(
    [{ mensagem: 'Falha ao carregar a fase 2', tipo: 'erro' }], MONTADO, 'index.html');
  registrar('erro sem número de linha ainda vira um pedido válido',
    pedido.includes('Falha ao carregar a fase 2') && pedido.includes('index.html'),
    'sem linha, mas com mensagem e arquivo');
}

// ====== 6) A ORDEM DADA À IA ======
{
  const pedido = montarPedidoDeCorrecao(
    [{ mensagem: 'TypeError: x', linha: 7, tipo: 'erro' }], MONTADO, 'jogo.html');
  registrar('o pedido manda corrigir a CAUSA, não cercar o sintoma com um if',
    /causa, não o sintoma/i.test(pedido), 'instrução presente');

  registrar('o pedido manda não reescrever o que está funcionando',
    /não reescreva partes que estão funcionando/i.test(pedido), 'instrução presente');

  registrar('o pedido nomeia o arquivo a consertar',
    pedido.includes('"jogo.html"'), 'arquivo nomeado');
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
