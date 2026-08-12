/** Impede o canto de voltar a parar depois de uma ou duas frases. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.match(app, /planeje primeiro a LETRA INTEIRA/);
assert.match(app, /mostrar_letra_cantada' UMA ÚNICA VEZ/);
assert.doesNotMatch(app, /UM ou DOIS versos por chamada/);
assert.match(app, /A letra INTEIRA, do primeiro ao último verso/);
assert.match(app, /\[CONTINUAÇÃO DO CANTO\]/);
assert.match(app, /if \(cantandoAgoraRef\.current && !isElevenLabsLiveOutput\(\)\)/);
assert.match(app, /session\.sendRealtimeInput\(\{[\s\S]{0,500}Continue cantando agora/);
assert.match(app, /continuacaoDoCantoRef\.current[\s\S]{0,300}clearTimeout/);
assert.match(app, /whitespace-pre-line max-h-\[52vh\] overflow-y-auto/);

console.log('9/9 conferências do canto completo passaram.');
