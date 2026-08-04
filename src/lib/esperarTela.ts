/**
 * QUANDO A TELA FICOU PRONTA PARA O PRÓXIMO CLIQUE.
 *
 * Esta é a peça que decide se um agente consegue trabalhar sozinho ou não. Clicar é fácil; o que
 * trava toda sequência automática é o intervalo entre um clique e o seguinte, porque ele não é
 * fixo: abrir um programa pesado leva segundos, trocar de aba leva um piscar de olhos, e a mesma
 * ação demora coisas diferentes em máquinas diferentes.
 *
 * As duas saídas óbvias são ruins, e nas duas pontas:
 *
 * - Esperar um tempo fixo curto faz o clique cair numa tela que ainda não existe. O alvo estava
 *   sendo procurado num lugar que ainda vai mudar, e o clique acerta o que estava lá antes.
 * - Esperar um tempo fixo longo transforma dez passos em minutos de espera parada, e é o que faz
 *   qualquer automação parecer travada.
 *
 * Aqui a espera é MEDIDA, não arbitrada: a tela é fotografada e comparada consigo mesma até parar
 * de mudar. Enquanto pixels se mexem, algo ainda está carregando; quando duas fotos seguidas são
 * praticamente iguais, acabou. É a mesma escolha já feita na mira do cursor (mirarNaInterface.ts):
 * medir em vez de calcular, porque o cálculo tem chances demais de errar.
 *
 * E a medição não se perde. Cada espera vira histórico, e o histórico vira previsão: se abrir o
 * navegador levou 2,4s das últimas vezes, a próxima vez começa a olhar perto dos 2,4s em vez de
 * ficar fotografando a tela desde o zero. Isso é o que impede a conta de custar mais do que a
 * espera que ela economiza.
 */

/** Assinatura barata de uma tela: brilho médio numa grade pequena. */
export type AssinaturaDaTela = Uint8Array;

export const LARGURA_DA_ASSINATURA = 32;
export const ALTURA_DA_ASSINATURA = 18;

/**
 * Diferença entre duas telas, de 0 (idênticas) a 1 (opostas).
 *
 * Comparar imagem inteira seria caro e, pior, sensível demais: um cursor piscando ou um relógio
 * mudando de minuto marcariam "a tela mudou" para sempre, e a espera nunca terminaria. A grade
 * pequena dilui essas mexidas mínimas e destaca o que importa — uma janela abrindo, uma página
 * trocando, um menu aparecendo.
 */
export function diferencaEntreTelas(a: AssinaturaDaTela | null, b: AssinaturaDaTela | null): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 1;
  let soma = 0;
  for (let i = 0; i < a.length; i++) soma += Math.abs(a[i] - b[i]);
  return soma / (a.length * 255);
}

/**
 * Abaixo disto a tela conta como parada.
 *
 * Não é zero de propósito: cursor de texto piscando, relógio, indicador de rede e animação de
 * "carregando" mexem alguns pixels para sempre. Exigir igualdade perfeita faria a espera nunca
 * terminar justamente nas telas mais comuns.
 */
export const LIMIAR_DE_TELA_PARADA = 0.006;

export interface HistoricoDeEsperas {
  /** Milissegundos medidos, por tipo de ação, do mais antigo para o mais recente. */
  porAcao: Record<string, number[]>;
}

export function historicoVazio(): HistoricoDeEsperas {
  return { porAcao: {} };
}

/**
 * Quanto se espera que ESTA ação demore, antes de começar a olhar.
 *
 * Sem histórico, vale um palpite por tipo de ação — grosseiro, mas na ordem de grandeza certa.
 * Com histórico, vale o que já foi medido nesta máquina, que é sempre melhor do que qualquer
 * palpite escrito aqui: a mesma ação num computador rápido e num lento não tem nada a ver.
 */
const PALPITE_INICIAL_MS: Record<string, number> = {
  abrir: 2500,
  clicar: 700,
  digitar: 250,
  tecla: 400,
  rolar: 350,
  mover_mouse: 120,
  terminal: 1200
};
const PALPITE_PADRAO_MS = 800;

/** Nunca menos que isto: dar tempo de a ação sequer chegar ao sistema. */
export const ESPERA_MINIMA_MS = 120;
/** Nunca mais que isto sem olhar: uma previsão errada não pode virar um minuto parado. */
export const ESPERA_MAXIMA_MS = 15000;

export function previsaoDeEspera(historico: HistoricoDeEsperas, acao: string): number {
  const medidos = historico.porAcao[acao] || [];
  if (medidos.length === 0) {
    return PALPITE_INICIAL_MS[acao] ?? PALPITE_PADRAO_MS;
  }
  // Mediana das últimas medições, e não média: uma única vez em que o computador engasgou puxaria
  // a média para cima e faria todas as esperas seguintes serem longas demais.
  //
  // Mediana DE VERDADE, com a média dos dois centrais quando a contagem é par. Pegando só o de
  // cima, duas medições [420, 2622] davam 2622 — a previsão adotava o pior caso e passava a olhar
  // tarde demais para enxergar os passos rápidos, que então mediam mais do que realmente levavam.
  const ultimas = medidos.slice(-7).sort((x, y) => x - y);
  const meio = ultimas.length % 2 === 1
    ? ultimas[(ultimas.length - 1) / 2]
    : (ultimas[ultimas.length / 2 - 1] + ultimas[ultimas.length / 2]) / 2;
  return Math.max(ESPERA_MINIMA_MS, Math.min(ESPERA_MAXIMA_MS, Math.round(meio)));
}

export function registrarMedicao(historico: HistoricoDeEsperas, acao: string, ms: number): HistoricoDeEsperas {
  const anteriores = historico.porAcao[acao] || [];
  return {
    porAcao: {
      ...historico.porAcao,
      // Só as últimas 20: o computador de hoje não precisa carregar a lentidão de ontem.
      [acao]: [...anteriores, Math.max(0, Math.round(ms))].slice(-20)
    }
  };
}

export interface ResultadoDaEspera {
  /** Quanto tempo se passou até a tela parar de mudar. */
  medidoMs: number;
  /** A tela chegou a parar, ou o prazo estourou com ela ainda mexendo? */
  estabilizou: boolean;
  /** Quantas fotos foram necessárias — o custo real desta espera. */
  fotos: number;
  /** A última assinatura, para o passo seguinte comparar sem fotografar de novo. */
  assinaturaFinal: AssinaturaDaTela | null;
}

export interface DependenciasDaEspera {
  agora: () => number;
  dormir: (ms: number) => Promise<void>;
  /** Fotografa a tela e devolve a assinatura, ou null se não deu para fotografar. */
  fotografar: () => Promise<AssinaturaDaTela | null>;
  /** Consultado entre as fotos: quem pediu para parar não deve esperar mais nada. */
  cancelado?: () => boolean;
}

/**
 * Espera a tela parar de mudar e devolve quanto tempo isso levou DE FATO.
 *
 * Duas decisões aqui existem só para a medição não mentir, e ambas foram aprendidas errando:
 *
 * 1. O TEMPO REGISTRADO É O DA PRIMEIRA FOTO DO PAR IGUAL, e não o instante em que a comparação
 *    aconteceu. Quando duas fotos seguidas batem, a tela já estava parada na PRIMEIRA delas — o
 *    tempo até a segunda inclui um intervalo de vigia que não tem nada a ver com o carregamento.
 *    Contando até a segunda, a medição saía inflada, virava a previsão seguinte, e a previsão
 *    inflada inflava a medição seguinte: um laço de realimentação que subia sem teto. Foi medido
 *    num carregamento real de 1800ms virando 3292ms, depois 9034ms.
 *
 * 2. A PRIMEIRA OLHADA VEM ANTES DA PREVISÃO (60% dela). Olhando só a partir da previsão, o menor
 *    valor que se consegue medir é a própria previsão — e assim ela nunca desce, mesmo quando a
 *    máquina está mais rápida do que na primeira vez. Espiar mais cedo é o que permite a conta
 *    corrigir para baixo, e não só para cima.
 */
export async function esperarTelaParar(
  deps: DependenciasDaEspera,
  opcoes: { previsaoMs: number; prazoMaximoMs?: number; assinaturaAnterior?: AssinaturaDaTela | null }
): Promise<ResultadoDaEspera> {
  const comecou = deps.agora();
  const prazo = opcoes.prazoMaximoMs ?? 20000;
  const previsao = Math.max(ESPERA_MINIMA_MS, Math.min(ESPERA_MAXIMA_MS, Math.round(opcoes.previsaoMs)));
  const primeira = Math.max(ESPERA_MINIMA_MS, Math.round(previsao * 0.6));

  await deps.dormir(primeira);

  let anterior = await deps.fotografar();
  let quandoAnterior = deps.agora();
  let fotos = 1;
  let intervalo = Math.max(150, Math.round(previsao * 0.25));

  while (deps.agora() - comecou < prazo) {
    if (deps.cancelado?.()) break;

    await deps.dormir(intervalo);
    const atual = await deps.fotografar();
    fotos++;

    if (atual && anterior && diferencaEntreTelas(anterior, atual) < LIMIAR_DE_TELA_PARADA) {
      // O instante da foto ANTERIOR: é ali que a tela já estava parada.
      return { medidoMs: quandoAnterior - comecou, estabilizou: true, fotos, assinaturaFinal: atual };
    }

    anterior = atual;
    quandoAnterior = deps.agora();
    // Espaçamento crescente, com teto: telas que demoram muito costumam demorar MUITO, e insistir
    // no mesmo ritmo só gasta captura sem antecipar o fim.
    intervalo = Math.min(1500, Math.round(intervalo * 1.6));
  }

  return { medidoMs: deps.agora() - comecou, estabilizou: false, fotos, assinaturaFinal: anterior };
}

/**
 * Converte uma captura (data URL) na assinatura. Só roda no navegador, onde há canvas.
 *
 * Devolve null em vez de lançar: uma captura que falhou não pode derrubar a sequência inteira —
 * quem chamou trata a ausência de assinatura como "não sei se mudou" e segue pelo prazo.
 */
export async function assinaturaDaImagem(dataUrl: string): Promise<AssinaturaDaTela | null> {
  try {
    if (typeof document === 'undefined' || !dataUrl) return null;
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('imagem inválida'));
      img.src = dataUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = LARGURA_DA_ASSINATURA;
    canvas.height = ALTURA_DA_ASSINATURA;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, LARGURA_DA_ASSINATURA, ALTURA_DA_ASSINATURA);

    const { data } = ctx.getImageData(0, 0, LARGURA_DA_ASSINATURA, ALTURA_DA_ASSINATURA);
    const assinatura = new Uint8Array(LARGURA_DA_ASSINATURA * ALTURA_DA_ASSINATURA);
    for (let i = 0; i < assinatura.length; i++) {
      const p = i * 4;
      // Luminância percebida: verde pesa mais que vermelho, que pesa mais que azul.
      assinatura[i] = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
    }
    return assinatura;
  } catch {
    return null;
  }
}
