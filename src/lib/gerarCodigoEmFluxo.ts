/**
 * Pede o código ao servidor e ENTREGA O TEXTO ENQUANTO ELE CHEGA.
 *
 * O caminho antigo (/api/generate) só devolve quando o modelo termina. Numa geração grande isso
 * são dezenas de segundos de tela parada, sem como distinguir "está escrevendo" de "travou" — e
 * quando o resultado enfim aparece, se o modelo entendeu errado, o tempo inteiro foi perdido.
 * Aqui o texto sai em pedaços, pelo /api/generate-stream, e quem chamou recebe cada um assim que
 * ele chega.
 *
 * O servidor manda o TEXTO INTEIRO de novo no evento final, e é esse que vale para gravar no
 * arquivo. Os pedaços servem para acompanhar; a gravação não depende de o cliente ter juntado
 * tudo na ordem certa.
 */

export interface RespostaEmFluxo {
  texto: string;
  truncated: boolean;
  blocked: boolean;
  finishReason?: string;
  /** Quantas vezes o modelo foi mandado continuar de onde parou. */
  continuacoes: number;
  modeloUsado?: string;
  modeloPreferido?: string;
  /** Preenchido quando a geração não pôde nem começar. */
  erro?: string;
  /** false quando o servidor não soube transmitir e o chamador precisa cair para /api/generate. */
  fluxoDisponivel: boolean;
}

export interface OpcoesDeFluxo {
  /** Chamado a cada pedaço, com o texto acumulado até ali e o pedaço novo. */
  aoEscrever?: (textoAcumulado: string, pedaco: string) => void;
  /** Chamado quando o modelo é mandado continuar de onde parou (resposta cortada). */
  aoContinuar?: (numeroDaContinuacao: number) => void;
  /** Chamado assim que se sabe qual modelo respondeu, antes do primeiro pedaço. */
  aoSaberModelo?: (modeloUsado: string, modeloPreferido: string) => void;
  /** Cancela a geração pela metade (o servidor para de consumir cota ao ver a conexão cair). */
  sinal?: AbortSignal;
}

const RESPOSTA_VAZIA: RespostaEmFluxo = {
  texto: '', truncated: false, blocked: false, continuacoes: 0, fluxoDisponivel: true
};

export async function gerarCodigoEmFluxo(
  corpo: Record<string, unknown>,
  opcoes: OpcoesDeFluxo = {}
): Promise<RespostaEmFluxo> {
  let resposta: Response;
  try {
    resposta = await fetch('/api/generate-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: opcoes.sinal
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ...RESPOSTA_VAZIA, erro: 'cancelado' };
    // Rede fora ou rota inexistente: quem chamou tenta o caminho de uma vez só.
    return { ...RESPOSTA_VAZIA, fluxoDisponivel: false, erro: e?.message || String(e) };
  }

  /**
   * Hospedagem sem transmissão (ou versão antiga do servidor) não pode virar "não gerou nada".
   *
   * Perder a escrita ao vivo é um degrau abaixo; ficar sem código é o desfecho ruim de sempre.
   * Nos dois casos a resposta diz 'fluxoDisponivel: false' e o chamador refaz pelo /api/generate.
   */
  if (!resposta.ok || !resposta.body) {
    let detalhe = `HTTP ${resposta.status}`;
    try {
      const json = await resposta.json();
      if (json?.error) detalhe = json.error;
    } catch { /* corpo não era JSON: fica o código do status */ }
    // 400 é erro real do pedido (ex: chave ausente) e repetir não adianta; o resto tenta de novo.
    const vaiTentarDeNovo = resposta.status !== 400;
    return { ...RESPOSTA_VAZIA, fluxoDisponivel: !vaiTentarDeNovo, erro: detalhe };
  }

  const leitor = resposta.body.getReader();
  const decodificador = new TextDecoder();
  let pendente = '';
  let acumulado = '';
  let final: RespostaEmFluxo | null = null;
  let erro: string | undefined;

  const processarLinha = (linha: string) => {
    if (!linha.startsWith('data:')) return;
    const carga = linha.slice(5).trim();
    if (!carga || carga === '[DONE]') return;

    let evento: any;
    try { evento = JSON.parse(carga); } catch { return; }

    if (evento.error) { erro = evento.error; return; }
    if (evento.modeloUsado && !evento.done && evento.text === undefined) {
      opcoes.aoSaberModelo?.(evento.modeloUsado, evento.modeloPreferido || '');
      return;
    }
    if (evento.continuando) { opcoes.aoContinuar?.(evento.continuando); return; }
    if (evento.done) {
      final = {
        texto: evento.text || acumulado,
        truncated: !!evento.truncated,
        blocked: !!evento.blocked,
        finishReason: evento.finishReason,
        continuacoes: evento.continuacoes || 0,
        modeloUsado: evento.modeloUsado,
        modeloPreferido: evento.modeloPreferido,
        fluxoDisponivel: true
      };
      return;
    }
    if (typeof evento.text === 'string' && evento.text) {
      acumulado += evento.text;
      opcoes.aoEscrever?.(acumulado, evento.text);
    }
  };

  try {
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      pendente += decodificador.decode(value, { stream: true });
      // Um pedaço da rede pode cortar um evento ao meio: só as linhas completas são processadas,
      // e o resto fica esperando o pedaço seguinte.
      const linhas = pendente.split('\n');
      pendente = linhas.pop() || '';
      for (const linha of linhas) processarLinha(linha);
    }
    if (pendente) processarLinha(pendente);
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      // Cancelado no meio: o que já apareceu na tela é real e volta para quem chamou decidir.
      return { ...RESPOSTA_VAZIA, texto: acumulado, erro: 'cancelado' };
    }
    // Conexão caiu no meio do fluxo: sem o evento final, o que existe é o acumulado.
    if (!final) return { ...RESPOSTA_VAZIA, texto: acumulado, erro: e?.message || String(e) };
  }

  if (erro && !final) return { ...RESPOSTA_VAZIA, erro };
  if (final) return final;
  // Fluxo terminou sem o evento final (servidor reiniciou, proxy cortou): vale o que chegou.
  return { ...RESPOSTA_VAZIA, texto: acumulado, erro: acumulado ? undefined : 'A geração terminou sem resposta.' };
}
