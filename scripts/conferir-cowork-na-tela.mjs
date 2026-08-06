/**
 * Abre a aba do OSONE COWORK num Chromium e confere o encaixe entre a tela e o agente REAL.
 *
 * O laço em si é conferido sem navegador em conferir-agente-autonomo.mjs. O que só a tela prova:
 *
 *   - que a aba lista as janelas e trabalha DENTRO de uma delas, e não na tela inteira;
 *   - que o clique num alvo descrito vira a posição certa: o modelo aponta na foto DA JANELA, e
 *     essa posição relativa precisa ser somada ao canto da janela antes de virar pixel de tela.
 *     Errar essa conta clica no lugar errado com total confiança, e é o tipo de erro que só
 *     aparece quando a janela não está colada no canto superior esquerdo;
 *   - que o relatório mostra o MOTIVO de cada ação enquanto ela acontece;
 *   - que a resposta lida da tela aparece em destaque no fim;
 *   - que dinheiro é recusado antes de tocar no computador, pela aba nova como pela antiga;
 *   - que dá para parar no meio, e que parar para.
 *
 * O agente local e o modelo são falsificados (nenhum teste pode clicar de verdade no computador de
 * quem roda, nem gastar cota), mas o AGENTE não é: o laço, os freios, as travas e a conversão de
 * coordenada são os de produção.
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

fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CoworkSection } from ${JSON.stringify(path.join(RAIZ, 'src/components/CoworkSection'))};
import { useLocalAgent } from ${JSON.stringify(path.join(RAIZ, 'src/hooks/useLocalAgent'))};

function Arreio() {
  const { listarJanelas, janelaDeTrabalho, definirJanela, trabalharNoObjetivo, relatoDoAgente,
          motorParado, pararMotor, retomarMotor,
          areaParalela, consultarAreaParalela, ligarAreaParalela, desligarAreaParalela,
          fotografarAreaParalela } = useLocalAgent();
  return React.createElement('div', { style: { height: '100vh' } },
    React.createElement(CoworkSection, {
      onBack: () => {},
      localAgentToken: 'token-de-teste',
      chaveGemini: 'chave-de-teste',
      modeloGemini: 'gemini-3.6-flash',
      ambiente: { osName: 'Linux', userName: 'teste', homeDir: '/home/teste' },
      listarJanelas: () => listarJanelas('token-de-teste'),
      janelaDeTrabalho, definirJanela, relatoDoAgente, motorParado, areaParalela,
      onConsultarArea: () => consultarAreaParalela('token-de-teste'),
      onLigarArea: () => ligarAreaParalela('token-de-teste'),
      onDesligarArea: () => desligarAreaParalela('token-de-teste'),
      onFotografarArea: () => fotografarAreaParalela('token-de-teste'),
      onTrabalhar: (objetivo, janela) => trabalharNoObjetivo(objetivo, {
        localAgentToken: 'token-de-teste',
        visao: { chaveGemini: 'x', modeloGemini: 'y' },
        janela
      }),
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
 * A JANELA DE MENTIRA NÃO FICA NO CANTO DA TELA, e isso é de propósito.
 *
 * Se ela começasse em (0,0), a posição relativa à janela e a posição na tela seriam o mesmo número
 * — e a conta que converte uma na outra passaria mesmo estando errada. Deslocada, um erro na
 * conversão vira um clique visivelmente fora do lugar, que é o que se quer detectar aqui.
 */
const JANELA = { id: '0x2200003', titulo: 'YouTube Studio — Navegador', app: 'firefox', x: 300, y: 120, width: 1000, height: 700, ativa: true };
const TELA = { width: 1920, height: 1080 };
/** O alvo no centro da foto da janela (500,500 em 0–1000) cai neste pixel da TELA. */
const PIXEL_ESPERADO = {
  x: Math.round(JANELA.x + 0.5 * JANELA.width),   // 800
  y: Math.round(JANELA.y + 0.5 * JANELA.height)   // 470
};

const instalarMundoFalso = async (pag) => {
  await pag.addInitScript(([janela, tela]) => {
    window.pedidos = [];
    window.decisoes = [];
    window.chamadasAoModelo = 0;
    window.estadoDaArea = { ligada: false, suportada: true, explicacao: 'desligada' };
    window.janelasAbertas = [
      janela,
      { id: '0x1100001', titulo: 'OSONE G5', app: 'electron', x: 0, y: 0, width: 1200, height: 800, ativa: false }
    ];

    let tom = 0;
    const fotoDaJanela = () => {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 140;
      const ctx = c.getContext('2d');
      ctx.fillStyle = (tom % 2) === 0 ? '#101010' : '#f0f0f0';
      ctx.fillRect(0, 0, 200, 140);
      return c.toDataURL('image/png');
    };
    // A janela muda quando alguém age nela, e fica parada quando ninguém age — como uma de verdade.
    const agiuNaJanela = () => { tom++; };

    const json = (corpo, ok = true) => Promise.resolve(new Response(JSON.stringify(corpo), {
      status: ok ? 200 : 500, headers: { 'Content-Type': 'application/json' }
    }));

    const fetchOriginal = window.fetch;
    window.fetch = (entrada, opcoes = {}) => {
      const url = String(typeof entrada === 'string' ? entrada : entrada.url);
      const corpo = opcoes.body || '';
      window.pedidos.push({ url, corpo });

      if (url.includes('/api/gemini/generateContent')) {
        window.chamadasAoModelo++;
        /**
         * O MESMO endpoint serve duas perguntas diferentes, e o teste precisa separá-las:
         * "onde está este alvo na foto?" (mirarPorVisao) e "qual a próxima ação?" (o agente).
         */
        if (corpo.includes('Elemento a localizar')) {
          // Centro exato da foto da janela: 500,500 na escala 0–1000.
          return json({ text: JSON.stringify({ encontrado: true, box_2d: [480, 480, 520, 520], descricao: 'alvo de teste' }) });
        }
        const proxima = window.decisoes.length > 1 ? window.decisoes.shift() : window.decisoes[0];
        return json({ text: JSON.stringify(proxima || { acao: 'desistir', args: { motivo: 'sem roteiro' }, pensamento: 'fim' }) });
      }

      if (url.includes('/api/agent/status')) return json({ status: 'online', osName: 'Linux', areaParalela: window.estadoDaArea });
      if (url.includes('/api/agent/desktop/status')) return json(window.estadoDaArea);
      if (url.includes('/api/agent/desktop/start')) {
        window.estadoDaArea = { ligada: true, suportada: true, largura: 1600, altura: 900, gerenciadorDeJanelas: 'openbox', explicacao: 'tela propria' };
        return json(window.estadoDaArea);
      }
      if (url.includes('/api/agent/desktop/stop')) {
        window.estadoDaArea = { ligada: false, suportada: true, explicacao: 'desligada' };
        return json(window.estadoDaArea);
      }
      if (url.includes('/api/agent/desktop/capture')) {
        window.fotosDaArea = (window.fotosDaArea || 0) + 1;
        return json({ image: fotoDaJanela(), mimeType: 'image/png', largura: 1600, altura: 900 });
      }
      if (url.includes('/api/agent/screen-info')) return json({ ...tela, offsetX: 0, offsetY: 0 });
      if (url.includes('/api/agent/window/list')) {
        return json({ janelas: [...window.janelasAbertas] });
      }
      if (url.includes('/api/agent/window/capture')) {
        const pedida = window.janelasAbertas.find(j => url.includes(encodeURIComponent(j.id))) || janela;
        window.janelasFotografadas = (window.janelasFotografadas || []);
        window.janelasFotografadas.push(pedida.id);
        return json({ image: fotoDaJanela(), mimeType: 'image/png', janela: pedida });
      }
      if (url.includes('/api/agent/window/focus')) return json({ success: true, geometria: janela });
      if (url.includes('/api/agent/mouse/move')) {
        const b = JSON.parse(corpo || '{}');
        return json({ pediuPx: b, ficouPx: b, telaPx: tela, execucaoExata: true });
      }
      if (url.includes('/api/agent/mouse/button')) { agiuNaJanela(); return json({ success: true }); }
      if (url.includes('/api/agent/open-any')) {
        agiuNaJanela();
        // Como no mundo real: abrir faz nascer uma janela NOVA, e ela demora um instante a aparecer.
        const n = window.janelasAbertas.length;
        setTimeout(() => window.janelasAbertas.push({
          id: '0x99000' + n, titulo: `Aberto ${n} — Navegador`, app: 'firefox',
          x: 300, y: 120, width: 1000, height: 700, ativa: true
        }), 300);
        return json({ success: true });
      }
      if (url.includes('/api/agent/keyboard/')) { agiuNaJanela(); return json({ success: true }); }
      if (url.startsWith('file://') || url.includes('.js')) return fetchOriginal(entrada, opcoes);
      return json({ success: true });
    };
  }, [JANELA, TELA]);
};

const abrir = async () => {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
  const pag = await ctx.newPage();
  await instalarMundoFalso(pag);
  await pag.goto('file://' + pagina);
  await pag.waitForTimeout(800);
  return { pag, ctx };
};

const definirDecisoes = (pag, lista) => pag.evaluate(d => { window.decisoes = d; }, lista);
const pedir = async (pag, objetivo) => {
  await pag.getByPlaceholder(/Ex:/).fill(objetivo);
  await pag.getByRole('button', { name: 'Começar' }).click();
};
const tocouNoComputador = (pag) => pag.evaluate(() =>
  window.pedidos.filter(p =>
    p.url.includes('/mouse/') || p.url.includes('/keyboard/') || p.url.includes('/open-any')).length);
const esperarFim = (pag) =>
  pag.waitForFunction(() => (window.avisos || []).length > 0, null, { timeout: 90000 }).catch(() => {});

const decisao = (acao, args, pensamento) => ({ acao, args, pensamento, esperaDaTela: 'mudar' });

// ====== 1) A JANELA DE TRABALHO ======
{
  const { pag, ctx } = await abrir();

  const texto = await pag.locator('body').innerText();
  registrar('a aba lista as janelas abertas',
    texto.includes('YouTube Studio — Navegador') && texto.includes('OSONE G5'),
    'as duas janelas apareceram para escolher');

  registrar('a janela escolhida sozinha não é o próprio OSONE',
    /YouTube Studio — Navegador[\s\S]{0,120}na frente agora/.test(texto) && !texto.includes('OSONE G5 ·'),
    'ele não começa trabalhando dentro de si mesmo');

  registrar('a tela diz que o agente troca de janela sozinho',
    /muda sozinho/.test(texto), 'a pessoa não precisa ficar escolhendo');

  await ctx.close();
}

// ====== 2) NADA ACONTECE ANTES DE COMEÇAR ======
{
  const { pag, ctx } = await abrir();
  await definirDecisoes(pag, [decisao('concluir', { resposta: 'ok' }, 'nada a fazer')]);
  await pag.getByPlaceholder(/Ex:/).fill('uma tarefa qualquer');
  await pag.waitForTimeout(300);

  const tocou = await tocouNoComputador(pag);
  registrar('escrever o objetivo não toca no computador',
    tocou === 0, tocou === 0 ? 'nenhuma ação executada' : `${tocou} ação(ões) antes de começar`);

  const chamou = await pag.evaluate(() => window.chamadasAoModelo);
  registrar('escrever o objetivo não chama o modelo',
    chamou === 0, `${chamou} chamada(s)`);

  await ctx.close();
}

// ====== 3) O CLIQUE NUM ALVO DESCRITO CAI NO PIXEL CERTO DA TELA ======
// A conta que importa: o modelo aponta na foto DA JANELA; a posição precisa ser somada ao canto
// da janela antes de virar pixel. Com a janela em (300,120), errar isso clica 300px à esquerda.
{
  const { pag, ctx } = await abrir();
  await definirDecisoes(pag, [
    decisao('clicar', { alvo: 'a aba Análises' }, 'Vejo o menu da esquerda com Análises'),
    decisao('concluir', { resposta: 'O gráfico mostra 12.400 visualizações, alta de 18%.' }, 'Li o gráfico')
  ]);
  await pedir(pag, 'analisar o gráfico do canal');
  await esperarFim(pag);
  await pag.waitForTimeout(400);

  const moveu = await pag.evaluate(() => window.pedidos
    .filter(p => p.url.includes('/mouse/move'))
    .map(p => { try { return JSON.parse(p.corpo); } catch { return null; } }).filter(Boolean));

  const acertou = moveu.some(m => Math.abs(m.x - PIXEL_ESPERADO.x) <= 2 && Math.abs(m.y - PIXEL_ESPERADO.y) <= 2);
  registrar('o clique num alvo da janela cai no pixel certo da TELA',
    acertou,
    `esperado (${PIXEL_ESPERADO.x},${PIXEL_ESPERADO.y}) · recebido ${moveu.map(m => `(${m.x},${m.y})`).join(' ') || 'nenhum'}`);

  const capturouJanela = await pag.evaluate(() => window.pedidos.filter(p => p.url.includes('/window/capture')).length);
  const capturouTelaInteira = await pag.evaluate(() => window.pedidos.filter(p => p.url.includes('/screen/capture')).length);
  registrar('ele olha a JANELA, e não a tela inteira',
    capturouJanela > 0 && capturouTelaInteira === 0,
    `${capturouJanela} foto(s) da janela, ${capturouTelaInteira} da tela inteira`);

  await ctx.close();
}

// ====== 4) O RELATÓRIO CONTA O QUE ELE ESTÁ FAZENDO, E A RESPOSTA APARECE ======
{
  const { pag, ctx } = await abrir();
  await definirDecisoes(pag, [
    decisao('abrir', { caminho: 'https://studio.youtube.com' }, 'Preciso abrir o Studio antes de qualquer coisa'),
    decisao('clicar', { alvo: 'a aba Análises' }, 'Vejo o menu da esquerda com Análises'),
    decisao('concluir', { resposta: 'O gráfico dos últimos 28 dias mostra 12.400 visualizações, alta de 18%.' }, 'Li o gráfico na tela')
  ]);
  await pedir(pag, 'analisar o gráfico do canal');

  // O motivo da ação tem de aparecer ENQUANTO ela acontece, e não só no fim.
  const contouDurante = await pag.waitForFunction(
    () => document.body.innerText.includes('Preciso abrir o Studio antes de qualquer coisa'),
    null, { timeout: 60000 }
  ).then(() => true).catch(() => false);
  registrar('o motivo de cada ação aparece enquanto ele trabalha',
    contouDurante, 'o relatório é ao vivo, não um resumo no fim');

  await esperarFim(pag);
  await pag.waitForTimeout(500);
  const texto = await pag.locator('body').innerText();

  registrar('o relatório guarda a sequência inteira, com motivo e ação',
    texto.includes('Preciso abrir o Studio') && texto.includes('Vejo o menu da esquerda')
      && texto.includes('Abri "https://studio.youtube.com"'),
    'cada linha diz por que agiu e o que fez');

  registrar('a RESPOSTA lida da tela aparece em destaque como Resultado',
    /Resultado[\s\S]{0,200}12\.400 visualizações/.test(texto),
    'o que a pessoa pediu não fica escondido no registro');

  registrar('a foto do que ele está vendo aparece na tela',
    await pag.locator('img[alt="A janela em que o agente trabalha"]').isVisible().catch(() => false),
    'dá para acompanhar olhando');

  await ctx.close();
}

// ====== 5) DINHEIRO É RECUSADO ANTES DE TOCAR NO COMPUTADOR ======
{
  const { pag, ctx } = await abrir();
  await definirDecisoes(pag, [
    decisao('clicar', { alvo: 'o botão azul' }, 'Vou finalizar a compra no cartão salvo')
  ]);
  await pedir(pag, 'comprar um fone pra mim');
  await esperarFim(pag);
  await pag.waitForTimeout(400);

  const tocou = await tocouNoComputador(pag);
  registrar('a ação com dinheiro não chega a ser executada',
    tocou === 0, `${tocou} ação(ões) no computador`);

  const texto = await pag.locator('body').innerText();
  registrar('a recusa aparece na tela dizendo que quem paga é a pessoa',
    /quem paga é a pessoa/i.test(texto), 'a mensagem do motor chegou inteira');

  await ctx.close();
}

// ====== 6) PARAR PARA DE VERDADE ======
{
  const { pag, ctx } = await abrir();
  // Um roteiro que nunca termina sozinho: só o botão de parar encerra.
  await definirDecisoes(pag, [
    decisao('clicar', { alvo: 'algo 1' }, 'clicando 1'),
    decisao('clicar', { alvo: 'algo 2' }, 'clicando 2'),
    decisao('clicar', { alvo: 'algo 3' }, 'clicando 3'),
    decisao('clicar', { alvo: 'algo 4' }, 'clicando 4'),
    decisao('clicar', { alvo: 'algo 5' }, 'clicando 5'),
    decisao('clicar', { alvo: 'algo 6' }, 'clicando 6'),
    decisao('clicar', { alvo: 'algo 7' }, 'clicando 7'),
    decisao('clicar', { alvo: 'algo 8' }, 'clicando 8')
  ]);
  await pedir(pag, 'clicar em muita coisa');
  await pag.waitForTimeout(2500);

  const parar = pag.getByRole('button', { name: /Parar agora/ });
  registrar('enquanto trabalha, existe um botão de parar',
    await parar.isVisible().catch(() => false), 'a interrupção está à mão');

  await parar.click();
  await esperarFim(pag);
  await pag.waitForTimeout(500);

  const cliquesAoParar = await pag.evaluate(() => window.pedidos.filter(p => p.url.includes('/mouse/button')).length);
  await pag.waitForTimeout(3000);
  const cliquesDepois = await pag.evaluate(() => window.pedidos.filter(p => p.url.includes('/mouse/button')).length);

  registrar('depois de parar, nenhum clique novo sai',
    cliquesDepois === cliquesAoParar && cliquesDepois < 8,
    `${cliquesAoParar} → ${cliquesDepois} clique(s)`);

  const texto = await pag.locator('body').innerText();
  registrar('a parada é explicada, dizendo quantas ações foram feitas',
    /Parado por você/i.test(texto), 'o motivo aparece em vez de um silêncio');

  await ctx.close();
}

// ====== 7) O HISTÓRICO GUARDA O OBJETIVO, E REPETIR REFAZ O CAMINHO ======
// Guardar passos seria pior: eles envelhecem. Guardar o objetivo deixa o agente refazer o caminho
// olhando a tela de hoje.
{
  const { pag, ctx } = await abrir();
  await definirDecisoes(pag, [decisao('concluir', { resposta: 'feito' }, 'nada a fazer aqui')]);
  await pedir(pag, 'conferir as notificações');
  await esperarFim(pag);
  await pag.waitForTimeout(600);

  const guardado = await pag.evaluate(() => JSON.parse(localStorage.getItem('osone_cowork_historico') || '[]'));
  registrar('o histórico guarda o OBJETIVO, e não uma lista de passos',
    guardado[0]?.tarefa === 'conferir as notificações' && guardado[0]?.passos === undefined,
    JSON.stringify(guardado[0] || {}).slice(0, 120));

  const antes = await pag.evaluate(() => window.chamadasAoModelo);
  await pag.locator('button[title="Pedir de novo (ele refaz o caminho olhando a tela de agora)"]').first().click();
  await esperarFim(pag);
  await pag.waitForTimeout(600);
  const depois = await pag.evaluate(() => window.chamadasAoModelo);

  registrar('repetir refaz o caminho olhando a tela de agora',
    depois > antes, `${antes} → ${depois} chamada(s) ao modelo`);

  await ctx.close();
}

// ====== 8) ABRIR NÃO GERA TRÊS ABAS, E ELE PASSA A OLHAR O QUE ABRIU ======
// O erro relatado em uso: pedido "analise uma coisa no YouTube", ele abriu três abas. A causa não
// era o modelo — era ele continuar olhando a janela ANTIGA depois de abrir, concluir que não
// pegou, e abrir de novo. Aqui a janela nova nasce de verdade, com atraso, como no mundo real.
{
  const { pag, ctx } = await abrir();
  await definirDecisoes(pag, [
    decisao('abrir', { caminho: 'https://youtube.com' }, 'Vou abrir o YouTube'),
    decisao('abrir', { caminho: 'https://youtube.com' }, 'Não parece ter aberto, vou de novo'),
    decisao('abrir', { caminho: 'https://youtube.com' }, 'Ainda não vejo, mais uma vez'),
    decisao('concluir', { resposta: 'estou no YouTube' }, 'Agora estou vendo')
  ]);
  await pedir(pag, 'analisar uma coisa no YouTube');
  await esperarFim(pag);
  await pag.waitForTimeout(600);

  const aberturas = await pag.evaluate(() => window.pedidos.filter(p => p.url.includes('/open-any')).length);
  registrar('pedir para abrir três vezes o mesmo site abre UMA aba',
    aberturas === 1, `${aberturas} abertura(s) para 3 decisões de abrir`);

  const fotografadas = await pag.evaluate(() => window.janelasFotografadas || []);
  registrar('depois de abrir, ele passa a fotografar a janela NOVA',
    fotografadas.some(id => id.startsWith('0x99000')),
    `janelas fotografadas: ${[...new Set(fotografadas)].join(', ')}`);

  const texto = await pag.locator('body').innerText();
  registrar('o relatório diz que ele já está olhando a janela que abriu',
    /passei a olhar a janela/i.test(texto), 'a troca aparece para quem está acompanhando');

  registrar('a insistência em reabrir aparece como aviso, não como aba nova',
    /JÁ ESTÁ ABERTO/.test(texto), 'a recusa é visível e explicada');

  await ctx.close();
}

// ====== 9) A TELA DELE: VOCÊ FICA ONDE ESTIVER, ELE TRABALHA DO LADO ======
{
  const { pag, ctx } = await abrir();

  const antes = await pag.locator('body').innerText();
  registrar('com a tela dele desligada, a aba diz que ele usa a SUA tela',
    /Ele trabalha na sua tela/.test(antes), 'a pessoa sabe em qual dos dois modos está');

  await pag.getByRole('button', { name: /Dar uma tela só para ele/ }).click();
  await pag.waitForTimeout(1200);

  const depois = await pag.locator('body').innerText();
  registrar('ligada, a aba diz que ele tem uma tela só dele',
    /Ele tem uma tela só dele/.test(depois) && /1600×900/.test(depois),
    'com o tamanho da tela dele');

  registrar('a aba avisa que seu mouse e seu teclado continuam seus',
    /Seu mouse e seu teclado continuam seus|seu mouse.*continuam seus/i.test(depois),
    'é o ponto inteiro da tela separada');

  registrar('o quadro passa a mostrar a tela dele ao vivo',
    /A tela dele, ao vivo/.test(depois) && /atualizando sozinha/.test(depois),
    'dá para acompanhar sem sair da aba do COWORK');

  // A imagem chega sozinha, sem o agente estar trabalhando: é isso que significa "ao vivo".
  const fotos1 = await pag.evaluate(() => window.fotosDaArea || 0);
  await pag.waitForTimeout(5000);
  const fotos2 = await pag.evaluate(() => window.fotosDaArea || 0);
  registrar('a tela dele se atualiza sozinha, mesmo com ele parado',
    fotos2 > fotos1, `${fotos1} → ${fotos2} capturas`);

  /**
   * A TELA DELE NASCE VAZIA — e a primeira tarefa precisa poder começar assim mesmo.
   *
   * Exigir uma janela escolhida antes de começar travaria tudo justamente no primeiro uso: não há
   * nenhuma janela lá até ele abrir a primeira. Sem janela e com a tela dele ligada, o quadro é a
   * tela dele inteira.
   */
  await pag.evaluate(() => { window.janelasAbertas = []; });
  await pag.getByRole('button', { name: 'Atualizar a lista de janelas' }).click().catch(() => {});
  await pag.waitForTimeout(600);
  await definirDecisoes(pag, [
    decisao('abrir', { caminho: 'https://youtube.com' }, 'A tela está vazia, vou abrir o YouTube'),
    decisao('concluir', { resposta: 'abri o YouTube na minha tela' }, 'pronto')
  ]);
  await pedir(pag, 'abrir o youtube na sua tela');
  await esperarFim(pag);
  await pag.waitForTimeout(600);

  const abriuNaTelaDele = await pag.evaluate(() => window.pedidos.filter(p => p.url.includes('/open-any')).length);
  registrar('a tarefa começa mesmo com a tela dele ainda vazia',
    abriuNaTelaDele >= 1, `${abriuNaTelaDele} abertura(s) na tela dele`);

  const usouACapturaDaArea = await pag.evaluate(() => (window.fotosDaArea || 0) > 0);
  registrar('sem janela, ele olha a tela dele inteira',
    usouACapturaDaArea, 'a captura da área paralela serve de quadro');

  await pag.getByRole('button', { name: /Desligar a tela dele/ }).click();
  await pag.waitForTimeout(800);
  const final = await pag.locator('body').innerText();
  registrar('dá para desligar e voltar a trabalhar na sua tela',
    /Ele trabalha na sua tela/.test(final), 'a escolha é reversível');

  await ctx.close();
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
