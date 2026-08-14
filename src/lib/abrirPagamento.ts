/**
 * Leva a pessoa até a página de pagamento sem nunca acusar um bloqueio que não houve.
 *
 * São três ambientes com comportamentos diferentes para a mesma chamada:
 *
 * - **App instalado (Electron):** `setWindowOpenHandler` manda o link para o navegador do sistema
 *   e responde `{ action: 'deny' }`, o que faz `window.open` devolver `null`. Aqui `null` é
 *   sucesso — o Checkout já abriu. Tratar isso como falha avisava o cliente que o pagamento tinha
 *   sido bloqueado no exato instante em que ele abria, e a compra morria aí.
 * - **Site e APK:** o `window.open` acontece depois do `await` da chamada ao `/checkout`, sem o
 *   gesto do clique ainda válido, então os bloqueadores de pop-up barram de verdade. Navegar a
 *   própria aba é o caminho que a Stripe recomenda e que nenhum bloqueador impede; a URL de
 *   retorno traz a pessoa de volta com `?billing=success`.
 * - **Navegador que permitiu o pop-up:** mantém o app aberto atrás, como sempre foi.
 */
export type ResultadoDePagamento = 'aba-nova' | 'navegador-do-sistema' | 'mesma-aba';

export interface AmbienteDePagamento {
  userAgent: string;
  abrirAba: (url: string) => { opener: unknown } | null;
  navegarNaAba: (url: string) => void;
}

export function abrirPagamento(url: string, ambiente: AmbienteDePagamento): ResultadoDePagamento {
  const appInstalado = /electron/i.test(ambiente.userAgent);
  const janela = ambiente.abrirAba(url);
  if (janela) {
    // A página de pagamento nunca deve poder mexer na janela que a abriu.
    janela.opener = null;
    return 'aba-nova';
  }
  if (appInstalado) return 'navegador-do-sistema';
  ambiente.navegarNaAba(url);
  return 'mesma-aba';
}

export function ambienteDoNavegador(): AmbienteDePagamento {
  return {
    userAgent: navigator.userAgent,
    abrirAba: url => window.open(url, '_blank'),
    navegarNaAba: url => window.location.assign(url)
  };
}
