/**
 * Abre a aba do OSONE COWORK num Chromium e confere que ela aciona o motor REAL — com as travas.
 *
 * A leitura do plano é conferida sem navegador em conferir-plano-do-cowork.mjs. O que só a tela
 * prova é o encaixe, e o encaixe é justamente onde uma aba nova costuma dar errado:
 *
 *   - que NADA acontece no computador enquanto o plano não é aprovado — a aba existe para acabar
 *     com o "posso clicar? confirma?" a cada passo, e o preço disso é que a aprovação inicial
 *     precisa ser real, e não um botão que já executou antes de ser apertado;
 *   - que a aba passa pelo MESMO motor (useLocalAgent → planoDeAcoes), e não por um caminho
 *     paralelo sem os limites: um plano com dinheiro não pode nem chegar a ter botão de executar;
 *   - que o clique descrito em palavras vira uma posição MEDIDA na hora — 'localizar' antes de
 *     'clicar' —, porque um clique sem medição cai onde o cursor estiver parado;
 *   - que dá para parar no meio, e que parar interrompe de verdade;
 *   - que a tarefa concluída entra no histórico e repetir reusa os passos sem voltar ao modelo.
 *
 * O agente local é falsificado aqui (nenhum teste pode clicar de verdade no computador de quem
 * roda), mas o MOTOR não é: o laço, as esperas, a conferência por foto e a validação são os de
 * produção. A tela de mentira muda de cor a cada captura justamente para o motor poder confirmar
 * que o passo pegou, como ele faria numa tela real.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-cowork-na-tela.mjs
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

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-cowork-tela-'));
const entrada = path.join(pastaTemp, 'entrada.tsx');
const pagina = path.join(pastaTemp, 'index.html');

/**
 * O arreio: a aba ligada ao motor DE VERDADE, pelo mesmo hook que o App usa.
 *
 * Passar um onExecutar de mentira aqui tornaria o conferidor inútil — ele provaria que a tela
 * chama uma função, e não que a tarefa passa pelas travas. Ligando no useLocalAgent real, um
 * plano com dinheiro é recusado pelo mesmo código que recusa no caminho antigo.
 */
fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CoworkSection } from ${JSON.stringify(path.join(RAIZ, 'src/components/CoworkSection'))};
import { useLocalAgent } from ${JSON.stringify(path.join(RAIZ, 'src/hooks/useLocalAgent'))};

function Arreio() {
  const { executarCowork, planoEmCurso, alvoMedido, motorParado, pararMotor, retomarMotor } = useLocalAgent();
  return React.createElement('div', { style: { height: '100vh' } },
    React.createElement(CoworkSection, {
      onBack: () => {},
      localAgentToken: 'token-de-teste',
      chaveGemini: 'chave-de-teste',
      modeloGemini: 'gemini-3.6-flash',
      ambiente: { osName: 'Linux', userName: 'teste', homeDir: '/home/teste' },
      onExecutar: (passos) => executarCowork(passos, 'token-de-teste', false, { chaveGemini: 'x', modeloGemini: 'y' }),
      planoEmCurso, alvoMedido, motorParado,
      onParar: pararMotor,
      onRetomar: retomarMotor,
      onNotification: (m, t) => { (window.avisos = window.avisos || []).push({ m, t }); }
    })
  );
}

createRoot(document.getElementById('raiz')).render(React.createElement(Arreio));
`);

fs.writeFileSync(pagina, `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#07080d;color:#ccc"><div id="raiz"></div><script src="./cowork.js"></script></body></html>`);

await build({
  entryPoints: [entrada], bundle: true, outfile: path.join(pastaTemp, 'cowork.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
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
 * O agente local de mentira, instalado antes de a página carregar.
 *
 * Ele REGISTRA tudo o que foi pedido — é essa lista que responde à pergunta que mais importa:
 * o computador foi tocado antes da aprovação? A tela devolvida muda de cor a cada captura para
 * que a conferência por foto do motor tenha o que confirmar.
 */
const instalarAgenteFalso = async (pag) => {
  await pag.addInitScript(() => {
    window.pedidos = [];
    window.planoDoModelo = null;
    window.chamadasAoModelo = 0;

    /**
     * A TELA DE MENTIRA SE COMPORTA COMO UMA DE VERDADE: muda quando alguém age, e fica parada
     * quando ninguém age.
     *
     * As duas metades importam. Se ela mudasse a cada foto, o motor nunca veria a tela "parar" e
     * ficaria fotografando até estourar o prazo em todo passo — o conferidor levaria minutos e
     * mediria a paciência dele, não o comportamento dele. Se ela nunca mudasse, todo passo seria
     * dado como não confirmado e o plano morreria no primeiro. Mudando só depois de uma ação, a
     * conferência por foto do motor funciona exatamente como funcionaria numa tela real.
     */
    let tom = 0;
    const telaFalsa = () => {
      const c = document.createElement('canvas');
      c.width = 160; c.height = 90;
      const ctx = c.getContext('2d');
      ctx.fillStyle = (tom % 2) === 0 ? '#101010' : '#f0f0f0';
      ctx.fillRect(0, 0, 160, 90);
      return c.toDataURL('image/png');
    };
    const agiuNaTela = () => { tom++; };

    const json = (corpo, ok = true) => Promise.resolve(new Response(JSON.stringify(corpo), {
      status: ok ? 200 : 500, headers: { 'Content-Type': 'application/json' }
    }));

    const fetchOriginal = window.fetch;
    window.fetch = (entrada, opcoes = {}) => {
      const url = String(typeof entrada === 'string' ? entrada : entrada.url);
      window.pedidos.push({ url, corpo: opcoes.body || '' });

      /**
       * O modelo OLHANDO a tela para achar o alvo — o mesmo endpoint que mirarPorVisao usa.
       *
       * Devolve uma caixa fixa no formato box_2d ([ymin, xmin, ymax, xmax] em escala 0–1000), que
       * é o que o código de produção espera. Assim o passo 'clicar' percorre o caminho inteiro de
       * verdade: olhar, medir, clicar na medição.
       */
      if (url.includes('/api/gemini/generateContent')) {
        return json({ text: JSON.stringify({ encontrado: true, box_2d: [340, 620, 380, 660], descricao: 'campo de busca' }) });
      }
      if (url.includes('/api/generate')) {
        window.chamadasAoModelo++;
        return json({ text: JSON.stringify(window.planoDoModelo || { passos: [] }) });
      }
      if (url.includes('/api/agent/status')) return json({ status: 'online', osName: 'Linux' });
      if (url.includes('/api/agent/screen-info')) return json({ width: 1920, height: 1080, offsetX: 0, offsetY: 0 });
      if (url.includes('/api/agent/screen/capture')) {
        return json({ image: telaFalsa(), mimeType: 'image/png', screenWidth: 1920, screenHeight: 1080 });
      }
      if (url.includes('/api/agent/mouse/move')) {
        const corpo = JSON.parse(opcoes.body || '{}');
        return json({ pediuPx: corpo, ficouPx: corpo, telaPx: { width: 1920, height: 1080 }, execucaoExata: true });
      }
      // Ações que mexem na tela: a tela passa a estar diferente da foto anterior, e é isso que o
      // motor usa para confirmar que o passo pegou.
      if (url.includes('/api/agent/mouse/button')) { agiuNaTela(); return json({ success: true }); }
      if (url.includes('/api/agent/open-any')) { agiuNaTela(); return json({ success: true }); }
      if (url.includes('/api/agent/keyboard/type')) { agiuNaTela(); return json({ success: true }); }
      if (url.includes('/api/agent/keyboard/key')) { agiuNaTela(); return json({ success: true }); }
      if (url.startsWith('file://') || url.includes('.js')) return fetchOriginal(entrada, opcoes);
      return json({ success: true });
    };
  });
};

const abrir = async () => {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
  const pag = await ctx.newPage();
  await instalarAgenteFalso(pag);
  await pag.goto('file://' + pagina);
  await pag.waitForTimeout(600);
  return { pag, ctx };
};

const definirPlano = (pag, plano) => pag.evaluate(p => { window.planoDoModelo = p; }, plano);
const pedir = async (pag, tarefa) => {
  await pag.getByPlaceholder(/Ex:/).fill(tarefa);
  await pag.getByRole('button', { name: 'Montar o plano' }).click();
  await pag.waitForTimeout(700);
};
const urls = (pag) => pag.evaluate(() => window.pedidos.map(p => p.url));
const tocouNoComputador = (pag) => pag.evaluate(() =>
  window.pedidos.filter(p =>
    p.url.includes('/mouse/') || p.url.includes('/keyboard/') || p.url.includes('/open-any')).length);

/** O botão de repetir uma tarefa do histórico — o mesmo seletor usado para esperar e para clicar. */
const BOTAO_REPETIR = 'button[title="Repetir esta tarefa (o plano volta para aprovação)"]';

const PLANO_SIMPLES = {
  passos: [
    { acao: 'abrir', args: { caminho: 'navegador' }, descricao: 'Abrir o navegador', esperaDaTela: 'mudar' },
    { acao: 'clicar', args: { alvo: 'o campo de busca' }, descricao: 'Clicar no campo de busca', esperaDaTela: 'mudar' }
  ]
};

// ====== 1) NADA ACONTECE ANTES DA APROVAÇÃO ======
{
  const { pag, ctx } = await abrir();
  await definirPlano(pag, PLANO_SIMPLES);
  await pedir(pag, 'abrir o navegador e buscar');

  const mostrou = await pag.getByText('Plano: 2 passo(s)').isVisible().catch(() => false);
  registrar('o plano aparece na tela para ser aprovado', mostrou, mostrou ? '2 passos listados' : 'não apareceu');

  const naTela = await pag.locator('body').innerText();
  registrar('cada passo aparece com a descrição em português',
    naTela.includes('Abrir o navegador') && naTela.includes('Clicar no campo de busca'),
    'o usuário lê o que vai acontecer antes de acontecer');

  registrar('o passo mostra o alvo descrito, e não uma coordenada inventada',
    naTela.includes('alvo: o campo de busca') && !/x=\d+, y=\d+/.test(naTela),
    'o plano descreve o alvo; a posição é medida na hora');

  const tocou = await tocouNoComputador(pag);
  registrar('montar o plano não toca no computador',
    tocou === 0, tocou === 0 ? 'nenhuma ação executada' : `${tocou} ação(ões) antes da aprovação`);

  const temBotao = await pag.getByRole('button', { name: /Aprovar e executar/ }).isVisible().catch(() => false);
  registrar('o botão de aprovar existe e é o único caminho para executar', temBotao, 'aprovação explícita');

  await ctx.close();
}

// ====== 2) DINHEIRO NÃO CHEGA A TER BOTÃO ======
// A trava vem de planoDeAcoes.ts, o mesmo arquivo que protege o caminho antigo. Se a aba tivesse
// virado uma porta dos fundos, este caso mostraria um plano executável.
{
  const { pag, ctx } = await abrir();
  await definirPlano(pag, {
    passos: [
      { acao: 'abrir', args: { caminho: 'loja' }, descricao: 'Abrir a loja', esperaDaTela: 'mudar' },
      { acao: 'clicar', args: { alvo: 'botão' }, descricao: 'Finalizar a compra no cartão', esperaDaTela: 'mudar' }
    ]
  });
  await pedir(pag, 'comprar um fone pra mim');

  const recusou = await pag.getByText('Plano não aprovado').isVisible().catch(() => false);
  registrar('um plano com pagamento é recusado na aba', recusou, 'recusa mostrada no lugar dos passos');

  const texto = await pag.locator('body').innerText();
  registrar('a recusa diz que quem paga é a pessoa',
    /quem paga é a pessoa/i.test(texto), 'a mensagem do motor chegou inteira à tela');

  const temBotao = await pag.getByRole('button', { name: /Aprovar e executar/ }).isVisible().catch(() => false);
  registrar('plano recusado não ganha botão de executar',
    !temBotao, temBotao ? 'ofereceu executar um plano recusado' : 'sem caminho para rodar');

  const tocou = await tocouNoComputador(pag);
  registrar('plano recusado não encosta no computador', tocou === 0, `${tocou} ação(ões)`);

  await ctx.close();
}

// ====== 3) APROVAR EXECUTA, PELO MOTOR DE VERDADE ======
{
  const { pag, ctx } = await abrir();
  await definirPlano(pag, PLANO_SIMPLES);
  await pedir(pag, 'abrir o navegador e buscar');

  await pag.getByRole('button', { name: /Aprovar e executar/ }).click();
  await pag.waitForTimeout(1200);

  const parando = await pag.getByRole('button', { name: /Parar agora/ }).isVisible().catch(() => false);
  registrar('enquanto roda, existe um botão de parar',
    parando, parando ? 'parada disponível durante a execução' : 'não dava para interromper');

  /**
   * A marca do alvo é conferida ENQUANTO o plano roda, e não depois.
   *
   * Ela existe para dizer onde o passo em curso vai agir; terminada a execução ela some de
   * propósito, porque uma marca parada sobre um plano encerrado aponta com confiança para um
   * ponto que não é mais alvo de nada. Conferir no fim seria conferir justamente o estado em que
   * ela não deve aparecer.
   */
  const marcouDurante = await pag.waitForFunction(
    () => /Alvo medido na tela:.*x=640, y=360/.test(document.body.innerText),
    null, { timeout: 90000 }
  ).then(() => true).catch(() => false);
  registrar('durante a execução, a tela marca o alvo MEDIDO e diz a posição usada',
    marcouDurante, 'a marca sobre a foto vem da medição, não do plano');

  await pag.waitForFunction(() => (window.avisos || []).length > 0, null, { timeout: 90000 }).catch(() => {});

  const pedidos = await pag.evaluate(() => window.pedidos);
  const lista = pedidos.map(p => p.url);
  const abriu = lista.some(u => u.includes('/open-any'));
  registrar('o passo "abrir" chegou ao agente', abriu, 'POST /open-any registrado');

  const iOlhar = lista.findIndex(u => u.includes('/api/gemini/generateContent'));
  const iClicar = lista.findIndex(u => u.includes('/mouse/button'));
  registrar('o clique só acontece depois de a tela ser olhada',
    iOlhar !== -1 && iClicar !== -1 && iOlhar < iClicar,
    'olhar antes, clicar depois — nunca clicar de memória');

  /**
   * O clique usou a posição MEDIDA, e não outra.
   *
   * A caixa devolvida pelo modelo de mentira tem centro em x=640, y=360 na escala 0–1000, que numa
   * tela de 1920x1080 é o pixel (1229, 389). É esse pixel que o cursor tem de ter recebido: se o
   * clique tivesse ido para qualquer outro lugar, a medição teria sido desperdiçada no caminho.
   */
  const moveuPara = pedidos
    .filter(p => p.url.includes('/mouse/move'))
    .map(p => { try { return JSON.parse(p.corpo); } catch { return null; } })
    .filter(Boolean);
  const acertou = moveuPara.some(m => Math.abs(m.x - 1229) <= 2 && Math.abs(m.y - 389) <= 2);
  registrar('o cursor foi para o pixel que a medição indicou',
    acertou, moveuPara.map(m => `(${m.x},${m.y})`).join(' ') || 'nenhum movimento');

  const capturou = lista.filter(u => u.includes('/screen/capture')).length;
  registrar('o motor conferiu a tela entre os passos',
    capturou >= 3, `${capturou} captura(s) — a foto nova é o que confirma que a ação pegou`);

  const naTelaNoFim = await pag.locator('body').innerText();
  registrar('terminada a execução, a marca do alvo some',
    !/Alvo medido na tela/.test(naTelaNoFim),
    'nada continua apontado depois que não há mais passo em curso');

  await ctx.close();
}

// ====== 4) A TAREFA FEITA ENTRA NO HISTÓRICO, E REPETIR NÃO VOLTA AO MODELO ======
{
  const { pag, ctx } = await abrir();
  await definirPlano(pag, PLANO_SIMPLES);
  await pedir(pag, 'abrir o navegador e buscar');
  await pag.getByRole('button', { name: /Aprovar e executar/ }).click();
  // Esperar a LINHA DO HISTÓRICO aparecer, e não um tempo fixo: o plano leva o que levar (cada
  // passo espera a tela parar de mudar), e um relógio chutado aqui reprovaria a execução por ser
  // lenta em vez de por estar errada.
  await pag.waitForSelector(BOTAO_REPETIR, { timeout: 90000 }).catch(() => {});

  // A linha do histórico é lida a partir do próprio botão de repetir: procurar o texto solto na
  // página acharia também o que ficou escrito na caixa do pedido, e não provaria nada.
  const linhaDoHistorico = await pag.locator(BOTAO_REPETIR).first().locator('xpath=..').innerText().catch(() => '');
  registrar('a tarefa executada aparece no histórico',
    linhaDoHistorico.includes('abrir o navegador e buscar') && /2 passo\(s\)/.test(linhaDoHistorico),
    linhaDoHistorico.split('\n').join(' · ') || 'nenhuma linha no histórico');

  const guardado = await pag.evaluate(() => JSON.parse(localStorage.getItem('osone_cowork_historico') || '[]'));
  registrar('o histórico guarda os passos, e não só o texto da tarefa',
    guardado[0]?.passos?.length === 2, `${guardado[0]?.passos?.length} passo(s) guardados`);

  const antes = await pag.evaluate(() => window.chamadasAoModelo);
  await pag.locator(BOTAO_REPETIR).first().click();
  await pag.waitForTimeout(500);
  const depois = await pag.evaluate(() => window.chamadasAoModelo);

  registrar('repetir reusa o plano guardado sem chamar o modelo de novo',
    depois === antes, `${antes} → ${depois} chamada(s) ao modelo`);

  const voltouParaAprovar = await pag.getByRole('button', { name: /Aprovar e executar/ }).isVisible().catch(() => false);
  registrar('repetir volta para aprovação em vez de sair executando',
    voltouParaAprovar, 'a tela de hoje não é a de ontem: aprova-se de novo');

  await ctx.close();
}

// ====== 5) PARAR NO MEIO PARA DE VERDADE ======
{
  const { pag, ctx } = await abrir();
  await definirPlano(pag, {
    passos: Array.from({ length: 8 }, (_, i) => ({
      acao: 'abrir', args: { caminho: `programa-${i}` }, descricao: `Abrir o programa ${i + 1}`, esperaDaTela: 'mudar'
    }))
  });
  await pedir(pag, 'abrir oito programas');
  await pag.getByRole('button', { name: /Aprovar e executar/ }).click();
  await pag.waitForTimeout(1500);

  await pag.getByRole('button', { name: /Parar agora/ }).click();
  await pag.waitForFunction(() => (window.avisos || []).length > 0, null, { timeout: 90000 }).catch(() => {});
  await pag.waitForTimeout(500);

  const contarAberturas = () => pag.evaluate(() => window.pedidos.filter(p => p.url.includes('/open-any')).length);
  const aberturasAoParar = await contarAberturas();
  await pag.waitForTimeout(2500);
  const aberturasDepois = await contarAberturas();

  registrar('depois de parar, nenhuma ação nova sai',
    aberturasDepois === aberturasAoParar && aberturasDepois < 8,
    `${aberturasAoParar} → ${aberturasDepois} de 8 passos`);

  const texto = await pag.locator('body').innerText();
  registrar('a parada é explicada na tela, com o passo em que parou',
    /parad[oa]|Parei/i.test(texto), 'o motivo aparece em vez de um silêncio');

  await ctx.close();
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
