/**
 * Roda o OSONE CODE num Chromium e confere que o código APARECE ENQUANTO É ESCRITO.
 *
 * Relatado assim: "não quero que ele me entregue o texto no final, quero ver o texto sendo
 * escrito em tempo real". O leitor do fluxo já é conferido em conferir-escrita-ao-vivo.mjs; o que
 * falta provar é a outra metade — que o texto realmente aparece na tela ANTES de a geração
 * terminar. Isso não dá para verificar lendo o código: só medindo a tela no meio da escrita.
 *
 * Cada caso aqui é uma pergunta que a pessoa faria olhando o app: o texto está saindo? dá para
 * parar no meio? o arquivo continua intacto se eu parar? o editor volta quando acaba?
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-painel-ao-vivo.mjs
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

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-ao-vivo-ui-'));
const entrada = path.join(pastaTemp, 'entrada.tsx');
const pagina = path.join(pastaTemp, 'index.html');

/**
 * A aba é montada com a IA substituída por uma escrita passo a passo comandada pelo teste:
 * window.__proximoPedaco() solta mais um pedaço, e a geração só termina quando o teste mandar.
 * É assim que dá para medir a tela COM a geração ainda em curso — que é o ponto.
 */
fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodeWorkspace } from ${JSON.stringify(path.join(RAIZ, 'src/components/CodeWorkspace'))};

createRoot(document.getElementById('raiz')).render(
  React.createElement('div', { style: { height: '100vh' } },
    React.createElement(CodeWorkspace, {
      onClose: () => {},
      onStartLiveVoice: () => {},
      apiKeys: { gemini: 'x' },
      isGenerating: false,
      onGenerateCodeRequest: async (p, _i, _m, alvo, aoEscrever, sinal) => {
        window.__cancelado = false;
        let acumulado = '';
        window.__proximoPedaco = (pedaco) => { acumulado += pedaco; aoEscrever && aoEscrever(acumulado); };
        return await new Promise((resolve) => {
          window.__terminar = () => resolve({ conteudo: acumulado, resumo: 'ao vivo' });
          sinal && sinal.addEventListener('abort', () => { window.__cancelado = true; resolve(null); });
        });
      }
    })
  )
);
`);
fs.writeFileSync(pagina, `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#07080d;color:#ccc"><div id="raiz"></div><script src="./code.js"></script></body></html>`);

await build({
  entryPoints: [entrada],
  bundle: true,
  outfile: path.join(pastaTemp, 'code.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [path.join(RAIZ, 'node_modules')],
  absWorkingDir: RAIZ,
  logLevel: 'silent'
});

const CHAVE = 'osone_code_repository_files';
const REPO = [
  { id: 'main-app', name: 'index.html', language: 'html', isMain: true, updatedAt: 1,
    content: '<h1>HTML ORIGINAL</h1>' }
];

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const executavel = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const nav = await chromium.launch(executavel ? { executablePath: executavel } : {});

const abrir = async () => {
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
  const pag = await ctx.newPage();
  await pag.addInitScript(([repo, chave]) => {
    localStorage.setItem(chave, JSON.stringify(repo));
    localStorage.setItem('osone_code_active_project_id', 'proj-1');
  }, [REPO, CHAVE]);
  await pag.goto('file://' + pagina);
  await pag.waitForTimeout(500);
  return { pag, ctx };
};

const lerRepo = (pag) => pag.evaluate(chave => JSON.parse(localStorage.getItem(chave) || '[]'), CHAVE);
const pedir = async (pag, texto) => {
  await pag.getByPlaceholder('Descreva a alteração').fill(texto);
  await pag.getByRole('button', { name: 'Gerar Código' }).click();
  await pag.waitForTimeout(250);
};
const escrever = async (pag, pedaco) => {
  await pag.evaluate(p => window.__proximoPedaco(p), pedaco);
  await pag.waitForTimeout(120);
};
const painelAoVivo = (pag) => pag.getByText('A IA está escrevendo…');

// ====== 1) O PEDIDO CENTRAL: o texto aparece DURANTE a geração ======
{
  const { pag, ctx } = await abrir();
  await pedir(pag, 'faz um jogo');

  const painelApareceu = await painelAoVivo(pag).isVisible();
  registrar('o painel de escrita ao vivo aparece assim que a geração começa',
    painelApareceu, painelApareceu ? 'painel visível' : 'painel não apareceu');

  await escrever(pag, '<!DOCTYPE html>\n');
  const depoisDoPrimeiro = await pag.locator('pre.custom-scrollbar').first().innerText();
  await escrever(pag, '<html>\n<body>\n');
  const depoisDoSegundo = await pag.locator('pre.custom-scrollbar').first().innerText();

  registrar('O TEXTO APARECE NA TELA ENQUANTO É ESCRITO, antes de a geração terminar',
    depoisDoPrimeiro.includes('<!DOCTYPE html>')
      && depoisDoSegundo.includes('<body>')
      && depoisDoSegundo.length > depoisDoPrimeiro.length,
    `a tela cresceu de ${depoisDoPrimeiro.length} para ${depoisDoSegundo.length} caracteres durante a geração`);

  // Enquanto isso, o arquivo no repositório não foi tocado: a gravação é só no fim.
  const repoDurante = await lerRepo(pag);
  registrar('durante a escrita, o arquivo do repositório continua intacto',
    repoDurante[0].content === '<h1>HTML ORIGINAL</h1>',
    repoDurante[0].content === '<h1>HTML ORIGINAL</h1>' ? 'nada gravado ainda' : 'GRAVOU no meio da escrita');

  const contador = await pag.getByText(/caracteres escritos/).innerText();
  registrar('o cabeçalho conta os caracteres já escritos, e não os do arquivo',
    /\d+ caracteres escritos/.test(contador), contador.trim());

  await escrever(pag, '</body>\n</html>');
  await pag.evaluate(() => window.__terminar());
  await pag.waitForTimeout(400);

  const repoDepois = await lerRepo(pag);
  registrar('ao terminar, o texto escrito ao vivo é o que vai para o arquivo',
    repoDepois[0].content.includes('</html>') && repoDepois[0].content.startsWith('<!DOCTYPE html>'),
    `${repoDepois[0].content.length} caracteres gravados`);

  const painelSumiu = !(await painelAoVivo(pag).isVisible().catch(() => false));
  registrar('o editor volta ao normal quando a geração termina',
    painelSumiu, painelSumiu ? 'painel fechado' : 'painel ficou preso na tela');

  await ctx.close();
}

// ====== 2) DÁ PARA PARAR NO MEIO — que é metade do valor de ver a escrita acontecendo ======
{
  const { pag, ctx } = await abrir();
  await pedir(pag, 'faz um jogo de nave');
  await escrever(pag, '<!DOCTYPE html>\n<html>\n');

  await pag.getByRole('button', { name: 'Cancelar' }).click();
  await pag.waitForTimeout(400);

  const cancelou = await pag.evaluate(() => window.__cancelado);
  registrar('o botão Cancelar interrompe a geração de verdade',
    cancelou === true, cancelou ? 'a geração foi abortada' : 'o pedido continuou correndo');

  const repo = await lerRepo(pag);
  registrar('cancelar não deixa meio arquivo gravado por cima do que existia',
    repo[0].content === '<h1>HTML ORIGINAL</h1>',
    repo[0].content === '<h1>HTML ORIGINAL</h1>' ? 'arquivo preservado' : 'ARQUIVO danificado');

  const painelSumiu = !(await painelAoVivo(pag).isVisible().catch(() => false));
  registrar('o editor volta ao normal depois do cancelamento',
    painelSumiu, painelSumiu ? 'painel fechado' : 'painel ficou preso na tela');

  // O pedido volta para a caixa: cancelar para reformular é o motivo mais provável de cancelar.
  const caixa = await pag.getByPlaceholder('Descreva a alteração').inputValue();
  registrar('o pedido cancelado volta para a caixa, para não ser digitado de novo',
    caixa === 'faz um jogo de nave', JSON.stringify(caixa));

  await ctx.close();
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
