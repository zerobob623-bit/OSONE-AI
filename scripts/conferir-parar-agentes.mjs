/**
 * Confere que dá para PARAR o Hunter e o Enxame no meio — e que parar significa parar.
 *
 * Os dois só sabiam ir até o fim. Fechar o modal escondia a tela e a execução continuava correndo
 * por baixo: o Enxame seguia consumindo cota pelas quatro iterações e GRAVAVA no repositório
 * depois, com o painel já fora da vista. Quem desistiu via o arquivo mudar sozinho minutos
 * depois, sem relação visível com nada que tivesse feito — e sem nada na tela para relacionar.
 *
 * A afirmação que este conferidor precisa sustentar não é "o botão existe", é "depois de parar,
 * NADA foi gravado". Por isso cada caso lê o repositório no fim e compara com o que havia antes.
 *
 * O modelo é substituído por um fetch de mentira que respeita o AbortSignal, como o fetch de
 * verdade faz: ele pendura a chamada até o sinal disparar e então rejeita com AbortError. É
 * exatamente a situação real — o usuário desiste enquanto o modelo ainda está pensando.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-parar-agentes.mjs
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

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-parar-'));
const entrada = path.join(pastaTemp, 'entrada.tsx');
const pagina = path.join(pastaTemp, 'index.html');

fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodeWorkspace } from ${JSON.stringify(path.join(RAIZ, 'src/components/CodeWorkspace'))};

createRoot(document.getElementById('raiz')).render(
  React.createElement('div', { style: { height: '100vh' } },
    React.createElement(CodeWorkspace, {
      onClose: () => {},
      onStartLiveVoice: () => {},
      apiKeys: { gemini: 'x' },
      isGenerating: false,
      onGenerateCodeRequest: async () => null
    })
  )
);
`);
fs.writeFileSync(pagina, `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#07080d;color:#ccc"><div id="raiz"></div><script src="./code.js"></script></body></html>`);

await build({
  entryPoints: [entrada],
  bundle: true,
  outfile: path.join(pastaTemp, 'code.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [path.join(RAIZ, 'node_modules')],
  absWorkingDir: RAIZ,
  logLevel: 'silent'
});

const CHAVE_PROJETOS = 'osone_code_projects_v2';
const CHAVE_ATIVO = 'osone_code_active_project_id';
const ORIGINAL = '<h1>ORIGINAL INTOCADO</h1>';

const PROJETOS = [1, 2, 3, 4, 5].map(n => ({
  id: `proj-${n}`,
  name: `Projeto ${n}`,
  files: [{ id: 'main-app', name: 'index.html', language: 'html', isMain: true, updatedAt: 1, content: ORIGINAL }],
  activeFileId: 'main-app',
  updatedAt: 1
}));

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const executavel = process.env.CHROMIUM_PATH
  || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/opt/google/chrome/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const nav = await chromium.launch(executavel ? { executablePath: executavel, args: ['--no-sandbox'] } : {});

/**
 * @param respostasProntas textos devolvidos de imediato, na ordem das chamadas; quando a lista
 *                         acaba, a chamada seguinte PENDURA até o AbortSignal disparar.
 */
const abrir = async (respostasProntas = []) => {
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
  const pag = await ctx.newPage();
  await pag.addInitScript(([projetos, chaveP, chaveA, prontas]) => {
    localStorage.setItem(chaveP, JSON.stringify(projetos));
    localStorage.setItem(chaveA, 'proj-1');

    window.__chamadas = 0;
    const fila = [...prontas];
    window.fetch = (url, opcoes) => {
      window.__chamadas++;
      const proxima = fila.shift();
      if (proxima !== undefined) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ text: proxima, truncated: false, blocked: false })
        });
      }
      /**
       * Sem resposta pronta: a chamada demora — e RESPONDE MESMO ASSIM, depois.
       *
       * A demora (2,5 s) é maior do que a espera até o clique em "Parar": é o que garante que o
       * cancelamento chegue com a chamada AINDA EM CURSO, que é a situação a testar. Com uma
       * demora curta, o conferidor cancelaria algo que já tinha terminado e mediria outra coisa.
       *
       * Esta demora é o coração do conferidor. Pendurar para sempre faria o caso passar à toa:
       * sem resposta, nem o código antigo gravaria nada, e o teste não provaria coisa alguma.
       * Respondendo depois, reproduz-se a situação real — o usuário desiste, e o modelo devolve o
       * texto em seguida. Quem passa o AbortSignal é rejeitado antes disso e não grava; quem não
       * passa recebe a resposta e grava no repositório com o painel já fechado, que era o defeito.
       */
      return new Promise((resolver, rejeitar) => {
        const sinal = opcoes && opcoes.signal;
        const relogio = setTimeout(() => resolver({
          ok: true,
          status: 200,
          json: async () => ({ text: '<html>RESPOSTA ATRASADA DO MODELO</html>', truncated: false, blocked: false })
        }), 2500);
        if (!sinal) return;
        const abortar = () => {
          clearTimeout(relogio);
          const e = new Error('abortado'); e.name = 'AbortError'; rejeitar(e);
        };
        if (sinal.aborted) return abortar();
        sinal.addEventListener('abort', abortar);
      });
    };
  }, [PROJETOS, CHAVE_PROJETOS, CHAVE_ATIVO, respostasProntas]);
  await pag.goto('file://' + pagina);
  await pag.waitForTimeout(500);
  return { pag, ctx };
};

const conteudoGravado = async (pag) => {
  const projetos = await pag.evaluate(c => JSON.parse(localStorage.getItem(c) || '[]'), CHAVE_PROJETOS);
  return projetos.find(p => p.id === 'proj-1').files.find(f => f.id === 'main-app').content;
};

// ====== 1) O HUNTER PARA, E NÃO ESCREVE NO ARQUIVO ======
{
  const { pag, ctx } = await abrir(); // a primeira chamada já pendura
  await pag.getByRole('button', { name: /HUNTER AGÊNTICO/ }).click();
  await pag.waitForTimeout(300);
  await pag.getByPlaceholder(/Ex:/).first().fill('confere tudo');
  await pag.getByRole('button', { name: /Caçar|Auditar|Examinar|Iniciar/i }).first().click();
  await pag.waitForTimeout(400);

  const botaoParar = pag.getByRole('button', { name: 'Parar' }).first();
  const apareceu = await botaoParar.isVisible().catch(() => false);
  registrar('o Hunter em execução mostra um botão de parar',
    apareceu, apareceu ? 'botão presente' : 'não há como parar');

  if (apareceu) {
    await botaoParar.click();
    // Mais do que a demora da resposta atrasada: é depois dela que o defeito apareceria.
    await pag.waitForTimeout(3200);
  }

  const gravado = await conteudoGravado(pag);
  registrar('parar o Hunter não altera o arquivo',
    gravado === ORIGINAL, gravado === ORIGINAL ? 'arquivo intocado' : `arquivo virou "${gravado.slice(0, 40)}"`);

  const temErro = await pag.getByText(/Erro na caçada/).first().isVisible().catch(() => false);
  registrar('parar o Hunter não é relatado como erro',
    !temErro, temErro ? 'apareceu relatório de erro' : 'sem falso erro');

  await ctx.close();
}

// ====== 2) FECHAR O MODAL DO HUNTER TAMBÉM PARA ======
{
  const { pag, ctx } = await abrir();
  await pag.getByRole('button', { name: /HUNTER AGÊNTICO/ }).click();
  await pag.waitForTimeout(300);
  await pag.getByPlaceholder(/Ex:/).first().fill('confere tudo');
  await pag.getByRole('button', { name: /Caçar|Auditar|Examinar|Iniciar/i }).first().click();
  await pag.waitForTimeout(400);

  await pag.locator('button[title="Parar a auditoria e fechar"]').first().click();
  await pag.waitForTimeout(3200);

  const gravado = await conteudoGravado(pag);
  registrar('fechar o modal do Hunter para a auditoria em vez de deixá-la correndo',
    gravado === ORIGINAL, gravado === ORIGINAL ? 'arquivo intocado' : 'GRAVOU depois de fechado');

  await ctx.close();
}

// ====== 3) O ENXAME PARA ANTES DE GRAVAR ======
// Produto e Arquiteto respondem; o Engenheiro pendura. É ali, logo depois dele, que o Enxame
// gravava no repositório — então é ali que o cancelamento precisa pegar.
{
  const { pag, ctx } = await abrir([
    JSON.stringify({ gdd: 'jogo', mechanics: ['a'], requirements: ['b'] }),
    JSON.stringify({ fileStructure: 'index.html', gameLoopStrategy: 'raf', librariesUsed: ['x'] })
  ]);

  await pag.getByRole('button', { name: /ENXAME OSONE CODE/ }).click();
  await pag.waitForTimeout(300);
  await pag.getByPlaceholder(/Ex:/).first().fill('faz um jogo de nave');
  await pag.getByRole('button', { name: /Disparar|Iniciar|Executar|ENXAME/i }).last().click();
  await pag.waitForTimeout(900);

  const botaoParar = pag.getByRole('button', { name: 'Parar' }).first();
  const apareceu = await botaoParar.isVisible().catch(() => false);
  registrar('o Enxame em execução mostra um botão de parar',
    apareceu, apareceu ? 'botão presente' : 'não há como parar');

  const chamadasAntes = await pag.evaluate(() => window.__chamadas);
  if (apareceu) {
    await botaoParar.click();
    await pag.waitForTimeout(3200);
  }

  const gravado = await conteudoGravado(pag);
  registrar('parar o Enxame no Engenheiro não grava código no repositório',
    gravado === ORIGINAL, gravado === ORIGINAL ? 'arquivo intocado' : `arquivo virou "${gravado.slice(0, 40)}"`);

  const chamadasDepois = await pag.evaluate(() => window.__chamadas);
  registrar('parar o Enxame interrompe a fila de agentes, em vez de seguir consumindo cota',
    chamadasDepois === chamadasAntes,
    `${chamadasAntes} chamadas ao parar, ${chamadasDepois} depois`);

  const comemorou = await pag.getByText(/Finalizado|com Sucesso/).first().isVisible().catch(() => false);
  registrar('o Enxame parado não anuncia projeto finalizado',
    !comemorou, comemorou ? 'ANUNCIOU sucesso de algo que foi cancelado' : 'sem falso sucesso');

  await ctx.close();
}

// ====== 4) FECHAR O MODAL DO ENXAME TAMBÉM PARA ======
{
  const { pag, ctx } = await abrir([
    JSON.stringify({ gdd: 'jogo', mechanics: ['a'], requirements: ['b'] }),
    JSON.stringify({ fileStructure: 'index.html', gameLoopStrategy: 'raf', librariesUsed: ['x'] })
  ]);

  await pag.getByRole('button', { name: /ENXAME OSONE CODE/ }).click();
  await pag.waitForTimeout(300);
  await pag.getByPlaceholder(/Ex:/).first().fill('faz um jogo');
  await pag.getByRole('button', { name: /Disparar|Iniciar|Executar|ENXAME/i }).last().click();
  await pag.waitForTimeout(900);

  await pag.locator('button[title="Parar o Enxame e fechar"]').first().click();
  await pag.waitForTimeout(3200);

  const gravado = await conteudoGravado(pag);
  registrar('fechar o modal do Enxame para a execução em vez de deixá-la gravando por baixo',
    gravado === ORIGINAL, gravado === ORIGINAL ? 'arquivo intocado' : 'GRAVOU depois de fechado');

  await ctx.close();
}

// ====== 5) O ENXAME INTEIRO CHEGA À APROVAÇÃO E SALVA O RESULTADO ======
{
  const codigoFinal = '<!doctype html><html><head><title>Nave</title></head><body><canvas></canvas><script>function loop(){requestAnimationFrame(loop)}loop()</script></body></html>';
  const { pag, ctx } = await abrir([
    JSON.stringify({ gdd: 'jogo de nave', mechanics: ['controle', 'pontuação'], requirements: ['canvas'] }),
    JSON.stringify({ fileStructure: 'index.html', gameLoopStrategy: 'requestAnimationFrame', librariesUsed: ['Canvas'] }),
    codigoFinal,
    JSON.stringify({ score: 100, passed: true, feedback: 'Tudo funcional.', missingItems: [] })
  ]);

  await pag.getByRole('button', { name: /ENXAME OSONE CODE/ }).click();
  await pag.waitForTimeout(300);
  await pag.getByPlaceholder(/Ex:/).first().fill('faz um jogo de nave');
  await pag.getByRole('button', { name: /Disparar|Iniciar|Executar|ENXAME/i }).last().click();
  await pag.waitForFunction(() => window.__chamadas >= 4, null, { timeout: 10000 }).catch(() => null);
  await pag.waitForTimeout(300);

  const gravado = await conteudoGravado(pag);
  const textoDaTela = await pag.locator('body').innerText();
  const chamadas = await pag.evaluate(() => window.__chamadas);
  registrar('o Enxame completo passa por Produto, Arquitetura, Engenharia e QA',
    chamadas === 4, `${chamadas} chamadas`);
  registrar('o Enxame aprovado grava exatamente o código produzido',
    gravado === codigoFinal, gravado === codigoFinal ? 'arquivo final preservado' : 'arquivo divergente');
  registrar('o Enxame só anuncia sucesso depois da aprovação do QA',
    /APROVADO COM SUCESSO|Jogo criado e testado pelo Enxame/i.test(textoDaTela),
    /APROVADO COM SUCESSO|Jogo criado e testado pelo Enxame/i.test(textoDaTela) ? 'QA 100/100' : textoDaTela.slice(-180));

  await ctx.close();
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
