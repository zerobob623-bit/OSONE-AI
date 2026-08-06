/**
 * Confere o OSONE HEAR: o que a escuta ESCREVE, e o que a elaboração PEDE ao modelo.
 *
 * Por que existe: os dois defeitos que arruínam esta aba não dão erro em lugar nenhum e não
 * aparecem numa frase curta de teste manual.
 *
 * - A TRANSCRIÇÃO QUE SE MULTIPLICA. Em modo contínuo, `event.results` traz a lista INTEIRA
 *   desde o começo da sessão, e `resultIndex` diz onde está o que mudou. Percorrer do zero — o
 *   jeito óbvio de escrever — reescreve todo o discurso a cada palavra nova, e a transcrição
 *   cresce ao quadrado. Com "bom dia" ninguém nota; com dez minutos de fala, o texto que vai
 *   para o modelo é o mesmo parágrafo repetido dezenas de vezes.
 * - A ESCUTA QUE MORRE NA PRIMEIRA PAUSA. O navegador encerra a sessão em cada silêncio um
 *   pouco mais longo. Sem religar, a pessoa segue discursando para um campo que parou de
 *   escrever — e a tela continua dizendo "ouvindo".
 *
 * E confere o que o pedido ao Gemini exige, porque é ele que decide se o discurso sai adaptado
 * ao assunto ou sempre com o mesmo esqueleto de título e bullets.
 *
 * O painel roda de verdade, num navegador, com o reconhecimento de voz do navegador trocado por
 * um de mentira que entrega os eventos EXATAMENTE no formato que o Chrome entrega — inclusive a
 * lista acumulada e o resultIndex. O que se observa é o texto que aparece na tela.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-hear.mjs
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

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-hear-'));
const entrada = path.join(pastaTemp, 'entrada.tsx');
const pagina = path.join(pastaTemp, 'index.html');

fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OsoneHearPanel } from ${JSON.stringify(path.join(RAIZ, 'src/components/OsoneHearPanel'))};
import { montarPedidoDeElaboracao, lerRespostaDaElaboracao, FORMATOS_POSSIVEIS } from ${JSON.stringify(path.join(RAIZ, 'src/lib/elaborarDiscurso'))};

// Expostos para o conferidor poder examinar a instrução que o modelo recebe de verdade.
window.__montarPedido = montarPedidoDeElaboracao;
window.__lerResposta = lerRespostaDaElaboracao;
window.__formatos = FORMATOS_POSSIVEIS;

createRoot(document.getElementById('raiz')).render(
  React.createElement(OsoneHearPanel, { chaveGemini: 'chave-de-teste', modeloGemini: 'gemini-3.6-flash' })
);
`);

fs.writeFileSync(pagina, `<!doctype html><html><head><meta charset="utf-8"></head>
<body><div id="raiz"></div><script src="./hear.js"></script></body></html>`);

await build({
  entryPoints: [entrada],
  bundle: true,
  outfile: path.join(pastaTemp, 'hear.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [path.join(RAIZ, 'node_modules')],
  absWorkingDir: RAIZ,
  logLevel: 'silent'
});

const executavel = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const nav = await chromium.launch(executavel ? { executablePath: executavel } : {});

/**
 * O reconhecimento de voz de mentira. Reproduz o contrato do Chrome, que é o que importa aqui:
 * `results` acumula a sessão inteira, `resultIndex` aponta o primeiro resultado alterado, e
 * `onend` dispara sozinho quando a sessão morre no silêncio.
 */
const RECONHECEDOR_DE_MENTIRA = `
  window.__falas = [];
  window.__reinicios = 0;
  class ReconhecimentoDeMentira {
    constructor() {
      this.resultados = [];
      this.ligado = false;
      window.__rec = this;
    }
    start() {
      if (this.ligado) throw new Error('já ligado');
      this.ligado = true;
      // Sessão nova recomeça com a lista vazia, como no navegador de verdade.
      this.resultados = [];
      window.__reinicios++;
    }
    stop() {
      if (!this.ligado) return;
      this.ligado = false;
      setTimeout(() => this.onend && this.onend(), 0);
    }
    /** Uma fala chegando: entra na lista acumulada e o evento aponta para ela. */
    dizer(texto, definitivo) {
      const indice = this.resultados.length;
      const anterior = this.resultados.length && !this.resultados[indice - 1].isFinal ? indice - 1 : indice;
      if (anterior !== indice) this.resultados.pop();
      this.resultados.push({ isFinal: definitivo, 0: { transcript: texto }, length: 1 });
      this.onresult && this.onresult({ resultIndex: anterior, results: this.resultados });
    }
    /** O navegador desistindo sozinho no silêncio — sem ninguém ter pedido. */
    morrerNoSilencio() {
      this.ligado = false;
      this.onend && this.onend();
    }
    erro(codigo) { this.onerror && this.onerror({ error: codigo }); }
  }
  window.SpeechRecognition = ReconhecimentoDeMentira;
  window.webkitSpeechRecognition = ReconhecimentoDeMentira;
`;

const abrir = async ({ respostaDoGemini, statusHttp = 200 } = {}) => {
  const ctx = await nav.newContext();
  const pag = await ctx.newPage();

  await pag.addInitScript(RECONHECEDOR_DE_MENTIRA);

  await pag.route('**/api/gemini/generateContent', async (rota) => {
    const corpo = JSON.parse(rota.request().postData() || '{}');
    await pag.evaluate(c => { window.__ultimoPedido = c; }, corpo);
    if (statusHttp !== 200) {
      return rota.fulfill({ status: statusHttp, contentType: 'application/json', body: JSON.stringify({ error: 'cota estourada' }) });
    }
    return rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: respostaDoGemini ?? JSON.stringify({
        tema: 'O atraso na obra do galpão',
        formato: 'Decisões e pendências',
        porqueDoFormato: 'A fala terminou em encaminhamentos com responsáveis.',
        discurso: '## O que ficou decidido\\n- Refazer o cronograma.'
      }) })
    });
  });

  await pag.goto('file://' + pagina);
  await pag.waitForSelector('text=Transcrição do discurso');
  return { pag, ctx };
};

const ligarMicrofone = (pag) => pag.getByTitle('Começar a escutar').click();
const pararMicrofone = (pag) => pag.getByTitle('Parar a escuta').click();
const dizer = (pag, texto, definitivo = true) =>
  pag.evaluate(([t, d]) => window.__rec.dizer(t, d), [texto, definitivo]);
const transcricaoNaTela = (pag) => pag.evaluate(() => {
  const titulo = [...document.querySelectorAll('h3')].find(h => h.textContent.includes('Transcrição do discurso'));
  const caixa = titulo?.closest('.rounded-3xl');
  return caixa?.querySelector('p.whitespace-pre-wrap')?.textContent || '';
});

// 1) O DEFEITO QUE SÓ APARECE NA FALA LONGA: cada evento traz a lista acumulada de novo.
{
  const { pag, ctx } = await abrir();
  await ligarMicrofone(pag);
  await dizer(pag, 'primeira frase do discurso');
  await dizer(pag, 'segunda frase do discurso');
  await dizer(pag, 'terceira frase do discurso');
  await pag.waitForTimeout(120);
  const texto = await transcricaoNaTela(pag);
  const repeticoes = (texto.match(/primeira frase do discurso/g) || []).length;
  registrar('cada frase entra UMA vez, mesmo o evento trazendo a lista inteira de novo',
    repeticoes === 1 && texto.includes('terceira frase do discurso'),
    repeticoes === 1 ? `"${texto.slice(0, 60)}…"` : `a primeira frase apareceu ${repeticoes}x — a transcrição está se multiplicando`);
  await ctx.close();
}

// 2) A ESCUTA ATIVA: o navegador desiste no silêncio e ela tem de voltar sozinha.
{
  const { pag, ctx } = await abrir();
  await ligarMicrofone(pag);
  await dizer(pag, 'antes da pausa');
  await pag.evaluate(() => window.__rec.morrerNoSilencio());
  await pag.waitForTimeout(400);
  await dizer(pag, 'depois da pausa');
  await pag.waitForTimeout(120);
  const texto = await transcricaoNaTela(pag);
  const reinicios = await pag.evaluate(() => window.__reinicios);
  registrar('o navegador desistindo no silêncio não encerra a escuta: ela se religa',
    reinicios >= 2 && texto.includes('antes da pausa') && texto.includes('depois da pausa'),
    `${reinicios} sessão(ões) aberta(s); texto: "${texto.slice(0, 70)}…"`);
  await ctx.close();
}

// 3) Parar é decisão DA PESSOA: depois disso o microfone não pode voltar sozinho.
{
  const { pag, ctx } = await abrir();
  await ligarMicrofone(pag);
  await dizer(pag, 'discurso encerrado aqui');
  await pararMicrofone(pag);
  await pag.waitForTimeout(500);
  const reiniciosDepois = await pag.evaluate(() => window.__reinicios);
  const ligado = await pag.evaluate(() => window.__rec.ligado);
  registrar('depois de parar, o microfone NÃO se religa sozinho',
    reiniciosDepois === 1 && ligado === false,
    `${reiniciosDepois} sessão(ões) no total, ligado=${ligado}`);
  await ctx.close();
}

// 4) O trecho ainda não confirmado não pode ser perdido por parar no meio da frase.
{
  const { pag, ctx } = await abrir();
  await ligarMicrofone(pag);
  await dizer(pag, 'frase confirmada', true);
  await dizer(pag, 'frase que ficou pela metade', false);
  await pararMicrofone(pag);
  await pag.waitForTimeout(150);
  const texto = await transcricaoNaTela(pag);
  registrar('parar no meio de uma frase preserva o que ainda não tinha sido confirmado',
    texto.includes('frase confirmada') && texto.includes('frase que ficou pela metade'),
    `"${texto}"`);
  await ctx.close();
}

// 5) O parcial é a aposta atual do navegador: substituído, nunca somado.
{
  const { pag, ctx } = await abrir();
  await ligarMicrofone(pag);
  await dizer(pag, 'bom', false);
  await dizer(pag, 'bom dia', false);
  await dizer(pag, 'bom dia a todos', false);
  await pag.waitForTimeout(120);
  const texto = await transcricaoNaTela(pag);
  registrar('a correção do parcial substitui a anterior, em vez de empilhar',
    texto.trim() === 'bom dia a todos',
    `"${texto.trim()}"`);
  await ctx.close();
}

// 6) Elaborar com a escuta ligada precisa parar antes: o discurso ainda estava crescendo.
{
  const { pag, ctx } = await abrir();
  await ligarMicrofone(pag);
  await dizer(pag, 'este e o discurso completo que sera elaborado agora');
  await pag.getByRole('button', { name: /Elaborar discurso/ }).click();
  await pag.waitForTimeout(400);
  const ligado = await pag.evaluate(() => window.__rec.ligado);
  const pedido = await pag.evaluate(() => window.__ultimoPedido);
  registrar('clicar em elaborar para a escuta antes de mandar o discurso',
    ligado === false && !!pedido,
    ligado === false ? 'microfone parado e pedido enviado' : 'O MICROFONE CONTINUOU LIGADO');
  await ctx.close();
}

// 7) O resultado precisa mostrar o tema, o formato escolhido e o porquê.
{
  const { pag, ctx } = await abrir();
  await ligarMicrofone(pag);
  await dizer(pag, 'a obra do galpao atrasou por causa da chuva e do fornecedor');
  await pararMicrofone(pag);
  await pag.getByRole('button', { name: /Elaborar discurso/ }).click();
  await pag.waitForSelector('text=O atraso na obra do galpão', { timeout: 5000 });
  const temFormato = await pag.locator('text=Decisões e pendências').count();
  const temPorque = await pag.locator('text=A fala terminou em encaminhamentos com responsáveis.').count();
  registrar('a tela mostra o tema, o formato escolhido e o motivo da escolha',
    temFormato > 0 && temPorque > 0,
    `formato ${temFormato > 0 ? 'ok' : 'AUSENTE'}, porquê ${temPorque > 0 ? 'ok' : 'AUSENTE'}`);
  await ctx.close();
}

// 8) Falha na elaboração não pode levar a transcrição junto — é o trabalho da pessoa.
{
  const { pag, ctx } = await abrir({ statusHttp: 500 });
  await ligarMicrofone(pag);
  await dizer(pag, 'discurso que nao pode ser perdido de jeito nenhum');
  await pararMicrofone(pag);
  await pag.getByRole('button', { name: /Elaborar discurso/ }).click();
  await pag.waitForSelector('text=A elaboração falhou', { timeout: 5000 });
  const texto = await transcricaoNaTela(pag);
  registrar('se a elaboração falha, a transcrição continua inteira na tela',
    texto.includes('discurso que nao pode ser perdido de jeito nenhum'),
    texto ? 'transcrição preservada' : 'A TRANSCRIÇÃO SUMIU JUNTO COM O ERRO');
  await ctx.close();
}

// 9) Resposta fora do formato não pode virar erro que engole o conteúdo.
{
  const { pag, ctx } = await abrir({ respostaDoGemini: '```json\n{"tema":"Tema com cerca","formato":"Narrativa","porqueDoFormato":"É um relato.","discurso":"## Era uma vez"}\n```' });
  await ligarMicrofone(pag);
  await dizer(pag, 'era uma vez um discurso contado como historia');
  await pararMicrofone(pag);
  await pag.getByRole('button', { name: /Elaborar discurso/ }).click();
  const apareceu = await pag.waitForSelector('text=Tema com cerca', { timeout: 5000 }).then(() => true).catch(() => false);
  registrar('resposta embrulhada em cerca de código ainda é lida corretamente',
    apareceu,
    apareceu ? 'JSON dentro da cerca foi lido' : 'a cerca de código quebrou a leitura');
  await ctx.close();
}

// 10) Texto solto (sem JSON nenhum) entrega o conteúdo, em vez de perder o discurso.
{
  const { pag, ctx } = await abrir();
  const lido = await pag.evaluate(() => window.__lerResposta('O modelo resolveu escrever em prosa e nada mais.'));
  registrar('resposta sem JSON entrega o texto em vez de descartar o discurso',
    lido.discurso.includes('resolveu escrever em prosa'),
    `discurso preservado, formato "${lido.formato}"`);
  await ctx.close();
}

// 11) A INSTRUÇÃO É O QUE FAZ A ADAPTAÇÃO ACONTECER. Sem o cardápio com o sinal de cada
//     formato, sem a proibição do esqueleto fixo e sem exigir a escolha declarada, o modelo
//     devolve título + bullets para qualquer assunto — o defeito que esta aba existe para evitar.
{
  const { pag, ctx } = await abrir();
  const analise = await pag.evaluate(() => {
    const pedido = window.__montarPedido('um discurso qualquer para conferir a instrucao');
    const formatos = window.__formatos;
    return {
      temTodosOsFormatos: formatos.every(f => pedido.includes(f.nome)),
      temOSinalDeCada: formatos.every(f => pedido.includes(f.quando)),
      permiteInventar: /INVENTE o formato/i.test(pedido),
      proibeEsqueletoFixo: /mesmo esqueleto/i.test(pedido),
      proibeInventarConteudo: /Inventar conteúdo que não foi dito/i.test(pedido),
      exigeEscolhaDeclarada: pedido.includes('"formato"') && pedido.includes('"porqueDoFormato"'),
      levaOTexto: pedido.includes('um discurso qualquer para conferir a instrucao'),
      quantosFormatos: formatos.length
    };
  });
  const tudo = Object.entries(analise).filter(([k]) => k !== 'quantosFormatos').every(([, v]) => v === true);
  registrar('o pedido ao modelo carrega o cardápio, o sinal de cada formato e a proibição do padrão fixo',
    tudo,
    tudo
      ? `${analise.quantosFormatos} formatos, com escolha declarada e lista aberta`
      : `faltou: ${Object.entries(analise).filter(([k, v]) => k !== 'quantosFormatos' && !v).map(([k]) => k).join(', ')}`);
  await ctx.close();
}

// 12) Discurso curto demais não vai ao modelo: não há o que organizar em duas palavras.
{
  const { pag, ctx } = await abrir();
  await ligarMicrofone(pag);
  await dizer(pag, 'oi');
  await pag.waitForTimeout(120);
  const desabilitado = await pag.getByRole('button', { name: /Elaborar discurso/ }).isDisabled();
  registrar('com pouquíssimas palavras, elaborar fica indisponível em vez de chamar o modelo à toa',
    desabilitado,
    desabilitado ? 'botão bloqueado' : 'o botão estava liberado');
  await ctx.close();
}

// 13) Permissão negada: a escuta para e explica, em vez de tentar religar para sempre.
{
  const { pag, ctx } = await abrir();
  await ligarMicrofone(pag);
  await pag.evaluate(() => window.__rec.erro('not-allowed'));
  await pag.evaluate(() => window.__rec.morrerNoSilencio());
  await pag.waitForTimeout(500);
  const reinicios = await pag.evaluate(() => window.__reinicios);
  const avisou = await pag.locator('text=/bloqueou o microfone/').count();
  registrar('microfone negado para a escuta e explica, em vez de religar num laço',
    reinicios === 1 && avisou > 0,
    `${reinicios} sessão(ões), aviso ${avisou > 0 ? 'na tela' : 'AUSENTE'}`);
  await ctx.close();
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
