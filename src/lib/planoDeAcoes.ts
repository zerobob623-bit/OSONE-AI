import {
  AssinaturaDaTela,
  DependenciasDaEspera,
  HistoricoDeEsperas,
  diferencaEntreTelas,
  esperarTelaParar,
  historicoVazio,
  previsaoDeEspera,
  registrarMedicao
} from './esperarTela';

/**
 * O PLANO: o agente executa uma sequência inteira sozinho, medindo o tempo entre um passo e o
 * próximo.
 *
 * O que existia antes: cada clique era uma ida e volta ao modelo. Ele pedia uma captura, esperava,
 * pedia para localizar, esperava, pedia o clique, esperava — e a cada volta a conversa parava para
 * ele decidir o passo seguinte. Uma tarefa de dez cliques virava dez rodadas completas, lentas e
 * caras, e no meio delas o usuário era consultado a cada dúvida.
 *
 * O que muda: o modelo escreve o plano UMA vez, e o motor executa a sequência inteira. Entre um
 * passo e o outro, o motor espera a tela parar de mudar (esperarTela.ts) em vez de chutar um tempo
 * fixo, e guarda quanto cada tipo de passo levou de verdade — a próxima ação do mesmo tipo já
 * começa a olhar no tempo certo.
 *
 * ONDE ISSO PRECISA PARAR, que é a parte que importa mais do que a automação em si:
 *
 * Um laço que clica sozinho no computador de alguém não pode ter só o caminho feliz. Um plano
 * escrito com uma suposição errada não erra uma vez: erra em laço, rápido, e cada erro muda a tela
 * de um jeito que o passo seguinte não previu. Por isso o motor para sozinho em cinco situações —
 * teto de passos, teto de tempo, falhas seguidas, tela que não corresponde ao esperado, e o botão
 * de parar do usuário — e cada parada volta com o motivo escrito, não com um silêncio.
 *
 * O que ele NÃO faz: decidir sozinho o que não estava no plano. Se a tela não bate com o que o
 * passo esperava, ele para e devolve o que viu, para o modelo replanejar com informação real. Um
 * agente que improvisa no meio de um laço automático é um agente que erra sem testemunha.
 */

export interface PassoDoPlano {
  /** O que executar: o mesmo vocabulário de 'controlar_pc' (clicar, digitar, abrir, tecla...). */
  acao: string;
  /** Argumentos da ação, iguais aos que o modelo já usa hoje. */
  args?: Record<string, any>;
  /** Para que serve este passo, em português — é o que aparece no painel e no relatório. */
  descricao: string;
  /**
   * O que se espera que aconteça com a tela depois deste passo.
   *
   * 'mudar' é o caso normal: um clique que não muda nada na tela é um clique que não pegou, e
   * seguir adiante nesse estado é o começo de uma sequência inteira errada.
   * 'permanecer' serve para passos que não devem alterar a tela (mover o mouse, por exemplo).
   * 'qualquer' desliga a checagem, para quando não dá para prever.
   */
  esperaDaTela?: 'mudar' | 'permanecer' | 'qualquer';
}

export interface ResultadoDoPasso {
  indice: number;
  descricao: string;
  acao: string;
  ok: boolean;
  /** Tempo da ação em si (a ida ao agente local). */
  duracaoDaAcaoMs: number;
  /** Tempo até a tela parar de mudar depois da ação. */
  esperaMedidaMs: number;
  /** O que o motor previa antes de medir — a prova de que a previsão está melhorando. */
  esperaPrevistaMs: number;
  /** A tela chegou a parar, ou o prazo estourou com ela ainda mexendo? */
  telaEstabilizou: boolean;
  /** Quanto a tela mudou entre antes e depois do passo, de 0 a 1. */
  mudancaDaTela: number;
  erro?: string;
}

export type MotivoDeParada =
  | 'concluido'
  | 'erro-no-passo'
  | 'falhas-seguidas'
  | 'tela-inesperada'
  | 'teto-de-passos'
  | 'teto-de-tempo'
  | 'parado-pelo-usuario';

export interface RelatorioDoPlano {
  motivo: MotivoDeParada;
  /** Em português, para o modelo contar ao usuário e para o painel mostrar. */
  resumo: string;
  passos: ResultadoDoPasso[];
  passosExecutados: number;
  totalDePassos: number;
  duracaoTotalMs: number;
  /** O histórico atualizado, para a próxima execução já começar calibrada. */
  historico: HistoricoDeEsperas;
}

export interface LimitesDoPlano {
  /** Teto de passos numa execução. Um plano maior que isto é sinal de plano mal feito. */
  maxPassos: number;
  /** Teto de tempo total. Protege contra uma tela que nunca para de mudar. */
  maxTotalMs: number;
  /** Quantas falhas seguidas antes de desistir. */
  maxFalhasSeguidas: number;
}

export const LIMITES_PADRAO: LimitesDoPlano = {
  maxPassos: 25,
  maxTotalMs: 5 * 60 * 1000,
  maxFalhasSeguidas: 2
};

export interface DependenciasDoPlano extends DependenciasDaEspera {
  /** Executa uma ação no computador e devolve o resultado (ou { error }). */
  executar: (acao: string, args: Record<string, any>) => Promise<any>;
  /** Chamado a cada mudança de estado, para o painel acompanhar ao vivo. */
  aoProgredir?: (passo: ResultadoDoPasso, total: number) => void;
}

/**
 * Ações que mexem em arquivo ou rodam comando não entram num laço automático.
 *
 * O laço existe para navegar por telas — clicar, digitar, rolar. Apagar arquivo e rodar comando de
 * terminal são de outra natureza: erram de forma que não dá para desfazer olhando a tela depois.
 * Elas continuam disponíveis pelo caminho normal, onde passam pela confirmação que já existe.
 */
const ACOES_FORA_DO_LACO = new Set(['apagar', 'terminal', 'mover', 'escrever_arquivo', 'renomear']);

/**
 * DINHEIRO NÃO ENTRA NO LAÇO AUTOMÁTICO. Nunca, por nenhum motivo.
 *
 * Todo o resto que este motor faz é reversível olhando a tela: um clique errado abre a janela
 * errada, e o passo seguinte corrige. Pagamento não é assim — ele sai do computador, chega a outra
 * pessoa e não volta com um Ctrl+Z. É a única categoria em que um erro do laço custa dinheiro de
 * verdade, de alguém, e por isso ela fica fora por regra, e não por bom senso do modelo na hora.
 *
 * O que a lista pega: o que o plano DECLARA. Um passo escrito como "clicar em Finalizar compra" é
 * recusado aqui. Um passo escrito como "clicar no botão azul" que por acaso seja o de pagar não é
 * — nenhuma lista de palavras resolve isso. Por isso ela não é a única defesa: a checagem de tela
 * para o laço a cada passo que não muda o que devia, o teto de passos é baixo, e a instrução ao
 * modelo manda devolver o controle ao usuário em qualquer tela de pagamento. A garantia forte é
 * essa — quem paga é a pessoa, não o agente.
 */
const PALAVRAS_DE_DINHEIRO = [
  'pagar', 'pagamento', 'pagto', 'checkout', 'finalizar compra', 'finalizar pedido',
  'comprar', 'compra', 'carrinho', 'assinar plano', 'assinatura', 'renovar plano',
  'cartao', 'cartão', 'credito', 'crédito', 'debito', 'débito', 'cvv', 'cvc',
  'pix', 'boleto', 'transferir', 'transferencia', 'transferência', 'ted', 'doc',
  'banco', 'bancaria', 'bancária', 'saldo', 'extrato', 'fatura', 'cobranca', 'cobrança',
  'paypal', 'mercado pago', 'picpay', 'nubank', 'stripe', 'wallet', 'carteira',
  'saque', 'sacar', 'depositar', 'deposito', 'depósito', 'investir', 'corretora'
];

const semAcentoSimples = (t: string) =>
  (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Devolve a palavra encontrada, ou null. Olha a descrição E os argumentos do passo. */
export function acharMencaoADinheiro(passo: PassoDoPlano): string | null {
  const texto = semAcentoSimples(
    [passo.descricao, JSON.stringify(passo.args || {})].join(' ')
  );
  for (const palavra of PALAVRAS_DE_DINHEIRO) {
    const alvo = semAcentoSimples(palavra);
    // Fronteira de palavra para 'ted'/'doc' não casarem dentro de outras palavras.
    const re = new RegExp(`(^|[^a-z0-9])${alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
    if (re.test(texto)) return palavra;
  }
  return null;
}

export function validarPlano(passos: PassoDoPlano[], limites: LimitesDoPlano = LIMITES_PADRAO): string | null {
  if (!Array.isArray(passos) || passos.length === 0) {
    return 'O plano está vazio. Descreva os passos antes de executar.';
  }
  if (passos.length > limites.maxPassos) {
    return `O plano tem ${passos.length} passos, acima do teto de ${limites.maxPassos}. Divida em partes menores e execute uma de cada vez.`;
  }
  for (let i = 0; i < passos.length; i++) {
    const p = passos[i];
    if (!p || typeof p.acao !== 'string' || !p.acao.trim()) {
      return `O passo ${i + 1} não diz qual ação executar.`;
    }
    if (!p.descricao || !String(p.descricao).trim()) {
      return `O passo ${i + 1} não tem descrição. Cada passo precisa dizer para que serve, porque é isso que o usuário lê enquanto o plano roda.`;
    }
    if (ACOES_FORA_DO_LACO.has(p.acao)) {
      return `O passo ${i + 1} usa '${p.acao}', que não pode rodar dentro de um plano automático — ações que mexem em arquivos ou rodam comandos precisam da confirmação normal, uma a uma.`;
    }
    const dinheiro = acharMencaoADinheiro(p);
    if (dinheiro) {
      return `O passo ${i + 1} ("${p.descricao}") envolve dinheiro ("${dinheiro}"), e o OSONE NÃO executa pagamento, compra, transferência ou qualquer movimentação financeira sozinho — nem dentro de um plano, nem fora dele. Leve o usuário até a tela e devolva o controle para ele concluir: quem paga é a pessoa.`;
    }
  }
  return null;
}

/** Só faz sentido esperar a tela parar depois de ações que mexem na tela. */
const NAO_MEXE_NA_TELA = new Set(['mover_mouse', 'capturar_tela', 'localizar', 'achar_texto', 'listar', 'status', 'checar_sistema']);

/**
 * Executa o plano inteiro, medindo cada espera e parando sozinho quando algo sai do previsto.
 */
export async function executarPlano(
  passos: PassoDoPlano[],
  deps: DependenciasDoPlano,
  opcoes: { limites?: LimitesDoPlano; historico?: HistoricoDeEsperas } = {}
): Promise<RelatorioDoPlano> {
  const limites = opcoes.limites ?? LIMITES_PADRAO;
  let historico = opcoes.historico ?? historicoVazio();

  const comecouTudo = deps.agora();
  const resultados: ResultadoDoPasso[] = [];
  let falhasSeguidas = 0;

  const encerrar = (motivo: MotivoDeParada, resumo: string): RelatorioDoPlano => ({
    motivo,
    resumo,
    passos: resultados,
    passosExecutados: resultados.length,
    totalDePassos: passos.length,
    duracaoTotalMs: deps.agora() - comecouTudo,
    historico
  });

  let assinaturaAtual: AssinaturaDaTela | null = await deps.fotografar();

  for (let i = 0; i < passos.length; i++) {
    if (deps.cancelado?.()) {
      return encerrar('parado-pelo-usuario', `Parado por você no passo ${i + 1} de ${passos.length}. Nada além disso foi executado.`);
    }
    if (deps.agora() - comecouTudo > limites.maxTotalMs) {
      return encerrar('teto-de-tempo', `O plano passou de ${Math.round(limites.maxTotalMs / 1000)}s e foi interrompido no passo ${i + 1} de ${passos.length}, por segurança.`);
    }

    const passo = passos[i];
    const assinaturaAntes = assinaturaAtual;
    const previstoMs = previsaoDeEspera(historico, passo.acao);

    const comecouAcao = deps.agora();
    let resposta: any;
    try {
      resposta = await deps.executar(passo.acao, passo.args || {});
    } catch (err: any) {
      resposta = { error: err?.message || String(err) };
    }
    const duracaoDaAcaoMs = deps.agora() - comecouAcao;

    if (resposta?.error) {
      falhasSeguidas++;
      const r: ResultadoDoPasso = {
        indice: i, descricao: passo.descricao, acao: passo.acao, ok: false,
        duracaoDaAcaoMs, esperaMedidaMs: 0, esperaPrevistaMs: previstoMs,
        telaEstabilizou: false, mudancaDaTela: 0, erro: String(resposta.error)
      };
      resultados.push(r);
      deps.aoProgredir?.(r, passos.length);

      if (falhasSeguidas >= limites.maxFalhasSeguidas) {
        return encerrar('falhas-seguidas', `Parei no passo ${i + 1} ("${passo.descricao}") depois de ${falhasSeguidas} falhas seguidas: ${resposta.error}`);
      }
      return encerrar('erro-no-passo', `O passo ${i + 1} ("${passo.descricao}") falhou: ${resposta.error}`);
    }

    falhasSeguidas = 0;

    // Passo que não mexe na tela não tem por que esperar tela nenhuma.
    let esperaMedidaMs = 0;
    let telaEstabilizou = true;
    if (!NAO_MEXE_NA_TELA.has(passo.acao)) {
      const espera = await esperarTelaParar(deps, { previsaoMs: previstoMs, assinaturaAnterior: assinaturaAntes });
      esperaMedidaMs = espera.medidoMs;
      telaEstabilizou = espera.estabilizou;
      assinaturaAtual = espera.assinaturaFinal;
      // Só medição de tela que realmente parou entra no histórico: um prazo estourado mede o
      // prazo, e não a ação, e envenenaria a previsão de todas as próximas.
      if (espera.estabilizou) historico = registrarMedicao(historico, passo.acao, espera.medidoMs);
    } else {
      assinaturaAtual = await deps.fotografar();
    }

    const mudancaDaTela = diferencaEntreTelas(assinaturaAntes, assinaturaAtual);
    const r: ResultadoDoPasso = {
      indice: i, descricao: passo.descricao, acao: passo.acao, ok: true,
      duracaoDaAcaoMs, esperaMedidaMs, esperaPrevistaMs: previstoMs,
      telaEstabilizou, mudancaDaTela
    };
    resultados.push(r);
    deps.aoProgredir?.(r, passos.length);

    /**
     * A TELA CONFIRMA O PASSO, e é aqui que o laço deixa de ser cego.
     *
     * Um clique que não muda nada na tela é um clique que não pegou — caiu ao lado do botão, ou a
     * janela nem estava em foco. Sem esta checagem, o passo seguinte seria executado sobre uma tela
     * que não é a que o plano imaginava, e a partir dali cada passo erra em cima do erro anterior.
     * Parar e devolver o que se viu é o que permite ao modelo replanejar com informação real.
     */
    const esperado = passo.esperaDaTela ?? (NAO_MEXE_NA_TELA.has(passo.acao) ? 'qualquer' : 'mudar');
    if (esperado === 'mudar' && mudancaDaTela < 0.01) {
      return encerrar('tela-inesperada',
        `O passo ${i + 1} ("${passo.descricao}") foi executado, mas a tela não mudou — provavelmente o clique não pegou no alvo. ` +
        `Parei aqui para não continuar em cima de uma tela errada. Olhe a tela e refaça o plano a partir deste ponto.`);
    }
    if (esperado === 'permanecer' && mudancaDaTela > 0.08) {
      return encerrar('tela-inesperada',
        `O passo ${i + 1} ("${passo.descricao}") não deveria mudar a tela, mas ela mudou bastante. ` +
        `Parei aqui: alguma coisa aconteceu fora do previsto no plano.`);
    }
  }

  const somaEspera = resultados.reduce((s, r) => s + r.esperaMedidaMs, 0);
  return encerrar('concluido',
    `Plano concluído: ${resultados.length} passo(s) em ${Math.round((deps.agora() - comecouTudo) / 1000)}s, ` +
    `sendo ${Math.round(somaEspera / 1000)}s esperando as telas carregarem.`);
}
