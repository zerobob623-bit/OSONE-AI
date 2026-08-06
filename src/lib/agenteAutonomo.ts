import { PassoDoPlano, validarPasso, LIMITES_PADRAO, LimitesDoPlano } from './planoDeAcoes';
import {
  AssinaturaDaTela, DependenciasDaEspera, HistoricoDeEsperas,
  diferencaEntreTelas, esperarTelaParar, historicoVazio, previsaoDeEspera, registrarMedicao
} from './esperarTela';

/**
 * O AGENTE QUE DECIDE OLHANDO, EM VEZ DE SEGUIR UM ROTEIRO.
 *
 * ====== O QUE ESTAVA ERRADO NO PLANO ESCRITO DE UMA VEZ ======
 *
 * O motor anterior (planoDeAcoes.ts) executa uma lista de passos escrita ANTES de começar. Isso
 * funciona quando a tarefa é conhecida e a tela é previsível, e falha exatamente onde as tarefas
 * de verdade vivem: quem escreve o plano não está vendo a tela em que ele vai rodar. Um passo que
 * falta — um botão de "aceitar cookies", um login que apareceu, uma aba que abriu em outro lugar —
 * não é um contratempo raro, é o caso normal. E como o plano é fixo, faltando um passo a tarefa
 * não termina: ela para no meio, tendo feito metade, e a pessoa precisa pedir tudo de novo.
 *
 * Foi o que aconteceu ao pedir a análise do gráfico de um canal: o plano previu abrir e procurar,
 * a tela real pediu outra coisa no meio, e a resposta foi "não achei".
 *
 * ====== O QUE ESTE ARQUIVO FAZ NO LUGAR ======
 *
 * Nenhum passo é escrito de antemão. O laço é:
 *
 *     OLHA a janela  →  DECIDE a próxima ação (com a foto à frente)  →  EXECUTA  →  OLHA de novo
 *
 * A cada volta, o modelo recebe a foto ATUAL, o objetivo e o que já foi feito, e diz uma única
 * coisa: a próxima ação. Se a tela mudou de um jeito que ninguém previu, ele vê e decide de novo —
 * o replanejamento não é um mecanismo à parte, é a consequência de decidir sempre olhando. Se
 * apareceu um pedido de login, ele vê o pedido de login. Se o botão está noutro lugar, ele vê onde
 * está.
 *
 * ====== POR QUE ISSO NÃO É UM LAÇO SOLTO ======
 *
 * Um agente que decide sozinho no computador de alguém precisa de mais freios do que um que segue
 * roteiro, e não de menos. Os mesmos cinco pontos de parada continuam valendo — teto de passos,
 * teto de tempo, falhas seguidas, botão de parar e ação recusada — e a validação de cada ação é a
 * MESMA função que o plano fixo usa (validarPasso, em planoDeAcoes.ts), chamada aqui a cada volta.
 * Dinheiro continua fora, por regra e não por bom senso do modelo na hora.
 *
 * Há um freio a mais, que só existe porque aqui o modelo decide: a repetição. Um agente que decide
 * olhando pode entrar num ciclo — clica, não muda nada, decide clicar de novo, para sempre. Três
 * decisões iguais seguidas sem a tela mudar encerram o laço, porque a essa altura ele não está
 * trabalhando, está preso.
 */

/** O que o agente pode fazer. Deliberadamente pequeno: cada verbo a mais é uma escolha a errar. */
export const ACOES_DO_AGENTE = [
  'abrir', 'clicar', 'digitar', 'tecla', 'rolar', 'esperar', 'trocar_janela', 'concluir', 'desistir'
] as const;
export type AcaoDoAgente = typeof ACOES_DO_AGENTE[number];

export interface DecisaoDoAgente {
  /** Por que esta ação agora, em português. É o que aparece no relatório ao vivo. */
  pensamento: string;
  acao: AcaoDoAgente | string;
  args: Record<string, any>;
  /** O que se espera da tela depois. Herdado do motor antigo: um clique que não muda nada falhou. */
  esperaDaTela?: 'mudar' | 'permanecer' | 'qualquer';
}

export interface VoltaDoAgente {
  indice: number;
  pensamento: string;
  acao: string;
  args: Record<string, any>;
  ok: boolean;
  /** O texto que o usuário lê nesta linha do relatório. */
  relato: string;
  erro?: string;
  duracaoMs: number;
  mudancaDaTela: number;
  /** A foto da janela DEPOIS desta volta, para o relatório poder mostrar o que ele viu. */
  foto?: string;
}

export type MotivoDeParadaDoAgente =
  | 'concluido'
  | 'desistiu'
  | 'teto-de-voltas'
  | 'teto-de-tempo'
  | 'falhas-seguidas'
  | 'repeticao'
  | 'acao-recusada'
  | 'sem-decisao'
  | 'parado-pelo-usuario';

export interface RelatorioDoAgente {
  motivo: MotivoDeParadaDoAgente;
  /** O resultado em português — inclusive a RESPOSTA, quando a tarefa era descobrir algo. */
  resumo: string;
  voltas: VoltaDoAgente[];
  duracaoTotalMs: number;
  historico: HistoricoDeEsperas;
}

export interface LimitesDoAgente extends LimitesDoPlano {
  /** Quantas decisões iguais seguidas, sem a tela mudar, antes de considerar que travou. */
  maxRepeticoes: number;
}

export const LIMITES_DO_AGENTE: LimitesDoAgente = {
  ...LIMITES_PADRAO,
  // Mais alto que o do plano fixo: aqui cada volta é um passo pequeno decidido na hora, e uma
  // tarefa real ("abre o canal, entra em análises, lê o gráfico") gasta mais voltas do que um
  // plano escrito por alguém que já sabia o caminho.
  maxPassos: 40,
  maxTotalMs: 8 * 60 * 1000,
  maxRepeticoes: 3
};

/**
 * A instrução do agente.
 *
 * Ela é escrita para UMA decisão por vez, e não para um plano: pedir um plano aqui reintroduziria
 * exatamente o problema que este arquivo existe para resolver.
 */
export const INSTRUCAO_DO_AGENTE = `Você é o OSONE COWORK operando o computador do usuário. A cada rodada você RECEBE UMA FOTO da janela em que está trabalhando e decide UMA ÚNICA próxima ação. Você não escreve plano: você olha e age, uma ação de cada vez, até a tarefa estar feita.

RESPONDA APENAS UM OBJETO JSON, nada mais:
{ "pensamento": "o que estou vendo e por que esta ação agora", "acao": "clicar", "args": { "alvo": "o botão Análises no menu da esquerda" }, "esperaDaTela": "mudar" }

AÇÕES:
- "abrir" { "caminho": "..." } — abre um programa, arquivo, pasta ou ENDEREÇO DE SITE. É assim que você chega onde precisa: prefira abrir o endereço direto (ex: "https://studio.youtube.com") a navegar clicando de tela em tela.
- "clicar" { "alvo": "descrição do que clicar" } — NUNCA passe x/y. Descreva o alvo como você o vê na foto ("o botão azul Entrar", "a aba Análises"); a posição é medida na hora.
- "digitar" { "texto": "..." } — digita no campo que está em foco. Clique no campo antes.
- "tecla" { "tecla": "enter" } — teclas nomeadas: enter, tab, escape, backspace, delete, arrowup/down/left/right, home, end, pageup, pagedown. Aceita "modificadores": ["ctrl"].
- "rolar" { "direcao": "down", "quantidade": 3 } — rola a página.
- "esperar" { "segundos": 3 } — só quando a tela ainda está claramente carregando.
- "trocar_janela" { "tituloContem": "parte do título" } — muda a janela em que você trabalha. Use depois de abrir algo novo, para passar a olhar a janela certa.
- "concluir" { "resposta": "..." } — a tarefa está feita. Em "resposta", escreva o RESULTADO para o usuário: se ele pediu uma informação (um número, uma análise, o que apareceu no gráfico), a resposta é essa informação, escrita por extenso, lida da tela.
- "desistir" { "motivo": "..." } — só quando não há como prosseguir. Diga o que impede.

REGRAS:
- "pensamento" é obrigatório e em português: diga o que você ESTÁ VENDO na foto e por que age assim. É o que o usuário lê enquanto você trabalha.
- OLHE A FOTO ANTES DE DECIDIR. Não repita a ação anterior se a tela não mudou — se não mudou, o que você tentou não funcionou; tente outro caminho.
- Se aparecer algo que não estava previsto (aviso de cookies, login, pop-up, atualização), RESOLVA e siga. É para isso que você decide olhando.
- Se a tarefa era descobrir/analisar algo, você só termina depois de LER na tela o que foi pedido. Concluir sem a informação é não ter feito a tarefa.
- "esperaDaTela": "mudar" no caso normal, "qualquer" quando não dá para prever.
- NÃO existem ações de arquivo nem de terminal aqui (apagar, mover, renomear, escrever_arquivo, terminal): elas exigem confirmação uma a uma e não entram em laço automático.
- DINHEIRO NUNCA: pagamento, compra, PIX, transferência, boleto, cartão, assinatura ou saque. Chegando numa tela dessas, use "desistir" explicando que o usuário conclui essa parte. Quem paga é a pessoa.`;

/** Tira a cerca de markdown que o modelo às vezes põe ao redor do JSON. */
function limparCerca(texto: string): string {
  const t = (texto || '').trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```[a-zA-Z]*\r?\n?/, '').replace(/```\s*$/, '').trim();
}

/** Acha o objeto JSON dentro de um texto que veio com conversa em volta. */
function extrairObjeto(texto: string): any | null {
  const limpo = limparCerca(texto);
  try { return JSON.parse(limpo); } catch { /* segue e tenta achar o objeto no meio */ }
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio === -1 || fim <= inicio) return null;
  try { return JSON.parse(limpo.slice(inicio, fim + 1)); } catch { return null; }
}

export interface LeituraDaDecisao {
  decisao?: DecisaoDoAgente;
  /** Preenchido quando a resposta não deu para usar; o texto explica o quê, em português. */
  problema?: string;
}

/**
 * Lê a resposta do modelo e devolve a decisão — ou o motivo de não dar para usá-la.
 *
 * Nenhum caminho devolve "deu erro" sem dizer o quê: uma decisão descartada precisa aparecer no
 * relatório com o motivo, senão o agente parece ter parado por conta própria.
 */
export function lerDecisao(respostaDoModelo: string): LeituraDaDecisao {
  if (!respostaDoModelo || !respostaDoModelo.trim()) {
    return { problema: 'O modelo respondeu vazio ao olhar a tela.' };
  }
  const bruto = extrairObjeto(respostaDoModelo);
  if (!bruto || typeof bruto !== 'object') {
    return { problema: 'O modelo não respondeu no formato esperado ao decidir a próxima ação.' };
  }

  const acao = String(bruto.acao || '').trim();
  if (!acao) return { problema: 'O modelo não disse qual ação executar.' };

  const pensamento = String(bruto.pensamento || '').trim();
  if (!pensamento) {
    return { problema: `O modelo decidiu '${acao}' sem dizer por quê, e uma ação sem explicação não é executada — é o que o usuário lê enquanto o agente trabalha.` };
  }

  return {
    decisao: {
      pensamento,
      acao,
      args: (bruto.args && typeof bruto.args === 'object') ? bruto.args : {},
      esperaDaTela: ['mudar', 'permanecer', 'qualquer'].includes(bruto.esperaDaTela) ? bruto.esperaDaTela : 'mudar'
    }
  };
}

/** Ações que terminam o trabalho em vez de mexer no computador. */
const ACOES_QUE_ENCERRAM = new Set(['concluir', 'desistir']);
/** Ações que não tocam no computador — não passam pela validação de dinheiro/arquivo. */
const ACOES_INTERNAS = new Set(['esperar', 'trocar_janela', 'concluir', 'desistir']);

/**
 * A decisão vira um passo no vocabulário do motor, para ser validada pelas MESMAS regras.
 *
 * O 'pensamento' entra como descrição de propósito: é o texto que a busca por menção a dinheiro
 * examina, e é o que o usuário lê. Uma decisão sem propósito escrito não passaria pela validação.
 */
function comoPasso(decisao: DecisaoDoAgente): PassoDoPlano {
  return {
    acao: decisao.acao,
    args: decisao.args,
    descricao: decisao.pensamento,
    esperaDaTela: decisao.esperaDaTela
  };
}

export interface DependenciasDoAgente extends DependenciasDaEspera {
  /** Executa uma ação no computador e devolve o resultado (ou { error }). */
  executar: (acao: string, args: Record<string, any>) => Promise<any>;
  /** Tira a foto da janela em que se está trabalhando, em data URL. */
  fotografarJanela: () => Promise<string | null>;
  /** Passa a trabalhar noutra janela. Devolve o título da nova, ou { error }. */
  trocarJanela: (tituloContem: string) => Promise<{ titulo?: string; error?: string }>;
  /**
   * Pergunta ao modelo qual a próxima ação, dando a foto atual e o histórico.
   * Devolve o texto cru da resposta — a leitura acontece aqui, em lerDecisao.
   */
  decidir: (objetivo: string, foto: string | null, historico: VoltaDoAgente[]) => Promise<string>;
  /** Chamado a cada volta, para o relatório ao vivo. */
  aoProgredir?: (volta: VoltaDoAgente) => void;
}

/**
 * O laço: olhar, decidir, agir, olhar de novo — até terminar ou até um dos freios pegar.
 */
export async function trabalharAteConcluir(
  objetivo: string,
  deps: DependenciasDoAgente,
  opcoes: { limites?: LimitesDoAgente; historicoDeEsperas?: HistoricoDeEsperas } = {}
): Promise<RelatorioDoAgente> {
  const limites = opcoes.limites ?? LIMITES_DO_AGENTE;
  let historico = opcoes.historicoDeEsperas ?? historicoVazio();

  const comecou = deps.agora();
  const voltas: VoltaDoAgente[] = [];
  let falhasSeguidas = 0;
  let repeticoes = 0;
  let assinaturaDaDecisaoAnterior = '';

  const encerrar = (motivo: MotivoDeParadaDoAgente, resumo: string): RelatorioDoAgente => ({
    motivo, resumo, voltas, duracaoTotalMs: deps.agora() - comecou, historico
  });

  const registrar = (v: VoltaDoAgente) => {
    voltas.push(v);
    deps.aoProgredir?.(v);
  };

  let assinaturaDaTela: AssinaturaDaTela | null = await deps.fotografar();

  for (let i = 0; i < limites.maxPassos; i++) {
    if (deps.cancelado?.()) {
      return encerrar('parado-pelo-usuario', `Parado por você depois de ${voltas.length} ação(ões). Nada além disso foi executado.`);
    }
    if (deps.agora() - comecou > limites.maxTotalMs) {
      return encerrar('teto-de-tempo',
        `Passei de ${Math.round(limites.maxTotalMs / 60000)} minutos trabalhando nisto e parei por segurança, depois de ${voltas.length} ação(ões). ` +
        `Diga o que falta e eu retomo de onde parou.`);
    }

    const comecouAVolta = deps.agora();
    const foto = await deps.fotografarJanela();

    // ====== DECIDIR, COM A FOTO À FRENTE ======
    let textoDaDecisao = '';
    try {
      textoDaDecisao = await deps.decidir(objetivo, foto, voltas);
    } catch (err: any) {
      return encerrar('sem-decisao', `Não consegui falar com o modelo para decidir a próxima ação: ${err?.message || err}`);
    }

    const { decisao, problema } = lerDecisao(textoDaDecisao);
    if (!decisao) {
      falhasSeguidas++;
      registrar({
        indice: i, pensamento: '(sem decisão legível)', acao: '—', args: {}, ok: false,
        relato: problema || 'O modelo não devolveu uma ação utilizável.',
        erro: problema, duracaoMs: deps.agora() - comecouAVolta, mudancaDaTela: 0, foto: foto || undefined
      });
      if (falhasSeguidas >= limites.maxFalhasSeguidas) {
        return encerrar('sem-decisao', `Parei: ${problema} Isso aconteceu ${falhasSeguidas} vezes seguidas.`);
      }
      continue;
    }

    // ====== AS MESMAS TRAVAS DO PLANO FIXO, A CADA AÇÃO ======
    if (!ACOES_INTERNAS.has(decisao.acao)) {
      const recusa = validarPasso(comoPasso(decisao), 'A ação que o agente decidiu');
      if (recusa) {
        registrar({
          indice: i, pensamento: decisao.pensamento, acao: decisao.acao, args: decisao.args, ok: false,
          relato: recusa, erro: recusa,
          duracaoMs: deps.agora() - comecouAVolta, mudancaDaTela: 0, foto: foto || undefined
        });
        return encerrar('acao-recusada', recusa);
      }
    }

    // ====== TERMINOU? ======
    if (ACOES_QUE_ENCERRAM.has(decisao.acao)) {
      const texto = String(decisao.args?.resposta || decisao.args?.motivo || decisao.pensamento).trim();
      registrar({
        indice: i, pensamento: decisao.pensamento, acao: decisao.acao, args: decisao.args, ok: decisao.acao === 'concluir',
        relato: texto, duracaoMs: deps.agora() - comecouAVolta, mudancaDaTela: 0, foto: foto || undefined
      });
      return decisao.acao === 'concluir'
        ? encerrar('concluido', texto || 'Tarefa concluída.')
        : encerrar('desistiu', texto || 'Não consegui concluir esta tarefa.');
    }

    /**
     * ====== O FREIO CONTRA O CICLO ======
     *
     * Um agente que decide olhando pode ficar preso de um jeito que um plano fixo nunca fica:
     * clica, nada muda, e como a tela é a mesma ele decide a mesma coisa outra vez — para sempre.
     * O teto de voltas acabaria pegando, mas só depois de dezenas de cliques inúteis no computador
     * de alguém. Três decisões idênticas seguidas já provam que ele não está avançando.
     */
    const assinaturaDaDecisao = `${decisao.acao}|${JSON.stringify(decisao.args)}`;
    if (assinaturaDaDecisao === assinaturaDaDecisaoAnterior) {
      repeticoes++;
      if (repeticoes >= limites.maxRepeticoes) {
        return encerrar('repeticao',
          `Parei: repeti "${decisao.pensamento}" ${repeticoes} vezes e a tela não avançou. ` +
          `O caminho que estou tentando não está funcionando — me diga por onde ir, ou refaça o pedido com mais detalhe.`);
      }
    } else {
      repeticoes = 0;
    }
    assinaturaDaDecisaoAnterior = assinaturaDaDecisao;

    // ====== TROCAR DE JANELA É COM O AGENTE, NÃO COM O USUÁRIO ======
    if (decisao.acao === 'trocar_janela') {
      const alvo = String(decisao.args?.tituloContem || '').trim();
      const r = await deps.trocarJanela(alvo);
      const ok = !r.error;
      falhasSeguidas = ok ? 0 : falhasSeguidas + 1;
      registrar({
        indice: i, pensamento: decisao.pensamento, acao: decisao.acao, args: decisao.args, ok,
        relato: ok ? `Passei a trabalhar na janela "${r.titulo}".` : r.error!,
        erro: r.error, duracaoMs: deps.agora() - comecouAVolta, mudancaDaTela: 0
      });
      // A janela mudou: a assinatura antiga é de outra tela, e compará-las diria "mudou tudo".
      assinaturaDaTela = await deps.fotografar();
      if (!ok && falhasSeguidas >= limites.maxFalhasSeguidas) {
        return encerrar('falhas-seguidas', `Parei depois de ${falhasSeguidas} falhas seguidas. A última: ${r.error}`);
      }
      continue;
    }

    if (decisao.acao === 'esperar') {
      const segundos = Math.min(15, Math.max(1, Number(decisao.args?.segundos) || 2));
      await deps.dormir(segundos * 1000);
      assinaturaDaTela = await deps.fotografar();
      registrar({
        indice: i, pensamento: decisao.pensamento, acao: 'esperar', args: decisao.args, ok: true,
        relato: `Esperei ${segundos}s a tela carregar.`,
        duracaoMs: deps.agora() - comecouAVolta, mudancaDaTela: 0
      });
      falhasSeguidas = 0;
      continue;
    }

    // ====== AGIR ======
    const assinaturaAntes = assinaturaDaTela;
    const previstoMs = previsaoDeEspera(historico, decisao.acao);

    let resposta: any;
    try {
      resposta = await deps.executar(decisao.acao, decisao.args);
    } catch (err: any) {
      resposta = { error: err?.message || String(err) };
    }

    if (resposta?.error) {
      falhasSeguidas++;
      registrar({
        indice: i, pensamento: decisao.pensamento, acao: decisao.acao, args: decisao.args, ok: false,
        relato: String(resposta.error), erro: String(resposta.error),
        duracaoMs: deps.agora() - comecouAVolta, mudancaDaTela: 0, foto: foto || undefined
      });
      if (falhasSeguidas >= limites.maxFalhasSeguidas) {
        return encerrar('falhas-seguidas',
          `Parei depois de ${falhasSeguidas} falhas seguidas. A última: ${resposta.error}`);
      }
      // A falha VOLTA para o modelo na próxima rodada, dentro do histórico: é assim que ele tenta
      // outro caminho em vez de repetir o mesmo. Um plano fixo não tinha para onde levar isto.
      assinaturaDaTela = await deps.fotografar();
      continue;
    }

    // ====== OLHAR DE NOVO ======
    const espera = await esperarTelaParar(deps, { previsaoMs: previstoMs, assinaturaAnterior: assinaturaAntes });
    if (espera.estabilizou) historico = registrarMedicao(historico, decisao.acao, espera.medidoMs);
    assinaturaDaTela = espera.assinaturaFinal;

    const mudancaDaTela = diferencaEntreTelas(assinaturaAntes, assinaturaDaTela);
    /**
     * Uma ação que não mudou nada NÃO encerra o laço aqui — e essa é a diferença de fundo para o
     * motor de plano fixo, que para nesse ponto.
     *
     * Lá, parar era o certo: o plano seguinte tinha sido escrito supondo que este passo pegou, e
     * continuar seria agir em cima de uma tela que ninguém previu. Aqui a próxima ação ainda vai
     * ser decidida, olhando a tela como ela ficou. "Não mudou nada" vira informação para a decisão
     * seguinte em vez de motivo para desistir — e é exatamente disso que uma tarefa real precisa,
     * porque metade dos cliques do mundo abrem menu, focam campo ou não fazem efeito visível.
     */
    const naoMudou = decisao.esperaDaTela === 'mudar' && mudancaDaTela < 0.01;
    falhasSeguidas = 0;

    registrar({
      indice: i, pensamento: decisao.pensamento, acao: decisao.acao, args: decisao.args, ok: true,
      relato: resumirResultado(decisao, resposta, naoMudou),
      duracaoMs: deps.agora() - comecouAVolta, mudancaDaTela, foto: foto || undefined
    });
  }

  return encerrar('teto-de-voltas',
    `Cheguei ao limite de ${limites.maxPassos} ações sem terminar a tarefa, e parei por segurança. ` +
    `O que consegui fazer está no relatório acima — diga como seguir a partir daí.`);
}

/** O que o usuário lê nesta linha do relatório: o que foi feito, e o que a tela respondeu. */
function resumirResultado(decisao: DecisaoDoAgente, resposta: any, naoMudou: boolean): string {
  const detalhe = (() => {
    if (decisao.acao === 'clicar') return `Cliquei em "${decisao.args?.alvo || 'onde estava mirando'}".`;
    if (decisao.acao === 'digitar') return `Digitei "${String(decisao.args?.texto || '').slice(0, 60)}".`;
    if (decisao.acao === 'abrir') return `Abri "${decisao.args?.caminho || ''}".`;
    if (decisao.acao === 'tecla') return `Apertei ${decisao.args?.tecla}.`;
    if (decisao.acao === 'rolar') return `Rolei a tela para ${decisao.args?.direcao === 'up' ? 'cima' : 'baixo'}.`;
    return `Executei ${decisao.acao}.`;
  })();
  const extra = resposta?.resumo ? ` ${String(resposta.resumo).slice(0, 160)}` : '';
  // Dizer que a tela não mudou é informação, não erro: é o que explica a próxima decisão.
  return naoMudou ? `${detalhe} A tela não mudou com isso.${extra}` : `${detalhe}${extra}`;
}
