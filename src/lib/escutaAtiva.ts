/**
 * A ESCUTA QUE NÃO PERDE O QUE FOI DITO.
 *
 * O reconhecimento de voz do navegador entrega o texto aos pedaços, e dois detalhes dele
 * derrubam uma transcrição longa se forem ignorados. Os dois estão resolvidos aqui, fora do
 * componente, porque são lógica — e lógica dentro de um `onresult` não tem como ser conferida
 * sem microfone, sem navegador e sem alguém falando.
 *
 * 1. O EVENTO REPETE O PASSADO. Em modo contínuo, `event.results` não traz só o trecho novo:
 *    traz a lista INTEIRA desde que a sessão começou, e `resultIndex` aponta onde está o que
 *    mudou. Percorrer a lista do zero e concatenar — que é o jeito óbvio de escrever — reescreve
 *    todo o discurso a cada palavra nova. A transcrição cresce ao quadrado: um minuto de fala
 *    vira páginas do mesmo texto repetido, e ninguém percebe enquanto a frase é curta.
 *
 * 2. O NAVEGADOR DESLIGA SOZINHO. Ele encerra a sessão em cada silêncio um pouco mais longo —
 *    a pausa entre dois parágrafos basta. Sem religar, "escuta ativa" dura até a primeira
 *    respiração de quem fala. Como o texto definitivo é guardado AQUI, e não dentro da sessão
 *    do navegador, religar não custa nada: a lista de resultados recomeça vazia e o que já
 *    estava escrito continua escrito.
 */

/** O que a escuta acumulou até agora. */
export interface EstadoDaEscuta {
  /** O que o reconhecimento já deu por definitivo. É isto que vira o discurso. */
  finalizado: string;
  /**
   * O trecho que o navegador ainda está decidindo. Muda a cada palavra e é substituído inteiro
   * no evento seguinte — por isso vive separado do definitivo, e não concatenado nele.
   */
  parcial: string;
}

/** O formato do evento do navegador, no mínimo que interessa aqui. */
export interface EventoDeReconhecimento {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean;[indice: number]: { transcript: string } }>;
}

export const ESCUTA_VAZIA: EstadoDaEscuta = { finalizado: '', parcial: '' };

/**
 * Junta dois trechos com UM espaço, sem criar espaço duplo nem colar palavras.
 *
 * Os pedaços chegam com espaçamento inconsistente entre navegadores: uns já vêm com espaço à
 * frente, outros não. Emendar sem cuidado produz "boatarde" ou "boa  tarde", e os dois estragam
 * a contagem de palavras e a leitura do que o modelo vai receber depois.
 */
export function juntarTrechos(anterior: string, novo: string): string {
  const a = (anterior || '').replace(/\s+$/, '');
  const b = (novo || '').replace(/^\s+/, '');
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
}

/**
 * Aplica um evento do reconhecimento ao que já foi acumulado.
 *
 * Só o que vem a partir de `resultIndex` é considerado: o que está antes já foi dado por
 * definitivo num evento anterior e já está em `finalizado`.
 */
export function aplicarResultado(estado: EstadoDaEscuta, evento: EventoDeReconhecimento): EstadoDaEscuta {
  const inicio = Number.isFinite(evento?.resultIndex) ? Math.max(0, evento.resultIndex) : 0;
  const total = evento?.results?.length || 0;

  let novoDefinitivo = '';
  let parcial = '';

  for (let i = inicio; i < total; i++) {
    const resultado = evento.results[i];
    const texto = resultado?.[0]?.transcript || '';
    if (!texto) continue;
    if (resultado.isFinal) novoDefinitivo = juntarTrechos(novoDefinitivo, texto);
    else parcial = juntarTrechos(parcial, texto);
  }

  return {
    finalizado: novoDefinitivo ? juntarTrechos(estado.finalizado, novoDefinitivo) : estado.finalizado,
    // O parcial é SUBSTITUÍDO, nunca somado: ele é a aposta atual do navegador sobre a mesma
    // palavra, e somá-lo repetiria a frase a cada correção que ele faz enquanto a pessoa fala.
    parcial
  };
}

/** O texto completo para mostrar na tela: o definitivo mais a cauda que ainda está sendo dita. */
export function textoDaEscuta(estado: EstadoDaEscuta): string {
  return juntarTrechos(estado.finalizado, estado.parcial);
}

/**
 * Conta palavras de verdade: separa por espaço e descarta o que sobra de pontuação solta.
 * Serve para a tela dizer o tamanho do discurso e para barrar uma elaboração de discurso vazio.
 */
export function contarPalavras(texto: string): number {
  const limpo = (texto || '').trim();
  if (!limpo) return 0;
  return limpo.split(/\s+/).filter(p => /[\p{L}\p{N}]/u.test(p)).length;
}

/** Duração em mm:ss (ou h:mm:ss quando passa de uma hora), para o cronômetro da gravação. */
export function formatarDuracao(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${doisDigitos(m)}:${doisDigitos(s)}` : `${doisDigitos(m)}:${doisDigitos(s)}`;
}

/** Se este navegador tem reconhecimento de voz. O Firefox, por exemplo, não tem. */
export function reconhecimentoDisponivel(): boolean {
  if (typeof window === 'undefined') return false;
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/** Cria o reconhecedor já configurado para escuta contínua em português. */
export function criarReconhecedor(idioma: string = 'pt-BR'): any | null {
  if (typeof window === 'undefined') return null;
  const Reconhecimento = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Reconhecimento) return null;

  const rec = new Reconhecimento();
  rec.lang = idioma;
  // Contínuo e com resultados parciais: é o que separa "ditar uma frase" de "acompanhar um
  // discurso". Sem os parciais, a tela fica parada por segundos e parece travada.
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  return rec;
}

/** Traduz o código de erro do navegador na frase que diz o que fazer. */
export function explicarErroDaEscuta(codigo: string): string {
  switch (codigo) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'O navegador bloqueou o microfone. Clique no cadeado ao lado do endereço, autorize o microfone e comece de novo.';
    case 'audio-capture':
      return 'Nenhum microfone foi encontrado. Confira se ele está conectado e se outro programa não está usando-o sozinho.';
    case 'network':
      return 'O reconhecimento de voz do navegador precisa de internet para transcrever, e a conexão falhou. O que já estava escrito foi mantido.';
    case 'no-speech':
      return 'Nada foi ouvido por um tempo. A escuta continua ligada — pode falar.';
    case 'aborted':
      return '';
    default:
      return `O reconhecimento de voz parou com o erro "${codigo}". O que já estava transcrito foi mantido.`;
  }
}
