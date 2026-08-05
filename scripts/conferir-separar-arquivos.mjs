/**
 * Confere a separação de um HTML grudado em index.html + estilo + script, em QUALQUER projeto.
 *
 * "Qualquer projeto" é o requisito, e ele é difícil pelo motivo de sempre: HTML real não tem uma
 * forma só. Tem projeto com dois <style>, com script de CDN no meio, com JSON dentro de um
 * <script type="application/json">, com módulo, com `</script>` escrito dentro de uma string.
 * Tentar prever cada formato é perder — sempre falta um, e quando falta o projeto de alguém
 * quebra em silêncio.
 *
 * Por isso a garantia não vem de prever: vem de CONFERIR. A separação é desfeita e comparada com
 * o original, caractere por caractere; não batendo, ela não acontece. Os casos aqui verificam as
 * duas metades disso — que os formatos comuns separam certo, e que os incomuns, quando não dá
 * para separar com segurança, não são separados de jeito nenhum.
 *
 * Os dois riscos que dominam o desenho, e que têm caso próprio:
 *
 *  - ORDEM DE EXECUÇÃO: um <script> no fim do <body> roda com a página montada. Movido para o
 *    <head>, roda antes de os elementos existirem e o jogo abre em branco.
 *  - CASCATA DO CSS: um <style> depois de um <link> vence a folha externa. Juntar blocos num
 *    arquivo só inverte quem vence, e o layout muda sem ninguém ter mexido no layout.
 *
 * Como rodar:
 *   node scripts/conferir-separar-arquivos.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-separar-'));
const saida = path.join(pastaTemp, 'separar.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/separarArquivos.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { separarProjeto, remontar, acharBlocos } = await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

/**
 * A prova que vale para todo caso: desfazer a separação devolve o arquivo original.
 *
 * A única folga é a mesma que a biblioteca declara — espaço em branco nas bordas de um bloco
 * <style>/<script>, onde ele comprovadamente não muda nada. Fora dela, tem que bater ao pé da
 * letra; afrouxar mais deixaria passar diferenças de verdade.
 */
const normalizar = (t) => (t || '')
  .replace(/\r\n/g, '\n')
  .replace(/[ \t]+$/gm, '')
  .replace(/(<(style|script)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi,
    (_i, abre, _tag, conteudo, fecha) => `${abre}${conteudo.trim()}${fecha}`);

const roundTripOk = (original, r) =>
  r.separou && normalizar(remontar(r.html, r.novos)) === normalizar(original);

// ====== 1) O CASO COMUM: um estilo no head, um script no fim do body ======
const JOGO = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Kart</title>
  <style>
    body { margin: 0; background: #000; }
    .hud { color: #0ff; }
  </style>
</head>
<body>
  <canvas id="pista"></canvas>
  <script>
    const ctx = document.getElementById('pista').getContext('2d');
    function loop() { requestAnimationFrame(loop); }
    loop();
  </script>
</body>
</html>`;

{
  const r = separarProjeto(JOGO, ['index.html']);
  registrar('o caso comum separa em dois arquivos, com os nomes esperados',
    r.separou && r.novos.length === 2
      && r.novos.some(a => a.nome === 'styles.css') && r.novos.some(a => a.nome === 'game.js'),
    r.novos.map(a => a.nome).join(' + ') || r.motivo);
}

{
  const r = separarProjeto(JOGO, ['index.html']);
  const css = r.novos.find(a => a.nome === 'styles.css');
  const js = r.novos.find(a => a.nome === 'game.js');
  registrar('o conteúdo vai para o arquivo certo, e nada se mistura',
    css.conteudo.includes('background: #000') && !css.conteudo.includes('requestAnimationFrame')
      && js.conteudo.includes('requestAnimationFrame') && !js.conteudo.includes('background'),
    'CSS no .css, JS no .js');
}

{
  const r = separarProjeto(JOGO, ['index.html']);
  registrar('o HTML fica com as referências, e sem o código embutido',
    r.html.includes('<link rel="stylesheet" href="styles.css">')
      && r.html.includes('src="game.js"')
      && !r.html.includes('requestAnimationFrame'),
    'index.html enxuto');
}

{
  const r = separarProjeto(JOGO, ['index.html']);
  registrar('desfazer a separação devolve o arquivo original, caractere por caractere',
    roundTripOk(JOGO, r), 'ida e volta idênticas');
}

// ====== 2) A ORDEM DE EXECUÇÃO NÃO PODE MUDAR ======
// É o erro que quebraria jogos em silêncio: script movido para o head roda antes de os elementos
// existirem, getElementById devolve null, e a tela fica em branco sem nada no console.
{
  const r = separarProjeto(JOGO, ['index.html']);
  const posLink = r.html.indexOf('href="styles.css"');
  const posScript = r.html.indexOf('src="game.js"');
  const posCanvas = r.html.indexOf('<canvas');
  registrar('a referência do script continua DEPOIS do canvas, como o bloco original estava',
    posScript > posCanvas && posLink < posCanvas,
    'a página monta antes de o script rodar, igual a antes');
}

// ====== 3) VÁRIOS BLOCOS: cada um vira um arquivo, na sua posição ======
// Juntar tudo num arquivo só é o que inverteria a cascata do CSS e a ordem do JS.
{
  const doisDeCada = `<!DOCTYPE html><html><head>
<style>a { color: red; }</style>
<link rel="stylesheet" href="https://cdn.exemplo/base.css">
<style>a { color: blue; }</style>
</head><body>
<script>console.log('antes');</script>
<div id="alvo"></div>
<script>document.getElementById('alvo').textContent = 'depois';</script>
</body></html>`;

  const r = separarProjeto(doisDeCada, ['index.html']);
  registrar('quatro blocos viram quatro arquivos, numerados',
    r.separou && r.novos.length === 4,
    r.novos.map(a => a.nome).join(', ') || r.motivo);

  const pos = (t) => r.html.indexOf(t);
  registrar('a cascata do CSS é preservada: o estilo azul continua DEPOIS da folha externa',
    pos('styles-1.css') < pos('cdn.exemplo') && pos('cdn.exemplo') < pos('styles-2.css'),
    'quem vencia continua vencendo');

  registrar('a ordem dos scripts é preservada, com o div entre eles',
    pos('game-1.js') < pos('<div id="alvo">') && pos('<div id="alvo">') < pos('game-2.js'),
    'o segundo script continua rodando com o div já na página');

  registrar('mesmo com quatro blocos, a ida e volta bate',
    roundTripOk(doisDeCada, r), 'idênticas');
}

// ====== 4) O QUE NÃO PODE SER TOCADO ======
{
  const comCDN = `<!DOCTYPE html><html><head>
<script src="https://cdn.tailwindcss.com"></script>
</head><body>
<script>const x = 1;</script>
</body></html>`;
  const r = separarProjeto(comCDN, ['index.html']);
  registrar('script de CDN não é extraído — ele já mora fora',
    r.separou && r.novos.length === 1 && r.html.includes('https://cdn.tailwindcss.com'),
    `${r.novos.length} arquivo(s) criado(s)`);
}

{
  // JSON dentro de um <script> é DADO. Virar arquivo .js o transformaria em código inválido.
  const comJson = `<!DOCTYPE html><html><body>
<script type="application/json" id="fases">{"fase": 1, "voltas": 3}</script>
<script>const dados = JSON.parse(document.getElementById('fases').textContent);</script>
</body></html>`;
  const r = separarProjeto(comJson, ['index.html']);
  registrar('script com dados (application/json) não vira arquivo .js',
    r.separou && r.novos.length === 1 && r.html.includes('{"fase": 1, "voltas": 3}'),
    'os dados ficam onde estavam');
}

{
  const comTemplate = `<!DOCTYPE html><html><body>
<script type="text/template" id="linha"><tr><td>{{nome}}</td></tr></script>
<script>const t = 1;</script>
</body></html>`;
  const r = separarProjeto(comTemplate, ['index.html']);
  registrar('script usado como molde (text/template) também é deixado em paz',
    r.separou && r.novos.length === 1 && r.html.includes('{{nome}}'),
    'molde preservado');
}

{
  const comModulo = `<!DOCTYPE html><html><body>
<script type="module">import { a } from './util.js'; console.log(a);</script>
</body></html>`;
  const r = separarProjeto(comModulo, ['index.html']);
  registrar('módulo é extraído mantendo o type="module" na tag',
    r.separou && /<script[^>]*type="module"[^>]*src="game\.js"/.test(r.html),
    r.html.match(/<script[^>]*>/)?.[0] || r.motivo);
}

{
  const comMedia = `<!DOCTYPE html><html><head>
<style media="print">body { color: black; }</style>
</head><body><script>const x=1;</script></body></html>`;
  const r = separarProjeto(comMedia, ['index.html']);
  registrar('atributos do bloco seguem na tag nova (media="print" não se perde)',
    r.separou && /<link[^>]*media="print"/.test(r.html),
    r.html.match(/<link[^>]*>/)?.[0] || r.motivo);
}

// ====== 5) NADA A SEPARAR: recusa com explicação, e sem mexer no arquivo ======
{
  const jaSeparado = `<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head>
<body><script src="game.js"></script></body></html>`;
  const r = separarProjeto(jaSeparado, ['index.html', 'styles.css', 'game.js']);
  registrar('projeto já separado não é mexido, e o motivo é dito',
    !r.separou && r.html === jaSeparado && /já está separado/.test(r.motivo || ''),
    r.motivo);
}

{
  const r = separarProjeto('body { color: red; }', ['styles.css']);
  registrar('arquivo que não é HTML não é separado',
    !r.separou && /não é uma página HTML/.test(r.motivo || ''), r.motivo);
}

{
  const vazio = `<!DOCTYPE html><html><head><style>   </style></head><body><script></script></body></html>`;
  const r = separarProjeto(vazio, ['index.html']);
  registrar('blocos vazios não viram arquivos vazios',
    !r.separou && r.novos.length === 0, r.motivo);
}

// ====== 6) NOMES QUE JÁ EXISTEM NO PROJETO ======
// Usar o nome de um arquivo existente o sobrescreveria — apagando trabalho que já estava lá.
{
  const r = separarProjeto(JOGO, ['index.html', 'styles.css', 'game.js']);
  const nomes = r.novos.map(a => a.nome);
  registrar('nome já ocupado no projeto não é reaproveitado',
    r.separou && !nomes.includes('styles.css') && !nomes.includes('game.js'),
    nomes.join(' + '));
}

// ====== 7) O CASO TRAIÇOEIRO: '</script>' dentro de uma string do código ======
// Um jogo que gera HTML tem isso. A tag fecharia cedo demais, e a leitura pegaria meio script.
{
  const comFechamentoNaString = `<!DOCTYPE html><html><body>
<script>
  const molde = '<div>oi<' + '/script>';
  console.log(molde);
</script>
</body></html>`;
  const r = separarProjeto(comFechamentoNaString, ['index.html']);
  registrar('script com fechamento montado por concatenação é separado inteiro',
    roundTripOk(comFechamentoNaString, r),
    r.separou ? 'ida e volta idênticas' : r.motivo);
}

// ====== 8) A CONFERÊNCIA É O QUE SUSTENTA A PROMESSA ======
// Este caso não testa um HTML: testa que a rede de segurança existe e reprova de verdade.
{
  const r = separarProjeto(JOGO, ['index.html']);
  const adulterado = { ...r, novos: r.novos.map(a => ({ ...a, conteudo: a.conteudo + '\nintruso();' })) };
  const bate = normalizar(remontar(adulterado.html, adulterado.novos)) === normalizar(JOGO);
  registrar('a conferência REPROVA quando o conteúdo não devolve o original',
    !bate, 'diferença detectada — nesse caso a separação não acontece');
}

{
  registrar('a leitura de blocos ignora o que não deve extrair',
    acharBlocos('<script src="a.js"></script><script type="application/json">{}</script>').length === 0
      && acharBlocos('<style>a{}</style>').length === 1,
    'só blocos extraíveis entram na conta');
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
