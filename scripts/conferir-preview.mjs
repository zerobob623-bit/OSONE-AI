/**
 * Confere a montagem do preview do OSONE CODE (src/lib/montarPreview.ts).
 *
 * Por que existe: o preview mostrava só o arquivo aberto, e o sintoma disso era silencioso —
 * um styles.css que ninguém carregava parecia um CSS que "não funciona", e abrir o próprio
 * styles.css desenhava o CSS como texto, o que parecia defeito do código do usuário. Nada disso
 * dava erro; a única forma de julgar é comparar a página montada com o que ela deveria conter.
 *
 * Como rodar:  node scripts/conferir-preview.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-preview-'));
const arquivoJs = path.join(pastaTemp, 'montar.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/montarPreview.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: arquivoJs,
  logLevel: 'silent'
});

const { montarPreview } = await import(pathToFileURL(arquivoJs).href);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const PAGINA = {
  id: 'main-app', name: 'index.html', language: 'html', isMain: true,
  content: `<!DOCTYPE html>
<html><head>
<link rel="stylesheet" href="https://cdn.exemplo/externo.css">
<link rel="stylesheet" href="styles.css">
</head><body>
<h1>OLA</h1>
<script src="https://cdn.exemplo/lib.js"></script>
<script src="script.js"></script>
</body></html>`
};
const CSS = { id: 'css-1', name: 'styles.css', language: 'css', content: 'body { color: tomato; }' };
const JS = { id: 'js-1', name: 'script.js', language: 'javascript', content: 'console.log("OI DO SCRIPT");' };
const PROJETO = [PAGINA, CSS, JS];

// 1) Com a página aberta, CSS e JS do projeto entram embutidos.
{
  const html = montarPreview(PROJETO, PAGINA);
  const ok = html.includes('body { color: tomato; }')
    && html.includes('console.log("OI DO SCRIPT")')
    && !html.includes('href="styles.css"')
    && !html.includes('src="script.js"');
  registrar('CSS e JS do projeto entram na página', ok,
    ok ? 'os dois embutidos, e as referências sumiram' : 'faltou embutir algum arquivo');
}

// 2) Endereço externo continua sendo buscado na internet, não inventado a partir do projeto.
{
  const html = montarPreview(PROJETO, PAGINA);
  registrar('CDN externo é preservado',
    html.includes('https://cdn.exemplo/externo.css') && html.includes('https://cdn.exemplo/lib.js'),
    'link e script externos intactos');
}

// 3) Editando o CSS, o preview mostra a PÁGINA — e já com o texto que está sendo digitado.
{
  const cssEditando = { ...CSS, content: 'body { color: rebeccapurple; }' };
  const html = montarPreview(PROJETO, cssEditando);
  const ok = html.includes('<h1>OLA</h1>') && html.includes('rebeccapurple') && !html.includes('tomato');
  registrar('abrir o styles.css mostra a página, com a edição em curso', ok,
    ok ? 'página renderizada com o CSS novo' : 'mostrou o arquivo cru ou o conteúdo velho');
}

// 4) O mesmo vale para o JS.
{
  const jsEditando = { ...JS, content: 'console.log("NOVINHO");' };
  const html = montarPreview(PROJETO, jsEditando);
  registrar('abrir o script.js mostra a página, com a edição em curso',
    html.includes('<h1>OLA</h1>') && html.includes('NOVINHO'), 'página com o script novo');
}

// 5) Caminhos com pasta e com ./ apontam para o mesmo arquivo do repositório.
{
  const comPasta = { ...PAGINA, content: PAGINA.content.replace('"styles.css"', '"./css/styles.css"') };
  const html = montarPreview([comPasta, CSS, JS], comPasta);
  registrar('caminho com pasta resolve pelo nome do arquivo',
    html.includes('body { color: tomato; }'), 'styles.css encontrado por "./css/styles.css"');
}

// 6) Referência para um arquivo que não existe fica como está, em vez de sumir da página.
{
  const semArquivo = { ...PAGINA, content: PAGINA.content.replace('"script.js"', '"nao-existe.js"') };
  const html = montarPreview([semArquivo, CSS], semArquivo);
  registrar('referência inexistente é preservada',
    html.includes('src="nao-existe.js"'), 'a tag original continua lá');
}

// 7) Script que contém a sequência de fechamento não pode cortar a página ao meio.
{
  const jsPerigoso = { ...JS, content: 'document.write("<' + '/script>");' };
  const html = montarPreview([PAGINA, CSS, jsPerigoso], PAGINA);
  const depoisDoScript = html.split('data-osone-origem="script.js"')[1] || '';
  registrar('script com fechamento embutido não quebra a página',
    depoisDoScript.includes('</body>') && html.includes('<\\/script>'),
    'a sequência foi neutralizada e o corpo da página seguiu inteiro');
}

// 8) Projeto sem página nenhuma: devolve o arquivo aberto, para o modo de JS puro funcionar.
{
  const html = montarPreview([JS], JS);
  registrar('projeto só com script devolve o próprio script',
    html === JS.content, 'sem página, o preview recebe o arquivo aberto');
}

// ====== MÓDULOS: UM ARQUIVO IMPORTANDO O OUTRO ======
//
// Sem isto não existe projeto JavaScript de verdade. O preview roda a partir de um documento sem
// endereço próprio, então um `import './util.js'` cru não tem contra o que ser resolvido: o módulo
// inteiro falha e a página fica em branco, com um erro no console apontando um caminho inexistente
// — o que manda quem programa procurar defeito no arquivo errado.
//
// Estes casos rodam o resultado num Chromium DE VERDADE: montar o texto certo não prova nada se o
// navegador recusar executá-lo.
const modulo = (nome, conteudo) => ({ id: 'm-' + nome, name: nome, language: 'javascript', content: conteudo });
const PAGINA_MODULO = {
  id: 'p-mod', name: 'index.html', language: 'html', isMain: true,
  content: '<div id="saida"></div><script type="module" src="app.js"></script>'
};

let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* sem navegador: os casos abaixo são pulados */ }

const executarNoNavegador = async (html) => {
  const executavel = process.env.CHROMIUM_PATH
    || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
  const nav = await chromium.launch(executavel ? { executablePath: executavel } : {});
  const pag = await nav.newPage();
  const erros = [];
  pag.on('pageerror', e => erros.push(String(e)));
  pag.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  await pag.setContent(html);
  await pag.waitForTimeout(400);
  const saida = await pag.locator('#saida').innerText().catch(() => '');
  await nav.close();
  return { saida, erros };
};

// 9) Import simples entre dois arquivos do projeto.
if (chromium) {
  const html = montarPreview([
    PAGINA_MODULO,
    modulo('app.js', "import { soma } from './util.js';\ndocument.getElementById('saida').textContent = soma(2, 3);"),
    modulo('util.js', 'export function soma(a, b) { return a + b; }')
  ], PAGINA_MODULO);
  const { saida, erros } = await executarNoNavegador(html);
  registrar('um arquivo importando o outro roda de verdade no navegador',
    saida === '5' && erros.length === 0,
    saida === '5' ? 'saída 5' : `saída "${saida}"; erros: ${erros.join(' | ').slice(0, 120)}`);
}

// 10) Cadeia de três níveis — o caso que quebrava por causa das aspas no endereço aninhado.
if (chromium) {
  const html = montarPreview([
    PAGINA_MODULO,
    modulo('app.js', "import { dobro } from './util.js';\ndocument.getElementById('saida').textContent = dobro(21);"),
    modulo('util.js', "import { FATOR } from './const.js';\nexport const dobro = (n) => n * FATOR;"),
    modulo('const.js', 'export const FATOR = 2;')
  ], PAGINA_MODULO);
  const { saida, erros } = await executarNoNavegador(html);
  registrar('cadeia de três arquivos encadeados também roda',
    saida === '42' && erros.length === 0,
    saida === '42' ? 'saída 42' : `saída "${saida}"; erros: ${erros.join(' | ').slice(0, 160)}`);
}

// 11) Import de biblioteca externa não pode ser tocado — é a CDN que resolve, não nós.
{
  const html = montarPreview([
    PAGINA_MODULO,
    modulo('app.js', "import React from 'react';\nimport x from 'https://cdn.exemplo/x.js';\nimport { a } from './util.js';"),
    modulo('util.js', 'export const a = 1;')
  ], PAGINA_MODULO);
  registrar('import de biblioteca e de CDN fica intacto',
    html.includes("from 'react'") && html.includes("from 'https://cdn.exemplo/x.js'") && !/from\s*['"]\.\/util/.test(html),
    'só o arquivo do projeto foi reescrito');
}

// 12) Script clássico (sem type=module) não pode ser reescrito: 'from' ali é texto comum.
{
  const classico = { id: 'c1', name: 'app.js', language: 'javascript', content: "var t = \"vem from './util.js'\";" };
  const pagina = { id: 'p2', name: 'index.html', language: 'html', isMain: true, content: '<script src="app.js"></script>' };
  const html = montarPreview([pagina, classico, modulo('util.js', 'export const a = 1;')], pagina);
  registrar('script clássico não tem seus imports reescritos',
    html.includes("vem from './util.js'"),
    'texto preservado');
}

// 13) Ciclo entre arquivos não pode travar a montagem do preview.
{
  const html = montarPreview([
    PAGINA_MODULO,
    modulo('app.js', "import { b } from './outro.js';\nexport const a = 1;"),
    modulo('outro.js', "import { a } from './app.js';\nexport const b = 2;")
  ], PAGINA_MODULO);
  registrar('ciclo de imports não trava nem estoura a montagem',
    typeof html === 'string' && html.length > 0,
    'preview montado sem travar');
}


fs.rmSync(pastaTemp, { recursive: true, force: true });

const falhas = casos.filter(c => !c.passou).length;
console.log(`\n${casos.length - falhas}/${casos.length} conferências passaram.`);
process.exit(falhas ? 1 : 0);
