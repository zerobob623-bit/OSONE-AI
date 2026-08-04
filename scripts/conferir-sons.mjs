/**
 * Roda a Biblioteca de Sons de verdade num Chromium e verifica quando a playlist AVANÇA.
 *
 * Por que existe: o defeito não dava erro nenhum. A fila avançava sempre que a URL tocando virava
 * nula, e nula é o que acontece nos dois casos opostos — a música acabou sozinha, ou quem estava
 * ouvindo mandou parar. Na prática não havia como parar uma playlist: apertar Parar tocava a
 * próxima faixa, clicar de novo na música que estava tocando também, e só na última faixa o
 * silêncio finalmente vinha.
 *
 * A prova precisa ser feita no navegador: é o <audio> de verdade que separa "terminou" de
 * "pausaram", e é essa diferença que o conserto passou a respeitar. Por isso o arnês toca um WAV
 * silencioso de verdade e espera o fim chegar sozinho, em vez de fingir o evento.
 *
 * Rodado contra a versão anterior ao conserto, os casos 1 e 3 reprovam. Os demais são a rede de
 * proteção do que o conserto NÃO podia quebrar: o avanço automático continuar existindo, a fila
 * ignorar o fim de um som que não é o dela, e a última faixa terminar em silêncio.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-sons.mjs
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

/**
 * WAV mono em silêncio, gerado aqui para não depender de nenhum arquivo externo.
 *
 * A duração não é detalhe: precisa ser curta o bastante para o conferidor esperar a fila inteira
 * correr, e longa o bastante para dar tempo de clicar em Parar com a faixa AINDA tocando — que é
 * justamente a situação em que o defeito aparecia.
 */
function wavSilencioBase64(segundos = 1.2, taxa = 8000) {
  const amostras = Math.floor(taxa * segundos);
  const b = Buffer.alloc(44 + amostras * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + amostras * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(taxa, 24);
  b.writeUInt32LE(taxa * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(amostras * 2, 40);
  return b.toString('base64');
}

const AUDIO = `data:audio/wav;base64,${wavSilencioBase64()}`;

const FAIXAS = [
  { id: 'm1', name: 'Faixa Um', category: 'musica', url: `${AUDIO}#um` },
  { id: 'm2', name: 'Faixa Dois', category: 'musica', url: `${AUDIO}#dois` },
  { id: 'm3', name: 'Faixa Tres', category: 'musica', url: `${AUDIO}#tres` },
  { id: 'avulsa', name: 'Som Avulso', category: 'musica', url: `${AUDIO}#avulsa` }
];
const PLAYLIST = [{ id: 'pl-1', name: 'Playlist de Teste', soundIds: ['m1', 'm2', 'm3'] }];

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-sons-'));
const entrada = path.join(pastaTemp, 'entrada.tsx');
const pagina = path.join(pastaTemp, 'index.html');

/**
 * O arnês reproduz o contrato do App: tocar guarda a URL, o fim natural do áudio zera a URL E
 * anuncia 'osone_sound_ended', e parar zera a URL SEM anunciar nada. É exatamente essa distinção
 * que o conserto introduziu, e é ela que está sendo verificada aqui.
 */
fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SoundLibrary } from ${JSON.stringify(path.join(RAIZ, 'src/components/SoundLibrary'))};

const FAIXAS = ${JSON.stringify(FAIXAS)};

function Arnes() {
  const [tocando, setTocando] = React.useState(null);
  const audioRef = React.useRef(null);

  const tocar = async (url) => {
    window.__ordens.push('tocar:' + url.split('#')[1]);
    if (audioRef.current) {
      audioRef.current.pause();
      const anterior = audioRef.current.dataset.url;
      audioRef.current = null;
      setTocando(null);
      if (anterior === url) return;
    }
    // O await é fiel ao App, que resolve a URL do áudio antes de tocar, e não é detalhe: ele
    // encerra o lote do React e deixa a interface renderizar de fato com a URL zerada. Era essa
    // renderização intermediária que a fila lia como "a música acabou" e usava para avançar.
    await Promise.resolve();
    const audio = new Audio(url);
    audio.dataset.url = url;
    audioRef.current = audio;
    setTocando(url);

    let jaAvisou = false;
    const avisar = () => {
      if (jaAvisou) return;
      jaAvisou = true;
      window.dispatchEvent(new CustomEvent('osone_sound_ended', { detail: { url } }));
    };
    audio.onended = () => { setTocando(null); audioRef.current = null; avisar(); };
    audio.onerror = () => { setTocando(null); audioRef.current = null; avisar(); };
    audio.play().catch(() => { setTocando(null); audioRef.current = null; avisar(); });
  };

  const parar = () => {
    window.__ordens.push('parar');
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setTocando(null);
    }
  };

  return React.createElement('div', { style: { height: '100vh' } },
    React.createElement(SoundLibrary, {
      sounds: FAIXAS,
      playingUrl: tocando,
      apiKeys: { gemini: '' },
      onAddSound: () => {},
      onUpdateSound: () => {},
      onRemoveSound: () => {},
      onRestoreDefaults: () => {},
      onPlaySound: tocar,
      onStopSound: parar,
      onClose: () => {}
    })
  );
}

window.__ordens = [];
createRoot(document.getElementById('raiz')).render(React.createElement(Arnes));
`);

fs.writeFileSync(pagina, `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#07080d;color:#ccc"><div id="raiz"></div><script src="./sons.js"></script></body></html>`);

await build({
  entryPoints: [entrada],
  bundle: true,
  outfile: path.join(pastaTemp, 'sons.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  // O ponto de entrada é gerado fora do projeto, então o esbuild precisa ser apontado para os
  // módulos daqui — senão nem o React ele encontra.
  nodePaths: [path.join(RAIZ, 'node_modules')],
  absWorkingDir: RAIZ,
  logLevel: 'silent'
});

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const executavel = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const nav = await chromium.launch({
  ...(executavel ? { executablePath: executavel } : {}),
  // Sem isto o navegador recusa o play() por falta de gesto do usuário, e o fim natural do áudio
  // — o evento que este conferidor existe para observar — nunca chegaria.
  args: ['--autoplay-policy=no-user-gesture-required']
});

/** Abre a aba de playlists com a playlist de teste já selecionada. */
const abrir = async () => {
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
  const pag = await ctx.newPage();
  await pag.addInitScript(pl => {
    localStorage.setItem('osone_playlists_musica', JSON.stringify(pl));
  }, PLAYLIST);
  await pag.goto('file://' + pagina);
  await pag.getByRole('button', { name: /Músicas & Playlists/ }).click();
  await pag.getByText('Playlist de Teste', { exact: true }).first().click();
  await pag.waitForTimeout(200);
  return { pag, ctx };
};

const ordens = (pag) => pag.evaluate(() => window.__ordens.slice());
const limparOrdens = (pag) => pag.evaluate(() => { window.__ordens.length = 0; });
const tocarPlaylist = async (pag) => {
  await pag.getByRole('button', { name: 'Tocar Playlist' }).click();
  await pag.waitForTimeout(150);
};
const botaoParar = (pag) => pag.locator('button[title="Parar"]').first();
/** O botão de tocar de uma linha da lista: o irmão anterior ao bloco que carrega o nome. */
const botaoDaMusica = (pag, nome) =>
  pag.locator(`xpath=//h4[normalize-space(text())=${JSON.stringify(nome)}]/../preceding-sibling::button[1]`).first();

// 1) Parar no meio da playlist tem de PARAR — este é o defeito original.
{
  const { pag, ctx } = await abrir();
  await tocarPlaylist(pag);
  await limparOrdens(pag);
  await botaoParar(pag).click();
  await pag.waitForTimeout(600);

  const registro = await ordens(pag);
  const tocouDepoisDeParar = registro.some(o => o.startsWith('tocar:'));
  registrar('parar no meio da playlist para de verdade, sem pular para a próxima',
    !tocouDepoisDeParar,
    tocouDepoisDeParar ? `AVANÇOU sozinho: ${registro.join(', ')}` : 'nenhuma faixa começou depois do Parar');
  await ctx.close();
}

// 2) O fim natural da faixa continua avançando a fila (o recurso não pode ter sumido no conserto).
{
  const { pag, ctx } = await abrir();
  await tocarPlaylist(pag);
  await limparOrdens(pag);
  // O WAV dura 1,2s: o fim chega sozinho, sem ninguém mandar parar.
  await pag.waitForTimeout(2000);

  const registro = await ordens(pag);
  registrar('a faixa terminando sozinha avança para a próxima',
    registro.includes('tocar:dois'),
    registro.length ? `ordens: ${registro.join(', ')}` : 'NADA aconteceu depois do fim da faixa');
  await ctx.close();
}

// 3) Clicar de novo na música que está tocando também é um pedido de parar, e não de pular.
{
  const { pag, ctx } = await abrir();
  await tocarPlaylist(pag);
  await limparOrdens(pag);
  // O botão da própria linha vira "parar" enquanto aquela faixa toca. É o segundo caminho pelo
  // qual quem ouve manda parar, e ele também não mexe na fila ao parar — daí o mesmo defeito.
  await botaoDaMusica(pag, 'Faixa Um').click();
  await pag.waitForTimeout(600);

  const registro = await ordens(pag);
  const mandouParar = registro.includes('parar');
  const avancoFantasma = registro.some(o => o.startsWith('tocar:'));
  registrar('clicar de novo na faixa que toca para, em vez de pular',
    mandouParar && !avancoFantasma,
    avancoFantasma ? `PULOU em vez de parar: ${registro.join(', ')}` : `ordens: ${registro.join(', ')}`);
  await ctx.close();
}

// 4) Só a faixa DA VEZ move a fila: um som avulso terminando não pode empurrar a playlist.
{
  const { pag, ctx } = await abrir();
  await tocarPlaylist(pag);
  await limparOrdens(pag);
  // O fim de um som que não é o da fila — um efeito sonoro disparado por outra parte do app,
  // por exemplo — chega pelo mesmo evento e não pode ser confundido com o fim da faixa atual.
  await pag.evaluate(() => window.dispatchEvent(
    new CustomEvent('osone_sound_ended', { detail: { url: 'algum-outro-som.mp3' } })
  ));
  await pag.waitForTimeout(300);

  const registro = await ordens(pag);
  const empurrou = registro.some(o => o.startsWith('tocar:'));
  registrar('som fora da fila terminando não mexe na playlist',
    !empurrou,
    empurrou ? `a fila andou sozinha: ${registro.join(', ')}` : 'a fila ficou onde estava');
  await ctx.close();
}

// 5) Chegando ao fim da última faixa, a fila simplesmente termina.
{
  const { pag, ctx } = await abrir();
  await tocarPlaylist(pag);
  // Três faixas de 1,2s encadeadas: tempo de sobra para a fila inteira correr até o fim.
  await pag.waitForTimeout(5000);
  await limparOrdens(pag);
  await pag.waitForTimeout(1500);

  const registro = await ordens(pag);
  registrar('depois da última faixa a fila para sozinha, sem reiniciar',
    registro.length === 0,
    registro.length ? `continuou tocando: ${registro.join(', ')}` : 'silêncio depois da última faixa');
  await ctx.close();
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
