import { PassoDoPlano, validarPlano, LIMITES_PADRAO, LimitesDoPlano } from './planoDeAcoes';

/**
 * Transforma o que o usuário escreveu num plano de passos — para ele APROVAR antes de rodar.
 *
 * Até aqui, o agente que clica e digita só existia dentro da conversa: a pessoa falava com o
 * chat e torcia para o modelo decidir chamar a ferramenta. Não dava para PEDIR uma automação,
 * nem ver o que ele ia fazer antes de fazer, nem repetir uma tarefa que deu certo.
 *
 * ====== POR QUE APROVAR O PLANO NÃO É "PERGUNTAR A CADA PASSO" ======
 *
 * O motor existe justamente para acabar com o "posso clicar? posso continuar? confirma?" a cada
 * etapa, que transforma uma tarefa de trinta segundos numa conversa de cinco minutos. Mostrar os
 * oito passos UMA vez e executar os oito é o contrário disso: a pessoa vê o que vai acontecer
 * enquanto ainda é barato mudar de ideia, e depois não é mais interrompida.
 *
 * ====== E POR QUE ESTE ARQUIVO NÃO REIMPLEMENTA NADA ======
 *
 * As regras de segurança — o teto de passos, a recusa de dinheiro, as ações de arquivo e terminal
 * que não entram no laço — moram em planoDeAcoes.ts e são chamadas daqui. Reescrevê-las criaria
 * uma segunda versão que envelheceria em silêncio, e a que envelhece é justamente a que deixa
 * passar. Este arquivo só LÊ a resposta do modelo e a entrega ao validador que já existe.
 */

export interface PlanoDoCowork {
  /** O que a pessoa pediu, como escreveu. */
  tarefa: string;
  passos: PassoDoPlano[];
  /** Preenchido quando o plano não pode ser executado; a tela mostra isto no lugar dos passos. */
  recusa?: string;
}

/**
 * A instrução que faz o modelo devolver um plano, e não uma conversa.
 *
 * Ela repete as travas que o validador aplica depois. Não é redundância inútil: um modelo que
 * conhece as regras devolve um plano aproveitável na primeira tentativa, em vez de um plano
 * recusado que a pessoa teria que pedir de novo sem saber o motivo.
 */
export const INSTRUCAO_PARA_PLANEJAR = `Você é o planejador do OSONE COWORK. Recebe uma tarefa para fazer NO COMPUTADOR do usuário e devolve o plano de passos que a executa.

RESPONDA APENAS UM OBJETO JSON, nada mais:
{
  "passos": [
    { "acao": "abrir", "args": { "caminho": "chrome" }, "descricao": "Abrir o navegador", "esperaDaTela": "mudar" },
    { "acao": "clicar", "args": { "alvo": "o campo de busca no topo da página" }, "descricao": "Clicar no campo de busca", "esperaDaTela": "mudar" },
    { "acao": "digitar", "args": { "texto": "OSONE" }, "descricao": "Digitar o termo procurado", "esperaDaTela": "mudar" }
  ],
  "recusa": ""
}

AÇÕES DISPONÍVEIS: "abrir", "clicar", "digitar", "tecla", "rolar", "mover_mouse".
ARGUMENTOS: abrir → "caminho" (nome do programa, arquivo, pasta ou endereço); clicar → "alvo"; digitar → "texto"; tecla → "tecla" (e "modificadores" quando houver); rolar → "direcao" ("up"/"down").

REGRAS:
- Cada passo precisa de "descricao" em português dizendo PARA QUE ELE SERVE. É o que o usuário lê na tela enquanto o plano roda; um passo sem descrição não é executado.
- "esperaDaTela": use "mudar" quando a ação deve alterar a tela (o normal), "permanecer" quando não deve (mover o mouse), "qualquer" quando não dá para prever.
- NUNCA escreva coordenadas x/y. Você não está vendo a tela do momento em que o plano vai rodar, então qualquer coordenada sua é chute — e chute erra. Em "clicar", descreva o alvo em args.alvo ("o botão Entrar", "o ícone de lupa no topo à direita"): a posição é MEDIDA na hora, com a tela à frente, e o clique usa a medição.
- No máximo 25 passos. Tarefa maior que isso deve ser dividida.
- NÃO inclua ações de arquivo ou terminal (apagar, mover, renomear, escrever_arquivo, terminal): elas exigem confirmação uma a uma e não entram em plano automático.
- DINHEIRO NUNCA: pagamento, compra, PIX, transferência, boleto, cartão, assinatura ou saque. Se a tarefa pedir isso, devolva "passos": [] e explique em "recusa" que você leva o usuário até a tela mas quem conclui é ele.
- Se a tarefa for vaga demais para virar passos, devolva "passos": [] e diga em "recusa" o que falta saber.`;

/** Tira a cerca de markdown que o modelo às vezes põe ao redor do JSON. */
function limparCerca(texto: string): string {
  const t = (texto || '').trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```[a-zA-Z]*\r?\n?/, '').replace(/```\s*$/, '').trim();
}

/**
 * Lê a resposta do modelo e devolve o plano — ou a recusa, com o motivo em português.
 *
 * Nenhum caminho aqui devolve "deu erro" sem dizer o quê. Um plano recusado é informação: a
 * pessoa precisa saber se foi a tarefa que era vaga, se era dinheiro, ou se o modelo respondeu
 * fora do formato — as três têm saídas diferentes.
 */
export function lerPlanoDoModelo(
  tarefa: string,
  respostaDoModelo: string,
  limites: LimitesDoPlano = LIMITES_PADRAO
): PlanoDoCowork {
  const vazio = (recusa: string): PlanoDoCowork => ({ tarefa, passos: [], recusa });

  if (!respostaDoModelo || !respostaDoModelo.trim()) {
    return vazio('O modelo respondeu vazio. Tente de novo, ou descreva a tarefa com mais detalhes.');
  }

  let bruto: any;
  try {
    bruto = JSON.parse(limparCerca(respostaDoModelo));
  } catch {
    return vazio('O modelo não respondeu no formato esperado (não veio um plano legível). Tente de novo.');
  }

  // O modelo pode recusar por conta própria — e a recusa dele é a resposta, não uma falha.
  if (typeof bruto?.recusa === 'string' && bruto.recusa.trim() && (!Array.isArray(bruto.passos) || bruto.passos.length === 0)) {
    return vazio(bruto.recusa.trim());
  }

  if (!Array.isArray(bruto?.passos) || bruto.passos.length === 0) {
    return vazio('O modelo não conseguiu transformar isto em passos. Descreva a tarefa dizendo o que abrir e o que fazer em cada tela.');
  }

  const passos: PassoDoPlano[] = bruto.passos.map((p: any) => ({
    acao: String(p?.acao || '').trim(),
    args: (p && typeof p.args === 'object' && p.args) || {},
    descricao: String(p?.descricao || '').trim(),
    esperaDaTela: ['mudar', 'permanecer', 'qualquer'].includes(p?.esperaDaTela) ? p.esperaDaTela : 'mudar'
  }));

  /**
   * A MESMA validação do laço automático, chamada aqui.
   *
   * É o que garante que a aba não seja uma porta dos fundos: um plano que o motor recusaria na
   * hora de executar é recusado aqui, antes de a pessoa aprovar — e com o mesmo texto, para não
   * haver duas explicações diferentes para a mesma regra.
   */
  const problema = validarPlano(passos, limites);
  if (problema) return vazio(problema);

  return { tarefa, passos };
}

/** Um resumo de uma linha do plano, para a lista de tarefas já feitas. */
export function resumirPlano(plano: PlanoDoCowork): string {
  if (plano.recusa) return plano.recusa;
  return `${plano.passos.length} passo(s): ${plano.passos.map(p => p.descricao).join(' → ')}`;
}

export interface TarefaDoHistorico {
  id: string;
  tarefa: string;
  quando: number;
  passos: PassoDoPlano[];
  desfecho: 'concluida' | 'parada' | 'erro';
  detalhe?: string;
}

const CHAVE_DO_HISTORICO = 'osone_cowork_historico';
const MAXIMO_NO_HISTORICO = 20;

/**
 * As tarefas já executadas, para repetir com um clique.
 *
 * É o que separa uma ferramenta de uma demonstração: montar o plano é o trabalho caro, e sem
 * guardá-lo a pessoa refaz o mesmo pedido toda vez. Guardando, ela automatiza uma vez e reusa.
 */
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
