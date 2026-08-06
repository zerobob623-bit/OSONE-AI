import { MotivoDeParadaDoAgente } from './agenteAutonomo';

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
}

const CHAVE_DO_HISTORICO = 'osone_cowork_historico';
const MAXIMO_NO_HISTORICO = 20;

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
  try { localStorage.removeItem(CHAVE_DO_HISTORICO); } catch { /* idem */ }
}
