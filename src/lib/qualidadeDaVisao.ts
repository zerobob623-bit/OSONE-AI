/**
 * QUANTO DA TELA CHEGA DE VERDADE NOS OLHOS DO MODELO.
 *
 * O compartilhamento de tela enviava todo quadro como 640×480 em JPEG de qualidade 0,6, fixo,
 * qualquer que fosse a tela de origem. Isso explica, sozinho, por que ler chat ao vivo saía
 * errado — e por que saía errado de um jeito específico, trocando palavras e nomes por outros
 * parecidos em vez de simplesmente falhar:
 *
 * 1. TAMANHO. Uma tela de 1920×1080 virava 640×480: cada letra encolhia três vezes. Um comentário
 *    escrito com 14 pixels de altura chegava com menos de 5 — abaixo do que qualquer leitor,
 *    humano ou modelo, consegue resolver. O que sobra da letra é uma mancha, e uma mancha admite
 *    várias leituras.
 *
 * 2. PROPORÇÃO. Pior que o encolhimento: 640×480 é 4:3 e a tela é 16:9. O quadro era esticado
 *    para caber, espremendo tudo 1,33× na horizontal. Letra espremida não é letra pequena, é
 *    letra DEFORMADA: "m" vira "rn", "cl" vira "d", "vv" vira "w". É a origem exata de "trocava
 *    palavras" — e de trocar palavra por palavra é que nascem os duplos sentidos que ninguém
 *    escreveu.
 *
 * 3. COMPRESSÃO. Qualidade 0,6 é o ponto em que o JPEG começa a inventar ondulação em volta de
 *    traço fino e alto contraste — que é exatamente a descrição de texto branco sobre vídeo.
 *
 * Nada disso é lido como "imagem ruim" pelo modelo. Ele recebe uma imagem, é perguntado o que
 * está escrito, e completa o borrão com a palavra mais provável. O erro não vem de falta de
 * capacidade de visão: vem de o borrão ter sido produzido aqui, antes de a pergunta ser feita.
 *
 * As contas abaixo preservam a proporção SEMPRE, nunca ampliam além da fonte (ampliar não cria
 * detalhe que a origem não tinha, só peso) e separam dois usos que têm exigências opostas:
 *
 * - 'ambiente': acompanhar em tempo real, um quadro por segundo, para o modelo saber o que está
 *   acontecendo. Precisa ser leve, porque atravessa um WebSocket aberto o tempo todo.
 * - 'leitura': UMA foto, tirada de propósito para ler texto. Aqui peso não importa — é uma
 *   chamada só, e ela decide se um nome vai ser dito certo ou errado em voz alta numa transmissão.
 */

export type ModoDeVisao = 'ambiente' | 'leitura';

export interface QuadroDeVisao {
  largura: number;
  altura: number;
  /** Qualidade do JPEG (0 a 1) para `canvas.toDataURL('image/jpeg', q)`. */
  qualidadeJpeg: number;
}

interface Perfil {
  ladoMaior: number;
  qualidadeJpeg: number;
}

/**
 * 'ambiente' não é generoso à toa: ele atravessa um WebSocket que fica aberto a sessão inteira,
 * um quadro por segundo, na conexão de quem provavelmente está subindo vídeo ao vivo ao mesmo
 * tempo. É o dobro de pixels do quadro antigo e com a proporção certa — o suficiente para
 * acompanhar a tela sem deformar nada —, e não mais do que isso, porque ler texto não é mais
 * tarefa dele: para isso existe a foto de 'leitura'.
 */
const PERFIS: Record<ModoDeVisao, Perfil> = {
  ambiente: { ladoMaior: 1280, qualidadeJpeg: 0.82 },
  leitura: { ladoMaior: 2560, qualidadeJpeg: 0.97 }
};

/** Quando o vídeo ainda não reportou tamanho, um 16:9 comum é melhor palpite que 4:3. */
const LARGURA_PADRAO = 1280;
const ALTURA_PADRAO = 720;

/** JPEG trabalha em blocos de 8×8 e lida melhor com lados pares; ímpar custa meia coluna de borrão. */
const paraPar = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Devolve o tamanho e a qualidade do quadro a enviar, a partir do tamanho REAL da fonte de vídeo
 * (`video.videoWidth`/`video.videoHeight`, não o tamanho do elemento na página).
 */
export function calcularQuadro(
  larguraFonte: number,
  alturaFonte: number,
  modo: ModoDeVisao = 'ambiente'
): QuadroDeVisao {
  const perfil = PERFIS[modo] || PERFIS.ambiente;

  const larguraOk = Number.isFinite(larguraFonte) && larguraFonte > 0;
  const alturaOk = Number.isFinite(alturaFonte) && alturaFonte > 0;
  const largura = larguraOk ? Number(larguraFonte) : LARGURA_PADRAO;
  const altura = alturaOk ? Number(alturaFonte) : ALTURA_PADRAO;

  // Menor que 1 encolhe; nunca maior que 1, porque ampliar aqui só multiplica peso: o detalhe que
  // faltou na origem não volta, e o modelo passa a receber uma imagem grande igualmente ilegível.
  const escala = Math.min(1, perfil.ladoMaior / Math.max(largura, altura));

  return {
    largura: paraPar(largura * escala),
    altura: paraPar(altura * escala),
    qualidadeJpeg: perfil.qualidadeJpeg
  };
}
