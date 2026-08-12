/**
 * Confere o que `vite build` sozinho não prova: o bundle serverless carrega com VERCEL=1 e o
 * Express realmente atende uma requisição. Assim, import ausente/incompatível falha durante o
 * build, com mensagem útil, em vez de virar FUNCTION_INVOCATION_FAILED só depois do deploy.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';

const bundle = path.resolve('server-build/server.cjs');
assert.ok(fs.existsSync(bundle), 'server-build/server.cjs não foi gerado');

const modulo = await import(pathToFileURL(bundle).href);
const promessaDoApp = modulo.default?.default ?? modulo.default;
const app = await promessaDoApp;
assert.equal(typeof app, 'function', 'o bundle não exportou o handler Express esperado');

let concluir;
const terminou = new Promise(resolve => { concluir = resolve; });
let status = 200;
let corpo = '';
const req = { method: 'GET', url: '/api/health', headers: {}, on() {} };
const res = {
  status(codigo) { status = codigo; return this; },
  setHeader() {}, getHeader() {}, on() {},
  write(valor = '') { corpo += String(valor); return true; },
  end(valor = '') { corpo += String(valor); concluir(); },
  send(valor = '') { corpo += String(valor); concluir(); return this; },
  json(valor) { corpo = JSON.stringify(valor); concluir(); return this; }
};

app(req, res);
await Promise.race([
  terminou,
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout ao iniciar /api/health')), 5000))
]);

assert.equal(status, 200, `/api/health respondeu HTTP ${status}`);
const json = JSON.parse(corpo);
assert.equal(json.service, 'osone-server');
assert.equal(json.environment, 'vercel');
assert.equal(json.ok, true);

console.log('3/3 conferências do runtime da Vercel passaram.');
process.exit(0);
