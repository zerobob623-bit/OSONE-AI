/**
 * Confere os sons do COWORK num navegador de verdade, ouvindo o que sai do WebAudio.
 *
 * O relato que motivou isto: "chega na tela do YouTube e fica tudo em silêncio". Com a tela do
 * agente separada da sua, você fica noutra aba — e trabalhando e travado passam a ter exatamente
 * a mesma aparência. O som é o que devolve a diferença sem exigir que você olhe.
 *
 * O que precisa ser verdade, e por quê:
 *
 *   1. CADA TIPO DE AÇÃO SOA DIFERENTE. Um bipe único diria "algo aconteceu", que é quase tão
 *      pouco quanto o silêncio. É a variedade que deixa a sequência audível como sequência.
 *   2. OS TRÊS MOMENTOS QUE IMPORTAM — começou, terminou, parou — não podem se confundir entre si
 *      nem com uma ação comum. É por eles que se responde "ainda está trabalhando?" sem olhar.
 *   3. O SOM É ACESSÓRIO. Sem WebAudio, com o áudio bloqueado, com a placa muda: nada pode lançar
 *      erro. Um som que derruba uma tarefa é pior do que nenhum som.
 *   4. DESLIGAR DESLIGA, e a escolha sobrevive a recarregar a página.
 *
 * O áudio é interceptado, e não ouvido: o AudioContext é substituído por um que ANOTA cada
 * oscilador criado, com frequência e duração. Assim dá para afirmar coisas exatas ("o som de
 * concluir sobe em quatro notas") em vez de "tocou alguma coisa".
 *
 * Como rodar:
 *   node scripts/conferir-som-do-cowork.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  console.error("Este conferidor precisa do playwright: rode 'npm i -D playwright' e tente de novo.");
  process.exit(2);
}

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-som-'));
const entrada = path.join(pastaTemp, 'entrada.ts');
const pagina = path.join(pastaTemp, 'index.html');

fs.writeFileSync(entrada, `
import * as som from ${JSON.stringify(path.join(RAIZ, 'src/lib/somDoCowork'))};
(window as any).som = som;
`);
fs.writeFileSync(pagina, `<!doctype html><html><head><meta charset="utf-8"></head>
<body><script src="./som.js"></script></body></html>`);

await build({
  entryPoints: [entrada], bundle: true, outfile: path.join(pastaTemp, 'som.js'),
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const executavel = process.env.CHROMIUM_PATH
  || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const nav = await chromium.launch(executavel ? { executablePath: executavel } : {});

/** Um AudioContext que anota em vez de soar — é o que permite afirmar o que foi tocado. */
const espiaoDeAudio = () => {
  window.tocados = [];
  class GanhoFalso {
    constructor() { this.gain = { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }; }
    connect() {}
  }
  class OsciladorFalso {
    constructor(anotar) { this.anotar = anotar; this.type = 'sine'; this.frequency = { setValueAtTime: (v) => { this.hz = v; } }; }
    connect() {}
    start(t) { this.inicio = t; }
    stop(t) { this.anotar({ hz: this.hz, tipo: this.type, duracao: Number((t - this.inicio).toFixed(4)) }); }
  }
  class ContextoFalso {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    createGain() { return new GanhoFalso(); }
    createOscillator() { return new OsciladorFalso(o => window.tocados.push(o)); }
    resume() { return Promise.resolve(); }
  }
  window.AudioContext = ContextoFalso;
  window.webkitAudioContext = ContextoFalso;
};

const abrir = async (preparar) => {
  const ctx = await nav.newContext();
  const pag = await ctx.newPage();
  await pag.addInitScript(preparar || espiaoDeAudio);
  await pag.goto('file://' + pagina);
  await pag.waitForTimeout(200);
  return { pag, ctx };
};

const tocar = async (pag, nota) => {
  await pag.evaluate(n => { window.tocados = []; window.som.tocar(n); }, nota);
  return await pag.evaluate(() => window.tocados);
};

// ====== 1) CADA AÇÃO TEM O SEU SOM ======
{
  const { pag, ctx } = await abrir();

  const acoes = ['abrir', 'clicar', 'digitar', 'tecla', 'rolar', 'trocar_janela', 'esperar'];
  const alturas = {};
  for (const a of acoes) {
    const t = await tocar(pag, a);
    alturas[a] = t.map(o => o.hz).join('-');
  }
  const distintos = new Set(Object.values(alturas));
  registrar('cada tipo de ação soa diferente das outras',
    distintos.size === acoes.length,
    `${distintos.size} sons distintos para ${acoes.length} ações`);

  const todosTocaram = Object.values(alturas).every(v => v.length > 0);
  registrar('toda ação do vocabulário do agente tem som',
    todosTocaram, Object.entries(alturas).map(([a, hz]) => `${a}:${hz}`).join(' '));

  // Uma ação desconhecida não pode virar silêncio: silêncio significa "parou".
  const desconhecida = await pag.evaluate(() => {
    window.tocados = [];
    window.som.tocar(window.som.notaDaAcao('uma_acao_que_nao_existe'));
    return window.tocados;
  });
  registrar('ação fora do vocabulário ainda soa, em vez de virar silêncio',
    desconhecida.length > 0, `${desconhecida.length} nota(s)`);

  await ctx.close();
}

// ====== 2) COMEÇOU, TERMINOU, PAROU: OS TRÊS QUE RESPONDEM SEM OLHAR ======
{
  const { pag, ctx } = await abrir();

  const inicio = await tocar(pag, 'inicio');
  const concluido = await tocar(pag, 'concluido');
  const parado = await tocar(pag, 'parado');
  const falha = await tocar(pag, 'falha');
  const recusa = await tocar(pag, 'recusa');

  const sobe = (t) => t.length > 1 && t[t.length - 1].hz > t[0].hz;
  const desce = (t) => t.length > 1 && t[t.length - 1].hz < t[0].hz;

  registrar('o som de início SOBE, e o de parada DESCE',
    sobe(inicio) && desce(parado),
    `início ${inicio.map(o => o.hz).join('→')} · parada ${parado.map(o => o.hz).join('→')}`);

  registrar('o som de conclusão é o mais longo e sobe até o fim',
    concluido.length >= 4 && sobe(concluido),
    `${concluido.length} notas: ${concluido.map(o => o.hz).join('→')}`);

  registrar('falha e recusa são graves, para não se confundirem com uma ação',
    Math.max(...falha.map(o => o.hz)) < 500 && Math.max(...recusa.map(o => o.hz)) < 500,
    `falha até ${Math.max(...falha.map(o => o.hz))}Hz · recusa até ${Math.max(...recusa.map(o => o.hz))}Hz`);

  registrar('recusa por regra soa diferente de uma falha qualquer',
    JSON.stringify(falha.map(o => o.hz)) !== JSON.stringify(recusa.map(o => o.hz)),
    'dinheiro recusado não soa como um clique que não pegou');

  const marcos = [inicio, concluido, parado].map(t => JSON.stringify(t.map(o => o.hz)));
  registrar('os três momentos não se confundem entre si',
    new Set(marcos).size === 3, 'começou, terminou e parou têm sons próprios');

  // O som de ação é curto; o de desfecho, não — é o que faz um passar despercebido e o outro não.
  const clicar = await tocar(pag, 'clicar');
  registrar('som de ação é curto e som de desfecho é longo',
    clicar[0].duracao < concluido[0].duracao * 1.5 && clicar.length < concluido.length,
    `clique ${clicar[0].duracao}s (1 nota) · conclusão ${concluido.length} notas`);

  await ctx.close();
}

// ====== 3) DESLIGAR DESLIGA, E A ESCOLHA SOBREVIVE ======
{
  const { pag, ctx } = await abrir();

  registrar('o som vem ligado por padrão',
    await pag.evaluate(() => window.som.somLigado()),
    'quem não quer, desliga — o contrário faria a função nascer invisível');

  await pag.evaluate(() => window.som.definirSom(false));
  const mudo = await tocar(pag, 'concluido');
  registrar('desligado, nada toca',
    mudo.length === 0, `${mudo.length} nota(s) com o som desligado`);

  await pag.reload();
  await pag.waitForTimeout(200);
  registrar('a escolha de desligar sobrevive a recarregar',
    (await pag.evaluate(() => window.som.somLigado())) === false,
    'não precisa desligar de novo a cada vez');

  await pag.evaluate(() => window.som.definirSom(true));
  const devolta = await tocar(pag, 'concluido');
  registrar('ligar de volta volta a tocar',
    devolta.length > 0, `${devolta.length} nota(s)`);

  await ctx.close();
}

// ====== 4) O SOM É ACESSÓRIO: NUNCA DERRUBA NADA ======
// É a garantia que mais importa. O agente está no meio de uma tarefa no computador de alguém;
// um erro de áudio não pode ter voz nenhuma sobre isso.
{
  const { pag, ctx } = await abrir(() => {
    // Um navegador sem WebAudio nenhum.
    delete window.AudioContext;
    delete window.webkitAudioContext;
  });
  const quebrou = await pag.evaluate(() => {
    try { window.som.tocar('inicio'); window.som.tocar('clicar'); return false; } catch { return true; }
  });
  registrar('sem WebAudio no navegador, tocar não lança erro',
    !quebrou, 'segue mudo, e o trabalho continua');
  await ctx.close();
}

{
  const { pag, ctx } = await abrir(() => {
    // O caso real: o navegador recusa o áudio porque não houve gesto do usuário.
    class ContextoQueRecusa {
      constructor() { throw new Error('not allowed'); }
    }
    window.AudioContext = ContextoQueRecusa;
    window.webkitAudioContext = ContextoQueRecusa;
  });
  const quebrou = await pag.evaluate(() => {
    try { window.som.tocar('concluido'); return false; } catch { return true; }
  });
  registrar('áudio bloqueado pelo navegador não lança erro',
    !quebrou, 'a tarefa não pode depender de o som ser permitido');
  await ctx.close();
}

{
  const { pag, ctx } = await abrir(() => {
    // localStorage indisponível (modo restrito): a preferência some, o som continua.
    Object.defineProperty(window, 'localStorage', {
      get() { throw new Error('bloqueado'); }
    });
  });
  const funcionou = await pag.evaluate(() => {
    try { return window.som.somLigado() === true; } catch { return false; }
  });
  registrar('sem localStorage, o som continua ligado em vez de sumir',
    funcionou, 'a preferência se perde; a informação, não');
  await ctx.close();
}

// ====== 5) O TOQUE PERIÓDICO ENQUANTO ELE TRABALHA ======
// Existe para a espera longa: uma página pesada carregando, o modelo pensando. Sem ele, o intervalo
// entre duas ações é silêncio puro — que é exatamente o que "travou" também parece.
{
  const { pag, ctx } = await abrir();
  const contagem = await pag.evaluate(async () => {
    window.tocados = [];
    const parar = window.som.baterPonto(120);
    await new Promise(r => setTimeout(r, 500));
    parar();
    const durante = window.tocados.length;
    window.tocados = [];
    await new Promise(r => setTimeout(r, 400));
    return { durante, depois: window.tocados.length };
  });
  registrar('enquanto trabalha, um toque baixinho de tempos em tempos',
    contagem.durante >= 2, `${contagem.durante} toque(s) em 500ms`);
  registrar('parar o toque periódico para de verdade',
    contagem.depois === 0, `${contagem.depois} toque(s) depois de parar`);
  await ctx.close();
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
