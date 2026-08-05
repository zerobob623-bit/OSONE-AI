/**
 * Separa um jogo de verdade num Chromium e prova que o PREVIEW CONTINUA IDÊNTICO.
 *
 * A lógica da separação é conferida em conferir-separar-arquivos.mjs, sem navegador. O que só o
 * navegador prova é a afirmação que o botão faz ao usuário: "o preview continua idêntico". Ela
 * não pode ser verificada lendo código — depende do preview remontar os arquivos exatamente como
 * o HTML grudado estava, e disso só a página desenhada dá notícia.
 *
 * O jeito de provar é rodar o mesmo jogo duas vezes, antes e depois de separar, e comparar o que
 * a PÁGINA passou a ser: o texto na tela, a cor que o CSS aplicou, e o resultado que só existe se
 * o JavaScript tiver rodado na ordem certa. É essa terceira medida que pega o erro mais grave da
 * separação — script que sai do fim do body e passa a rodar antes de a página existir.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-separar-na-tela.mjs
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

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-separar-tela-'));
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

/**
 * O script fica no FIM do body e mexe num elemento que está acima dele. É de propósito: se a
 * separação o movesse para o head, ele rodaria antes de o elemento existir e o texto nunca
 * apareceria — o defeito silencioso que este conferidor precisa ser capaz de pegar.
 */
const JOGO = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; background: #101020; }
    #placar { color: rgb(0, 255, 128); font-size: 32px; }
  </style>
</head>
<body>
  <div id="placar">aguardando</div>
  <script>
    document.getElementById('placar').textContent = 'VOLTAS: 3';
  </script>
</body>
</html>`;

const PROJETOS = [1, 2, 3, 4, 5].map(n => ({
  id: `proj-${n}`, name: `Projeto ${n}`, activeFileId: 'main-app', updatedAt: 1,
  files: [{ id: 'main-app', name: 'index.html', language: 'html', isMain: true, updatedAt: 1,
            content: n === 1 ? JOGO : '<h1>outro</h1>' }]
}));

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const executavel = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const nav = await chromium.launch(executavel ? { executablePath: executavel } : {});

const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
const pag = await ctx.newPage();
await pag.addInitScript(([ps, cp, ca]) => {
  localStorage.setItem(cp, JSON.stringify(ps));
  localStorage.setItem(ca, 'proj-1');
}, [PROJETOS, CHAVE_PROJETOS, CHAVE_ATIVO]);
await pag.goto('file://' + pagina);
await pag.waitForTimeout(2000);

/** O que a PÁGINA do preview virou: texto, cor aplicada pelo CSS, e prova de que o JS rodou. */
const medirPreview = async () => {
  const quadro = pag.frameLocator('iframe').first();
  const placar = quadro.locator('#placar');
  await placar.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
  return {
    texto: await placar.textContent().catch(() => '(sem elemento)'),
    cor: await placar.evaluate(el => getComputedStyle(el).color).catch(() => '(sem cor)'),
    fundo: await quadro.locator('body').evaluate(el => getComputedStyle(el).backgroundColor).catch(() => '(sem fundo)')
  };
};

const antes = await medirPreview();
registrar('antes de separar, o preview mostra o jogo funcionando',
  antes.texto === 'VOLTAS: 3' && antes.cor === 'rgb(0, 255, 128)',
  `texto="${antes.texto}", cor=${antes.cor}`);

// ====== A SEPARAÇÃO ======
await pag.getByRole('button', { name: 'Separar' }).click();
await pag.waitForTimeout(2000);

{
  const arquivos = await pag.evaluate(c => JSON.parse(localStorage.getItem(c) || '[]')
    .find(p => p.id === 'proj-1').files.map(f => f.name), CHAVE_PROJETOS);
  registrar('o projeto passa a ter três arquivos',
    arquivos.length === 3 && arquivos.includes('styles.css') && arquivos.includes('game.js'),
    arquivos.join(' + '));
}

{
  const conteudos = await pag.evaluate(c => {
    const fs = JSON.parse(localStorage.getItem(c) || '[]').find(p => p.id === 'proj-1').files;
    return Object.fromEntries(fs.map(f => [f.name, f.content]));
  }, CHAVE_PROJETOS);

  registrar('o index.html ficou só com a estrutura e as referências',
    conteudos['index.html'].includes('href="styles.css"')
      && conteudos['index.html'].includes('src="game.js"')
      && !conteudos['index.html'].includes('VOLTAS: 3')
      && !conteudos['index.html'].includes('background: #101020'),
    `${conteudos['index.html'].length} caracteres (era ${JOGO.length})`);

  registrar('o CSS e o JS foram para os arquivos certos',
    conteudos['styles.css'].includes('#101020') && conteudos['game.js'].includes('VOLTAS: 3'),
    'cada um no seu lugar');
}

// ====== A PROMESSA DO BOTÃO ======
{
  const depois = await medirPreview();
  registrar('DEPOIS de separar, a página do preview é exatamente a mesma',
    depois.texto === antes.texto && depois.cor === antes.cor && depois.fundo === antes.fundo,
    `texto="${depois.texto}", cor=${depois.cor}, fundo=${depois.fundo}`);

  // Esta é a medida que pega o erro grave: o texto só existe se o script tiver rodado DEPOIS de o
  // elemento existir. Movido para o head, ele acharia null e o texto seria 'aguardando'.
  registrar('o script continua rodando na hora certa (a ordem não mudou)',
    depois.texto === 'VOLTAS: 3',
    depois.texto === 'aguardando' ? 'o script passou a rodar cedo demais' : 'ordem preservada');
}

// ====== DÁ PARA VOLTAR ATRÁS ======
{
  await pag.locator('textarea.code-editor-textarea').first().click();
  await pag.keyboard.press('Control+z');
  await pag.waitForTimeout(1500);

  const arquivos = await pag.evaluate(c => JSON.parse(localStorage.getItem(c) || '[]')
    .find(p => p.id === 'proj-1').files, CHAVE_PROJETOS);
  registrar('um Ctrl+Z desfaz a separação inteira de uma vez',
    arquivos.length === 1 && arquivos[0].content === JOGO,
    `voltou a ${arquivos.length} arquivo(s)`);
}

// ====== O BOTÃO NÃO APARECE QUANDO NÃO HÁ O QUE SEPARAR ======
{
  await pag.getByRole('button', { name: 'Separar' }).click();
  await pag.waitForTimeout(1500);
  const aindaTem = await pag.getByRole('button', { name: 'Separar' }).isVisible().catch(() => false);
  registrar('depois de separado, o botão some — não sobra ação que só diria "não"',
    !aindaTem, aindaTem ? 'botão continuou oferecido' : 'botão escondido');
}

await ctx.close();
await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
