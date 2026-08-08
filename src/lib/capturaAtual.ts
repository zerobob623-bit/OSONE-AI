/** Metadados que provam que uma imagem veio de uma captura nova, e não do cache. */
export interface MetadadosDaCaptura {
  captureId: string;
  requestId: string;
  capturedAt: number;
}

export interface PedidoDeCaptura {
  requestId: string;
  iniciadoEm: number;
  agora?: number;
  ultimoCaptureId?: string | null;
}

/**
 * Uma URL diferente evita o cache; estes checks evitam aceitar até uma resposta antiga que algum
 * proxy tenha devolvido assim mesmo. O horário é criado no agente local DEPOIS de ler o PNG.
 */
export function validarCapturaAtual(dados: any, pedido: PedidoDeCaptura): string | null {
  if (!dados?.image) return 'A captura não trouxe imagem.';
  if (!dados?.captureId || !dados?.requestId || !Number.isFinite(Number(dados?.capturedAt))) {
    return 'O Agente Local não confirmou quando este frame foi capturado.';
  }
  if (dados.requestId !== pedido.requestId) return 'A resposta pertence a outro pedido de captura.';
  if (pedido.ultimoCaptureId && dados.captureId === pedido.ultimoCaptureId) return 'O Agente Local repetiu um frame anterior.';

  const agora = pedido.agora ?? Date.now();
  const capturadaEm = Number(dados.capturedAt);
  // Um segundo de tolerância cobre relógio/ordenação de callbacks; dez segundos no futuro é sempre
  // metadado inválido. Não existe limite superior de duração: uma máquina lenta pode levar tempo
  // para gerar o PNG, mas o timestamp só nasce quando o arquivo atual terminou de ser lido.
  if (capturadaEm < pedido.iniciadoEm - 1000) return 'O frame foi produzido antes deste pedido.';
  if (capturadaEm > agora + 10_000) return 'O horário do frame está no futuro.';
  return null;
}

export function novoIdDeCaptura(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
