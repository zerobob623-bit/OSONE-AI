import type { MotivoDeParadaDoAgente, RelatorioDoAgente, VoltaDoAgente } from './agenteAutonomo';

/**
 * As tarefas que o COWORK já executou, para repetir com um clique.
 *
 * O que é guardado aqui mudou junto com o agente, e a mudança importa. Antes o histórico guardava
 * a LISTA DE PASSOS, porque o plano era escrito uma vez e executado; repetir era reexecutar os
 * mesmos passos. Só que passos gravados envelhecem: o botão mudou de lugar, a página ganhou um
 * aviso de cookies, o site foi redesenhado — e repetir passos velhos numa tela nova é justamente
 * o jeito de errar com confiança.
 *
 * Agora o que se guarda é o OBJETIVO em português. Repetir é pedir a mesma coisa de novo, e o
 * agente decide o caminho olhando a tela de hoje. O que era caro guardar (o plano) deixou de
 * existir; o que valia a pena guardar (o que você quis) é uma linha de texto.
 */

export interface TarefaDoHistorico {
  id: string;
  /** O objetivo, escrito pelo usuário. É isto que "repetir" reenvia. */
  tarefa: string;
  quando: number;
  desfecho: 'concluida' | 'parada' | 'erro';
  /** O resultado em português — inclusive a resposta, quando a tarefa era descobrir algo. */
  detalhe?: string;
  /** Quantas ações o agente precisou. Serve para reconhecer tarefa que ficou cara. */
  voltas?: number;
  /** Em que janela começou, para a pessoa lembrar do contexto. */
  janela?: string;
  /** Houve uma execução concluída cujos alvos semânticos podem orientar a próxima tentativa. */
  aprendida?: boolean;
}

const CHAVE_DO_HISTORICO = 'osone_cowork_historico';
const MAXIMO_NO_HISTORICO = 20;
const CHAVE_DAS_AUTOMACOES = 'osone_cowork_automacoes_v1';

export interface MemoriaDeAutomacao {
  objetivo: string;
  atualizadoEm: number;
  sucessos: number;
  /** Pistas sem coordenadas e sem o conteúdo digitado. Nunca são reproduzidas às cegas. */
  pistas: Array<{ acao: string; descricao: string }>;
}

const normalizarObjetivo = (texto: string) => texto.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');

function lerAutomacoes(): MemoriaDeAutomacao[] {
  try {
    const valor = JSON.parse(localStorage.getItem(CHAVE_DAS_AUTOMACOES) || '[]');
    return Array.isArray(valor) ? valor : [];
  } catch { return []; }
}

/**
 * Converte uma execução bem-sucedida em memória SEM transformar o COWORK num macro gravado.
 * Coordenadas e textos digitados são descartados; senha, token ou mensagem do usuário não entram
 * no armazenamento. Na próxima vez, o modelo recebe só descrições como “clicou no botão Enviar”
 * e continua obrigado a olhar a tela atual antes de cada ação.
 */
function pistaSegura(volta: VoltaDoAgente): { acao: string; descricao: string } | null {
  if (!volta.ok) return null;
  const args = volta.args || {};
  switch (volta.acao) {
    case 'clicar': {
      const alvo = String(args.alvo || '').trim();
      return alvo ? { acao: 'clicar', descricao: `clicar em ${alvo}` } : null;
    }
    case 'abrir': {
      let caminho = String(args.caminho || '').trim();
      try {
        const url = new URL(caminho);
        url.search = ''; url.hash = '';
        caminho = url.toString();
      } catch { /* caminho local fica local; esta memória nunca sai do aparelho */ }
      return caminho ? { acao: 'abrir', descricao: `abrir ${caminho}` } : null;
    }
    case 'trocar_janela': {
      const titulo = String(args.tituloContem || '').trim();
      return titulo ? { acao: 'trocar_janela', descricao: `procurar janela ${titulo}` } : null;
    }
    case 'tecla': {
      const tecla = String(args.tecla || '').trim();
      return tecla ? { acao: 'tecla', descricao: `pressionar ${tecla}` } : null;
    }
    case 'rolar':
      return { acao: 'rolar', descricao: `rolar ${String(args.direcao || 'down')}` };
    case 'digitar':
      return { acao: 'digitar', descricao: 'digitar no campo em foco (conteúdo omitido por privacidade)' };
    default:
      return null;
  }
}

export function aprenderAutomacao(objetivo: string, relatorio: RelatorioDoAgente): boolean {
  if (relatorio.motivo !== 'concluido') return false;
  const pistas = relatorio.voltas.map(pistaSegura).filter(Boolean).slice(0, 24) as MemoriaDeAutomacao['pistas'];
  if (!pistas.length) return false;
  const chave = normalizarObjetivo(objetivo);
  const atuais = lerAutomacoes();
  const anterior = atuais.find(a => normalizarObjetivo(a.objetivo) === chave);
  const memoria: MemoriaDeAutomacao = {
    objetivo: objetivo.trim(), atualizadoEm: Date.now(), sucessos: (anterior?.sucessos || 0) + 1, pistas
  };
  const nova = [memoria, ...atuais.filter(a => normalizarObjetivo(a.objetivo) !== chave)].slice(0, 20);
  try { localStorage.setItem(CHAVE_DAS_AUTOMACOES, JSON.stringify(nova)); } catch { return false; }
  return true;
}

export function pistasDaAutomacao(objetivo: string): string {
  const chave = normalizarObjetivo(objetivo);
  const memoria = lerAutomacoes().find(a => normalizarObjetivo(a.objetivo) === chave);
  if (!memoria?.pistas?.length) return '';
  return [
    `MEMÓRIA DE UMA EXECUÇÃO BEM-SUCEDIDA DESTE OBJETIVO (${memoria.sucessos} vez(es)):`,
    ...memoria.pistas.map((p, i) => `${i + 1}. ${p.descricao}`),
    'Use isto apenas como pista. NÃO repita coordenadas nem ações cegamente: confira a foto atual, adapte o caminho e valide o resultado de cada passo.'
  ].join('\n');
}

/** Traduz o motivo de parada do agente para o desfecho que a lista mostra. */
export function desfechoDoMotivo(motivo: MotivoDeParadaDoAgente | string): TarefaDoHistorico['desfecho'] {
  if (motivo === 'concluido') return 'concluida';
  if (motivo === 'parado-pelo-usuario') return 'parada';
  return 'erro';
}

export function lerHistorico(): TarefaDoHistorico[] {
  try {
    const salvo = localStorage.getItem(CHAVE_DO_HISTORICO);
    const lista = salvo ? JSON.parse(salvo) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function guardarNoHistorico(item: TarefaDoHistorico): TarefaDoHistorico[] {
  const atual = lerHistorico();
  // A mesma tarefa executada de novo sobe para o topo em vez de virar uma segunda linha igual.
  const semRepetida = atual.filter(t => t.tarefa.trim().toLowerCase() !== item.tarefa.trim().toLowerCase());
  const nova = [item, ...semRepetida].slice(0, MAXIMO_NO_HISTORICO);
  try {
    localStorage.setItem(CHAVE_DO_HISTORICO, JSON.stringify(nova));
  } catch { /* histórico é conforto, não pode quebrar a execução */ }
  return nova;
}

export function limparHistorico(): void {
  try {
    localStorage.removeItem(CHAVE_DO_HISTORICO);
    localStorage.removeItem(CHAVE_DAS_AUTOMACOES);
  } catch { /* idem */ }
}
