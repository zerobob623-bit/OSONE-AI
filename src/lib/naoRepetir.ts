/**
 * TRAVA CONTRA ATENDER A MESMA MENSAGEM DUAS VEZES.
 *
 * O Baileys pode entregar a MESMA mensagem mais de uma vez no evento 'messages.upsert', com o
 * mesmo key.id: acontece em recibo de retentativa, em reconexão com notificações pendentes, e
 * quando a mensagem chega por mais de um caminho. Sem uma trava, cada entrega repetida virava uma
 * auto-resposta nova — o cliente recebia o mesmo texto duas vezes no mesmo minuto, o que além de
 * feio faz o atendimento parecer automático do pior jeito.
 *
 * A trava é por IDENTIFICADOR, e não por conteúdo. Duas mensagens iguais de verdade ("oi" mandado
 * duas vezes) são duas mensagens e merecem duas respostas; o que não pode é a MESMA mensagem ser
 * respondida de novo. Travar por conteúdo silenciaria alguém que repetiu a pergunta porque não foi
 * respondido — exatamente a pessoa que mais precisa de resposta.
 */
export class NaoRepetir {
  private vistos = new Set<string>();
  private readonly limite: number;

  constructor(limite = 500) {
    this.limite = Math.max(1, limite);
  }

  /**
   * Marca o identificador como atendido e diz se ele JÁ tinha sido atendido antes.
   *
   * Identificador vazio nunca é considerado repetido: sem ID não há como saber se é a mesma
   * mensagem, e engolir uma mensagem legítima é pior do que responder uma repetida.
   */
  jaAtendido(id: string): boolean {
    if (!id) return false;
    if (this.vistos.has(id)) return true;
    this.vistos.add(id);
    // Um conjunto que só cresce vira vazamento numa sessão que fica dias no ar. O mais antigo sai
    // primeiro: mensagens antigas não voltam a chegar, então lembrar delas não serve para nada.
    if (this.vistos.size > this.limite) {
      const maisAntigo = this.vistos.values().next().value;
      if (maisAntigo !== undefined) this.vistos.delete(maisAntigo);
    }
    return false;
  }

  get tamanho(): number {
    return this.vistos.size;
  }
}
