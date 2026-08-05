/**
 * Abre o painel "o que mudou" num Chromium e confere que ele mostra a alteração de verdade.
 *
 * A comparação em si é conferida em conferir-comparar-codigo.mjs, sem navegador. O que só a tela
 * prova é o encaixe: que o painel compara contra o MESMO ponto para onde o Ctrl+Z voltaria, que a
 * mudança aparece marcada, e que fechar o painel não altera nada — quem abriu para conferir não
 * pode acabar mexendo no código sem querer.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-comparar-na-tela.mjs
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

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-comparar-tela-'));
const entrada = path.join(pastaTemp, 'entrada.tsx');
const pagina = path.join(pastaTemp, 'index.html');

const NOVO = `<!DOCTYPE html>
<html><body>
<h1>OSONE KART</h1>
<script>
const vidas = 5;
function desenhar() { ctx.fillRect(0, 0, 20, 20); }
</script>
</body></html>`;

fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodeWorkspace } from ${JSON.stringify(path.join(RAIZ, 'src/components/CodeWorkspace'))};

createRoot(document.getElementById('raiz')).render(
  React.createElement('div', { style: { height: '100vh' } },
    React.createElement(CodeWorkspace, {
      onClose: () => {}, onStartLiveVoice: () => {},
      apiKeys: { gemini: 'x' }, isGenerating: false,
      onGenerateCodeRequest: async () => ({ conteudo: ${JSON.stringify(NOVO)}, resumo: 'teste' })
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

/** O jogo antes do pedido: 3 vidas, retângulo de 10. A IA muda os dois. */
const ORIGINAL = `<!DOCTYPE html>
<html><body>
<h1>OSONE KART</h1>
<script>
const vidas = 3;
function desenhar() { ctx.fillRect(0, 0, 10, 10); }
</script>
</body></html>`;

const PROJETOS = [1, 2, 3, 4, 5].map(n => ({
  id: `proj-${n}`, name: `Projeto ${n}`, activeFileId: 'main-app', updatedAt: 1,
  files: [{ id: 'main-app', name: 'index.html', language: 'html', isMain: true, updatedAt: 1,
            content: n === 1 ? ORIGINAL : '<h1>outro</h1>' }]
}));

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
  await pag.addInitScript(([ps, cp, ca]) => {
    localStorage.setItem(cp, JSON.stringify(ps));
    localStorage.setItem(ca, 'proj-1');
  }, [PROJETOS, CHAVE_PROJETOS, CHAVE_ATIVO]);
  await pag.goto('file://' + pagina);
  await pag.waitForTimeout(700);
  return { pag, ctx };
};

const conteudoNoRepo = (pag) => pag.evaluate(c =>
  JSON.parse(localStorage.getItem(c) || '[]').find(p => p.id === 'proj-1').files[0].content, CHAVE_PROJETOS);

const gerar = async (pag) => {
  await pag.getByPlaceholder(/Descreva/).fill('aumenta as vidas e o tamanho');
  await pag.getByRole('button', { name: 'Gerar Código' }).click();
  await pag.waitForTimeout(1200);
};

// ====== 1) SEM ALTERAÇÃO ANTERIOR, NÃO HÁ O QUE COMPARAR ======
{
  const { pag, ctx } = await abrir();
  const tem = await pag.locator('button[title="Ver o que mudou na última alteração"]').isVisible().catch(() => false);
  registrar('sem histórico, o botão de comparar não aparece',
    !tem, tem ? 'ofereceu comparar sem ter com o quê' : 'escondido');
  await ctx.close();
}

// ====== 2) DEPOIS DA IA, O PAINEL MOSTRA O QUE MUDOU ======
{
  const { pag, ctx } = await abrir();
  await gerar(pag);

  await pag.locator('button[title="Ver o que mudou na última alteração"]').click();
  await pag.waitForTimeout(600);

  const aberto = await pag.getByText('O que mudou na última alteração').isVisible().catch(() => false);
  registrar('o painel de comparação abre depois da alteração da IA',
    aberto, aberto ? 'painel aberto' : 'não abriu');

  const texto = await pag.locator('.max-h-\\[88vh\\]').first().innerText();

  registrar('o painel mostra a linha que saiu e a que entrou',
    texto.includes('const vidas = 3;') && texto.includes('const vidas = 5;'),
    'as duas versões da linha estão na tela');

  registrar('o painel nomeia o arquivo e conta as linhas',
    texto.includes('index.html') && /\+\d/.test(texto) && /−\d/.test(texto),
    (texto.match(/[+−]\d+/g) || []).join(' '));

  registrar('as linhas que não mudaram não são listadas uma a uma',
    texto.includes('⋯') || texto.split('\n').length < 40,
    `${texto.split('\n').length} linhas no painel`);

  await ctx.close();
}

// ====== 3) FECHAR O PAINEL NÃO MEXE NO CÓDIGO ======
// Quem abriu para conferir não pode acabar alterando o projeto sem querer.
{
  const { pag, ctx } = await abrir();
  await gerar(pag);
  const antesDeAbrir = await conteudoNoRepo(pag);

  await pag.locator('button[title="Ver o que mudou na última alteração"]').click();
  await pag.waitForTimeout(500);
  await pag.locator('button[title="Fechar (a alteração continua valendo)"]').click();
  await pag.waitForTimeout(500);

  const depoisDeFechar = await conteudoNoRepo(pag);
  registrar('fechar o painel deixa o código exatamente como estava',
    depoisDeFechar === antesDeAbrir && depoisDeFechar.includes('const vidas = 5;'),
    'nada foi alterado ao conferir');
  await ctx.close();
}

// ====== 4) DESFAZER PELO PAINEL VOLTA AO ESTADO COMPARADO ======
// É o encaixe que importa: o painel compara contra o mesmo ponto para onde o Ctrl+Z volta. Se
// fossem pontos diferentes, a pessoa desfaria achando que voltava para o que viu na tela.
{
  const { pag, ctx } = await abrir();
  await gerar(pag);

  await pag.locator('button[title="Ver o que mudou na última alteração"]').click();
  await pag.waitForTimeout(500);
  // O do painel, não o do cabeçalho: os dois se chamam "Desfazer" e o título os separa.
  await pag.locator('button[title="Desfazer esta alteração"]').click();
  await pag.waitForTimeout(900);

  const voltou = await conteudoNoRepo(pag);
  registrar('desfazer pelo painel volta exatamente para o "antes" que ele mostrava',
    voltou === ORIGINAL,
    voltou.includes('const vidas = 3;') ? 'voltou ao original' : 'voltou para outro estado');

  const fechou = !(await pag.getByText('O que mudou na última alteração').isVisible().catch(() => false));
  registrar('o painel fecha depois de desfazer',
    fechou, fechou ? 'painel fechado' : 'ficou aberto mostrando uma comparação vencida');
  await ctx.close();
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
