/**
 * Roda um código QUE QUEBRA DE VERDADE num Chromium e confere que o erro chega até a IA.
 *
 * A montagem do pedido é conferida em conferir-erros-do-preview.mjs, sem navegador. O que só o
 * navegador pode provar é a ponte: que um `ReferenceError` lançado dentro do iframe do preview
 * atravessa até o painel do OSONE CODE, aparece para o usuário, e vira um pedido com a mensagem
 * real dentro.
 *
 * Nada aqui é simulado do lado do erro: o código do preview tem um defeito plantado, o navegador
 * executa, e o erro que viaja é o que o motor de JavaScript de verdade produziu. Um teste que
 * fabricasse a mensagem à mão estaria conferindo o próprio teste — a única parte que pode dar
 * errado é justamente o caminho entre o iframe e o painel.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-erro-vira-conserto.mjs
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

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-erro-conserto-'));
const entrada = path.join(pastaTemp, 'entrada.tsx');
const pagina = path.join(pastaTemp, 'index.html');

fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodeWorkspace } from ${JSON.stringify(path.join(RAIZ, 'src/components/CodeWorkspace'))};

createRoot(document.getElementById('raiz')).render(
  React.createElement('div', { style: { height: '100vh' } },
    React.createElement(CodeWorkspace, {
      onClose: () => {},
      onStartLiveVoice: () => {},
      apiKeys: { gemini: 'x', geminiModel: 'gemini-3.6-flash' },
      isGenerating: false,
      onGenerateCodeRequest: async (p) => { window.__pedidoRecebido = p; return null; }
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

/** Um jogo com um defeito plantado: 'kart' nunca é criado, e desenhar() explode ao rodar. */
const JOGO_QUEBRADO = `<!DOCTYPE html>
<html><body>
<canvas id="pista"></canvas>
<script>
  const ctx = document.getElementById('pista').getContext('2d');
  function desenhar() { ctx.fillRect(kart.x, kart.y, 20, 20); }
  desenhar();
</script>
</body></html>`;

const JOGO_SADIO = `<!DOCTYPE html>
<html><body>
<canvas id="pista"></canvas>
<script>
  const ctx = document.getElementById('pista').getContext('2d');
  const kart = { x: 10, y: 10 };
  function desenhar() { ctx.fillRect(kart.x, kart.y, 20, 20); }
  desenhar();
</script>
</body></html>`;

const projetos = (conteudo) => [1, 2, 3, 4, 5].map(n => ({
  id: `proj-${n}`, name: `Projeto ${n}`, activeFileId: 'main-app', updatedAt: 1,
  files: [{ id: 'main-app', name: 'index.html', language: 'html', isMain: true, updatedAt: 1,
            content: n === 1 ? conteudo : '<h1>outro</h1>' }]
}));

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const executavel = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const nav = await chromium.launch(executavel ? { executablePath: executavel } : {});

const abrir = async (conteudo) => {
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
  const pag = await ctx.newPage();
  await pag.addInitScript(([ps, cp, ca]) => {
    localStorage.setItem(cp, JSON.stringify(ps));
    localStorage.setItem(ca, 'proj-1');
  }, [projetos(conteudo), CHAVE_PROJETOS, CHAVE_ATIVO]);
  await pag.goto('file://' + pagina);
  // O preview precisa montar, rodar e falhar — e a mensagem precisa atravessar o iframe.
  await pag.waitForTimeout(2500);
  return { pag, ctx };
};

const tarjaDeErro = (pag) => pag.getByText(/O código quebrou ao rodar|erros ao rodar o código/);

// ====== 1) O ERRO ATRAVESSA O IFRAME E APARECE NO PAINEL ======
{
  const { pag, ctx } = await abrir(JOGO_QUEBRADO);
  const apareceu = await tarjaDeErro(pag).isVisible().catch(() => false);
  registrar('erro lançado dentro do preview chega ao painel do OSONE CODE',
    apareceu, apareceu ? 'tarja visível' : 'o erro ficou preso no iframe, como antes');

  const temBotao = await pag.getByRole('button', { name: /Corrigir com a IA/ }).isVisible().catch(() => false);
  registrar('o painel oferece corrigir com a IA',
    temBotao, temBotao ? 'botão presente' : 'sem caminho para o conserto');

  await ctx.close();
}

// ====== 2) O PEDIDO CARREGA O ERRO REAL DO NAVEGADOR ======
{
  const { pag, ctx } = await abrir(JOGO_QUEBRADO);
  await pag.getByRole('button', { name: /Corrigir com a IA/ }).click();
  await pag.waitForTimeout(700);

  const pedido = await pag.evaluate(() => window.__pedidoRecebido) || '';
  registrar('o pedido enviado à IA contém a mensagem que o navegador produziu',
    /kart is not defined|kart' is not defined|ReferenceError/i.test(pedido),
    (pedido.split('\\n').find(l => /Reference|kart/i.test(l)) || pedido.slice(0, 70)).trim());

  registrar('o pedido contém o texto da linha que falhou, para a IA achar o lugar',
    pedido.includes('ctx.fillRect(kart.x, kart.y, 20, 20)'),
    pedido.includes('ctx.fillRect') ? 'linha citada literalmente' : 'a IA teria que adivinhar onde é');

  registrar('o pedido nomeia o arquivo e manda corrigir a causa',
    pedido.includes('index.html') && /causa, não o sintoma/i.test(pedido),
    'instruções presentes');

  await ctx.close();
}

// ====== 3) CÓDIGO SADIO NÃO ACUSA NADA ======
// Alarme falso aqui seria pior que a falta do recurso: a tarja vermelha viveria acesa e o botão
// mandaria a IA consertar um projeto que está funcionando.
{
  const { pag, ctx } = await abrir(JOGO_SADIO);
  const apareceu = await tarjaDeErro(pag).isVisible().catch(() => false);
  registrar('código que roda sem erro não mostra tarja nenhuma',
    !apareceu, apareceu ? 'ALARME FALSO num projeto que funciona' : 'tela limpa');
  await ctx.close();
}

// ====== 4) O AVISO DO TAILWIND POR CDN NÃO É DEFEITO DO USUÁRIO ======
// Ele aparece em TODO projeto que o OSONE gera. Tratá-lo como erro faria a tarja viver acesa e o
// botão mandar a IA "consertar" uma escolha do próprio app.
{
  const comTailwind = JOGO_SADIO.replace('<canvas', '<script src="https://cdn.tailwindcss.com"></script>\n<canvas');
  const { pag, ctx } = await abrir(comTailwind);
  const apareceu = await tarjaDeErro(pag).isVisible().catch(() => false);
  registrar('o aviso do Tailwind por CDN não acende a tarja de erro',
    !apareceu, apareceu ? 'acusou um aviso que o próprio OSONE causa' : 'ignorado corretamente');
  await ctx.close();
}

// ====== 5) CONSERTAR O CÓDIGO APAGA O ERRO ANTIGO ======
// Sem isto, a tarja continuaria acesa depois do conserto e o botão mandaria a IA caçar de novo um
// defeito que ela acabou de resolver.
{
  const { pag, ctx } = await abrir(JOGO_QUEBRADO);
  const antes = await tarjaDeErro(pag).isVisible().catch(() => false);

  // O usuário conserta à mão, digitando no editor.
  await pag.evaluate((sadio) => {
    const area = document.querySelector('textarea.code-editor-textarea');
    const nativo = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativo.call(area, sadio);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }, JOGO_SADIO);
  await pag.waitForTimeout(2500);

  const depois = await tarjaDeErro(pag).isVisible().catch(() => false);
  registrar('consertar o código apaga a tarja do erro anterior',
    antes && !depois, `antes=${antes ? 'acesa' : 'apagada'}, depois=${depois ? 'AINDA acesa' : 'apagada'}`);
  await ctx.close();
}

// ====== 6) DÁ PARA DISPENSAR SEM CONSERTAR ======
{
  const { pag, ctx } = await abrir(JOGO_QUEBRADO);
  await pag.locator('button[title="Dispensar"]').first().click();
  await pag.waitForTimeout(400);
  const sumiu = !(await tarjaDeErro(pag).isVisible().catch(() => false));
  registrar('dá para dispensar o aviso sem mandar consertar',
    sumiu, sumiu ? 'tarja fechada' : 'não fechou');
  await ctx.close();
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
