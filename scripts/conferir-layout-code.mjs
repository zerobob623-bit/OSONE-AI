import assert from 'node:assert/strict';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../src/components/CodeWorkspace.tsx', import.meta.url), 'utf8');
const features = fs.readFileSync(new URL('../FEATURES.md', import.meta.url), 'utf8');

assert.match(code, /flex flex-col gap-2 shrink-0 z-30 overflow-hidden/);
assert.match(code, /lg:flex-row lg:items-center lg:justify-between/);
console.log('  ok  topo do OSONE CODE é separado em faixas, não uma linha espremida');

assert.match(code, /rounded-2xl border border-white\/5 bg-black\/20 p-1\.5/);
assert.match(code, /overflow-x-auto no-scrollbar/);
assert.match(code, /ENXAME OSONE CODE/);
assert.match(code, /GitHub/);
console.log('  ok  ações avançadas ficam em trilho próprio rolável');

assert.match(code, /Project Switcher Bar/);
assert.match(code, /z-20 overflow-hidden/);
assert.match(code, /w-full md:w-auto max-w-full flex items-center gap-1\.5 overflow-x-auto/);
console.log('  ok  projetos têm trilho próprio e não empurram a tela');

assert.match(code, /flex flex-col sm:flex-row sm:items-center gap-2 bg-black\/50/);
assert.match(code, /w-full min-w-0 flex-1 bg-transparent/);
assert.match(code, /w-full sm:w-auto px-4 py-2 rounded-xl bg-cyan-500/);
console.log('  ok  rodapé da IA quebra de forma controlada em telas menores');

assert.match(features, /topo separa identidade\/seletor de visualização, ações avançadas e projetos em trilhos próprios/);
console.log('  ok  layout anti-sobreposição registrado no FEATURES.md');

console.log('5/5 conferências de layout do OSONE CODE passaram.');
