/**
 * Aplicação de edições cirúrgicas em código-fonte, no mesmo espírito da ferramenta Edit
 * usada por assistentes de codificação agênticos: cada edição precisa casar de forma
 * EXATA e ÚNICA com um trecho do conteúdo atual. Isso evita que o modelo precise
 * reescrever o arquivo inteiro a cada pedido (lento, caro e arriscado de esquecer algo).
 *
 * O protocolo de comunicação com o modelo usa blocos de texto puro (estilo
 * SEARCH/REPLACE), NÃO JSON: pedir para o modelo colocar código-fonte grande (com aspas,
 * crases, quebras de linha) dentro de uma string JSON é frágil — é muito comum o modelo
 * produzir um JSON mal escapado ou truncado, e nesse caso não há como aplicar a edição nem
 * recuperar o código com segurança. Texto puro delimitado por marcadores não precisa de
 * nenhum escape.
 */
export interface CodeEdit {
  old_string: string;
  new_string: string;
}

export interface ApplyCodeEditsResult {
  content: string;
  appliedCount: number;
  failedEdits: Array<CodeEdit & { reason: string }>;
}

export function applyCodeEdits(original: string, edits: CodeEdit[]): ApplyCodeEditsResult {
  let content = original;
  let appliedCount = 0;
  const failedEdits: Array<CodeEdit & { reason: string }> = [];

  for (const edit of edits) {
    if (!edit || typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string') {
      continue;
    }
    if (edit.old_string === '') {
      failedEdits.push({ ...edit, reason: "old_string vazio (não suportado, use conteúdo real do arquivo)" });
      continue;
    }
    if (edit.old_string === edit.new_string) {
      continue;
    }

    const occurrences = content.split(edit.old_string).length - 1;
    if (occurrences === 0) {
      failedEdits.push({ ...edit, reason: "trecho não encontrado no código atual" });
      continue;
    }
    if (occurrences > 1) {
      failedEdits.push({ ...edit, reason: `trecho ambíguo (encontrado ${occurrences} vezes)` });
      continue;
    }

    content = content.replace(edit.old_string, edit.new_string);
    appliedCount++;
  }

  return { content, appliedCount, failedEdits };
}

/**
 * O trecho de busca pode vir VAZIO, e isso precisa ser reconhecido como bloco.
 *
 * Com a exigência de uma quebra de linha antes do '=====', um bloco de SEARCH vazio — que o modelo
 * manda quando está criando um arquivo do zero — não era reconhecido como bloco nenhum. O texto
 * inteiro caía no caminho de "isto é o arquivo completo", e os MARCADORES acabavam gravados dentro
 * do arquivo como se fossem código.
 */
const SEARCH_REPLACE_BLOCK_RE = /<{5,}\s*SEARCH\s*\r?\n([\s\S]*?)\r?\n?={5,}\s*\r?\n([\s\S]*?)\r?\n>{5,}\s*REPLACE/g;

/** Abertura de um bloco, usada para descobrir se sobrou algum sem fechamento. */
const ABERTURA_DE_BLOCO_RE = /<{5,}[ \t]*SEARCH[ \t]*\r?\n/;
/** A linha de '=======' que separa o trecho procurado do texto que entra no lugar. */
const SEPARADOR_DE_BLOCO_RE = /\r?\n={5,}[ \t]*\r?\n/;

export interface LeituraDeBlocos {
  /** Blocos completos, do começo ao '>>>>>>> REPLACE'. */
  edits: CodeEdit[];
  /** true quando o texto termina no meio de um bloco que nunca fechou. */
  cortada: boolean;
  /** O que já havia sido escrito na parte de substituição do bloco cortado (pode ser vazio). */
  fragmento: string;
}

/**
 * Lê os blocos SEARCH/REPLACE E DIZ SE A RESPOSTA ACABOU NO MEIO DE UM.
 *
 * Esta segunda informação é o que faltava, e a falta dela corrompia arquivos. Quando o modelo
 * estoura o limite de tokens, a resposta simplesmente para — muitas vezes no meio de um bloco,
 * antes do '>>>>>>> REPLACE'. Para uma leitura que só procura blocos INTEIROS, esse pedaço não
 * existe: ela devolve zero blocos, quem chamava concluía "então isto não é uma edição, é o
 * arquivo inteiro" e gravava o texto cru — marcadores '<<<<<<< SEARCH' e tudo — por cima de um
 * arquivo que funcionava. O trabalho do usuário sumia e nada na tela dizia que algo deu errado.
 */
export function lerBlocosSearchReplace(text: string): LeituraDeBlocos {
  const edits: CodeEdit[] = [];
  const re = new RegExp(SEARCH_REPLACE_BLOCK_RE.source, 'g');
  let match: RegExpExecArray | null;
  let fimDoUltimoBlocoCompleto = 0;
  while ((match = re.exec(text)) !== null) {
    edits.push({ old_string: match[1], new_string: match[2] });
    fimDoUltimoBlocoCompleto = match.index + match[0].length;
  }

  const resto = text.slice(fimDoUltimoBlocoCompleto);
  const abertura = ABERTURA_DE_BLOCO_RE.exec(resto);
  if (!abertura) return { edits, cortada: false, fragmento: '' };

  // Sobrou um bloco aberto depois do último completo: a resposta foi cortada dentro dele.
  const depoisDaAbertura = resto.slice(abertura.index + abertura[0].length);
  const separador = SEPARADOR_DE_BLOCO_RE.exec(depoisDaAbertura);
  // Se o corte veio antes do '=======', nem o texto de substituição começou: não há nada a salvar.
  const fragmento = separador
    ? depoisDaAbertura.slice(separador.index + separador[0].length).replace(/\s+$/, '')
    : '';
  return { edits, cortada: true, fragmento };
}

/**
 * Extrai blocos no formato:
 * <<<<<<< SEARCH
 * (trecho exato do código atual)
 * =======
 * (texto que entra no lugar)
 * >>>>>>> REPLACE
 * Pode haver múltiplos blocos em sequência. Texto puro, sem necessidade de escapar nada.
 */
export function parseSearchReplaceEdits(text: string): CodeEdit[] {
  return lerBlocosSearchReplace(text).edits;
}

export interface TrechoSelecionado {
  /** Onde o trecho começa e termina no arquivo, no momento em que o pedido foi enviado. */
  inicio: number;
  fim: number;
  /** O texto exato que estava selecionado. É ele que confirma que o alvo não se moveu. */
  texto: string;
}

export interface ResultadoDaSubstituicao {
  conteudo: string;
  /** false quando o trecho não estava mais lá: nada é gravado, e o motivo vem em 'erro'. */
  aplicou: boolean;
  erro?: string;
}

/**
 * Troca APENAS o trecho selecionado, e confere que ele não se moveu antes de trocar.
 *
 * A conferência não é zelo excessivo — é o que separa a edição cirúrgica de uma corrupção. Entre
 * apertar "gerar" e a resposta chegar passam dezenas de segundos, e nesse meio-tempo a pessoa
 * pode ter digitado, desfeito, trocado de arquivo ou deixado o Enxame mexer no repositório. As
 * posições guardadas então apontam para outro lugar, e gravar por elas colocaria o texto novo no
 * meio de uma função qualquer — um estrago silencioso, do tipo que só aparece muito depois.
 *
 * Por isso o que vale é o TEXTO, não o número: se o que está entre as posições não for mais
 * exatamente o que foi selecionado, procura-se o texto no arquivo; achado uma única vez, ele é o
 * alvo. Ambíguo ou ausente, não se grava nada e o chamador explica por quê.
 */
export function substituirTrecho(
  conteudoAtual: string,
  trecho: TrechoSelecionado,
  textoNovo: string
): ResultadoDaSubstituicao {
  /**
   * O RECUO DO TRECHO NÃO PODE SER COMIDO NA LIMPEZA.
   *
   * stripOuterMarkdownFence apara os dois lados, e isso está certo para um arquivo inteiro — mas
   * aqui o texto vai ser colado DENTRO de outro código, e os espaços da frente são a indentação
   * dele. Removê-los cola a linha nova rente à margem, quebrando o alinhamento em qualquer
   * linguagem e, em Python, quebrando o programa: lá o recuo é a sintaxe do bloco.
   *
   * Então a cerca de markdown é removida (ela nunca é código), e só o que sobra depois dela é que
   * tem o recuo preservado.
   */
  let novo = (textoNovo || '').replace(/^\r?\n+/, '').replace(/\s+$/, '');
  if (novo.trimStart().startsWith('```')) {
    const semEspacoAntes = novo.trimStart();
    novo = semEspacoAntes
      .replace(/^```[a-zA-Z0-9]*\r?\n?/, '')
      .replace(/\r?\n?```\s*$/, '')
      .replace(/\s+$/, '');
  }
  if (!novo.trim()) {
    return { conteudo: conteudoAtual, aplicou: false, erro: 'o modelo devolveu um trecho vazio' };
  }

  // Caminho normal: o trecho continua exatamente onde estava.
  if (conteudoAtual.slice(trecho.inicio, trecho.fim) === trecho.texto) {
    return {
      conteudo: conteudoAtual.slice(0, trecho.inicio) + novo + conteudoAtual.slice(trecho.fim),
      aplicou: true
    };
  }

  // O arquivo mudou: vale o texto, não a posição.
  const primeira = conteudoAtual.indexOf(trecho.texto);
  if (primeira === -1) {
    return {
      conteudo: conteudoAtual,
      aplicou: false,
      erro: 'o trecho selecionado não está mais no arquivo (ele foi editado durante a geração)'
    };
  }
  if (conteudoAtual.indexOf(trecho.texto, primeira + 1) !== -1) {
    return {
      conteudo: conteudoAtual,
      aplicou: false,
      erro: 'o trecho selecionado agora aparece mais de uma vez no arquivo, e não dá para saber qual você quis mudar'
    };
  }
  return {
    conteudo: conteudoAtual.slice(0, primeira) + novo + conteudoAtual.slice(primeira + trecho.texto.length),
    aplicou: true
  };
}

/**
 * O pedaço do arquivo ao redor do trecho, para o modelo entender o que está editando.
 *
 * Mandar dez linhas soltas produz código que não conversa com o resto: o modelo inventa nomes de
 * variáveis que já existem, ignora o estilo do arquivo e chama funções que não estão lá. Mandar o
 * arquivo inteiro resolve o contexto, mas num arquivo de 50 mil caracteres isso é desperdício em
 * toda edição de três linhas.
 *
 * A janela ao redor resolve os dois: contexto suficiente para escrever código coerente, sem
 * carregar o arquivo todo. Arquivo pequeno vai inteiro, porque aí não há o que economizar.
 */
export function contextoAoRedor(conteudo: string, inicio: number, fim: number, folga = 4000): string {
  if (conteudo.length <= folga * 2) return conteudo;
  const de = Math.max(0, inicio - folga);
  const ate = Math.min(conteudo.length, fim + folga);
  return (de > 0 ? '…\n' : '') + conteudo.slice(de, ate) + (ate < conteudo.length ? '\n…' : '');
}

/**
 * Um documento HTML que começou e não terminou.
 *
 * Serve para reconhecer o sintoma central de "o código não está sendo finalizado": o arquivo
 * abre como página e acaba no meio, sem o fechamento. É proposital que a checagem seja estreita
 * — só olha o fechamento do documento — porque um palpite errado aqui viraria alarme falso em
 * código perfeitamente válido, e alarme falso ensina o usuário a ignorar o aviso.
 */
export function pareceDocumentoIncompleto(conteudo: string): boolean {
  const c = (conteudo || '').trim();
  if (!c) return false;
  const abreDocumento = /<!DOCTYPE\s+html/i.test(c) || /<html[\s>]/i.test(c);
  if (!abreDocumento) return false;
  return !/<\/html\s*>/i.test(c);
}

/**
 * Rede de segurança contra respostas que saíram "escapadas" como se fossem o valor de uma
 * string JSON (barra-n literal em vez de quebra de linha real, aspas escapadas em vez de
 * aspas normais), sem que ninguém tenha rodado o JSON.parse nelas. Isso produz um arquivo
 * inteiro numa única linha cheio de sequências de escape visíveis — sintoma inconfundível.
 *
 * Só dispara quando o texto tem MUITAS sequências de escape de quebra-de-linha literais e
 * QUASE NENHUMA quebra de linha real, o que nunca acontece em código de verdade formatado
 * normalmente (só em texto que era pra ter sido desescapado e não foi). Isso evita falso
 * positivo em código legítimo que só tenha uma dessas sequências dentro de uma string, já
 * que nesse caso as quebras de linha reais do resto do arquivo continuam presentes em
 * abundância.
 */
function looksLikeUnparsedJsonEscapedText(text: string): boolean {
  if (!text) return false;
  const backslash = String.fromCharCode(92);
  const literalEscapeCount = text.split(backslash + "n").length - 1;
  const realNewlineCount = text.split(String.fromCharCode(10)).length - 1;
  return literalEscapeCount >= 8 && realNewlineCount <= 2;
}

// Faixa de caracteres de controle reais (0-31) que invalidariam o JSON.parse, exceto
// tab (9), newline (10) e carriage-return (13), que são válidos dentro de uma string JSON
// quando devidamente escapados e não atrapalham o parse aqui.
const CONTROL_CHAR_CODES_TO_STRIP: number[] = [];
for (let i = 0; i <= 31; i++) {
  if (i !== 9 && i !== 10 && i !== 13) CONTROL_CHAR_CODES_TO_STRIP.push(i);
}
const CONTROL_CHARS_TO_STRIP_SET = new Set(CONTROL_CHAR_CODES_TO_STRIP);

function stripRealControlChars(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (!CONTROL_CHARS_TO_STRIP_SET.has(code)) out += text[i];
  }
  return out;
}

/**
 * Se o texto parecer o conteúdo cru (não desescapado) de uma string JSON, faz o unescape
 * (interpretando as sequências de escape como JSON faria) e retorna o resultado. Caso
 * contrário, ou se o parse falhar, devolve o texto original sem alterações.
 */
export function unescapeIfRawJsonString(text: string): string {
  if (!looksLikeUnparsedJsonEscapedText(text)) return text;
  try {
    const cleaned = stripRealControlChars(text);
    const quote = String.fromCharCode(34);
    const parsed = JSON.parse(quote + cleaned + quote);
    if (typeof parsed === 'string' && parsed.trim().length > 0) return parsed;
  } catch {
    // Não era realmente uma string JSON escapada válida: mantém o texto original.
  }
  return text;
}

/** Remove uma única cerca de markdown externa (```...```) envolvendo todo o texto, se houver. */
export function stripOuterMarkdownFence(text: string): string {
  let t = (text || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z0-9]*\r?\n?/, '');
    t = t.replace(/\r?\n?```\s*$/, '');
    t = t.trim();
  }
  return t;
}

/**
 * Divide um texto em seções nomeadas, delimitadas por cabeçalhos "=== NOME ===" em linhas
 * próprias. Usado pelo agente Hunter para combinar metadados curtos (dúvida, resumo) com o
 * código em texto puro na mesma resposta, sem precisar de JSON.
 */
export function parseSections(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const headerRe = /^[ \t]*={2,}\s*([A-Za-z_]+)\s*={2,}[ \t]*$/gm;
  const headers: { name: string; end: number; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(text)) !== null) {
    headers.push({ name: m[1].toUpperCase(), start: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < headers.length; i++) {
    const sectionEnd = i + 1 < headers.length ? headers[i + 1].start : text.length;
    result[headers[i].name] = text.slice(headers[i].end, sectionEnd).trim();
  }
  return result;
}

const CODE_EDIT_SYSTEM_INSTRUCTION_TEMPLATE = (roleIntro: string) => `${roleIntro}

Assim como um assistente de codificação real (par de programação estilo "vibe coding"), você NUNCA reescreve um arquivo inteiro do zero quando já existe código funcionando. Você faz EDIÇÕES CIRÚRGICAS: localiza o trecho exato que precisa mudar e substitui só ele, preservando tudo o resto exatamente como está — sem esquecer, remover ou alterar por acidente nada que não foi pedido.

Se já existir código no arquivo, responda com um ou mais blocos neste formato EXATO (texto puro, NUNCA use JSON):

<<<<<<< SEARCH
trecho exato e único do código atual a ser substituído
=======
texto que entra no lugar
>>>>>>> REPLACE

Regras rígidas do bloco SEARCH:
- Cópia LITERAL e EXATA de um trecho do código atual fornecido (mesma indentação, aspas, espaços e quebras de linha) — copie e cole, não digite de memória.
- Grande o suficiente para ser único no arquivo inteiro (se o mesmo trecho aparecer mais de uma vez, inclua mais linhas de contexto ao redor até ficar único).
- Nunca invente ou aproxime um trecho que não existe exatamente daquele jeito no código atual.
- Para mudanças em pontos diferentes e não relacionados do arquivo, use múltiplos blocos SEARCH/REPLACE em sequência, cada um pequeno e focado numa única mudança.
- Não escreva NADA fora dos blocos: sem explicações, sem markdown, sem comentários antes/depois/entre os blocos.

Se o arquivo estiver vazio ou você estiver criando algo totalmente novo do zero, NÃO use blocos SEARCH/REPLACE: responda diretamente com o código-fonte COMPLETO do zero, sem nenhum marcador, sem explicações antes ou depois, sem cortar nada por brevidade.

IMPORTANTE: responda SEMPRE com código-fonte de verdade, em texto puro, com quebras de linha reais. NUNCA escreva o código como se fosse o valor de uma string JSON (nada de usar barra-n no lugar de quebra de linha ou aspas escapadas com barra) — isso quebra o arquivo inteiro.`;

export function buildCodeEditSystemInstruction(roleIntro: string): string {
  return CODE_EDIT_SYSTEM_INSTRUCTION_TEMPLATE(roleIntro);
}

/**
 * Recebe o texto cru retornado pelo modelo e aplica sobre o conteúdo atual.
 * - Se houver blocos SEARCH/REPLACE, aplica cada um como edição cirúrgica.
 * - Caso contrário, trata a resposta inteira como o conteúdo completo do arquivo (uso
 *   esperado quando não havia código anterior, ou fallback se o modelo ignorar o formato).
 * Antes de tudo, corrige automaticamente respostas que vieram "escapadas" como string JSON
 * crua (ver unescapeIfRawJsonString).
 * Nunca lança exceção.
 */
export function applyModelCodeResponse(rawText: string, currentContent: string): {
  content: string;
  summary: string;
  hadFailures: boolean;
  /** A resposta acabou no meio de um bloco de edição: o que veio está incompleto por definição. */
  respostaCortada: boolean;
} {
  const text = unescapeIfRawJsonString((rawText || '').trim()).trim();
  const { edits, cortada, fragmento } = lerBlocosSearchReplace(text);
  const arquivoEstavaVazio = !currentContent || !currentContent.trim();

  /**
   * RESPOSTA CORTADA NO MEIO DE UM BLOCO: O TEXTO CRU NÃO É O ARQUIVO.
   *
   * Este é o caminho que destruía código. O modelo estourava o limite de tokens no meio de uma
   * edição, o bloco ficava sem o '>>>>>>> REPLACE', a leitura antiga não enxergava bloco nenhum
   * e o texto cru — com os marcadores dentro — era gravado como se fosse o arquivo inteiro. Um
   * arquivo que funcionava era substituído por meia edição, e o app anunciava sucesso.
   *
   * Agora o que sobrou do bloco cortado nunca vira arquivo: num arquivo que já tinha código,
   * nada é gravado (não aplicar uma edição é sempre melhor do que perder o que existia); num
   * arquivo vazio, aproveita-se o pedaço já escrito, porque ali não há o que perder e ele serve
   * de ponto de partida. Nos dois casos quem chamou recebe 'respostaCortada' e pode avisar na
   * tela, em vez de tratar meio arquivo como entrega pronta.
   */
  if (cortada) {
    if (edits.length > 0) {
      const { content, appliedCount, failedEdits } = applyCodeEdits(currentContent, edits);
      const partes = [`a resposta do modelo foi cortada no meio da última edição (ela não foi aplicada)`];
      if (appliedCount > 0) partes.push(`${appliedCount} edição(ões) anterior(es) aplicada(s)`);
      if (failedEdits.length > 0) partes.push(`${failedEdits.length} não casaram com o código atual`);
      return { content, summary: partes.join('. '), hadFailures: true, respostaCortada: true };
    }

    if (arquivoEstavaVazio && fragmento.trim()) {
      return {
        content: fragmento,
        summary: 'a resposta do modelo foi cortada antes do fim — o código gravado está incompleto',
        hadFailures: true,
        respostaCortada: true
      };
    }

    return {
      content: currentContent,
      summary: 'a resposta do modelo foi cortada no meio de um bloco de edição — nada foi aplicado para não gravar meia edição por cima do arquivo',
      hadFailures: true,
      respostaCortada: true
    };
  }

  if (edits.length > 0) {
    const { content, appliedCount, failedEdits } = applyCodeEdits(currentContent, edits);

    /**
     * ARQUIVO VAZIO: O QUE VEIO NO 'REPLACE' É O ARQUIVO. Não jogue fora.
     *
     * Num arquivo em branco não existe trecho para procurar, então TODA edição falha — e o
     * conteúdo voltava vazio, exatamente como entrou. O modelo tinha escrito o código inteiro
     * dentro da parte de substituição, e ele era descartado: a pessoa pedia um app, o modelo
     * escrevia o app, e o editor continuava com zero caractere. Gerar de novo dava no mesmo,
     * porque o defeito não estava no modelo.
     *
     * A instrução pede para responder o arquivo completo quando não há código anterior, e isso
     * continua valendo — mas o modelo manda blocos assim mesmo, com frequência, e perder o
     * trabalho por causa do formato é o pior desfecho possível. Quando não havia nada para
     * editar, o que ele escreveu no lugar É o arquivo.
     */
    if (appliedCount === 0 && arquivoEstavaVazio) {
      const criado = edits.map(e => e.new_string).join('\n').trim();
      if (criado) {
        return {
          content: criado,
          summary: `arquivo criado a partir do conteúdo proposto (${edits.length} bloco(s))`,
          hadFailures: false,
          respostaCortada: false
        };
      }
    }

    const parts: string[] = [];
    if (appliedCount > 0) parts.push(`${appliedCount} edição(ões) aplicada(s) com precisão`);
    if (failedEdits.length > 0) {
      parts.push(`${failedEdits.length} edição(ões) não puderam ser aplicadas: ${failedEdits.map(f => f.reason).join('; ')}`);
    }
    return { content, summary: parts.join('. '), hadFailures: failedEdits.length > 0, respostaCortada: false };
  }

  return { content: stripOuterMarkdownFence(text), summary: '', hadFailures: false, respostaCortada: false };
}
