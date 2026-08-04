/**
 * Confere a leitura do JSON que volta do modelo (src/lib/utils.ts).
 *
 * Por que existe: o extractJson contava chaves e colchetes CRUS para achar onde o JSON termina, e
 * contava também os que estavam dentro de strings. Bastava o modelo escrever uma chave solta no
 * meio de um texto — "use } para fechar", um trecho de código, uma regex — para a conta fechar
 * antes da hora e devolver um pedaço cortado, que o JSON.parse recusava. Como o safeJsonParse é
 * usado em todo o app, o efeito era a resposta inteira virar o valor de reserva, em silêncio: sem
 * erro na tela, sem pista nenhuma, só um resultado vazio de vez em quando.
 *
 * O caso mais traiçoeiro é o das aspas escapadas, porque a chave nem precisa estar desbalanceada:
 * o que confunde a conta é a aspa que não fecha string nenhuma.
 *
 * Como rodar:
 *   node scripts/conferir-json.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-json-'));
const saida = path.join(pastaTemp, 'utils.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/utils.ts')],
  bundle: true,
  format: 'esm',
  outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')],
  absWorkingDir: RAIZ,
  logLevel: 'silent'
});

const { safeJsonParse } = await import('file://' + saida);

const RESERVA = '__RESERVA__';
const casos = [
  ['chave solta dentro de uma string', '{"msg": "use } para fechar"}', { msg: 'use } para fechar' }],
  ['aspas escapadas antes da chave', '{"s": "aspas \\" e chave }"}', { s: 'aspas " e chave }' }],
  ['chaves equilibradas dentro da string', '{"code": "function f() { return 1; }"}', { code: 'function f() { return 1; }' }],
  ['colchete solto dentro da string', 'blá blá {"a": {"b": "]"}} sobra', { a: { b: ']' } }],
  ['lista com chave dentro da string', '[{"x": "}"}, {"y": 2}]', [{ x: '}' }, { y: 2 }]],
  ['quantificador de regex não conta como chave', '{"regex": "^[a-z]{2,}$"}', { regex: '^[a-z]{2,}$' }],
  ['cerca de markdown em volta', '```json\n{"ok": true}\n```', { ok: true }],
  ['texto antes e depois do objeto', 'Claro! {"n": 1} espero ter ajudado.', { n: 1 }],
  ['objeto aninhado de verdade', '{"a": {"b": {"c": 3}}, "d": 4}', { a: { b: { c: 3 } }, d: 4 }]
];

let falhas = 0;
for (const [nome, entrada, esperado] of casos) {
  const obtido = safeJsonParse(entrada, RESERVA);
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!passou) falhas++;
  const detalhe = passou
    ? JSON.stringify(entrada)
    : `${JSON.stringify(entrada)} devolveu ${JSON.stringify(obtido)}`;
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}  — ${detalhe}`);
}

fs.rmSync(pastaTemp, { recursive: true, force: true });

console.log(`\n${casos.length - falhas}/${casos.length} conferências passaram.`);
process.exit(falhas === 0 ? 0 : 1);
