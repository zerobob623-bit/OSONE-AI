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

const SEARCH_REPLACE_BLOCK_RE = /<{5,}\s*SEARCH\s*\r?\n([\s\S]*?)\r?\n={5,}\s*\r?\n([\s\S]*?)\r?\n>{5,}\s*REPLACE/g;

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
  const edits: CodeEdit[] = [];
  const re = new RegExp(SEARCH_REPLACE_BLOCK_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    edits.push({ old_string: match[1], new_string: match[2] });
  }
  return edits;
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

Se o arquivo estiver vazio ou você estiver criando algo totalmente novo do zero, NÃO use blocos SEARCH/REPLACE: responda diretamente com o código-fonte COMPLETO do zero, sem nenhum marcador, sem explicações antes ou depois, sem cortar nada por brevidade.`;

export function buildCodeEditSystemInstruction(roleIntro: string): string {
  return CODE_EDIT_SYSTEM_INSTRUCTION_TEMPLATE(roleIntro);
}

/**
 * Recebe o texto cru retornado pelo modelo e aplica sobre o conteúdo atual.
 * - Se houver blocos SEARCH/REPLACE, aplica cada um como edição cirúrgica.
 * - Caso contrário, trata a resposta inteira como o conteúdo completo do arquivo (uso
 *   esperado quando não havia código anterior, ou fallback se o modelo ignorar o formato).
 * Nunca lança exceção.
 */
export function applyModelCodeResponse(rawText: string, currentContent: string): {
  content: string;
  summary: string;
  hadFailures: boolean;
} {
  const text = (rawText || '').trim();
  const edits = parseSearchReplaceEdits(text);

  if (edits.length > 0) {
    const { content, appliedCount, failedEdits } = applyCodeEdits(currentContent, edits);
    const parts: string[] = [];
    if (appliedCount > 0) parts.push(`${appliedCount} edição(ões) aplicada(s) com precisão`);
    if (failedEdits.length > 0) {
      parts.push(`${failedEdits.length} edição(ões) não puderam ser aplicadas: ${failedEdits.map(f => f.reason).join('; ')}`);
    }
    return { content, summary: parts.join('. '), hadFailures: failedEdits.length > 0 };
  }

  return { content: stripOuterMarkdownFence(text), summary: '', hadFailures: false };
}
