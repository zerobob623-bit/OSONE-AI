/**
 * Confere a leitura de texto da tela — o caminho inteiro entre "a tela do usuário" e "o OSONE
 * disse isto em voz alta numa transmissão ao vivo".
 *
 * Este conferidor existe por causa de um caso real: acompanhando uma live do TikTok por
 * compartilhamento de tela, o OSONE leu comentários trocando palavras, misturando quem escreveu o
 * quê, e chegou a dizer em voz alta comentário de conotação sexual. Cada uma das três causas tem
 * conferência aqui:
 *
 * 1. `qualidadeDaVisao` — a imagem chegava deformada e pequena demais para ter letra legível.
 * 2. `lerChatDaTela` — não havia como responder "não deu para ler", e o que era palpite entrava
 *    como se fosse leitura.
 * 3. `filtroDeVozPublica` — não havia nada entre ler e falar.
 *
 * O que não dá para conferir aqui é se o modelo lê certo uma tela de verdade — isso só a tela
 * responde. Dá para conferir tudo o que acontece ANTES e DEPOIS dele, que é onde os três erros
 * nasceram.
 *
 * Como rodar:  node scripts/conferir-leitura-de-chat.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-chat-'));

const carregar = async (arquivoTs, nomeSaida) => {
  const saida = path.join(pastaTemp, nomeSaida);
  await build({
    entryPoints: [path.join(RAIZ, arquivoTs)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile: saida,
    logLevel: 'silent'
  });
  return import(pathToFileURL(saida).href);
};

const { calcularQuadro } = await carregar('src/lib/qualidadeDaVisao.ts', 'qualidade.mjs');
const { avaliarParaVozPublica } = await carregar('src/lib/filtroDeVozPublica.ts', 'filtro.mjs');
const { lerChatDaTela, montarInstrucaoDeLeitura } = await carregar('src/lib/lerChatDaTela.ts', 'leitura.mjs');

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n· Tamanho e proporção do quadro enviado ao modelo\n');

{
  // O erro original: 1920×1080 virava 640×480, que é 4:3. Texto espremido 1,33× na horizontal.
  const q = calcularQuadro(1920, 1080, 'ambiente');
  const proporcaoOrigem = 1920 / 1080;
  const proporcaoQuadro = q.largura / q.altura;
  const igual = Math.abs(proporcaoOrigem - proporcaoQuadro) < 0.02;
  registrar('tela 16:9 continua 16:9 (não é espremida em 4:3)', igual, `${q.largura}x${q.altura}`);
}

{
  const q = calcularQuadro(1920, 1080, 'ambiente');
  registrar('quadro de acompanhamento é maior que os 640×480 antigos', q.largura > 640 && q.qualidadeJpeg > 0.6,
    `${q.largura}x${q.altura} em qualidade ${q.qualidadeJpeg}`);
}

{
  const ambiente = calcularQuadro(2560, 1440, 'ambiente');
  const tela = calcularQuadro(2560, 1440, 'tela');
  registrar('compartilhamento de tela usa perfil mais nítido que câmera/ambiente',
    tela.largura > ambiente.largura && tela.qualidadeJpeg > ambiente.qualidadeJpeg,
    `tela ${tela.largura}x${tela.altura}@${tela.qualidadeJpeg} vs ambiente ${ambiente.largura}x${ambiente.altura}@${ambiente.qualidadeJpeg}`);
}

{
  const tela = calcularQuadro(1920, 1080, 'tela');
  registrar('tela Full HD compartilhada chega inteira, sem reduzir texto pequeno',
    tela.largura === 1920 && tela.altura === 1080 && tela.qualidadeJpeg >= 0.9,
    `${tela.largura}x${tela.altura}@${tela.qualidadeJpeg}`);
}

{
  const tela = calcularQuadro(2560, 1440, 'tela');
  const leitura = calcularQuadro(2560, 1440, 'leitura');
  registrar('a foto de leitura é maior e menos comprimida que o vídeo de tela',
    leitura.largura > tela.largura && leitura.qualidadeJpeg > tela.qualidadeJpeg,
    `leitura ${leitura.largura}x${leitura.altura}@${leitura.qualidadeJpeg} vs tela ${tela.largura}x${tela.altura}@${tela.qualidadeJpeg}`);
}

{
  // Ampliar não devolve detalhe que a origem não tinha — só multiplica peso da imagem.
  const q = calcularQuadro(800, 600, 'leitura');
  registrar('tela pequena não é ampliada', q.largura === 800 && q.altura === 600, `${q.largura}x${q.altura}`);
}

{
  const q = calcularQuadro(3840, 2160, 'leitura');
  registrar('tela 4K é reduzida mantendo a proporção', Math.abs(q.largura / q.altura - 3840 / 2160) < 0.02 && q.largura <= 2560,
    `${q.largura}x${q.altura}`);
}

{
  // video.videoWidth é 0 até o primeiro quadro chegar; um canvas 0×0 enviaria imagem vazia.
  const q = calcularQuadro(0, 0, 'ambiente');
  registrar('vídeo sem tamanho ainda produz quadro válido', q.largura > 0 && q.altura > 0, `${q.largura}x${q.altura}`);
}

{
  const q = calcularQuadro(1365, 767, 'ambiente');
  registrar('lados saem pares (JPEG trabalha em blocos)', q.largura % 2 === 0 && q.altura % 2 === 0, `${q.largura}x${q.altura}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n· O que não pode ser dito em voz alta numa live\n');

const bloqueia = (texto) => avaliarParaVozPublica(texto).seguro === false;

{
  registrar('palavrão explícito é bloqueado', bloqueia('caralho que jogo bom'));
}
{
  registrar('ofensa direta é bloqueada', bloqueia('você é um idiota'));
}
{
  registrar('palavrão escrito com números passa a ser reconhecido', bloqueia('p0rr4 nenhuma'),
    JSON.stringify(avaliarParaVozPublica('p0rr4 nenhuma')));
}
{
  registrar('palavrão com letras esticadas é reconhecido', bloqueia('caraaaalhooo'));
}
{
  registrar('palavrão com letras separadas é reconhecido', bloqueia('c a r a l h o'));
}
{
  registrar('expressão de duplo sentido é bloqueada', bloqueia('senta aqui vai'),
    avaliarParaVozPublica('senta aqui vai').categoria);
}
{
  registrar('pedido de nudes é bloqueado', bloqueia('manda nudes pfvr'));
}

// O outro lado da régua: um filtro que cala o chat inteiro é tão inútil quanto não ter filtro.
{
  registrar('comentário comum passa', !bloqueia('boa noite pessoal, som top demais'));
}
{
  registrar('"cu" não bloqueia "curioso"', !bloqueia('fiquei curioso com esse acorde'),
    JSON.stringify(avaliarParaVozPublica('fiquei curioso com esse acorde')));
}
{
  registrar('"pica" não bloqueia "picanha"', !bloqueia('vou fazer picanha depois'));
}
{
  registrar('"senta" sozinho não bloqueia', !bloqueia('senta que la vem historia'));
}
{
  registrar('elogio normal passa', !bloqueia('que voz linda, chorei aqui'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n· Transcrição: o que vira fala e o que é descartado\n');

/** Finge o proxy do Gemini devolvendo um texto qualquer como resposta do modelo. */
const comResposta = (texto, { ok = true, corpo = null } = {}) => {
  globalThis.fetch = async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => (corpo !== null ? corpo : { text: texto })
  });
};

const ler = (opcoes) => lerChatDaTela('data:image/jpeg;base64,AAAA', 'image/jpeg', 'chave', 'modelo', opcoes);

const comentario = (extra) => JSON.stringify({
  comentarios: [{ autor: '@jubs', texto: 'vc eh mto bom nisso', confianca: 0.96, legivel: true, improprio: false, duplo_sentido: false, ...extra }],
  ilegiveis: 0
});

{
  comResposta(comentario());
  const r = await ler();
  const c = r.comentarios[0];
  registrar('texto é entregue letra por letra, sem correção de português',
    r.ok && c?.texto === 'vc eh mto bom nisso' && c.autor === '@jubs' && c.podeFalar === true,
    JSON.stringify(c));
}

{
  // O erro que produzia nome trocado: leitura duvidosa entrando como se fosse certeza.
  comResposta(comentario({ confianca: 0.55 }));
  const r = await ler();
  registrar('leitura de baixa confiança vira "ilegível", não vira fala',
    r.ok && r.comentarios.length === 0 && r.ilegiveis === 1, JSON.stringify({ lidos: r.comentarios.length, ilegiveis: r.ilegiveis }));
}

{
  comResposta(comentario({ confianca: undefined }));
  const r = await ler();
  registrar('confiança ausente é tratada como ilegível (silêncio não é permissão)',
    r.ok && r.comentarios.length === 0 && r.ilegiveis === 1, JSON.stringify({ lidos: r.comentarios.length, ilegiveis: r.ilegiveis }));
}

{
  comResposta(comentario({ legivel: false, confianca: 0.99 }));
  const r = await ler();
  registrar('"legivel: false" manda para os ilegíveis mesmo com confiança alta',
    r.ok && r.comentarios.length === 0 && r.ilegiveis === 1);
}

{
  comResposta(comentario({ improprio: true, motivo: 'xingamento' }));
  const r = await ler();
  const c = r.comentarios[0];
  registrar('comentário marcado como impróprio pelo modelo é lido mas não pode ser falado',
    r.ok && c && c.podeFalar === false && r.bloqueados === 1, c?.motivoDoBloqueio);
}

{
  comResposta(comentario({ duplo_sentido: true }));
  const r = await ler();
  registrar('duplo sentido marcado pelo modelo não pode ser falado',
    r.ok && r.comentarios[0]?.podeFalar === false && r.bloqueados === 1);
}

{
  // A camada que não depende do modelo: ele jurou que estava tudo bem, e não estava.
  comResposta(JSON.stringify({
    comentarios: [{ autor: '@zx', texto: 'senta aqui gata', confianca: 0.99, legivel: true, improprio: false, duplo_sentido: false }],
    ilegiveis: 0
  }));
  const r = await ler();
  registrar('o filtro local barra o que o modelo aprovou por engano',
    r.ok && r.comentarios[0]?.podeFalar === false && r.bloqueados === 1, r.comentarios[0]?.motivoDoBloqueio);
}

{
  comResposta(JSON.stringify({
    comentarios: [
      { autor: '@a', texto: 'boa noite', confianca: 0.95, legivel: true },
      { autor: '@a', texto: 'boa noite', confianca: 0.95, legivel: true },
      { autor: '@b', texto: 'boa noite', confianca: 0.95, legivel: true }
    ],
    ilegiveis: 0
  }));
  const r = await ler();
  registrar('comentário repetido do mesmo autor conta uma vez; de outro autor conta de novo',
    r.ok && r.comentarios.length === 2, `${r.comentarios.length} comentário(s)`);
}

{
  comResposta(comentario());
  const primeiro = await ler();
  const chaves = primeiro.comentarios.map(c => `${c.autor.toLowerCase()}|${c.texto.toLowerCase()}`);
  comResposta(comentario());
  const segundo = await ler({ jaLidos: chaves });
  registrar('o que já foi lido não volta na leitura seguinte', segundo.ok && segundo.comentarios.length === 0);
}

{
  comResposta('Claro! Aqui vai:\n```json\n' + comentario() + '\n```');
  const r = await ler();
  registrar('resposta com cerca de código e frase em volta ainda é lida', r.ok && r.comentarios.length === 1);
}

{
  comResposta('O chat fala sobre música e elogios ao seu som.');
  const r = await ler();
  registrar('resumo em prosa, sem JSON, é RECUSADO em vez de virar leitura', !r.ok, (r.motivo || '').slice(0, 60));
}

{
  comResposta(JSON.stringify({ comentarios: [], ilegiveis: 7 }));
  const r = await ler();
  registrar('tela ilegível inteira devolve zero comentários e a contagem', r.ok && r.comentarios.length === 0 && r.ilegiveis === 7);
}

{
  comResposta(null, { ok: false, corpo: { error: 'cota do Gemini esgotada' } });
  const r = await ler();
  registrar('erro do servidor vira motivo legível, não silêncio', !r.ok && /cota/.test(r.motivo || ''), r.motivo);
}

{
  globalThis.fetch = async () => { throw new Error('rede fora do ar'); };
  const r = await ler();
  registrar('rede fora do ar não vira leitura inventada', !r.ok && /rede fora do ar/.test(r.motivo || ''));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n· A ordem que volta para dentro da conversa de voz\n');

{
  comResposta(JSON.stringify({
    comentarios: [
      { autor: '@jubs', texto: 'vc eh mto bom nisso', confianca: 0.96, legivel: true },
      { autor: '@zx', texto: 'manda nudes', confianca: 0.97, legivel: true }
    ],
    ilegiveis: 3
  }));
  const r = await ler();
  const instrucao = montarInstrucaoDeLeitura(r);
  const temOTexto = instrucao.includes('vc eh mto bom nisso');
  const escondeOBloqueado = !instrucao.includes('manda nudes');
  const proibeAdivinhar = /PROIBIDO adivinhar/i.test(instrucao);
  registrar('a instrução traz o texto exato a ler', temOTexto);
  registrar('a instrução NÃO repete o comentário bloqueado', escondeOBloqueado);
  registrar('a instrução proíbe adivinhar o que ficou ilegível', proibeAdivinhar);
}

{
  const instrucao = montarInstrucaoDeLeitura({ ok: false, comentarios: [], ilegiveis: 0, bloqueados: 0, motivo: 'sem chave', duracaoMs: 1 });
  registrar('leitura falha manda dizer que falhou, e não inventar', /FALHOU/.test(instrucao) && /NÃO invente/.test(instrucao));
}

fs.rmSync(pastaTemp, { recursive: true, force: true });

const falharam = casos.filter(c => !c.passou).length;
console.log(`\n${casos.length - falharam}/${casos.length} conferências passaram.`);
process.exit(falharam ? 1 : 0);
