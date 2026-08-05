/**
 * Confere que as sugestões do OSONE CODE saem do CÓDIGO que está aberto.
 *
 * A fileira de atalhos era um cardápio fixo — "Refatorar & Otimizar", "Corrigir BUGS",
 * "Adicionar Animações" — igual num arquivo em branco e num jogo de 50 mil caracteres. O problema
 * não era serem genéricas, era serem CEGAS: mandar "corrigir bugs" sem ter lido o código é pedir
 * para o modelo adivinhar o que procurar, e o que volta costuma ser mexida aleatória.
 *
 * O que se confere aqui é o comportamento, não o texto que o modelo devolve: que o arquivo é
 * mesmo lido, que a sugestão vira o pedido quando clicada, que arquivo curto continua com as
 * frases fixas (ali elas são o que serve), que trocar de arquivo não deixa sugestão velha na tela
 * falando do arquivo anterior, e que a mesma análise não é paga duas vezes.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-sugestoes-do-codigo.mjs
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

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-sugestoes-'));
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

// Um jogo de verdade, com um defeito plantado — é sobre ISTO que a sugestão precisa falar.
const JOGO = `<!DOCTYPE html><html><head><title>Kart</title></head><body>
<canvas id="pista"></canvas>
<script>
let karts = [];
function checarBatida(a, b) { return a.x === b.x && a.y === b.y; }
function loop() {
  for (let i = 0; i < karts.length; i++)
    for (let j = 0; j < karts.length; j++)
      if (i !== j && checarBatida(karts[i], karts[j])) karts[i].vel = 0;
  setInterval(loop, 16);
}
loop();
</script></body></html>`.padEnd(400, ' ');

const CURTO = '<h1>oi</h1>';

const projetos = (conteudoUm, extras = []) => [
  { id: 'proj-1', name: 'Projeto 1', activeFileId: 'main-app', updatedAt: 1,
    files: [{ id: 'main-app', name: 'index.html', language: 'html', isMain: true, updatedAt: 1, content: conteudoUm },
            ...extras] },
  ...[2, 3, 4, 5].map(n => ({
    id: `proj-${n}`, name: `Projeto ${n}`, activeFileId: 'main-app', updatedAt: 1,
    files: [{ id: 'main-app', name: 'index.html', language: 'html', isMain: true, updatedAt: 1, content: '<h1>vazio</h1>' }]
  }))
];

const SUGESTOES = [
  "Corrija checarBatida: comparar x e y com === nunca detecta encostão",
  "Troque o setInterval dentro de loop() por requestAnimationFrame",
  "O laço duplo de colisão é O(n²) e trava acima de 50 karts",
  "Dê largura e altura ao canvas #pista antes de desenhar"
];

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const executavel = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const nav = await chromium.launch(executavel ? { executablePath: executavel } : {});

const abrir = async (projs) => {
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
  const pag = await ctx.newPage();
  await pag.addInitScript(([ps, chaveP, chaveA, sugestoes]) => {
    localStorage.setItem(chaveP, JSON.stringify(ps));
    localStorage.setItem(chaveA, 'proj-1');
    // O modelo é substituído: o que se confere é o caminho, não o texto que ele inventaria.
    window.__corposEnviados = [];
    window.fetch = (url, opcoes) => {
      const corpo = JSON.parse(opcoes.body);
      window.__corposEnviados.push(corpo);
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ text: JSON.stringify(sugestoes), truncated: false, blocked: false })
      });
    };
  }, [projs, CHAVE_PROJETOS, CHAVE_ATIVO, SUGESTOES]);
  await pag.goto('file://' + pagina);
  await pag.waitForTimeout(500);
  return { pag, ctx };
};

const corpos = (pag) => pag.evaluate(() => window.__corposEnviados);

// ====== 1) ARQUIVO EM BRANCO: as frases fixas são o que serve ======
{
  const { pag, ctx } = await abrir(projetos(CURTO));
  const temFixas = await pag.getByRole('button', { name: /Corrigir BUGS/ }).isVisible().catch(() => false);
  const temBotaoDeSugerir = await pag.getByRole('button', { name: /Sugerir a partir deste código/ }).isVisible().catch(() => false);
  registrar('arquivo curto mantém as frases fixas e NÃO oferece analisar',
    temFixas && !temBotaoDeSugerir,
    `fixas=${temFixas ? 'sim' : 'não'}, botão de analisar=${temBotaoDeSugerir ? 'oferecido (errado)' : 'ausente'}`);

  const quantas = (await corpos(pag)).length;
  registrar('arquivo curto não gasta chamada nenhuma ao modelo',
    quantas === 0, `${quantas} chamada(s)`);
  await ctx.close();
}

// ====== 2) COM CÓDIGO: o arquivo é lido, e o que vai para o modelo é ELE ======
{
  const { pag, ctx } = await abrir(projetos(JOGO));
  await pag.getByRole('button', { name: /Sugerir a partir deste código/ }).click();
  await pag.waitForTimeout(700);

  const enviados = await corpos(pag);
  const pedido = enviados[0];
  const mandouOCodigo = !!pedido && String(pedido.prompt).includes('checarBatida');
  registrar('o conteúdo do arquivo aberto é enviado para análise',
    mandouOCodigo, mandouOCodigo ? 'o código foi junto no pedido' : 'o modelo recebeu o pedido SEM o código');

  registrar('a análise pede resposta em JSON e não liga os ajustes pesados da geração',
    pedido?.responseMimeType === 'application/json' && pedido?.unrestricted === false,
    `responseMimeType=${pedido?.responseMimeType}, unrestricted=${pedido?.unrestricted}`);

  const primeira = await pag.getByRole('button', { name: /checarBatida/ }).isVisible().catch(() => false);
  registrar('as sugestões do código aparecem no lugar das frases fixas',
    primeira, primeira ? 'sugestão específica na tela' : 'as frases fixas continuaram');

  const fixasSumiram = !(await pag.getByRole('button', { name: /Corrigir BUGS/ }).isVisible().catch(() => false));
  registrar('as frases fixas saem de cena quando há sugestão de verdade',
    fixasSumiram, fixasSumiram ? 'cardápio fixo escondido' : 'os dois na tela ao mesmo tempo');

  await ctx.close();
}

// ====== 3) CLICAR NA SUGESTÃO É PEDIR AQUILO ======
{
  const { pag, ctx } = await abrir(projetos(JOGO));
  await pag.getByRole('button', { name: /Sugerir a partir deste código/ }).click();
  await pag.waitForTimeout(700);
  await pag.getByRole('button', { name: /checarBatida/ }).click();
  await pag.waitForTimeout(500);

  const pedido = await pag.evaluate(() => window.__pedidoRecebido);
  registrar('clicar na sugestão manda exatamente ela como pedido',
    pedido === SUGESTOES[0], JSON.stringify(pedido || '').slice(0, 60));
  await ctx.close();
}

// ====== 4) NÃO PAGAR DUAS VEZES PELA MESMA ANÁLISE ======
{
  const { pag, ctx } = await abrir(projetos(JOGO));
  await pag.getByRole('button', { name: /Sugerir a partir deste código/ }).click();
  await pag.waitForTimeout(700);
  const depoisDaPrimeira = (await corpos(pag)).length;

  // O botão de reler existe justamente para forçar; sem forçar, o mesmo código não é reanalisado.
  await pag.evaluate(() => window.dispatchEvent(new Event('osone_repository_updated')));
  await pag.waitForTimeout(400);
  const semForcar = (await corpos(pag)).length;

  registrar('o mesmo código não é reanalisado sozinho',
    semForcar === depoisDaPrimeira, `${depoisDaPrimeira} → ${semForcar} chamada(s)`);

  await pag.locator('button[title="Reler o arquivo e sugerir de novo"]').click();
  await pag.waitForTimeout(700);
  const depoisDeForcar = (await corpos(pag)).length;
  registrar('o botão de reler força uma análise nova',
    depoisDeForcar > semForcar, `${semForcar} → ${depoisDeForcar} chamada(s)`);
  await ctx.close();
}

// ====== 5) TROCAR DE ARQUIVO NÃO DEIXA SUGESTÃO VELHA FALANDO DO ANTERIOR ======
{
  const outro = { id: 'f2', name: 'notas.js', language: 'javascript', updatedAt: 1, content: '// outro arquivo' };
  const { pag, ctx } = await abrir(projetos(JOGO, [outro]));
  await pag.getByRole('button', { name: /Sugerir a partir deste código/ }).click();
  await pag.waitForTimeout(700);

  await pag.getByText('notas.js', { exact: true }).first().click();
  await pag.waitForTimeout(500);

  const sobrou = await pag.getByRole('button', { name: /checarBatida/ }).isVisible().catch(() => false);
  registrar('abrir outro arquivo limpa as sugestões do arquivo anterior',
    !sobrou, sobrou ? 'sugestão do index.html ficou na tela do notas.js' : 'tela limpa');
  await ctx.close();
}

// ====== 6) SUGESTÃO É UM EXTRA: falhar nunca pode atrapalhar quem programa ======
{
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
  const pag = await ctx.newPage();
  await pag.addInitScript(([ps, chaveP, chaveA]) => {
    localStorage.setItem(chaveP, JSON.stringify(ps));
    localStorage.setItem(chaveA, 'proj-1');
    window.__erros = [];
    window.addEventListener('error', e => window.__erros.push(String(e.message)));
    // O modelo devolve lixo: nem JSON é.
    window.fetch = () => Promise.resolve({
      ok: true, status: 200, json: async () => ({ text: 'desculpa, não consegui analisar' })
    });
  }, [projetos(JOGO), CHAVE_PROJETOS, CHAVE_ATIVO]);
  await pag.goto('file://' + pagina);
  await pag.waitForTimeout(500);

  await pag.getByRole('button', { name: /Sugerir a partir deste código/ }).click();
  await pag.waitForTimeout(700);

  const aindaTemFixas = await pag.getByRole('button', { name: /Corrigir BUGS/ }).isVisible().catch(() => false);
  const erros = await pag.evaluate(() => window.__erros);
  const editorVivo = await pag.locator('textarea.code-editor-textarea').first().isVisible();
  registrar('resposta ilegível não quebra a tela nem apaga as frases fixas',
    aindaTemFixas && erros.length === 0 && editorVivo,
    `${erros.length} erro(s) na página; editor ${editorVivo ? 'funcionando' : 'QUEBRADO'}`);
  await ctx.close();
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
