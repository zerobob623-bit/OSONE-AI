/** Estado mínimo usado pela geração para não gastar cota depois que o consumidor desconecta. */
export type EstadoDoClienteDoStream = { foiEmbora: boolean };

type RespostaObservavel = {
  writableEnded: boolean;
  on: (evento: 'close', callback: () => void) => unknown;
};

/**
 * Observa a RESPOSTA, não a requisição.
 *
 * No Node atual, `close` na requisição também acontece quando o corpo de um POST termina de chegar
 * normalmente. Já `close` na resposta antes de `writableEnded` significa que a aba foi fechada ou
 * o fetch foi cancelado enquanto o servidor ainda escrevia.
 */
export function acompanharClienteDoStream(resposta: RespostaObservavel): EstadoDoClienteDoStream {
  const estado: EstadoDoClienteDoStream = { foiEmbora: false };
  resposta.on('close', () => {
    if (!resposta.writableEnded) estado.foiEmbora = true;
  });
  return estado;
}
