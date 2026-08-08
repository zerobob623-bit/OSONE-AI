import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let chromium;
try { ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch { console.error('Este conferidor precisa do Playwright.'); process.exit(2); }

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-ensino-'));
const entrada = path.join(temp, 'entrada.tsx');
fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CoworkTeachingPanel } from ${JSON.stringify(path.join(RAIZ, 'src/components/CoworkTeachingPanel'))};
createRoot(document.getElementById('raiz')).render(React.createElement(CoworkTeachingPanel, {
  objetivo: 'ver o último vídeo curto do YouTube', chaveGemini: 'teste', modeloGemini: 'teste',
  onNotification: (m, t) => { window.avisos = [...(window.avisos || []), { m, t }]; }
}));
`);
fs.writeFileSync(path.join(temp, 'index.html'), '<div id="raiz"></div><script src="./app.js"></script>');
await build({ entryPoints: [entrada], bundle: true, outfile: path.join(temp, 'app.js'),
  define: { 'process.env.NODE_ENV': '"production"' }, nodePaths: [path.join(RAIZ, 'node_modules')], logLevel: 'silent' });

const executavel = process.env.CHROMIUM_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(fs.existsSync);
const nav = await chromium.launch(executavel ? { executablePath: executavel, args: ['--no-sandbox'] } : {});
const pag = await nav.newPage();
await pag.addInitScript(() => {
  class Reconhecedor {
    continuous = true; interimResults = true; lang = 'pt-BR'; maxAlternatives = 1;
    start() { window.reconhecedorDoTeste = this; }
    stop() { this.onend?.(); }
  }
  window.SpeechRecognition = Reconhecedor;
  window.webkitSpeechRecognition = Reconhecedor;
  const media = navigator.mediaDevices || {};
  media.getDisplayMedia = async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#fff'; ctx.font = '32px sans-serif'; ctx.fillText('YouTube Studio', 30, 60);
    window.telaDoTeste = { canvas, ctx };
    return canvas.captureStream(8);
  };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: media });
  window.fetch = async (url) => {
    if (String(url).includes('/api/gemini/generateContent')) return new Response(JSON.stringify({ text: JSON.stringify({
      resumo: 'Abrir conteúdo e escolher o último Short',
      passos: [
        { acao: 'clicar', alvo: 'Conteúdo', quandoUsar: 'menu lateral do YouTube Studio', comoConfirmar: 'lista de vídeos aparece' },
        { acao: 'clicar', alvo: 'primeiro item com tipo Short', quandoUsar: 'lista ordenada por data', comoConfirmar: 'detalhes do vídeo aparecem' }
      ]
    }) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response('{}', { status: 200 });
  };
});
await pag.goto('file://' + path.join(temp, 'index.html'));

const casos = [];
const ok = (nome, condicao) => { casos.push(!!condicao); console.log(`${condicao ? '  ok  ' : 'FALHOU'}  ${nome}`); };
await pag.getByRole('button', { name: 'Ensinar automação' }).click();
await pag.getByText('gravando', { exact: true }).waitFor();
ok('o botão abre tela e microfone e entra em gravação', true);

await pag.evaluate(() => {
  const { ctx } = window.telaDoTeste;
  ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 640, 360);
  ctx.fillStyle = '#fff'; ctx.font = '28px sans-serif'; ctx.fillText('Conteúdo  Shorts  Vídeos', 30, 80);
});
await pag.waitForTimeout(300);
await pag.evaluate(() => {
  window.reconhecedorDoTeste.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'Agora clique em Conteúdo, porque aqui ficam os vídeos do canal.' }, isFinal: true }] });
});
await pag.getByText(/Agora clique em Conteúdo/).waitFor();
// Canvas captureStream do Chromium headless não publica cada redesenho como um monitor real; o
// botão manual percorre o mesmo capturador com `forcar=true` e prova o segundo quadro.
await pag.getByRole('button', { name: 'Registrar quadro' }).click();
await pag.getByText(/2 quadro\(s\)/).waitFor();
ok('fala e captura manual acumulam quadros da tela compartilhada', true);

await pag.getByRole('button', { name: 'Concluir ensino' }).click();
await pag.getByText('ver o último vídeo curto do YouTube', { exact: true }).waitFor();
ok('o Gemini assimila e o treinamento aparece salvo', await pag.getByText(/2 passos · .* quadros locais/).isVisible());

const salvo = await pag.evaluate(async () => new Promise(resolve => {
  const r = indexedDB.open('osone_memory_db', 1);
  r.onsuccess = () => {
    const q = r.result.transaction('memories', 'readonly').objectStore('memories').get('osone_cowork_treinamentos_v1');
    q.onsuccess = () => resolve(q.result);
  };
}));
ok('transcrição e imagens dos passos ficam no IndexedDB local',
  Array.isArray(salvo) && salvo[0]?.transcricao?.includes('clique em Conteúdo') && salvo[0]?.quadros?.every(q => q.imagem.startsWith('data:image/jpeg')));

await pag.getByTitle('Apagar este treinamento e seus quadros').click();
await pag.waitForTimeout(100);
ok('apagar remove o treinamento e seus quadros da lista', await pag.getByText('ver o último vídeo curto do YouTube', { exact: true }).count() === 0);

await nav.close();
console.log(`\n${casos.filter(Boolean).length}/${casos.length} conferências visuais do ensino passaram.`);
if (casos.some(x => !x)) process.exit(1);
