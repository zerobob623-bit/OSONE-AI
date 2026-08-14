/**
 * LEITURA LITERAL DO CHAT — o que está ESCRITO na tela, e nada além disso.
 *
 * Isto nasceu de um caso concreto: o OSONE acompanhava uma live do TikTok por compartilhamento de
 * tela e lia os comentários em voz alta na transmissão. Ele trocava palavras, misturava quem
 * escreveu o quê, e chegou a dizer em voz alta comentários de conotação sexual — na voz do dono do
 * canal, para a audiência inteira.
 *
 * Nenhum desses erros é "visão fraca". Cada um tem uma causa própria, e é por isso que este
 * arquivo existe separado:
 *
 * 1. A IMAGEM ERA IRRECONHECÍVEL ANTES DE CHEGAR. O compartilhamento mandava 640×480 em qualidade
 *    0,6 — ver `qualidadeDaVisao.ts`. Aqui a foto é tirada de propósito para ler: resolução
 *    nativa, compressão quase nula, uma imagem só.
 *
 * 2. A PERGUNTA ESTAVA NO MEIO DA CONVERSA. Perguntado "o que o pessoal está falando?" dentro de
 *    um diálogo, o modelo responde como quem conversa: completa, resume, arredonda, fica bem na
 *    fita. É o mesmo motivo pelo qual a mira por visão (`mirarPorVisao.ts`) virou uma chamada
 *    dedicada. Aqui a chamada só contém a imagem e uma ordem de transcrição, sem histórico nenhum
 *    para se apoiar — e com temperatura zero, porque transcrever não é criar.
 *
 * 3. NÃO HAVIA COMO DIZER "NÃO DEU PARA LER". Só existia a opção de responder alguma coisa. Um
 *    modelo sem a saída "ilegível" preenche o borrão com a palavra mais provável, e palavra
 *    provável no lugar de palavra escrita é exatamente o que troca nome de pessoa e inventa duplo
 *    sentido que ninguém digitou. Agora cada comentário vem com confiança declarada, e o que não
 *    passa da régua é DESCARTADO aqui, antes de virar fala.
 *
 * 4. NÃO HAVIA FILTRO NENHUM ENTRE LER E FALAR. Passou a existir, em duas camadas: o modelo
 *    classifica (ele vê a frase inteira e entende ironia) e, por baixo, uma lista escrita que não
 *    depende do julgamento dele (`filtroDeVozPublica.ts`). Basta uma das duas reprovar para o
 *    comentário não ser falado.
 *
 * O que sai daqui não é uma descrição do chat. É a lista do que dá para afirmar que está escrito,
 * separada da lista do que não pode ser dito em voz alta e da contagem do que não deu para ler.
 */

import { avaliarParaVozPublica } from './filtroDeVozPublica';

export interface ComentarioLido {
  /** Nome/@ de quem escreveu, exatamente como aparece. Vazio quando não dá para ler o autor. */
  autor: string;
  /** O texto do comentário, letra por letra, como está escrito. */
  texto: string;
  /** Confiança declarada pelo modelo na transcrição, de 0 a 1. */
  confianca: number;
  /** Passou da régua de confiança: dá para afirmar que é isto que está escrito. */
  legivel: boolean;
  /** Pode ser dito em voz alta na transmissão. */
  podeFalar: boolean;
  /** Por que não pode ser falado, quando for o caso. */
  motivoDoBloqueio?: string;
}

export interface LeituraDeChat {
  ok: boolean;
  /** Tudo que foi lido com confiança suficiente, falável ou não. */
  comentarios: ComentarioLido[];
  /** Quantos comentários existiam mas não deram para ler com segurança. */
  ilegiveis: number;
  /** Quantos foram lidos mas não podem ser ditos em voz alta. */
  bloqueados: number;
  motivo?: string;
  duracaoMs: number;
}

export interface OpcoesDeLeitura {
  /** Chaves de comentários já lidos antes, para não repetir os mesmos em voz alta. */
  jaLidos?: string[];
  /** Régua de confiança. Abaixo disso o comentário é tratado como ilegível. */
  minimoDeConfianca?: number;
  /** Onde na tela está o chat, quando o usuário souber dizer ("coluna da direita"). */
  ondeEstaOChat?: string;
}

const MAXIMO_DE_COMENTARIOS = 25;
const TAMANHO_MAXIMO_DO_TEXTO = 400;
const TAMANHO_MAXIMO_DO_AUTOR = 60;

/**
 * 0,85 e não 0,5. A régua não é "o modelo acha que acertou" — é "dá para dizer isto em voz alta
 * numa transmissão sem risco de estar falando o nome de outra pessoa". Comentário abaixo disso
 * não vira uma leitura pior: vira uma contagem de ilegíveis, que o OSONE relata como tal.
 */
const MINIMO_DE_CONFIANCA_PADRAO = 0.85;

const INSTRUCAO = `Você TRANSCREVE texto de uma captura de tela. Você não interpreta, não resume, não traduz e não conversa.

Recebe UMA imagem da tela de um computador, com uma janela de chat/comentários ao vivo visível. Devolva o que está ESCRITO nos comentários.

Responda SOMENTE com JSON, sem texto em volta e sem blocos de código:
{"comentarios": [{"autor": "...", "texto": "...", "confianca": 0.0, "legivel": true, "improprio": false, "duplo_sentido": false, "motivo": ""}], "ilegiveis": 0}

REGRAS DE TRANSCRIÇÃO — nesta ordem de importância:
1. LETRA POR LETRA. Copie exatamente o que está escrito, incluindo erro de digitação, abreviação, gíria, letra maiúscula, acento faltando e emoji. NÃO corrija, NÃO complete palavra cortada, NÃO traduza, NÃO reescreva em português melhor. Se está escrito "vc eh mto bom", o texto é "vc eh mto bom".
2. NOME DE QUEM ESCREVEU É NOME DE PESSOA REAL. Copie o @ ou apelido caractere por caractere. Se o nome está cortado, borrado ou coberto, deixe "autor" vazio — nunca escolha o nome parecido mais provável, e nunca reaproveite o nome de outro comentário.
3. QUANDO NÃO DER PARA LER, DIGA QUE NÃO DEU. Este é o ponto mais importante de todos. Se qualquer caractere de um comentário estiver ambíguo (fonte pequena, texto sobre vídeo claro, borrão de compressão, comentário passando/entrando na tela), marque "legivel": false e ponha a confiança abaixo de 0.5. NUNCA adivinhe a palavra mais provável para completar o que não está nítido: adivinhar troca o nome de uma pessoa pelo de outra e inventa frase que ninguém escreveu.
4. CONFIANÇA É SOBRE A LEITURA, NÃO SOBRE O SENTIDO. 1.0 = cada caractere está nítido e você o leria igual dez vezes seguidas. 0.9 = nítido, com uma ou outra letra deduzida pelo contexto da palavra. Abaixo de 0.8 = você está preenchendo lacuna. Seja severo: superestimar aqui é o erro que produz vergonha ao vivo.
5. SÓ O QUE ESTÁ NA IMAGEM. Não inclua comentário que você imagina que estaria num chat desse tipo. Se não houver chat visível na imagem, devolva a lista vazia e explique em "ilegiveis": 0 com "comentarios": [].
6. Ordem: de cima para baixo, como aparecem na tela. No máximo os ${MAXIMO_DE_COMENTARIOS} mais recentes.

CLASSIFICAÇÃO PARA LEITURA EM VOZ ALTA — este texto vai ser DITO por uma voz numa transmissão pública ao vivo:
- "improprio": true para palavrão, xingamento, ofensa pessoal, conteúdo sexual explícito, assédio, discurso de ódio ou apelo a menor de idade.
- "duplo_sentido": true quando as palavras são inocentes mas a frase, dita a alguém ao vivo, tem leitura sexual ou constrangedora ("senta aqui", "mostra mais", "que delícia"). Na dúvida entre inocente e duplo sentido, marque true.
- "motivo": uma frase curta dizendo por quê, quando marcar qualquer um dos dois.
- Continue transcrevendo o texto REAL mesmo assim: quem decide o que fazer com ele é o programa, não você. Não censure, não substitua por asterisco e não suavize o que está escrito.

"ilegiveis": quantos comentários você VIU na tela mas não conseguiu ler com segurança e por isso deixou de fora da lista.`;

/** Tira cercas de bloco de código e sobras de texto em volta do JSON. */
function extrairJson(bruto: string): any | null {
  const limpo = String(bruto || '').replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(limpo);
  } catch {
    const inicio = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    if (inicio === -1 || fim <= inicio) return null;
    try {
      return JSON.parse(limpo.slice(inicio, fim + 1));
    } catch {
      return null;
    }
  }
}

/** Caractere de controle e marca invisível não têm como estar escritos na tela: vieram do modelo. */
function limpar(valor: any, limite: number): string {
  return String(valor ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limite);
}

/**
 * Identidade de um comentário para efeito de "já li este".
 *
 * Autor junto do texto, porque duas pessoas diferentes escrevendo "boa noite" são dois
 * comentários, e a mesma pessoa repetindo "boa noite" três vezes é uma repetição só.
 */
export function chaveDoComentario(autor: string, texto: string): string {
  return `${autor.toLowerCase().trim()}|${texto.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

/**
 * Olha a imagem e devolve o que está escrito no chat.
 *
 * `imagemBase64` deve ser a foto tirada em modo 'leitura' (ver `qualidadeDaVisao.ts`), e não um
 * quadro do fluxo em tempo real: o fluxo é comprimido para caber num WebSocket contínuo, e é
 * justamente essa compressão que borra a letra.
 */
export async function lerChatDaTela(
  imagemBase64: string,
  mimeType: string,
  chaveGemini: string,
  modelo: string,
  opcoes: OpcoesDeLeitura = {}
): Promise<LeituraDeChat> {
  const comecou = Date.now();
  const vazio = (motivo: string): LeituraDeChat => ({
    ok: false, comentarios: [], ilegiveis: 0, bloqueados: 0, motivo, duracaoMs: Date.now() - comecou
  });

  const dados = imagemBase64.includes(',') ? imagemBase64.split(',')[1] : imagemBase64;
  if (!dados) return vazio('Não havia imagem para ler.');

  const minimo = Number.isFinite(opcoes.minimoDeConfianca as number)
    ? Math.min(1, Math.max(0, Number(opcoes.minimoDeConfianca)))
    : MINIMO_DE_CONFIANCA_PADRAO;

  const pedido = opcoes.ondeEstaOChat
    ? `Transcreva os comentários do chat nesta tela. O chat está em: ${opcoes.ondeEstaOChat}.`
    : 'Transcreva os comentários do chat visível nesta tela.';

  let resposta: Response;
  try {
    resposta = await fetch('/api/gemini/generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientApiKey: chaveGemini || undefined,
        model: modelo,
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: dados } },
            { text: pedido }
          ]
        }],
        config: {
          systemInstruction: INSTRUCAO,
          // Transcrever não é criar. A mesma imagem tem de devolver o mesmo texto sempre; qualquer
          // variação aqui é o modelo escolhendo entre leituras possíveis, que é o erro em questão.
          temperature: 0,
          responseMimeType: 'application/json'
        }
      })
    });
  } catch (err: any) {
    return vazio(`Não foi possível falar com o modelo para ler o chat: ${err?.message || err}`);
  }

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    return vazio(corpo?.error || `O modelo não respondeu ao ler o chat (HTTP ${resposta.status}).`);
  }

  const texto = corpo?.text
    ?? corpo?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('')
    ?? '';
  const lido = extrairJson(texto);

  if (!lido || !Array.isArray(lido.comentarios)) {
    return vazio(`O modelo não respondeu no formato de transcrição esperado: ${String(texto).slice(0, 200)}`);
  }

  const jaLidos = new Set((opcoes.jaLidos || []).map(k => String(k)));
  const vistosAgora = new Set<string>();
  const comentarios: ComentarioLido[] = [];

  // Só conta como ilegível o que o modelo AFIRMOU ter visto sem conseguir ler; o que ele leu mal
  // é somado abaixo, ao ser descartado pela régua de confiança.
  let ilegiveis = Number.isFinite(Number(lido.ilegiveis)) ? Math.max(0, Math.trunc(Number(lido.ilegiveis))) : 0;
  let bloqueados = 0;

  for (const bruto of lido.comentarios.slice(0, MAXIMO_DE_COMENTARIOS)) {
    const autor = limpar(bruto?.autor, TAMANHO_MAXIMO_DO_AUTOR);
    const textoDoComentario = limpar(bruto?.texto, TAMANHO_MAXIMO_DO_TEXTO);
    if (!textoDoComentario) continue;

    const confiancaBruta = Number(bruto?.confianca);
    const confianca = Number.isFinite(confiancaBruta) ? Math.min(1, Math.max(0, confiancaBruta)) : 0;
    // Confiança ausente vira zero, e zero reprova. Um campo que não veio não é permissão para
    // falar: é ausência de garantia, que é o mesmo que ilegível.
    const legivel = bruto?.legivel !== false && confianca >= minimo;

    if (!legivel) {
      ilegiveis += 1;
      continue;
    }

    const chave = chaveDoComentario(autor, textoDoComentario);
    if (jaLidos.has(chave) || vistosAgora.has(chave)) continue;
    vistosAgora.add(chave);

    // Duas camadas independentes, e basta uma reprovar. A do modelo entende a frase; a lista
    // escrita não depende de ele ter entendido.
    const veredictoLocal = avaliarParaVozPublica(`${autor} ${textoDoComentario}`);
    const reprovadoPeloModelo = bruto?.improprio === true || bruto?.duplo_sentido === true;
    const podeFalar = veredictoLocal.seguro && !reprovadoPeloModelo;
    if (!podeFalar) bloqueados += 1;

    comentarios.push({
      autor,
      texto: textoDoComentario,
      confianca,
      legivel: true,
      podeFalar,
      motivoDoBloqueio: podeFalar
        ? undefined
        : (veredictoLocal.motivo || limpar(bruto?.motivo, 140) || 'Conteúdo impróprio para ser lido em voz alta ao vivo.')
    });
  }

  return {
    ok: true,
    comentarios,
    ilegiveis,
    bloqueados,
    duracaoMs: Date.now() - comecou
  };
}

/**
 * Monta o texto que vai para dentro da conversa de voz.
 *
 * A leitura acima acontece FORA do diálogo; este é o único ponto em que o resultado entra nele, e
 * por isso ele carrega junto o que o modelo de voz pode fazer com aquilo. Sem essa parte, um
 * modelo que recebe uma lista de comentários volta a fazer o de sempre: comenta, resume, junta
 * dois num só e completa o que ficou faltando.
 */
export function montarInstrucaoDeLeitura(leitura: LeituraDeChat): string {
  if (!leitura.ok) {
    return `[CHAT AO VIVO] A leitura FALHOU: ${leitura.motivo}. Diga isso ao usuário e NÃO invente nenhum comentário.`;
  }

  const falaveis = leitura.comentarios.filter(c => c.podeFalar);
  const linhas = falaveis.map(c => (c.autor ? `- ${c.autor}: "${c.texto}"` : `- (autor ilegível): "${c.texto}"`));

  const partes: string[] = ['[CHAT AO VIVO — TRANSCRIÇÃO LITERAL]'];

  if (linhas.length > 0) {
    partes.push(
      'Estes são os comentários que dá para ler com segurança e que podem ser ditos em voz alta:',
      linhas.join('\n'),
      'Leia EXATAMENTE estes textos, palavra por palavra, com o nome de quem escreveu como está aqui. ' +
      'NÃO corrija erro de digitação, NÃO traduza, NÃO resuma, NÃO junte dois comentários e NÃO acrescente ' +
      'nenhum comentário que não esteja nesta lista.'
    );
  } else {
    partes.push('NENHUM comentário desta tela pode ser lido em voz alta agora.');
  }

  if (leitura.bloqueados > 0) {
    partes.push(
      `${leitura.bloqueados} comentário(s) foram lidos mas estão BLOQUEADOS para voz por conteúdo impróprio ou de ` +
      'duplo sentido. NÃO os leia, NÃO os resuma, NÃO os descreva e NÃO dê pista do que diziam. Se for comentar, ' +
      'diga apenas que havia comentários que você preferiu não ler ao vivo, e siga em frente.'
    );
  }

  if (leitura.ilegiveis > 0) {
    partes.push(
      `${leitura.ilegiveis} comentário(s) apareceram na tela mas NÃO estavam legíveis. É PROIBIDO adivinhar o que ` +
      'diziam ou quem escreveu. Diga ao usuário que essa parte do chat está pequena/borrada demais para ler e ' +
      'sugira aumentar o zoom da janela do chat.'
    );
  }

  if (linhas.length === 0 && leitura.bloqueados === 0 && leitura.ilegiveis === 0) {
    partes.push('Não havia nenhum comentário visível nesta tela. Diga isso — não invente movimento no chat.');
  }

  return partes.join('\n\n');
}
