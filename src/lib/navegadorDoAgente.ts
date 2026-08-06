/**
 * COMO ABRIR UM ENDEREÇO NA TELA DO AGENTE — e por que o jeito óbvio não funciona.
 *
 * ====== O BUG QUE ISTO CONSERTA ======
 *
 * Em uso real: a tela do agente ficava PRETA, o relatório dizia "abri" com sucesso, e nenhuma
 * janela aparecia. O agente então concluía — corretamente, pelo que via — que não tinha aberto, e
 * tentava de novo. As "três abas do YouTube" saíram exatamente daí.
 *
 * A causa não é um defeito, é como navegadores funcionam: quando já existe uma instância rodando,
 * um segundo lançamento NÃO abre um navegador novo. Ele ENTREGA o endereço à instância que já
 * está aberta, e ela abre uma aba. Como a instância aberta é a do usuário, na tela dele, a aba
 * nascia lá — e o DISPLAY que passamos não muda nada, porque quem desenha é o processo antigo,
 * que continua onde sempre esteve.
 *
 * ====== A SOLUÇÃO: UM PERFIL PRÓPRIO ======
 *
 * Um perfil separado é o que faz o navegador entender que é OUTRA instância, e não um recado para
 * a que já roda. E o perfil é FIXO, não um por abertura: assim o segundo endereço pedido
 * reaproveita o navegador do agente (abre uma aba nele) em vez de empilhar uma janela nova a cada
 * pedido — que seria trocar o problema das três abas na tela errada pelo das três janelas na certa.
 *
 * Este arquivo é só a decisão: qual navegador, com quais argumentos. Quem lança é o agente local.
 */

/** Um alvo que é endereço de site, e não caminho de arquivo nem nome de programa. */
export function ehEndereco(alvo: string): boolean {
  return /^(https?:\/\/|www\.)/i.test((alvo || '').trim());
}

/** "www.x.com" vira "https://www.x.com"; o resto passa como está. */
export function normalizarEndereco(alvo: string): string {
  const t = (alvo || '').trim();
  return /^www\./i.test(t) ? `https://${t}` : t;
}

/**
 * A pasta do perfil do navegador do agente.
 *
 * Fixa de propósito — ver acima. Fica na pasta temporária do sistema porque é descartável: apagá-la
 * não perde nada do usuário, e ela não deve se misturar com o perfil real dele em hipótese alguma.
 */
export const NOME_DO_PERFIL = 'osone-cowork-navegador';

export interface NavegadorDoAgente {
  bin: string;
  argumentos: (perfil: string, url: string) => string[];
}

/**
 * Os navegadores, em ordem de preferência, com o argumento que força instância própria.
 *
 * Nos derivados do Chrome é '--user-data-dir'. No Firefox o mesmo efeito tem outro nome:
 * '-no-remote' é o que impede o recado para a instância já aberta, e sem ele o '-profile' sozinho
 * não resolve — a chamada ainda seria entregue à que roda na tela do usuário.
 */
export const NAVEGADORES_DO_AGENTE: NavegadorDoAgente[] = [
  { bin: 'google-chrome-stable', argumentos: (p, u) => [`--user-data-dir=${p}`, '--no-first-run', '--no-default-browser-check', u] },
  { bin: 'google-chrome', argumentos: (p, u) => [`--user-data-dir=${p}`, '--no-first-run', '--no-default-browser-check', u] },
  { bin: 'chromium', argumentos: (p, u) => [`--user-data-dir=${p}`, '--no-first-run', '--no-default-browser-check', u] },
  { bin: 'chromium-browser', argumentos: (p, u) => [`--user-data-dir=${p}`, '--no-first-run', '--no-default-browser-check', u] },
  { bin: 'brave-browser', argumentos: (p, u) => [`--user-data-dir=${p}`, '--no-first-run', u] },
  { bin: 'microsoft-edge', argumentos: (p, u) => [`--user-data-dir=${p}`, '--no-first-run', u] },
  { bin: 'firefox', argumentos: (p, u) => ['-no-remote', '-profile', p, '-new-tab', u] }
];

/**
 * Nome de programa é programa, não caminho de arquivo.
 *
 * Sem esta distinção, pedir "google-chrome" virava `xdg-open google-chrome`, que interpreta o texto
 * como caminho relativo e responde "gio: file:///home/usuario/google-chrome: arquivo não
 * encontrado" — mensagem que aponta para o lugar errado e faz parecer que o programa não está
 * instalado, quando ele está no PATH. Foi o que apareceu no relatório de uso.
 */
export function pareceNomeDePrograma(alvo: string): boolean {
  const primeiro = (alvo || '').trim().split(/\s+/)[0];
  return /^[a-zA-Z0-9._-]+$/.test(primeiro) && primeiro.length > 0;
}
