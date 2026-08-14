/**
 * O QUE NÃO PODE SAIR PELA BOCA DO OSONE NUMA TRANSMISSÃO AO VIVO.
 *
 * Ler o chat de uma live em voz alta é diferente de ler qualquer outra coisa: o que for dito sai
 * pelo microfone da transmissão, na voz do dono do canal, e não tem como voltar atrás. Um
 * comentário de baixo calão lido em voz alta não é um erro do espectador que escreveu — vira uma
 * fala do dono da live, para a audiência inteira.
 *
 * Este filtro é o CHÃO, e existe separado da leitura de propósito. O modelo também classifica
 * cada comentário quando lê (ver `lerChatDaTela.ts`), mas foi justamente o julgamento do modelo
 * que falhou na prática — e um julgamento que já falhou não pode ser a única barreira. Aqui a
 * regra é escrita, determinística e não depende de o modelo estar num dia bom: se cair na lista,
 * não é falado, independentemente do que o modelo tenha achado.
 *
 * Bloquear demais é barato: o comentário continua aparecendo escrito no resultado, e o dono da
 * live decide se lê. Bloquear de menos custa uma vergonha ao vivo. A régua é assimétrica de
 * propósito.
 *
 * Duas listas, porque os dois problemas são diferentes:
 *
 * - PALAVRAS EXPLÍCITAS: só entram termos que não têm leitura inocente. "Pau" e "rola" ficam de
 *   fora daqui — são palavras comuns do português, e bloquear toda frase que as contenha faria o
 *   OSONE calar metade de um chat normal.
 * - EXPRESSÕES DE DUPLO SENTIDO: frases de duas ou mais palavras. É onde o duplo sentido de
 *   verdade mora ("senta aqui", "manda nudes") e, por serem expressões inteiras, quase não
 *   produzem engano — "senta" sozinho é inocente, "senta aqui" dito a uma pessoa numa live não é.
 *
 * O resto — ironia, apelido pesado, indireta que só faz sentido com o contexto do vídeo — fica
 * com o modelo, que vê a frase inteira. Aqui só o que dá para provar com a palavra escrita.
 */

export type CategoriaDeBloqueio = 'explicito' | 'duplo_sentido';

export interface VeredictoDeFala {
  seguro: boolean;
  categoria?: CategoriaDeBloqueio;
  /** O que exatamente casou, para o usuário poder discordar do filtro sabendo do que se trata. */
  termo?: string;
  motivo?: string;
}

/**
 * Deixa o texto na forma em que a comparação é justa: sem acento, sem maiúscula, sem os truques
 * de escrita que existem justamente para passar por filtro.
 *
 * Repetição é cortada em DUAS letras, e não em uma: "porra" tem 'rr' de verdade, então derrubar
 * toda repetição transformaria a palavra da lista em outra coisa e ela nunca casaria. Com o teto
 * em dois, "porrrrra" vira "porra" e "porra" continua "porra".
 */
export function normalizarParaFiltro(texto: string): string {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Substituições de teclado: escrever "p0rr4" não deixa de ser escrever a palavra.
    .replace(/[@4]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/(.)\1{2,}/g, '$1$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mesma coisa, mas sem NENHUM separador: pega quem escreve "p o r r a" ou "c-a-r-a-l-h-o" para
 * escapar da comparação por palavra inteira.
 *
 * Só é usada com termos longos (7 letras ou mais). Termo curto colado num texto sem espaços casa
 * dentro de qualquer palavra — "cu" apareceria em "curioso" — e aí o filtro calaria o chat inteiro.
 */
export function compactarParaFiltro(texto: string): string {
  return normalizarParaFiltro(texto).replace(/[^a-z0-9]/g, '');
}

/**
 * Derruba TODA repetição a uma letra só. É a forma de pegar a letra esticada de propósito
 * ("caraaaalhooo"), que o teto de duas letras não alcança quando a letra esticada não é uma das
 * que a palavra tem dobradas de verdade.
 *
 * Vale só para comparar com os termos também derrubados: aqui "porra" e "pora" viram a mesma
 * coisa, o que é bom para achar o palavrão e péssimo para qualquer outro uso.
 */
function colapsarRepeticoes(texto: string): string {
  return texto.replace(/(.)\1+/g, '$1');
}

/**
 * Termos sem leitura inocente em português ou inglês. Comparados por PALAVRA INTEIRA, admitindo
 * as terminações comuns de plural e de gênero (o `s?a?` no fim do padrão montado abaixo).
 */
const TERMOS_EXPLICITOS = [
  // Português — baixo calão e sexo explícito
  'porra', 'caralho', 'karalho', 'buceta', 'boceta', 'xoxota', 'xereca', 'periquita',
  'piroca', 'pica', 'rola dura', 'penis', 'pinto duro',
  'cacete', 'punheta', 'siririca', 'boquete', 'broche', 'chupada', 'chupando o',
  'foder', 'fode', 'fodendo', 'fodida', 'fodido', 'foda se', 'fodase', 'trepar', 'trepando',
  'transar', 'transando', 'gozar', 'gozei', 'gozou', 'gozando', 'gozada', 'esporrar',
  'tesao', 'tarado', 'tarada', 'safadeza', 'putaria', 'putinha', 'putona',
  'puta', 'putas', 'vadia', 'vagabunda', 'piranha', 'quenga', 'rapariga', 'garota de programa',
  'corno', 'cornao', 'chifrudo', 'viado', 'bicha', 'veado', 'arrombado', 'arrombada',
  'otario', 'babaca', 'imbecil', 'idiota', 'retardado', 'mongoloide',
  'merda', 'bosta', 'cuzao', 'cuzinho', 'cu', 'fdp', 'pqp', 'vsf', 'vtnc', 'krl', 'plmdds',
  'filho da puta', 'filha da puta', 'desgraçado', 'desgracado',
  'nudes', 'nude', 'pelada', 'pelado', 'nua', 'sexo', 'sexual', 'orgasmo', 'masturbar',
  'masturbando', 'masturbacao', 'pornô', 'porno', 'pornografia', 'sacanagem', 'putaria pura',
  // Inglês — chat de live é internacional e o filtro não pode parar na fronteira
  'fuck', 'fucking', 'fucker', 'shit', 'bullshit', 'bitch', 'dick', 'cock', 'pussy',
  'boobs', 'tits', 'whore', 'slut', 'cum', 'cumming', 'horny', 'blowjob', 'handjob',
  'milf', 'porn', 'nsfw', 'dickpic'
];

/**
 * Expressões de duplo sentido: cada uma é inocente palavra por palavra e deixa de ser quando as
 * palavras vêm juntas e endereçadas a alguém. Foi este tipo de comentário que passou pelo modelo
 * e acabou lido em voz alta.
 */
const EXPRESSOES_DE_DUPLO_SENTIDO = [
  'senta aqui', 'senta em mim', 'pode sentar', 'senta no meu', 'senta gostoso',
  'me come', 'te comer', 'quero comer', 'vou comer voce', 'come ela', 'come ele',
  'mete gostoso', 'mete forte', 'quero meter', 'vou meter', 'enfia', 'enfiar em',
  'manda nudes', 'manda foto pelada', 'tira a roupa', 'fica pelada', 'mostra tudo',
  'mostra mais', 'abaixa mais', 'levanta a saia', 'sem calcinha', 'sem sutia',
  'ta durinho', 'ta duro', 'ficou duro', 'to duro', 'to molhada', 'ficou molhada',
  'chupa meu', 'chupa a', 'chupa o', 'lambe meu', 'lambe a', 'passa a mao',
  'senta no colo', 'no meu colo', 'deita comigo', 'vem pra cama', 'vamos pro quarto',
  'gostosa demais', 'que delicia de', 'delicia essa', 'que corpo hein', 'que bunda',
  'de quatro', 'geme pra mim', 'geme ai'
];

const TAMANHO_MINIMO_PARA_COMPACTO = 7;

/** Escapa o que vira metacaractere de regex; os termos são dados escritos, não expressões. */
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Palavra inteira, com folga para plural e gênero no fim ("puta" pega "putas", "tarado" pega
 * "tarados"), mas sem deixar o termo casar no meio de outra palavra: é a diferença entre bloquear
 * "cu" e bloquear "curioso".
 */
const padraoDeTermo = (termo: string, colapsar = false) => {
  const base = normalizarParaFiltro(termo);
  const partes = (colapsar ? colapsarRepeticoes(base) : base).split(' ').filter(Boolean).map(escapar);
  if (partes.length === 0) return null;
  return new RegExp(`(?:^|\\s)${partes.join('\\s+')}s?a?(?:$|\\s)`);
};

interface PadraoDeTermo {
  termo: string;
  padrao: RegExp;
  /** Contra o texto com toda repetição derrubada, e não contra o texto normalizado. */
  padraoColapsado: RegExp;
}

const montarPadroes = (termos: string[]): PadraoDeTermo[] => termos
  .map(termo => ({ termo, padrao: padraoDeTermo(termo), padraoColapsado: padraoDeTermo(termo, true) }))
  .filter((x): x is PadraoDeTermo => x.padrao !== null && x.padraoColapsado !== null);

const PADROES_EXPLICITOS = montarPadroes(TERMOS_EXPLICITOS);

const PADROES_DE_DUPLO_SENTIDO = montarPadroes(EXPRESSOES_DE_DUPLO_SENTIDO);

const COMPACTOS_EXPLICITOS = TERMOS_EXPLICITOS
  .map(t => ({ termo: t, compacto: compactarParaFiltro(t) }))
  .filter(x => x.compacto.length >= TAMANHO_MINIMO_PARA_COMPACTO);

/**
 * Diz se este texto pode ser dito em voz alta numa transmissão pública.
 *
 * Só olha o que está escrito. Não julga intenção, não pondera contexto e não abre exceção — quem
 * faz isso é o modelo, uma camada acima. Aqui é o chão de que ele não pode descer.
 */
export function avaliarParaVozPublica(texto: string): VeredictoDeFala {
  const normalizado = normalizarParaFiltro(texto);
  if (!normalizado) return { seguro: true };

  // Espaços nas pontas para que "^|\s" e "$|\s" valham também na primeira e na última palavra.
  const comFolga = ` ${normalizado} `;
  const comFolgaColapsada = ` ${colapsarRepeticoes(normalizado)} `;

  for (const { termo, padrao, padraoColapsado } of PADROES_EXPLICITOS) {
    if (padrao.test(comFolga) || padraoColapsado.test(comFolgaColapsada)) {
      return {
        seguro: false,
        categoria: 'explicito',
        termo,
        motivo: `Contém "${termo}", que é palavrão ou termo sexual explícito.`
      };
    }
  }

  for (const { termo, padrao, padraoColapsado } of PADROES_DE_DUPLO_SENTIDO) {
    if (padrao.test(comFolga) || padraoColapsado.test(comFolgaColapsada)) {
      return {
        seguro: false,
        categoria: 'duplo_sentido',
        termo,
        motivo: `Contém a expressão "${termo}", de conotação sexual quando dita a alguém.`
      };
    }
  }

  // Última passada: o mesmo palavrão escrito com separadores no meio para escapar do filtro.
  const compacto = compactarParaFiltro(texto);
  for (const { termo, compacto: alvo } of COMPACTOS_EXPLICITOS) {
    if (compacto.includes(alvo)) {
      return {
        seguro: false,
        categoria: 'explicito',
        termo,
        motivo: `Contém "${termo}" escrito de forma disfarçada (letras separadas ou trocadas).`
      };
    }
  }

  return { seguro: true };
}
