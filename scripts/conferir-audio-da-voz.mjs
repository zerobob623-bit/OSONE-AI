/**
 * Confere o tocador de áudio da voz: o vazamento de contexto e a almofada contra picote.
 *
 * O RELATO foi "instabilidade na voz, tipo uns picotes — não sei se foi internet". Eram duas
 * coisas, e nenhuma delas era só a internet:
 *
 * 1. VAZAMENTO DE CONTEXTO DE ÁUDIO (o grave). stop() fechava o contexto e criava OUTRO em
 *    seguida, "deixando um pronto". Como startLiveSession descarta o AudioPlayer e cria um novo
 *    a cada sessão, esse contexto recém-criado ficava vivo e órfão. O navegador tem teto baixo
 *    (~6 no Chrome) de contextos por página: com uma sessão por vez, levava horas e passava por
 *    problema de rede; com o Modo Vigília religando a cada ~10 min, o teto chegava em cerca de
 *    uma hora — e aí o áudio picota e depois falha de vez.
 *
 * 2. ALMOFADA FINA DEMAIS. Os pedaços são agendados em sequência; quando um demora, o relógio
 *    do áudio passa do instante agendado e sobra um buraco audível. 50ms não cobrem a oscilação
 *    normal de uma internet doméstica — então a rede era o gatilho, mas o tocador amplificava.
 *
 * Como rodar:
 *   node scripts/conferir-audio-da-voz.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(RAIZ, '.tmp-audio-'));
const saida = path.join(pastaTemp, 'audio.mjs');
await build({
  entryPoints: [path.join(RAIZ, 'src/lib/audio.ts')],
  bundle: true, format: 'esm', outfile: saida, logLevel: 'silent'
});

let criados = 0, fechados = 0;
class ContextoFalso {
  constructor() { criados++; this.state = 'running'; this.currentTime = 0; this._vivo = true; this.destination = {}; }
  createAnalyser() { return { fftSize: 0, smoothingTimeConstant: 0, connect() {}, frequencyBinCount: 32, getByteFrequencyData() {} }; }
  createBuffer(_c, len) { const d = new Float32Array(len); return { duration: len / 24000, getChannelData: () => d }; }
  createBufferSource() { return { buffer: null, playbackRate: { value: 1 }, connect() {}, start() {}, stop() {}, onended: null }; }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }; }
  createWaveShaper() { return { curve: null, oversample: '', connect() {} }; }
  close() { if (this._vivo) { fechados++; this._vivo = false; } this.state = 'closed'; return Promise.resolve(); }
}
global.window = { AudioContext: ContextoFalso, dispatchEvent() {}, CustomEvent: class { constructor() {} } };
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};
global.atob = (s) => Buffer.from(s, 'base64').toString('binary');

const { AudioPlayer } = await import('file://' + saida);

let ok = 0, falhou = 0;
const conferir = (nome, cond, detalhe = '') => {
  if (cond) { ok++; console.log(`  ok    ${nome}`); }
  else { falhou++; console.log(`  FALHOU ${nome} ${detalhe}`); }
};

console.log('\n=== VAZAMENTO DE CONTEXTO AO RELIGAR (Modo Vigília) ===');
let player = new AudioPlayer();
for (let i = 0; i < 6; i++) {   // 6 religamentos = ~1 hora de conversa
  player.stop();
  player = new AudioPlayer();
}
const vivos = criados - fechados;
conferir(`após 6 religamentos sobra no máximo 1 contexto vivo (sobrou ${vivos})`, vivos <= 1,
  `criados=${criados} fechados=${fechados} — o Chrome recusa acima de ~6`);

console.log('\n=== O PLAYER CONTINUA UTILIZÁVEL DEPOIS DE stop() ===');
const p2 = new AudioPlayer();
const antesDoStop = criados;
p2.stop();
const pcm = Buffer.alloc(960).toString('base64');   // ~20ms de silêncio em 24kHz
p2.playChunk(pcm);
conferir('playChunk recria o contexto solto pelo stop()', criados === antesDoStop + 1,
  `criados passou de ${antesDoStop} para ${criados}`);
conferir('e volta a agendar áudio (não fica mudo para sempre)', p2.nextStartTime > 0,
  `nextStartTime=${p2.nextStartTime}`);

console.log('\n=== ALMOFADA CONTRA PICOTE ===');
const fonte = fs.readFileSync(path.join(RAIZ, 'src/lib/audio.ts'), 'utf8');
const almofada = Number((fonte.match(/const ALMOFADA_S = ([\d.]+);/) || [])[1]);
conferir('a almofada é maior que os 50ms antigos', almofada > 0.05, `${almofada * 1000}ms`);
conferir('mas não vira atraso perceptível na conversa (<= 200ms)', almofada <= 0.2, `${almofada * 1000}ms`);
conferir('existe teto para o atraso não crescer sem limite depois de uma pausa',
  /nextStartTime > currentTime \+ 0\.5/.test(fonte));

// Um pedaço que chega atrasado precisa ser reagendado com a almofada inteira, e não colado no
// "agora" — colar no agora é o que produz o buraco seguinte.
const p3 = new AudioPlayer();
p3.playChunk(pcm);
const agendadoInicial = p3.nextStartTime;
conferir('o primeiro pedaço já sai com a almofada aplicada', agendadoInicial >= almofada,
  `${agendadoInicial} < ${almofada}`);

fs.rmSync(pastaTemp, { recursive: true, force: true });
console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou > 0 ? 1 : 0);
