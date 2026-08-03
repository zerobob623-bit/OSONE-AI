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

fs.rmSync(pastaTemp, { recursive: true, force: true });

const falhas = casos.filter(c => !c.passou).length;
console.log(`\n${casos.length - falhas}/${casos.length} conferências passaram.`);
process.exit(falhas ? 1 : 0);
