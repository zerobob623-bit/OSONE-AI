/** Regra de fronteira entre o agente que decide e o computador da pessoa. */
export function validarContextoDeExecucaoDoCowork(contexto: {
  temJanela: boolean;
  areaParalelaLigada: boolean;
}): string | null {
  if (contexto.temJanela || contexto.areaParalelaLigada) return null;
  return 'Esta ação precisa mexer no computador, mas nenhuma janela foi escolhida. ' +
    'Posso continuar apenas pesquisando e lendo páginas, ou você pode escolher uma janela no COWORK.';
}
