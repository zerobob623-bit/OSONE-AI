import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-sons-'));
const out = path.join(tmp, 'sons.mjs');
await build({ entryPoints: [new URL('../src/lib/bibliotecaDeSons.ts', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { validarAudioDaBiblioteca, normalizarBibliotecaDeSons } = await import(pathToFileURL(out).href);

assert.equal(validarAudioDaBiblioteca({ name: 'Impacto', tipo: 'efeito', category: 'impacto', url: 'https://cdn.test/impacto.mp3', origem: 'Autor — CC0' }).ok, true);
assert.equal(validarAudioDaBiblioteca({ name: 'Música falsa', tipo: 'musica', category: 'comico', url: 'https://cdn.test/a.mp3' }).ok, false);
assert.equal(validarAudioDaBiblioteca({ name: 'Página', tipo: 'efeito', category: 'interface', url: 'https://site.test/watch/123' }).ok, false);
assert.equal(validarAudioDaBiblioteca({ name: 'Inseguro', tipo: 'efeito', category: 'interface', url: 'http://site.test/a.mp3' }).ok, false);
const migrados = normalizarBibliotecaDeSons([{ id: '1', name: 'Synth', category: 'synth', url: 'https://cdn.test/a.mp3' }]);
assert.equal(migrados[0].category, 'musica');
assert.equal(migrados[0].tipo, 'musica');

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.match(app, /name: "install_sound_library_item"/);
assert.match(app, /name: "search_freesound_catalog"/);
assert.match(app, /window\.confirm\(`Adicionar este áudio/);
assert.match(app, /nunca anuncie instalação antes da resposta desta ferramenta/i);
console.log('10/10 conferências da Biblioteca de Sons passaram.');
