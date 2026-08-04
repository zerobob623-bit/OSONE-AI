/**
 * Confere que o OSONE CODE RODA Python, e que ele falha de forma honesta sem internet.
 *
 * Dava para criar um arquivo .py e não dava para executá-lo: o preview só sabia web, e o arquivo
 * ficava ali como texto. Agora o código roda de verdade pelo Pyodide — o CPython compilado para o
 * navegador —, com biblioteca padrão, exceções reais e o traceback do Python.
 *
 * O Pyodide vem de uma CDN e NÃO é embutido no pacote do app: são dezenas de megabytes, que
 * dobrariam o tamanho do instalador para quem nunca vai escrever uma linha de Python. Essa escolha
 * tem uma consequência que precisa estar dita na tela em vez de escondida — sem internet, a
 * primeira execução falha. O caso mais importante deste conferidor é justamente esse: a falha
 * precisa EXPLICAR, em vez de deixar a tela parada em "carregando" para sempre.
 *
 * Como rodar:
 *   node scripts/conferir-python.mjs
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

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-py-'));
const entrada = path.join(pastaTemp, 'entrada.tsx');
const pagina = path.join(pastaTemp, 'index.html');

fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodePreview } from ${JSON.stringify(path.join(RAIZ, 'src/components/CodePreview'))};
function Arnes() {
  const [codigo, setCodigo] = React.useState(window.__codigoPython || '');
  React.useEffect(() => { window.__definirCodigo = setCodigo; }, []);
  return React.createElement('div', { style: { height: '100vh' } },
    React.createElement(CodePreview, { code: codigo, linguagem: 'python' }));
}
createRoot(document.getElementById('raiz')).render(React.createElement(Arnes));
`);
fs.writeFileSync(pagina, `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0"><div id="raiz"></div><script src="./py.js"></script></body></html>`);

await build({
  entryPoints: [entrada], bundle: true, outfile: path.join(pastaTemp, 'py.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};
const pular = (nome, motivo) => {
  casos.push({ nome, passou: true, pulado: true });
  console.log(`  --    ${nome}  — PULADO: ${motivo}`);
};

/**
 * O interpretador está ao alcance desta máquina?
 *
 * Sem esta checagem, rodar o conferidor numa rede que bloqueia a CDN devolvia três reprovações
 * vermelhas — dizendo que o recurso está quebrado quando o que falta é acesso à internet. Um teste
 * que confunde "não funciona" com "não deu para testar" ensina a ignorar o vermelho.
 */
const CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
let cdnAlcancavel = false;
try {
  const r = await fetch(CDN, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
  cdnAlcancavel = r.ok;
} catch { cdnAlcancavel = false; }
const MOTIVO = 'o interpretador Python (Pyodide) vem de uma CDN, e esta máquina não a alcança';

const executavel = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const nav = await chromium.launch(executavel ? { executablePath: executavel } : {});

/** Abre o preview com um código Python e espera a saída do quadro interno. */
const rodar = async (codigo, { offline = false, prazoMs = 90000 } = {}) => {
  const ctx = await nav.newContext({ viewport: { width: 900, height: 700 } });
  const pag = await ctx.newPage();
  await pag.addInitScript(c => { window.__codigoPython = c; }, codigo);
  if (offline) await ctx.setOffline(true);
  await pag.goto('file://' + pagina);

  const quadro = async () => {
    for (const f of pag.frames()) {
      if (await f.locator('#saida').count().catch(() => 0)) return f;
    }
    return null;
  };

  const limite = Date.now() + prazoMs;
  let texto = '', estado = '';
  while (Date.now() < limite) {
    const f = await quadro();
    if (f) {
      texto = await f.locator('#saida').innerText().catch(() => '');
      estado = await f.locator('#estado').innerText().catch(() => '');
      if (texto.trim() || /indisponível/i.test(estado)) break;
    }
    await pag.waitForTimeout(1000);
  }
  await ctx.close();
  return { texto, estado };
};

// 1) O caso que não existia: Python rodando.
if (!cdnAlcancavel) pular('código Python roda e o print aparece na tela', MOTIVO);
else {
  const { texto, estado } = await rodar('print("ola do python")\nprint(2 ** 10)');
  registrar('código Python roda e o print aparece na tela',
    texto.includes('ola do python') && texto.includes('1024'),
    texto.trim() ? `saída: ${texto.replace(/\n/g, ' | ').slice(0, 60)} (${estado})` : `nada saiu (${estado})`);
}

// 2) A biblioteca padrão está lá — é o que separa "rodar Python" de "avaliar expressão".
if (!cdnAlcancavel) pular('a biblioteca padrão do Python está disponível', MOTIVO);
else {
  const { texto } = await rodar('import json, math\nprint(json.dumps({"raiz": math.sqrt(144)}))');
  registrar('a biblioteca padrão do Python está disponível',
    texto.includes('12.0'),
    texto.trim().slice(0, 60) || 'sem saída');
}

// 3) Erro de Python precisa aparecer com a mensagem real, e não sumir.
if (!cdnAlcancavel) pular('erro do Python aparece com a mensagem real', MOTIVO);
else {
  const { texto } = await rodar('x = 1 / 0');
  registrar('erro do Python aparece com a mensagem real',
    /ZeroDivisionError/.test(texto),
    texto.trim().split('\n').pop()?.slice(0, 60) || 'sem erro na tela');
}

// 4) O MAIS IMPORTANTE: sem internet, a falha explica em vez de travar em "carregando".
{
  const { texto, estado } = await rodar('print("nunca chega aqui")', { offline: true, prazoMs: 45000 });
  const explicou = /não foi possível carregar o python/i.test(texto)
    && /internet|conexão/i.test(texto);
  const dizQueORestoFunciona = /HTML, CSS e JavaScript/i.test(texto);
  registrar('sem internet, a falha do Python é explicada em vez de travar',
    explicou && /indisponível/i.test(estado),
    explicou ? `estado "${estado}"; explica o motivo e ${dizQueORestoFunciona ? 'diz que o resto funciona offline' : 'NÃO diz que o resto funciona'}` : `travou ou não explicou (estado "${estado}")`);
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });

const pulados = casos.filter(c => c.pulado).length;
const passaram = casos.filter(c => c.passou && !c.pulado).length;
const total = casos.length - pulados;
console.log(`\n${passaram}/${total} conferências passaram${pulados ? ` (${pulados} pulada(s): ${MOTIVO})` : ''}.`);
// Pulado não é reprovado: o código de saída conta só o que deu para verificar.
process.exit(passaram === total ? 0 : 1);
