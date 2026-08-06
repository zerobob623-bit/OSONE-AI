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
 * OSONE COWORK — o agente executa uma sequência inteira sozinho, medindo o tempo entre um passo e
 * o próximo e conferindo, com uma foto nova, se cada ação pegou.
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
 * O CICLO DE CADA PASSO, que é o que o torna capaz de trabalhar sozinho:
 *
 *   executa → ESTIMA quanto aquele tipo de ação costuma demorar nesta máquina → ESPERA a tela
 *   parar de mudar → TIRA UMA FOTO NOVA e confere se a ação pegou → se não pegou, TENTA DE NOVO
 *   (e a estimativa já corrigida entra na tentativa seguinte) → só então vai para o próximo passo.
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
  /** Quantas vezes o passo precisou ser tentado até dar certo (1 = de primeira). */
  tentativas: number;
  erro?: string;
}

export type MotivoDeParada =
  | 'concluido'
  | 'erro-no-passo'
  | 'falhas-seguidas'
  | 'tela-inesperada'
  | 'passo-nao-confirmado'
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
  /**
   * Quantas vezes o MESMO passo é tentado antes de o plano desistir dele.
   *
   * Existe porque a maior parte das falhas de um passo é temporária: a página ainda estava
   * carregando quando o clique saiu, o campo ainda não tinha foco, a janela ainda estava
   * ganhando o primeiro plano. Parar na primeira falha desperdiça um plano inteiro por causa de
   * meio segundo de atraso — e obriga a pessoa a mandar recomeçar, que é justamente a pergunta
   * que este motor existe para não fazer.
   */
  maxTentativasPorPasso: number;
}

export const LIMITES_PADRAO: LimitesDoPlano = {
  maxPassos: 25,
  maxTotalMs: 5 * 60 * 1000,
  maxFalhasSeguidas: 2,
  maxTentativasPorPasso: 3
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

/**
 * As travas de UM passo, isoladas — a peça que todo acionador do motor precisa chamar.
 *
 * Ela vive separada porque existe mais de uma forma de chegar até aqui: o plano escrito de uma vez
 * (validado inteiro, antes de começar) e o agente autônomo, que decide a próxima ação olhando a
 * tela e por isso só tem UM passo para validar de cada vez. Se cada caminho tivesse sua própria
 * checagem, bastaria um deles envelhecer para a regra deixar de valer — e o que envelhece em
 * silêncio é sempre o que deixa passar.
 *
 * O rótulo entra na mensagem no lugar do número do passo: num laço autônomo não existe "passo 3
 * do plano", existe a ação que acabou de ser decidida.
 */
export function validarPasso(passo: PassoDoPlano, rotulo: string = 'A ação'): string | null {
  if (!passo || typeof passo.acao !== 'string' || !passo.acao.trim()) {
    return `${rotulo} não diz qual ação executar.`;
  }
  if (!passo.descricao || !String(passo.descricao).trim()) {
    return `${rotulo} não tem descrição. Cada passo precisa dizer para que serve, porque é isso que o usuário lê enquanto o plano roda.`;
  }
  if (ACOES_FORA_DO_LACO.has(passo.acao)) {
    return `${rotulo} usa '${passo.acao}', que não pode rodar dentro de um plano automático — ações que mexem em arquivos ou rodam comandos precisam da confirmação normal, uma a uma.`;
  }
  const dinheiro = acharMencaoADinheiro(passo);
  if (dinheiro) {
    return `${rotulo} ("${passo.descricao}") envolve dinheiro ("${dinheiro}"), e o OSONE NÃO executa pagamento, compra, transferência ou qualquer movimentação financeira sozinho — nem dentro de um plano, nem fora dele. Leve o usuário até a tela e devolva o controle para ele concluir: quem paga é a pessoa.`;
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
    const problema = validarPasso(passos[i], `O passo ${i + 1}`);
    if (problema) return problema;
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
    const esperado = passo.esperaDaTela ?? (NAO_MEXE_NA_TELA.has(passo.acao) ? 'qualquer' : 'mudar');

    /**
     * CADA PASSO TENTA DE NOVO ANTES DE DESISTIR.
     *
     * A maior parte das falhas de um passo é temporária: a página ainda estava carregando quando o
     * clique saiu, o campo ainda não tinha ganhado foco, a janela ainda estava vindo para a frente.
     * Parar na primeira falha joga fora o plano inteiro por causa de meio segundo de atraso — e
     * obriga a pessoa a mandar recomeçar, que é justamente a pergunta que este motor existe para
     * não fazer.
     *
     * O ciclo de cada tentativa é sempre o mesmo: EXECUTA, ESTIMA quanto essa ação costuma demorar,
     * ESPERA a tela parar de mudar, e OLHA a tela de novo para conferir se a ação pegou. Se não
     * pegou, tenta outra vez — e o que ele aprendeu sobre o tempo dessa ação já entra na tentativa
     * seguinte, então a segunda tentativa não repete a espera curta demais que fez a primeira
     * falhar.
     */
    let tentativa = 0;
    let ultimoErro = '';
    let confirmado = false;
    let resultadoDoPasso: ResultadoDoPasso | null = null;

    while (tentativa < limites.maxTentativasPorPasso && !confirmado) {
      tentativa++;
      if (deps.cancelado?.()) {
        return encerrar('parado-pelo-usuario', `Parado por você no passo ${i + 1} de ${passos.length}.`);
      }

      // A foto do "antes" é tirada a cada tentativa: depois de uma tentativa falha a tela pode ter
      // mudado, e comparar com uma foto velha diria que mudou quando não mudou.
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
        ultimoErro = String(resposta.error);
        resultadoDoPasso = {
          indice: i, descricao: passo.descricao, acao: passo.acao, ok: false,
          duracaoDaAcaoMs, esperaMedidaMs: 0, esperaPrevistaMs: previstoMs,
          telaEstabilizou: false, mudancaDaTela: 0, tentativas: tentativa, erro: ultimoErro
        };
        deps.aoProgredir?.(resultadoDoPasso, passos.length);
        // Antes de repetir, deixa a tela assentar: repetir na hora costuma repetir a mesma falha.
        if (tentativa < limites.maxTentativasPorPasso) {
          await deps.dormir(Math.min(2000, previstoMs));
          assinaturaAtual = await deps.fotografar();
        }
        continue;
      }

      // Estima, espera, e OLHA A TELA DE NOVO — é a foto nova que confirma se a ação pegou.
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

      /**
       * A TELA CONFIRMA O PASSO, e é aqui que o laço deixa de ser cego.
       *
       * Um clique que não muda nada na tela é um clique que não pegou — caiu ao lado do botão, ou a
       * janela nem estava em foco. Sem esta conferência, o passo seguinte seria executado sobre uma
       * tela que não é a que o plano imaginava, e a partir dali cada passo erra em cima do anterior.
       */
      const mudouDemais = esperado === 'permanecer' && mudancaDaTela > 0.08;
      const naoMudou = esperado === 'mudar' && mudancaDaTela < 0.01;
      confirmado = !mudouDemais && !naoMudou;

      resultadoDoPasso = {
        indice: i, descricao: passo.descricao, acao: passo.acao, ok: confirmado,
        duracaoDaAcaoMs, esperaMedidaMs, esperaPrevistaMs: previstoMs,
        telaEstabilizou, mudancaDaTela, tentativas: tentativa,
        erro: confirmado ? undefined : (naoMudou ? 'a tela não mudou depois da ação' : 'a tela mudou quando não devia')
      };
      deps.aoProgredir?.(resultadoDoPasso, passos.length);

      if (!confirmado) {
        ultimoErro = resultadoDoPasso.erro || '';
        // 'permanecer' que mudou não se resolve repetindo: repetir agiria de novo sobre uma tela
        // que já não é a esperada, e a segunda ação erra pior que a primeira.
        if (mudouDemais) break;
      }
    }

    if (resultadoDoPasso) resultados.push(resultadoDoPasso);
    falhasSeguidas = confirmado ? 0 : falhasSeguidas + 1;

    if (!confirmado) {
      const tentou = `depois de ${tentativa} tentativa(s)`;
      if (resultadoDoPasso?.erro === 'a tela mudou quando não devia') {
        return encerrar('tela-inesperada',
          `O passo ${i + 1} ("${passo.descricao}") não deveria mudar a tela, mas ela mudou bastante. ` +
          `Parei aqui: alguma coisa aconteceu fora do previsto no plano.`);
      }
      if (ultimoErro === 'a tela não mudou depois da ação') {
        return encerrar('passo-nao-confirmado',
          `O passo ${i + 1} ("${passo.descricao}") foi executado ${tentou} e a tela não mudou nenhuma vez — ` +
          `o clique não está pegando no alvo. Parei aqui para não continuar em cima de uma tela errada. ` +
          `Olhe a tela, localize o alvo de novo e refaça o plano a partir deste ponto.`);
      }
      if (falhasSeguidas >= limites.maxFalhasSeguidas) {
        return encerrar('falhas-seguidas', `Parei no passo ${i + 1} ("${passo.descricao}") ${tentou}, com falhas em passos seguidos: ${ultimoErro}`);
      }
      return encerrar('erro-no-passo', `O passo ${i + 1} ("${passo.descricao}") falhou ${tentou}: ${ultimoErro}`);
    }
  }

  const somaEspera = resultados.reduce((s, r) => s + r.esperaMedidaMs, 0);
  const repetidos = resultados.filter(r => r.tentativas > 1).length;
  return encerrar('concluido',
    `Plano concluído: ${resultados.length} passo(s) em ${Math.round((deps.agora() - comecouTudo) / 1000)}s, ` +
    `sendo ${Math.round(somaEspera / 1000)}s esperando as telas carregarem` +
    // Passo que precisou repetir é sinal de plano frágil naquele ponto, e vale ser dito mesmo
    // quando tudo deu certo no fim.
    `${repetidos > 0 ? `. ${repetidos} passo(s) precisaram de mais de uma tentativa.` : '.'}`);
}
