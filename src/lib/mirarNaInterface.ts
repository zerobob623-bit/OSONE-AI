/**
 * MIRA NA PRÓPRIA INTERFACE — descobre onde um elemento do OSONE está NA TELA perguntando ao
 * navegador, em vez de estimar olhando uma imagem.
 *
 * Por que isto existe: toda a cadeia de clique depende de uma coordenada, e estimá-la olhando uma
 * captura é o elo fraco. Ficou medido em uso real: em três tentativas seguidas o erro em Y foi
 * constante (-45px nas três) enquanto o erro em X variou ao acaso. Erro de leitura seria aleatório
 * nos dois eixos; desvio fixo num eixo só revela que a imagem não estava sendo lida.
 *
 * A busca por texto (OCR) resolveu isso para alvos escritos, mas botão que é só ícone não tem
 * texto para reconhecer. Quando o alvo é do PRÓPRIO OSONE, porém, não é preciso reconhecer nada:
 * o navegador sabe exatamente onde cada elemento está, com nome, tamanho e posição. Basta
 * perguntar — e traduzir a posição da página para o pixel da tela.
 *
 * A tradução é o ponto delicado, e por isso ela não é calculada e sim MEDIDA. Calcular exigiria
 * acertar de uma vez a posição da janela, a altura da barra do navegador, a borda lateral, o zoom
 * da página e a escala do sistema — cinco chances de errar por alguns pixels, exatamente o tipo de
 * conta que já falhou antes. Em vez disso o cursor é movido até o ponto calculado e o navegador
 * responde onde ele caiu DENTRO da página: com esse par (pixel da tela ↔ ponto da página) a
 * tradução deixa de ser hipótese. Se o primeiro tiro não cair sobre o alvo, a diferença corrige a
 * conta e o tiro seguinte cai — e a confirmação final é o próprio navegador dizendo qual elemento
 * está sob o cursor.
 *
 * Quando nada disso é possível — a janela do OSONE está atrás de outra, minimizada, ou o agente
 * roda em outra máquina — nenhum evento chega, a mira falha explicitamente e quem chamou cai na
 * busca por texto. É de propósito: uma coordenada não confirmada aqui clicaria em outro programa.
 */

export interface TelaDoAgente {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export interface PontoNaTela {
  x: number;
  y: number;
}

/** Move o cursor para um pixel absoluto e devolve onde ele REALMENTE parou (ou null se falhou). */
export type MoverCursor = (x: number, y: number) => Promise<PontoNaTela | null>;

export type OrigemDoNome = 'aria-label' | 'title' | 'texto' | 'alt' | 'placeholder' | 'valor';

export interface AlvoNaInterface {
  rotulo: string;
  origemDoNome: OrigemDoNome;
  pixel: PontoNaTela;
  escala0a1000: PontoNaTela;
  tamanhoPx: { largura: number; altura: number };
  /** Quantos movimentos de cursor foram necessários até o navegador confirmar o alvo. */
  movimentos: number;
}

/**
 * Um só formato para os dois desfechos, em vez de uma união discriminada: este projeto compila
 * sem strictNullChecks, e sem ele o TypeScript não estreita união por 'true'/'false' — o campo do
 * outro caso vira erro de compilação em quem consome. Campo opcional evita a armadilha.
 */
export interface ResultadoDaMira {
  encontrado: boolean;
  /** Preenchido apenas quando encontrado, com a posição já confirmada pelo navegador. */
  alvo?: AlvoNaInterface;
  /** Preenchido apenas quando NÃO encontrado: por que exatamente este caminho não serviu. */
  motivo?: string;
  /** O que a interface tinha de clicável na hora — a lista que permite conferir a grafia. */
  rotulosVisiveis?: string[];
  ambiguos?: string[];
}

/** Mesma normalização usada na busca por OCR, para que "Voz Livre" e "VOZ  LIVRE" sejam iguais. */
const normalizar = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/**
 * O que pode ser clicado. Inclui [title] e [aria-label] porque é justamente aí que mora o nome dos
 * botões que são só ícone — o caso que a busca por texto nunca resolveria, por não haver texto.
 */
const SELETOR_CLICAVEIS = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'summary',
  'label',
  '[role="button"]',
  '[role="tab"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[contenteditable="true"]',
  '[title]',
  '[aria-label]'
].join(',');

/** Nome legível não passa de uma linha: um contêiner grande com meia tela de texto não é rótulo. */
const LIMITE_DO_NOME = 120;

interface NomeCandidato {
  texto: string;
  origem: OrigemDoNome;
}

function nomesDoElemento(el: Element): NomeCandidato[] {
  const nomes: NomeCandidato[] = [];
  const juntar = (bruto: string | null | undefined, origem: OrigemDoNome) => {
    const texto = (bruto || '').replace(/\s+/g, ' ').trim();
    if (texto && texto.length <= LIMITE_DO_NOME) nomes.push({ texto, origem });
  };

  juntar(el.getAttribute('aria-label'), 'aria-label');
  juntar(el.getAttribute('title'), 'title');
  juntar(el.getAttribute('alt'), 'alt');
  juntar(el.getAttribute('placeholder'), 'placeholder');

  // Botão de ícone às vezes carrega o nome num filho (o <svg>, a <img>, um <span> escondido para
  // leitores de tela). Sem olhar para dentro, esses ficariam anônimos — que é o caso a resolver.
  const filho = el.querySelector('[aria-label],[title],img[alt]');
  if (filho && filho !== el) {
    juntar(filho.getAttribute('aria-label'), 'aria-label');
    juntar(filho.getAttribute('title'), 'title');
    juntar(filho.getAttribute('alt'), 'alt');
  }

  const entrada = el as HTMLInputElement;
  if (entrada.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(entrada.type || '')) {
    juntar(entrada.value, 'valor');
  }

  juntar((el as HTMLElement).innerText, 'texto');

  return nomes;
}

/** Retângulo do elemento se ele estiver realmente visível e clicável; null caso contrário. */
function retanguloVisivel(el: Element): DOMRect | null {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) return null;

  const estilo = window.getComputedStyle(el);
  if (estilo.visibility === 'hidden' || estilo.display === 'none') return null;
  // 'pointer-events' é herdado, então um pai com pointer-events:none marca os filhos também — é
  // assim que a interface escondida do modo Voz Livre (opacity-0 + pointer-events-none) some daqui.
  if (estilo.pointerEvents === 'none') return null;
  if (Number(estilo.opacity) < 0.05) return null;

  return r;
}

interface Candidato {
  el: Element;
  rotulo: string;
  origem: OrigemDoNome;
  pontos: number;
  area: number;
}

function pontuar(nome: string, alvo: string): number {
  const n = normalizar(nome);
  if (!n || !alvo) return 0;
  if (n === alvo) return 100;
  if (alvo.length >= 3 && n.startsWith(alvo)) return 70;
  if (alvo.length >= 3 && n.includes(alvo)) return 50;
  // Contenção ao contrário — o rótulo cabendo dentro do que foi pedido — serve para quando o
  // modelo manda uma frase maior que o botão ("compartilhar tela agora"). Só que sem exigir que o
  // rótulo cubra boa parte do pedido, um nome curto casa com qualquer frase que o contenha: foi
  // medido que "Menu" era devolvido para quem pediu "Menu invisível", que é outro botão.
  if (n.length >= 4 && n.length >= alvo.length * 0.6 && alvo.includes(n)) return 40;
  return 0;
}

/** Todos os elementos visíveis cujo nome combina com o alvo, do mais provável para o menos. */
function candidatos(alvoBruto: string): { lista: Candidato[]; rotulosVisiveis: string[] } {
  const alvo = normalizar(alvoBruto);
  const lista: Candidato[] = [];
  const rotulosVisiveis: string[] = [];

  const elementos = Array.from(document.querySelectorAll(SELETOR_CLICAVEIS));
  for (const el of elementos) {
    const r = retanguloVisivel(el);
    if (!r) continue;

    const nomes = nomesDoElemento(el);
    if (nomes.length === 0) continue;

    if (rotulosVisiveis.length < 60) {
      const principal = nomes[0].texto;
      if (principal.length > 1 && !rotulosVisiveis.includes(principal)) rotulosVisiveis.push(principal);
    }

    let melhor: Candidato | null = null;
    for (const nome of nomes) {
      // Um ponto a menos para o texto solto: quando o mesmo elemento casa pelo title E pelo texto,
      // o rótulo declarado é o mais confiável dos dois.
      const pontos = pontuar(nome.texto, alvo) - (nome.origem === 'texto' ? 1 : 0);
      if (pontos > 0 && (!melhor || pontos > melhor.pontos)) {
        melhor = { el, rotulo: nome.texto, origem: nome.origem, pontos, area: r.width * r.height };
      }
    }
    if (melhor) lista.push(melhor);
  }

  lista.sort((a, b) => (b.pontos - a.pontos) || (a.area - b.area));

  // Um botão e o <span> dentro dele casam os dois com o mesmo texto. Ficar com o de dentro é o
  // certo: é o menor, e clicar no centro dele acerta o botão também.
  const semAninhados = lista.filter(c => !lista.some(outro => outro !== c && c.el.contains(outro.el) && outro.pontos >= c.pontos));

  return { lista: semAninhados, rotulosVisiveis };
}

/**
 * Tradução entre o ponto da página (CSS px) e o pixel absoluto da tela.
 *
 * escala é o devicePixelRatio: em navegador ele já embute o zoom da página e a escala do sistema,
 * então costuma estar certo de saída. origem é a posição do canto do conteúdo na tela — o valor
 * que a heurística erra por causa da barra do navegador, e o que a medição corrige.
 */
interface Traducao {
  escalaX: number;
  escalaY: number;
  origemX: number;
  origemY: number;
}

interface Ancora {
  tela: PontoNaTela;
  pagina: PontoNaTela;
}

function traducaoEstimada(): Traducao {
  /**
   * devicePixelRatio já embute a escala do sistema e o zoom da página, e converte ponto da página
   * em pixel de tela com exatidão. Ele serve também de escala das coordenadas de janela (screenX,
   * outerWidth), o que a rigor só coincide com o zoom em 100% — mas isso afeta somente o chute
   * inicial, que é justamente o que a medição corrige em seguida.
   *
   * Tirar essa escala de window.screen.width seria pior: com dois monitores, screen descreve
   * apenas o monitor onde a janela está, enquanto a tela do agente é a união dos dois, e a conta
   * erraria por um fator inteiro — jogando as duas sondagens para fora da janela e derrubando a
   * mira num caso comum.
   */
  const escala = window.devicePixelRatio || 1;
  const borda = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  const barraDoNavegador = Math.max(0, window.outerHeight - window.innerHeight - borda);

  return {
    escalaX: escala,
    escalaY: escala,
    origemX: (window.screenX + borda) * escala,
    origemY: (window.screenY + barraDoNavegador) * escala
  };
}

function paraTela(pagina: PontoNaTela, t: Traducao): PontoNaTela {
  return {
    x: Math.round(t.origemX + pagina.x * t.escalaX),
    y: Math.round(t.origemY + pagina.y * t.escalaY)
  };
}

/**
 * Reajusta a tradução com o que foi medido. Uma âncora corrige a origem (o deslocamento da
 * janela); duas âncoras distantes corrigem também a escala, caso o devicePixelRatio não descreva
 * esta tela.
 */
function ajustar(base: Traducao, ancoras: Ancora[]): Traducao {
  const t = { ...base };
  if (ancoras.length === 0) return t;

  if (ancoras.length >= 2) {
    const a = ancoras[ancoras.length - 2];
    const b = ancoras[ancoras.length - 1];
    const dPaginaX = b.pagina.x - a.pagina.x;
    const dPaginaY = b.pagina.y - a.pagina.y;
    const escalaX = dPaginaX !== 0 ? (b.tela.x - a.tela.x) / dPaginaX : t.escalaX;
    const escalaY = dPaginaY !== 0 ? (b.tela.y - a.tela.y) / dPaginaY : t.escalaY;
    // Distância curta demais transforma ruído de arredondamento em escala absurda: só aceita o
    // ajuste quando os dois pontos estão longe o bastante e o resultado é plausível. O limite é
    // baixo de propósito — o devicePixelRatio nem sempre descreve a escala do cursor (no Windows,
    // um processo sem consciência de DPI recebe coordenadas já reduzidas), e sem corrigir a escala
    // o erro cresce com a distância até a última âncora.
    if (Math.abs(dPaginaX) >= 24 && escalaX > 0.2 && escalaX < 8) t.escalaX = escalaX;
    if (Math.abs(dPaginaY) >= 24 && escalaY > 0.2 && escalaY < 8) t.escalaY = escalaY;
  }

  const ultima = ancoras[ancoras.length - 1];
  t.origemX = ultima.tela.x - ultima.pagina.x * t.escalaX;
  t.origemY = ultima.tela.y - ultima.pagina.y * t.escalaY;
  return t;
}

/**
 * Escuta a chegada do ponteiro na página.
 *
 * A escuta começa ANTES de mandar o cursor e o prazo só corre DEPOIS que o movimento voltou. A
 * ordem importa: mover o cursor é uma ida ao agente que no Windows abre um PowerShell e pode levar
 * quase um segundo, e um prazo iniciado junto com o pedido expiraria antes de o cursor sequer sair
 * do lugar — descartando um movimento que deu certo como se a janela estivesse escondida.
 */
function observarPonteiro() {
  let visto: MouseEvent | null = null;
  let avisar: ((e: MouseEvent) => void) | null = null;

  const ouvir = (e: Event) => {
    visto = e as MouseEvent;
    if (avisar) {
      const entregar = avisar;
      avisar = null;
      entregar(visto);
    }
  };
  window.addEventListener('mousemove', ouvir, true);

  return {
    esperar(prazoMs: number): Promise<MouseEvent | null> {
      if (visto) return Promise.resolve(visto);
      return new Promise(resolve => {
        const tempo = setTimeout(() => {
          avisar = null;
          resolve(null);
        }, prazoMs);
        avisar = (e: MouseEvent) => {
          clearTimeout(tempo);
          resolve(e);
        };
      });
    },
    parar() {
      window.removeEventListener('mousemove', ouvir, true);
    }
  };
}

const PRAZO_DO_EVENTO_MS = 900;
/** Folga para o evento do empurrão ser entregue antes de a escuta seguinte começar. */
const PAUSA_APOS_EMPURRAO_MS = 120;

const pausa = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface Observacao {
  /** Onde o cursor parou, segundo o sistema operacional. */
  ficou: PontoNaTela;
  /** Onde ele apareceu dentro da página — null quando o ponteiro não chegou a ela. */
  pagina: PontoNaTela | null;
}

/**
 * Move o cursor e descobre onde ele apareceu dentro da página.
 *
 * O evento é o que fecha o circuito: sem ele há apenas a intenção de ter movido para um lugar.
 *
 * O empurrão de alguns pixels vem ANTES, e só quando o cursor já está no destino: sem deslocamento
 * o navegador não avisa nada, e um destino igual à posição atual pareceria uma janela escondida.
 * Empurrar depois de toda falha era o inverso disso — gastava dois movimentos extras justamente no
 * caso em que o ponteiro nunca ia chegar à página, que é o mais lento de todos.
 */
async function moverEObservar(
  destino: PontoNaTela,
  mover: MoverCursor,
  posicaoAtual: PontoNaTela | null
): Promise<Observacao | null> {
  const jaEstavaNoDestino = !!posicaoAtual
    && Math.abs(posicaoAtual.x - destino.x) <= 2
    && Math.abs(posicaoAtual.y - destino.y) <= 2;

  if (jaEstavaNoDestino) {
    if (!(await mover(destino.x + 11, destino.y + 11))) return null;
    await pausa(PAUSA_APOS_EMPURRAO_MS);
  }

  const observador = observarPonteiro();
  try {
    const ficou = await mover(destino.x, destino.y);
    if (!ficou) return null;
    const evento = await observador.esperar(PRAZO_DO_EVENTO_MS);
    return { ficou, pagina: evento ? { x: evento.clientX, y: evento.clientY } : null };
  } finally {
    observador.parar();
  }
}

/** O ponteiro está sobre o elemento pretendido (ou sobre algo dentro dele)? */
function acertouOAlvo(el: Element, pagina: PontoNaTela): boolean {
  const sob = document.elementFromPoint(pagina.x, pagina.y);
  return !!sob && (sob === el || el.contains(sob));
}

/** Centro do elemento, preso ao que está visível na janela para não mirar fora da tela. */
function centroVisivel(r: DOMRect): PontoNaTela {
  const x0 = Math.max(r.left, 0);
  const y0 = Math.max(r.top, 0);
  const x1 = Math.min(r.right, window.innerWidth);
  const y1 = Math.min(r.bottom, window.innerHeight);
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

const TENTATIVAS_DE_MIRA = 3;

/**
 * Localiza na PRÓPRIA interface do OSONE o elemento chamado `alvoBruto` e devolve o pixel de tela
 * confirmado pelo navegador. Só responde 'encontrado' quando o ponteiro foi de fato parar sobre o
 * elemento: uma coordenada não confirmada aqui clicaria em outro programa.
 */
export async function mirarNaInterface(
  alvoBruto: string,
  tela: TelaDoAgente,
  mover: MoverCursor
): Promise<ResultadoDaMira> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { encontrado: false, motivo: 'Sem interface do OSONE para consultar neste contexto.', rotulosVisiveis: [] };
  }

  const alvo = (alvoBruto || '').trim();
  if (!alvo) return { encontrado: false, motivo: 'Nenhum rótulo informado.', rotulosVisiveis: [] };

  if (document.visibilityState !== 'visible') {
    return {
      encontrado: false,
      motivo: 'A janela do OSONE não está visível na tela agora, então a posição dos elementos dela não serve para clicar.',
      rotulosVisiveis: []
    };
  }

  const { lista, rotulosVisiveis } = candidatos(alvo);
  if (lista.length === 0) {
    return {
      encontrado: false,
      motivo: `Nenhum elemento da interface do OSONE se chama "${alvo}".`,
      rotulosVisiveis
    };
  }

  const melhorPontuacao = lista[0].pontos;
  const empatados = lista.filter(c => c.pontos === melhorPontuacao);
  if (empatados.length > 3) {
    return {
      encontrado: false,
      motivo: `"${alvo}" combina com ${empatados.length} elementos diferentes da interface do OSONE — vago demais para clicar.`,
      rotulosVisiveis,
      ambiguos: empatados.slice(0, 8).map(c => c.rotulo)
    };
  }

  const escolhido = lista[0];
  let traducao = traducaoEstimada();
  const ancoras: Ancora[] = [];
  let movimentos = 0;
  let posicaoDoCursor: PontoNaTela | null = null;

  const semPonteiroNaPagina: ResultadoDaMira = {
    encontrado: false,
    motivo:
      'O cursor foi movido, mas a interface do OSONE não recebeu o ponteiro — ou a janela está atrás de outra, ' +
      'ou o Agente Local está em outra máquina. Sem essa confirmação a posição do elemento não vale como coordenada de clique.',
    rotulosVisiveis
  };

  for (let tentativa = 1; tentativa <= TENTATIVAS_DE_MIRA; tentativa++) {
    // O retângulo é relido a cada volta: passar o mouse por cima pode ter mexido no layout, e uma
    // medição feita antes disso descreveria uma tela que não existe mais.
    const r = retanguloVisivel(escolhido.el);
    if (!r) {
      return {
        encontrado: false,
        motivo: `"${escolhido.rotulo}" deixou de estar visível na interface durante a mira.`,
        rotulosVisiveis
      };
    }

    const centro = centroVisivel(r);
    const observado = await moverEObservar(paraTela(centro, traducao), mover, posicaoDoCursor);
    movimentos++;
    if (!observado) return { encontrado: false, motivo: 'Não foi possível mover o cursor para conferir a posição.', rotulosVisiveis };
    posicaoDoCursor = observado.ficou;

    if (!observado.pagina) {
      if (ancoras.length === 0 && tentativa < TENTATIVAS_DE_MIRA) {
        // O ponteiro não chegar à página pode significar duas coisas: a conta caiu fora da janela,
        // ou a janela não está por cima. O centro da área visível é o ponto com mais chance de cair
        // dentro dela — se nem ele responder, não é erro de conta, e insistir só moveria o cursor
        // à toa no computador de alguém.
        const meio = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const sonda = await moverEObservar(paraTela(meio, traducao), mover, posicaoDoCursor);
        movimentos++;
        if (!sonda) return { encontrado: false, motivo: 'Não foi possível mover o cursor para conferir a posição.', rotulosVisiveis };
        posicaoDoCursor = sonda.ficou;
        if (sonda.pagina) {
          ancoras.push({ tela: sonda.ficou, pagina: sonda.pagina });
          traducao = ajustar(traducao, ancoras);
          continue;
        }
      }
      return semPonteiroNaPagina;
    }

    ancoras.push({ tela: observado.ficou, pagina: observado.pagina });

    if (acertouOAlvo(escolhido.el, observado.pagina)) {
      const escala0a1000 = {
        x: Math.round(((observado.ficou.x - tela.offsetX) / tela.width) * 1000),
        y: Math.round(((observado.ficou.y - tela.offsetY) / tela.height) * 1000)
      };
      return {
        encontrado: true,
        alvo: {
          rotulo: escolhido.rotulo,
          origemDoNome: escolhido.origem,
          pixel: observado.ficou,
          escala0a1000,
          tamanhoPx: {
            largura: Math.round(r.width * traducao.escalaX),
            altura: Math.round(r.height * traducao.escalaY)
          },
          movimentos
        }
      };
    }

    traducao = ajustar(traducao, ancoras);
  }

  return {
    encontrado: false,
    motivo:
      `Depois de ${movimentos} tentativas o ponteiro não parou sobre "${escolhido.rotulo}". ` +
      'A posição na tela não pôde ser confirmada, então nenhuma coordenada é devolvida.',
    rotulosVisiveis
  };
}
