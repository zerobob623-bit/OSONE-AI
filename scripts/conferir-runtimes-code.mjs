/** Confere os runtimes TypeScript e SQLite do OSONE CODE num Chromium real. */
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch { console.error("Este conferidor precisa do playwright: rode 'npm i --no-save playwright'."); process.exit(2); }

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-runtimes-'));
const entrada = path.join(pasta, 'entrada.tsx');
const pagina = path.join(pasta, 'index.html');
fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodePreview } from ${JSON.stringify(path.join(raiz, 'src/components/CodePreview'))};
createRoot(document.getElementById('raiz')).render(React.createElement('div',{style:{height:'100vh'}},
  React.createElement(CodePreview,{code:window.__codigo,linguagem:window.__linguagem})));
`);
fs.writeFileSync(pagina, '<!doctype html><html><body style="margin:0"><div id="raiz"></div><script src="./app.js"></script></body></html>');
await build({ entryPoints:[entrada], bundle:true, outfile:path.join(pasta,'app.js'), define:{'process.env.NODE_ENV':'"production"'}, nodePaths:[path.join(raiz,'node_modules')], absWorkingDir:raiz, logLevel:'silent' });

const executavel = process.env.CHROMIUM_PATH || ['/usr/bin/google-chrome','/usr/bin/chromium','/opt/google/chrome/chrome'].find(fs.existsSync);
const navegador = await chromium.launch(executavel ? { executablePath: executavel, args:['--no-sandbox'] } : {});
const casos = [];
const registrar = (nome, passou, detalhe='') => { casos.push(passou); console.log(`${passou?'  ok  ':'FALHOU'}  ${nome}${detalhe?' — '+detalhe:''}`); };

async function rodar(linguagem, codigo, seletor, prazo=45000) {
  const contexto = await navegador.newContext();
  const pag = await contexto.newPage();
  await pag.addInitScript(({linguagem,codigo}) => { window.__linguagem=linguagem; window.__codigo=codigo; }, {linguagem,codigo});
  await pag.goto('file://'+pagina);
  const iframe = pag.frameLocator('iframe');
  await iframe.locator(seletor).waitFor({state:'visible',timeout:prazo});
  const texto = await iframe.locator('body').innerText();
  await contexto.close();
  return texto;
}

try {
  const ts = await rodar('typescript', 'interface Item { valor: number }\nconst x: Item = { valor: 21 };\nconsole.log(x.valor * 2);', '#saida');
  registrar('TypeScript é compilado e executado de verdade', /42/.test(ts) && !/indisponível|not defined|erro/i.test(ts), ts.replace(/\n/g,' | ').slice(0,100));
} catch (e) { registrar('TypeScript é compilado e executado de verdade', false, e.message); }

try {
  const sql = await rodar('sql', "CREATE TABLE pessoas(nome TEXT, idade INTEGER); INSERT INTO pessoas VALUES ('Ana', 30), ('Bia', 25); SELECT nome, idade FROM pessoas ORDER BY idade DESC;", 'table');
  registrar('SQL roda em SQLite e retorna tabela', /Ana/.test(sql) && /Bia/.test(sql) && /30/.test(sql) && !/indisponível|inválido|not defined/i.test(sql), sql.replace(/\n/g,' | ').slice(0,120));
} catch (e) { registrar('SQL roda em SQLite e retorna tabela', false, e.message); }

try {
  const tsComHtml = await rodar('typescript', 'const fechamento: string = "</script>"; console.log(fechamento);', '#saida');
  registrar('texto </script> dentro do código não quebra o sandbox', tsComHtml.includes('</script>'));
} catch (e) { registrar('texto </script> dentro do código não quebra o sandbox', false, e.message); }

await navegador.close();
fs.rmSync(pasta,{recursive:true,force:true});
const passaram=casos.filter(Boolean).length;
console.log(`${passaram}/${casos.length} conferências dos novos runtimes passaram.`);
process.exit(passaram===casos.length?0:1);
