/**
 * Confere o que o OSONE MANDA para os aparelhos da casa inteligente (Tuya).
 *
 * Por que existe: os defeitos daqui não davam erro. A Tuya aceita um comando com um ponto de
 * dados que o aparelho não tem, responde sucesso, e o aparelho não mexe. Foi exatamente esse o
 * bug já consertado do liga/desliga ("switch_1" fixo numa lâmpada que só entende "switch_led"),
 * e o mesmo defeito continuava vivo em duas ações que ninguém tinha olhado:
 *
 * - COR: 'set_color' devolvia apenas [{switch_led: true}]. A cor era jogada fora no caminho, a
 *   lâmpada acendia branca, e o OSONE anunciava "comando recebido com sucesso". Quem pediu luz
 *   azul via luz branca e ouvia que tinha dado certo.
 * - BRILHO: 'set_value' mandava sempre 'bright_value' numa escala de 10 a 1000. As lâmpadas
 *   atuais usam 'bright_value_v2', e as antigas usam 'bright_value' numa escala de 25 a 255 —
 *   nas primeiras o comando é ignorado, e nas segundas 40% vira um valor fora da faixa.
 * - ALTERNAR: quando a leitura de estado falhava, o inverso de "desconhecido" dava sempre LIGAR.
 *   Pedir para alternar uma luz acesa não fazia nada, e era anunciado como sucesso.
 *
 * A verificação é feita no hook de verdade, montado num React fora da tela, com a rede
 * respondida por um aparelho de mentira que se comporta como cada modelo real se comporta. O que
 * se observa é o corpo do pedido que chega em /api/tuya/command — ou seja, o que o aparelho
 * receberia de fato.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-casa.mjs
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

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-casa-'));
const entrada = path.join(pastaTemp, 'entrada.tsx');
const pagina = path.join(pastaTemp, 'index.html');

fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { useTuyaSmartHome } from ${JSON.stringify(path.join(RAIZ, 'src/hooks/useTuyaSmartHome'))};

function Arnes() {
  const { executeTuyaDeviceControl } = useTuyaSmartHome();
  React.useEffect(() => { window.__controlar = executeTuyaDeviceControl; }, [executeTuyaDeviceControl]);
  return React.createElement('div', { id: 'pronto' }, 'pronto');
}
createRoot(document.getElementById('raiz')).render(React.createElement(Arnes));
`);
fs.writeFileSync(pagina, `<!doctype html><html><head><meta charset="utf-8"></head>
<body><div id="raiz"></div><script src="./casa.js"></script></body></html>`);

await build({
  entryPoints: [entrada],
  bundle: true,
  outfile: path.join(pastaTemp, 'casa.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
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
const nav = await chromium.launch(executavel ? { executablePath: executavel } : {});

/**
 * Abre o arnês com um aparelho de mentira. `status` é a lista de pontos de dados que ele diz
 * ter — é isso que separa uma lâmpada atual de uma antiga, e de uma tomada simples.
 */
const abrir = async ({ nome, category = 'dj', status, statusHttp = 200 }) => {
  const ctx = await nav.newContext();
  const pag = await ctx.newPage();

  await pag.route('**/api/tuya/**', async (rota) => {
    const url = rota.request().url();
    const cumprir = (corpo, code = 200) =>
      rota.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(corpo) });

    if (url.includes('/api/tuya/status')) return cumprir({ configured: true });
    if (url.includes('/api/tuya/devices')) return cumprir({ devices: [{ id: 'dev-1', name: nome, category, online: true }] });
    if (url.includes('/status')) {
      if (statusHttp !== 200) return cumprir({ error: 'aparelho fora do ar' }, statusHttp);
      return cumprir({ status });
    }
    if (url.includes('/api/tuya/command')) {
      const enviado = JSON.parse(rota.request().postData() || '{}');
      await pag.evaluate(c => { window.__ultimoComando = c; }, enviado.commands);
      return cumprir({ success: true, result: true });
    }
    return cumprir({});
  });

  await pag.goto('file://' + pagina);
  await pag.waitForSelector('#pronto');
  await pag.waitForTimeout(150);
  return { pag, ctx };
};

const controlar = (pag, nome, acao, valor, cor) => pag.evaluate(
  ([n, a, v, c]) => window.__controlar(n, a, v, c, false),
  [nome, acao, valor ?? undefined, cor ?? undefined]
);
const ultimoComando = (pag) => pag.evaluate(() => window.__ultimoComando || null);
const limpar = (pag) => pag.evaluate(() => { window.__ultimoComando = null; });

// Pontos de dados de cada modelo, como a Tuya os reporta.
const LAMPADA_ATUAL = [
  { code: 'switch_led', value: false },
  { code: 'work_mode', value: 'white' },
  { code: 'bright_value_v2', value: 500 },
  { code: 'colour_data_v2', value: '{"h":0,"s":0,"v":1000}' }
];
const LAMPADA_ANTIGA = [
  { code: 'switch_led', value: true },
  { code: 'bright_value', value: 200 }
];
const TOMADA = [{ code: 'switch_1', value: false }];

// 1) A cor pedida precisa chegar ao aparelho.
{
  const { pag, ctx } = await abrir({ nome: 'Lampada da Sala', status: LAMPADA_ATUAL });
  const r = await controlar(pag, 'Lampada da Sala', 'set_color', undefined, 'azul');
  const cmd = await ultimoComando(pag);
  const cor = (cmd || []).find(c => /colour_data/.test(c.code));
  const matiz = cor ? JSON.parse(cor.value).h : null;
  registrar('a cor pedida chega ao aparelho, em vez de virar só "ligar"',
    r.ok && !!cor && matiz === 240,
    cor ? `mandou ${cor.code} com matiz ${matiz}°` : `NENHUM comando de cor: ${JSON.stringify(cmd)}`);
  await ctx.close();
}

// 2) Cor sem entrar no modo colorido acende branco, mesmo com a cor enviada.
{
  const { pag, ctx } = await abrir({ nome: 'Lampada da Sala', status: LAMPADA_ATUAL });
  await controlar(pag, 'Lampada da Sala', 'set_color', undefined, '#FF0000');
  const cmd = await ultimoComando(pag);
  const modo = (cmd || []).find(c => c.code === 'work_mode');
  registrar('a cor vem acompanhada do modo colorido e de ligar',
    modo?.value === 'colour' && (cmd || []).some(c => c.code === 'switch_led' && c.value === true),
    JSON.stringify(cmd));
  await ctx.close();
}

// 3) Lâmpada sem luz colorida: recusa explicada, não um "sucesso" que não fez nada.
{
  const { pag, ctx } = await abrir({ nome: 'Lampada Velha', status: LAMPADA_ANTIGA });
  await limpar(pag);
  const r = await controlar(pag, 'Lampada Velha', 'set_color', undefined, 'verde');
  const cmd = await ultimoComando(pag);
  registrar('aparelho sem luz colorida recusa em vez de fingir que mudou de cor',
    r.ok === false && cmd === null,
    r.ok === false ? `recusou: ${r.message.slice(0, 60)}…` : 'ANUNCIOU SUCESSO sem mandar cor');
  await ctx.close();
}

// 4) Brilho na geração nova: código e escala corretos.
{
  const { pag, ctx } = await abrir({ nome: 'Lampada da Sala', status: LAMPADA_ATUAL });
  await controlar(pag, 'Lampada da Sala', 'set_value', 40, undefined);
  const cmd = await ultimoComando(pag);
  const brilho = (cmd || []).find(c => /bright_value/.test(c.code));
  registrar('brilho na lâmpada atual usa bright_value_v2 na escala 10–1000',
    brilho?.code === 'bright_value_v2' && brilho.value === 406,
    brilho ? `${brilho.code} = ${brilho.value}` : `nenhum comando de brilho: ${JSON.stringify(cmd)}`);
  await ctx.close();
}

// 5) Brilho na geração antiga: a escala é OUTRA, e mandar 400 numa faixa que vai a 255 é lixo.
{
  const { pag, ctx } = await abrir({ nome: 'Lampada Velha', status: LAMPADA_ANTIGA });
  await controlar(pag, 'Lampada Velha', 'set_value', 40, undefined);
  const cmd = await ultimoComando(pag);
  const brilho = (cmd || []).find(c => /bright_value/.test(c.code));
  registrar('brilho na lâmpada antiga usa bright_value na escala 25–255',
    brilho?.code === 'bright_value' && brilho.value === 117,
    brilho ? `${brilho.code} = ${brilho.value}` : `nenhum comando de brilho: ${JSON.stringify(cmd)}`);
  await ctx.close();
}

// 6) Tomada não tem brilho: recusa explicada.
{
  const { pag, ctx } = await abrir({ nome: 'Tomada da Sala', category: 'cz', status: TOMADA });
  await limpar(pag);
  const r = await controlar(pag, 'Tomada da Sala', 'set_value', 50, undefined);
  registrar('aparelho sem brilho recusa em vez de mandar um comando que ele ignora',
    r.ok === false && (await ultimoComando(pag)) === null,
    r.ok === false ? `recusou: ${r.message.slice(0, 60)}…` : 'ANUNCIOU SUCESSO');
  await ctx.close();
}

// 7) Alternar lê o estado real: luz acesa tem de APAGAR.
{
  const { pag, ctx } = await abrir({ nome: 'Lampada Velha', status: LAMPADA_ANTIGA });
  await controlar(pag, 'Lampada Velha', 'toggle', undefined, undefined);
  const cmd = await ultimoComando(pag);
  registrar('alternar uma luz acesa manda desligar, e não ligar de novo',
    cmd?.[0]?.value === false,
    JSON.stringify(cmd));
  await ctx.close();
}

// 8) Estado ilegível: recusa, em vez de chutar "ligar" e chamar de sucesso.
{
  const { pag, ctx } = await abrir({ nome: 'Lampada Muda', status: [], statusHttp: 500 });
  await limpar(pag);
  const r = await controlar(pag, 'Lampada Muda', 'toggle', undefined, undefined);
  registrar('sem conseguir ler o estado, alternar recusa em vez de chutar ligar',
    r.ok === false && (await ultimoComando(pag)) === null,
    r.ok === false ? `recusou: ${r.message.slice(0, 60)}…` : 'CHUTOU um comando');
  await ctx.close();
}

// 9) Nome com acento: o aparelho se chama "Lâmpada" e quem fala escreve "lampada".
{
  const { pag, ctx } = await abrir({ nome: 'Lâmpada do Quarto', status: LAMPADA_ATUAL });
  const r = await controlar(pag, 'lampada do quarto', 'turn_on', undefined, undefined);
  registrar('nome sem acento encontra o aparelho cadastrado com acento',
    r.ok === true,
    r.ok ? 'encontrou' : `NÃO ENCONTROU: ${r.message.slice(0, 70)}`);
  await ctx.close();
}

// 10) Nome exato ganha de nome parecido.
{
  const ctx = await nav.newContext();
  const pag = await ctx.newPage();
  await pag.route('**/api/tuya/**', async (rota) => {
    const url = rota.request().url();
    const cumprir = (c) => rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(c) });
    if (url.includes('/api/tuya/status')) return cumprir({ configured: true });
    if (url.includes('/api/tuya/devices')) return cumprir({ devices: [
      { id: 'dev-varanda', name: 'Luz da Varanda', category: 'dj', online: true },
      { id: 'dev-luz', name: 'Luz', category: 'dj', online: true }
    ] });
    if (url.includes('/status')) {
      await pag.evaluate(u => { window.__idConsultado = u; }, url);
      return cumprir({ status: LAMPADA_ATUAL });
    }
    if (url.includes('/api/tuya/command')) return cumprir({ success: true, result: true });
    return cumprir({});
  });
  await pag.goto('file://' + pagina);
  await pag.waitForSelector('#pronto');
  await controlar(pag, 'Luz', 'turn_on', undefined, undefined);
  const consultado = await pag.evaluate(() => window.__idConsultado || '');
  registrar('pedir "Luz" acende a "Luz", e não a "Luz da Varanda"',
    consultado.includes('dev-luz'),
    consultado.includes('dev-luz') ? 'acertou o aparelho de nome exato' : `foi no aparelho errado: ${consultado}`);
  await ctx.close();
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
