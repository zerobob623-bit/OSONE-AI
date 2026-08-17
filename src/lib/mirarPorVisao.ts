/**
 * MIRA POR VISÃO — o modelo OLHA a tela e diz onde o alvo está.
 *
 * Por que isto substituiu o reconhecimento de texto: o OCR só achava o que estava ESCRITO, e ainda
 * assim custava caro. Medido em uso real, cinco processos do tesseract rodando ao mesmo tempo, cada
 * um a quase 90% de um núcleo, com três minutos de prazo cada — o computador inteiro parava, e
 * enquanto isso qualquer comando novo do usuário entrava na fila atrás daquilo. Um botão que é só
 * ícone, que é a maior parte de uma interface, nunca seria encontrado de qualquer forma.
 *
 * Aqui não há regra escrita sobre botão nenhum. A captura vai para o modelo com uma pergunta só —
 * "onde está isto?" — e ele responde com a caixa que envolve o elemento. É o mesmo que a pessoa faz
 * ao olhar a tela, e vale para qualquer programa, com texto ou sem.
 *
 * Duas escolhas fazem a diferença entre isto e as tentativas antigas de "pedir a coordenada":
 *
 * 1. A pergunta é SEPARADA da conversa. Antes a coordenada era pedida no meio do diálogo, e ficou
 *    medido que o modelo respondia de memória sem olhar a imagem — o erro em Y era constante em
 *    tentativas seguidas, coisa que leitura de imagem nunca produz. Numa chamada dedicada, que só
 *    contém a imagem e a pergunta, não existe memória anterior de onde responder.
 *
 * 2. A caixa é pedida no formato que o próprio modelo foi treinado a produzir — [ymin, xmin, ymax,
 *    xmax] normalizado de 0 a 1000. Pedir "x e y em pixels" obrigaria a adivinhar a resolução; pedir
 *    nesse formato é usar a capacidade como ela existe.
 */

export interface AlvoVisto {
  /** Centro do elemento na escala 0–1000 usada pelo clique. */
  centro: { x: number; y: number };
  /** A caixa inteira, na mesma escala — serve para saber o tamanho do alvo. */
  caixa: { x0: number; y0: number; x1: number; y1: number };
  /** O que o modelo diz ter visto ali. É a prova de que ele olhou, e o que aparece no painel. */
  descricao: string;
}

export interface ResultadoDaVisao {
  encontrado: boolean;
  alvo?: AlvoVisto;
  motivo?: string;
  /** Quanto tempo a consulta levou, para o custo da mira ficar visível em vez de suposto. */
  duracaoMs?: number;
}

const INSTRUCAO = `Você localiza elementos de interface em capturas de tela. Recebe UMA imagem da tela de um computador e a descrição de UM elemento.

Responda SOMENTE com JSON, sem texto em volta e sem blocos de código.

Se encontrar o elemento:
{"encontrado": true, "box_2d": [ymin, xmin, ymax, xmax], "descricao": "o que você vê nessa caixa"}

As quatro coordenadas são normalizadas de 0 a 1000 em relação à imagem inteira: ymin/ymax do topo para a base, xmin/xmax da esquerda para a direita. A caixa deve envolver o elemento CLICÁVEL inteiro (o botão todo, não só o texto ou o ícone dentro dele), o mais justa possível.

Se o elemento não estiver visível na imagem:
{"encontrado": false, "motivo": "por que não está — não aparece, está fora da tela, está coberto, ou há vários iguais e a descrição não distingue"}

Regras:
- Olhe a imagem. Nunca responda de memória nem por suposição de onde esse tipo de elemento costuma ficar.
- Se houver mais de um candidato e a descrição não separar qual, responda encontrado: false explicando a ambiguidade. Uma caixa errada faz o clique cair no lugar errado, o que é pior do que não responder.
- A descrição do que você viu deve ser do elemento REAL naquela caixa, não uma repetição do que foi pedido.`;

/** Tira cercas de bloco de código e sobras de texto em volta do JSON. */
function extrairJson(bruto: string): any | null {
  const limpo = String(bruto || '').replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(limpo);
  } catch {
    // Modelo às vezes acrescenta uma frase antes ou depois: pega o primeiro objeto equilibrado.
    const inicio = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    if (inicio === -1 || fim <= inicio) return null;
    try {
      return JSON.parse(limpo.slice(inicio, fim + 1));
    } catch {
      return null;
    }
  }
}

const dentro = (v: number) => Math.min(1000, Math.max(0, v));

/**
 * Pergunta ao modelo onde está `alvo` na imagem `imagemBase64`.
 *
 * `imagemBase64` deve ser a captura CRUA, sem a grade vermelha de referência: a grade é régua para
 * leitura humana e, sobreposta ao conteúdo, só atrapalha quem já sabe apontar sozinho.
 */
export async function mirarPorVisao(
  alvo: string,
  imagemBase64: string,
  mimeType: string,
  chaveGemini: string,
  modelo: string,
  sinalExterno?: AbortSignal
): Promise<ResultadoDaVisao> {
  const comecou = Date.now();
  const dados = imagemBase64.includes(',') ? imagemBase64.split(',')[1] : imagemBase64;

  /**
   * TETO DE TEMPO PRÓPRIO, E CANCELAMENTO VINDO DE FORA — o que vier primeiro.
   *
   * Esta chamada não tinha nenhum limite: era um fetch só, sem AbortController, sem timeout.
   * Relatado como "às vezes ele fica 2 minutos caçando na tela" — e fazia sentido: o servidor
   * tenta mais de um modelo, mais de uma vez cada, e nada aqui cortava a espera se um deles
   * estivesse lento. Enquanto isso, o motor ficava com UMA AÇÃO POR VEZ travada, então o resto
   * do controle do PC ficava preso atrás desta única pergunta ao modelo de visão.
   *
   * 'sinalExterno' é o que permite o motor MUDAR DE IDEIA: se uma ação nova chegar enquanto esta
   * busca ainda está no ar, quem chama aborta esta chamada em vez de esperar — sem prejuízo,
   * porque isto é só uma pergunta de leitura, sem efeito nenhum na máquina do usuário.
   */
  const controle = new AbortController();
  const TETO_MS = 25000;
  const timer = setTimeout(() => controle.abort(), TETO_MS);
  const repassarCancelamento = () => controle.abort();
  sinalExterno?.addEventListener('abort', repassarCancelamento);

  let resposta: Response;
  try {
    resposta = await fetch('/api/gemini/generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientApiKey: chaveGemini || undefined,
        model: modelo,
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: mimeType || 'image/png', data: dados } },
            { text: `Elemento a localizar: ${alvo}` }
          ]
        }],
        config: {
          systemInstruction: INSTRUCAO,
          // Zero porque isto é medição, não criação: a mesma tela e a mesma pergunta têm de
          // devolver a mesma caixa, senão duas tentativas seguidas viram dois lugares diferentes.
          temperature: 0,
          responseMimeType: 'application/json'
        }
      }),
      signal: controle.signal
    });
  } catch (err: any) {
    const foiCancelamento = err?.name === 'AbortError';
    return {
      encontrado: false,
      motivo: foiCancelamento
        ? (sinalExterno?.aborted
            ? 'Busca cancelada: outra ação começou antes de terminar de olhar a tela.'
            : `O modelo demorou mais de ${TETO_MS / 1000}s para olhar a tela e a busca foi cancelada.`)
        : `Não foi possível falar com o modelo para olhar a tela: ${err?.message || err}`,
      duracaoMs: Date.now() - comecou
    };
  } finally {
    clearTimeout(timer);
    sinalExterno?.removeEventListener('abort', repassarCancelamento);
  }

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    return { encontrado: false, motivo: corpo?.error || `O modelo não respondeu ao olhar a tela (HTTP ${resposta.status}).`, duracaoMs: Date.now() - comecou };
  }

  const texto = corpo?.text
    ?? corpo?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('')
    ?? '';
  const lido = extrairJson(texto);

  if (!lido) {
    return {
      encontrado: false,
      motivo: `O modelo olhou a tela mas não respondeu no formato esperado: ${String(texto).slice(0, 200)}`,
      duracaoMs: Date.now() - comecou
    };
  }

  if (lido.encontrado === false || !Array.isArray(lido.box_2d)) {
    return {
      encontrado: false,
      motivo: lido.motivo || 'O modelo não encontrou esse elemento na tela.',
      duracaoMs: Date.now() - comecou
    };
  }

  const [ymin, xmin, ymax, xmax] = lido.box_2d.map((n: any) => Number(n));
  if (![ymin, xmin, ymax, xmax].every(Number.isFinite)) {
    return { encontrado: false, motivo: 'O modelo devolveu uma caixa com números inválidos.', duracaoMs: Date.now() - comecou };
  }

  const x0 = dentro(Math.min(xmin, xmax));
  const x1 = dentro(Math.max(xmin, xmax));
  const y0 = dentro(Math.min(ymin, ymax));
  const y1 = dentro(Math.max(ymin, ymax));

  // Caixa de área nula não aponta lugar nenhum: é resposta malformada disfarçada de sucesso.
  if (x1 - x0 < 1 || y1 - y0 < 1) {
    return { encontrado: false, motivo: 'A caixa devolvida não tem tamanho — o elemento não foi realmente localizado.', duracaoMs: Date.now() - comecou };
  }

  return {
    encontrado: true,
    duracaoMs: Date.now() - comecou,
    alvo: {
      centro: { x: Math.round((x0 + x1) / 2), y: Math.round((y0 + y1) / 2) },
      caixa: { x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x1), y1: Math.round(y1) },
      descricao: String(lido.descricao || alvo).slice(0, 120)
    }
  };
}
