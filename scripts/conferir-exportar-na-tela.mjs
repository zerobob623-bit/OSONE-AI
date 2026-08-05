/**
 * Clica no botão de exportar num Chromium, PEGA O ARQUIVO BAIXADO e abre o que veio dentro.
 *
 * A montagem do pacote é conferida em conferir-exportar-projeto.mjs, sem navegador. O que só o
 * navegador prova é a ponte: que o botão realmente dispara um download, que o arquivo chega ao
 * disco com o nome certo, e que o que está dentro dele é o projeto que estava na tela.
 *
 * Essa ponte tem partes que não existem fora do navegador — createObjectURL, o clique programado
 * num <a download>, a permissão de baixar. Um teste que chamasse só a função de empacotar passaria
 * mesmo se o botão não baixasse nada.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-exportar-na-tela.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error("Este conferidor precisa do playwright: rode 'npm i -D playwright' e tente de novo.");
  process.exit(2);
}

const JSZip = (await import(path.join(RAIZ, 'node_modules/jszip/lib/index.js'))).default;

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-exportar-tela-'));
const entrada = path.join(pastaTemp, 'entrada.tsx');
const pagina = path.join(pastaTemp, 'index.html');

fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodeWorkspace } from ${JSON.stringify(path.join(RAIZ, 'src/components/CodeWorkspace'))};

createRoot(document.getElementById('raiz')).render(
  React.createElement('div', { style: { height: '100vh' } },
    React.createElement(CodeWorkspace, {
      onClose: () => {}, onStartLiveVoice: () => {},
      apiKeys: { gemini: 'x' }, isGenerating: false,
      onGenerateCodeRequest: async () => null
    })
  )
);
`);
fs.writeFileSync(pagina, `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#07080d;color:#ccc"><div id="raiz"></div><script src="./code.js"></script></body></html>`);

await build({
  entryPoints: [entrada], bundle: true, outfile: path.join(pastaTemp, 'code.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});

const CHAVE_PROJETOS = 'osone_code_projects_v2';
const CHAVE_ATIVO = 'osone_code_active_project_id';

const HTML = '<!DOCTYPE html>\n<html><body><h1>OSONE KART</h1></body></html>';
const CSS = 'body { background: #101020; }';
const JS = "console.log('acelera');";

const PROJETOS = [1, 2, 3, 4, 5].map(n => ({
  id: `proj-${n}`, name: n === 1 ? 'Kart 3D' : `Projeto ${n}`, activeFileId: 'main-app', updatedAt: 1,
  files: n === 1
    ? [{ id: 'main-app', name: 'index.html', language: 'html', isMain: true, updatedAt: 1, content: HTML },
       { id: 'f2', name: 'styles.css', language: 'css', updatedAt: 1, content: CSS },
       { id: 'f3', name: 'game.js', language: 'javascript', updatedAt: 1, content: JS }]
    : [{ id: 'main-app', name: 'index.html', language: 'html', isMain: true, updatedAt: 1, content: '<h1>vazio</h1>' }]
}));

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const executavel = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const nav = await chromium.launch(executavel ? { executablePath: executavel } : {});
const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const pag = await ctx.newPage();
await pag.addInitScript(([ps, cp, ca]) => {
  localStorage.setItem(cp, JSON.stringify(ps));
  localStorage.setItem(ca, 'proj-1');
}, [PROJETOS, CHAVE_PROJETOS, CHAVE_ATIVO]);
await pag.goto('file://' + pagina);
await pag.waitForTimeout(800);

// ====== O CLIQUE, E O ARQUIVO QUE CHEGA AO DISCO ======
const esperandoDownload = pag.waitForEvent('download', { timeout: 15000 });
await pag.locator('button[title*="Baixar o projeto inteiro"]').click();

let baixado = null;
try {
  baixado = await esperandoDownload;
} catch (e) {
  registrar('clicar no botão dispara o download do projeto', false, 'nenhum download aconteceu');
}

if (baixado) {
  registrar('clicar no botão dispara o download do projeto', true, 'download recebido');

  registrar('o arquivo baixado tem o nome do projeto e a extensão .zip',
    /^kart-3d-\d{4}-\d{2}-\d{2}\.zip$/.test(baixado.suggestedFilename()),
    baixado.suggestedFilename());

  const destino = path.join(pastaTemp, 'baixado.zip');
  await baixado.saveAs(destino);

  const zip = await JSZip.loadAsync(fs.readFileSync(destino));
  const dentro = {};
  for (const nome of Object.keys(zip.files)) {
    if (!zip.files[nome].dir) dentro[nome] = await zip.files[nome].async('string');
  }

  registrar('o pacote no disco tem os três arquivos do projeto',
    Object.keys(dentro).length === 3
      && dentro['index.html'] !== undefined && dentro['styles.css'] !== undefined && dentro['game.js'] !== undefined,
    Object.keys(dentro).join(' + '));

  registrar('o conteúdo dos arquivos é o que estava no editor',
    dentro['index.html'] === HTML && dentro['styles.css'] === CSS && dentro['game.js'] === JS,
    'idêntico ao editor');

  registrar('o index.html baixado é uma página que abre sozinha no navegador',
    dentro['index.html'].includes('<!DOCTYPE html>') && dentro['index.html'].includes('OSONE KART'),
    'dá para abrir com dois cliques');
}

// ====== A TELA CONFIRMA O QUE ACONTECEU ======
{
  await pag.waitForTimeout(600);
  const aviso = await pag.getByText(/baixado com 3 arquivo/).isVisible().catch(() => false);
  registrar('a tela confirma o download e diz quantos arquivos foram',
    aviso, aviso ? 'confirmação visível' : 'baixou em silêncio');
}

// ====== PROJETO SEM CONTEÚDO NÃO ENTREGA PACOTE VAZIO ======
// Um zip vazio faria a pessoa achar que exportou, e descobrir o contrário só na hora de usar.
{
  /**
   * O projeto é esvaziado PELO EDITOR, e não mexendo no localStorage.
   *
   * Mexer no armazenamento e recarregar não funcionaria: o addInitScript deste conferidor roda a
   * cada navegação e reescreveria o estado montado no começo, desfazendo a alteração em silêncio
   * — o caso passaria a medir o projeto cheio achando que media o vazio. Esvaziar pelo editor é o
   * que uma pessoa faria, e não briga com a preparação do teste.
   */
  await pag.getByText('Projeto 2', { exact: true }).first().click();
  await pag.waitForTimeout(500);
  await pag.locator('textarea.code-editor-textarea').first().click();
  await pag.keyboard.press('Control+a');
  await pag.keyboard.press('Delete');
  await pag.waitForTimeout(600);

  await pag.locator('button[title*="Baixar o projeto inteiro"]').click();

  // O aviso some sozinho depois de alguns segundos: esperar por ele é mais confiável do que
  // dormir um tempo fixo e torcer para a medição cair dentro da janela em que ele existe.
  const explicou = await pag.getByText(/Não há nada para exportar/)
    .waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);

  const projetoNaTela = await pag.locator('.text-cyan-400.font-semibold').first().innerText().catch(() => '?');
  registrar('projeto vazio explica em vez de baixar um pacote vazio',
    explicou, explicou ? 'a tela explicou' : `não avisou nada (arquivo aberto: ${projetoNaTela})`);
}

await ctx.close();
await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
