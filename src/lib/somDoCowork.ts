/**
 * O AGENTE FAZ BARULHO ENQUANTO TRABALHA — para você não precisar olhar.
 *
 * O motivo é o relatado em uso: "chega na tela do YouTube e fica tudo em silêncio". Um agente que
 * trabalha sozinho por minutos, numa tela que não é a sua, some. Parado e trabalhando têm
 * exatamente a mesma aparência quando você está noutra aba — e a única forma de saber era voltar
 * a olhar, que é justamente o que a tela separada existe para você não precisar fazer.
 *
 * Cada tipo de ação tem um som PRÓPRIO, e isso não é enfeite: um bipe único diria "algo
 * aconteceu", que é quase tão pouco quanto o silêncio. Alturas diferentes deixam a sequência
 * audível como sequência — dá para perceber, sem olhar, que ele abriu, clicou, digitou, e que
 * agora está parado há tempo demais.
 *
 * ====== POR QUE OS SONS SÃO GERADOS, E NÃO ARQUIVOS ======
 *
 * Nenhum arquivo de áudio, nenhuma rede, nada para carregar: são osciladores. Um pacote de sons
 * embutido pesaria mais do que este arquivo inteiro, e um buscado na rede escolheria a pior hora
 * para falhar — bem quando o agente está no meio de uma tarefa e o silêncio significa outra coisa.
 *
 * ====== O CUIDADO QUE FAZ DIFERENÇA ======
 *
 * Todo som tem subida e descida suaves. Ligar e desligar um oscilador de uma vez produz um
 * estalo — o famoso "clique" —, e um estalo repetido a cada ação de uma tarefa de quarenta ações
 * cansa a ponto de a pessoa desligar o som. Aí ela perde a informação junto.
 */

export type NotaDoCowork =
  | 'inicio'
  | 'abrir'
  | 'clicar'
  | 'digitar'
  | 'tecla'
  | 'rolar'
  | 'trocar_janela'
  | 'esperar'
  | 'olhando'
  | 'captura'
  | 'ensinando'
  | 'falha'
  | 'recusa'
  | 'concluido'
  | 'parado';

interface Toque {
  /** Frequências em Hz, tocadas em sequência. Uma só = bipe; várias = pequena melodia. */
  notas: number[];
  /** Duração de cada nota, em segundos. */
  duracao: number;
  volume: number;
  tipo?: OscillatorType;
}

/**
 * O vocabulário sonoro.
 *
 * As alturas seguem uma lógica que se aprende sem ninguém explicar: sobe quando algo começa ou dá
 * certo, desce quando termina ou falha, e as ações do meio ficam numa faixa média, curtas, cada
 * uma no seu degrau. Depois de uma tarefa você já sabe distinguir um clique de uma digitação.
 */
const TOQUES: Record<NotaDoCowork, Toque> = {
  // Começou: duas notas subindo, o suficiente para ser reconhecido de outra aba.
  inicio: { notas: [523.25, 783.99], duracao: 0.11, volume: 0.16 },

  // As ações do trabalho: curtas e discretas. Elas tocam dezenas de vezes numa tarefa, então
  // qualquer coisa mais longa ou mais alta vira incômodo antes do décimo passo.
  abrir: { notas: [659.25], duracao: 0.09, volume: 0.1 },
  clicar: { notas: [880.0], duracao: 0.05, volume: 0.09 },
  digitar: { notas: [1046.5], duracao: 0.045, volume: 0.07, tipo: 'triangle' },
  tecla: { notas: [987.77], duracao: 0.045, volume: 0.07, tipo: 'triangle' },
  rolar: { notas: [587.33], duracao: 0.06, volume: 0.07, tipo: 'triangle' },
  trocar_janela: { notas: [698.46, 880.0], duracao: 0.06, volume: 0.1 },
  esperar: { notas: [440.0], duracao: 0.07, volume: 0.06, tipo: 'sine' },
  /** Ele está pensando/olhando a tela — o momento em que o silêncio mais parecia travamento. */
  olhando: { notas: [349.23], duracao: 0.04, volume: 0.045, tipo: 'sine' },
  // Obturador curto em duas camadas: deixa inequívoco o instante do frame sem parecer erro.
  captura: { notas: [1250, 820], duracao: 0.035, volume: 0.065, tipo: 'triangle' },
  ensinando: { notas: [440, 554.37, 659.25], duracao: 0.08, volume: 0.12, tipo: 'sine' },

  // Algo saiu errado: grave, para não se confundir com uma ação comum.
  falha: { notas: [311.13, 261.63], duracao: 0.12, volume: 0.14, tipo: 'square' },
  /** Recusa por regra (dinheiro, terminal): precisa soar diferente de uma falha qualquer. */
  recusa: { notas: [415.30, 415.30, 311.13], duracao: 0.1, volume: 0.15, tipo: 'square' },

  // Terminou: acorde subindo, para dar para ouvir do outro lado da casa.
  concluido: { notas: [523.25, 659.25, 783.99, 1046.5], duracao: 0.11, volume: 0.17 },
  // Desligou/parou: desce, e é o contrário exato do som de início.
  parado: { notas: [783.99, 523.25], duracao: 0.13, volume: 0.15 }
};

/** A ação decidida pelo agente vira o som dela; o que não estiver mapeado usa o de clique. */
export function notaDaAcao(acao: string): NotaDoCowork {
  return (acao in TOQUES ? acao : 'clicar') as NotaDoCowork;
}

const CHAVE_DO_SOM = 'osone_cowork_som';

export function somLigado(): boolean {
  try {
    // Ligado por padrão: quem não quer desliga. O contrário faria a função nascer invisível.
    return localStorage.getItem(CHAVE_DO_SOM) !== 'nao';
  } catch {
    return true;
  }
}

export function definirSom(ligado: boolean): void {
  try { localStorage.setItem(CHAVE_DO_SOM, ligado ? 'sim' : 'nao'); } catch { /* só a preferência se perde */ }
}

let contexto: AudioContext | null = null;

/**
 * O contexto de áudio, criado só quando o primeiro som toca.
 *
 * Navegador nenhum deixa tocar áudio antes de a pessoa interagir com a página, e criar o contexto
 * na carga faria ele nascer suspenso e mudo. Criado no primeiro som — que vem de um clique em
 * "Começar" — ele já nasce liberado.
 */
function pegarContexto(): AudioContext | null {
  try {
    const Classe = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Classe) return null;
    if (!contexto) contexto = new Classe();
    if (contexto!.state === 'suspended') contexto!.resume().catch(() => { /* segue mudo */ });
    return contexto;
  } catch {
    return null;
  }
}

/**
 * Toca o som de um acontecimento. Nunca lança, nunca bloqueia.
 *
 * Áudio é acessório: se o navegador recusar, se o contexto não existir, se a placa estiver muda,
 * o agente tem de continuar trabalhando exatamente igual. Um som que derruba uma tarefa seria
 * pior do que nenhum som.
 */
export function tocar(nota: NotaDoCowork): void {
  if (!somLigado()) return;
  const ctx = pegarContexto();
  if (!ctx) return;

  const toque = TOQUES[nota];
  if (!toque) return;

  try {
    const agora = ctx.currentTime;
    toque.notas.forEach((frequencia, i) => {
      const inicio = agora + i * toque.duracao;
      const fim = inicio + toque.duracao;

      const oscilador = ctx.createOscillator();
      oscilador.type = toque.tipo || 'sine';
      oscilador.frequency.setValueAtTime(frequencia, inicio);

      /**
       * A envoltória — subida e descida suaves em vez de liga/desliga.
       *
       * Sem ela cada som estala nas duas pontas. Num relatório de quarenta ações isso vira
       * quarenta estalos, e a pessoa desliga o som — perdendo junto a informação que ele carrega.
       */
      const ganho = ctx.createGain();
      ganho.gain.setValueAtTime(0.0001, inicio);
      ganho.gain.exponentialRampToValueAtTime(toque.volume, inicio + 0.012);
      ganho.gain.exponentialRampToValueAtTime(0.0001, fim);

      oscilador.connect(ganho);
      ganho.connect(ctx.destination);
      oscilador.start(inicio);
      oscilador.stop(fim + 0.02);
    });
  } catch { /* som é acessório: falhar aqui não pode afetar o trabalho */ }
}

/**
 * Um lembrete periódico de que ele CONTINUA trabalhando.
 *
 * Existe para o caso que motivou tudo isto: uma ação demorada (uma página pesada carregando, o
 * modelo pensando) faz o som parar, e som parado é indistinguível de travado. Um toque baixinho
 * de tempos em tempos mantém a diferença audível — e quando ele realmente para, o silêncio passa
 * a significar alguma coisa.
 */
export function baterPonto(intervaloMs: number = 12000): () => void {
  const t = setInterval(() => tocar('olhando'), intervaloMs);
  return () => clearInterval(t);
}
