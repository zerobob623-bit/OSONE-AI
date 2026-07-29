/**
 * Aplicação de edições cirúrgicas em código-fonte, no mesmo espírito da ferramenta Edit
 * usada por assistentes de codificação agênticos: cada edição precisa casar de forma
 * EXATA e ÚNICA com um trecho do conteúdo atual. Isso evita que o modelo precise
 * reescrever o arquivo inteiro a cada pedido (lento, caro e arriscado de esquecer algo).
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
 * Extrai o objeto JSON de uma resposta de modelo, removendo cercas de markdown
 * (```json ... ```) se presentes.
 */
export function parseModelJson(rawText: string): any {
  let text = (rawText || '').trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  }
  return JSON.parse(text);
}

const CODE_EDIT_SYSTEM_INSTRUCTION_TEMPLATE = (roleIntro: string) => `${roleIntro}

Assim como um assistente de codificação real (par de programação estilo "vibe coding"), você NUNCA reescreve um arquivo inteiro do zero quando já existe código funcionando. Você faz EDIÇÕES CIRÚRGICAS: localiza o trecho exato que precisa mudar e substitui só ele, preservando tudo o resto exatamente como está — sem esquecer, remover ou alterar por acidente nada que não foi pedido.

Se já existir código no arquivo, responda ESTRITAMENTE com este JSON (nada além dele, sem markdown):
{
  "mode": "edits",
  "edits": [
    { "old_string": "trecho exato e único do código atual a ser substituído", "new_string": "texto que entra no lugar" }
  ]
}

Regras rígidas para "old_string":
- Cópia LITERAL e EXATA de um trecho do código atual fornecido (mesma indentação, aspas, espaços e quebras de linha).
- Grande o suficiente para ser único no arquivo inteiro (se o mesmo trecho aparecer mais de uma vez, inclua mais linhas de contexto ao redor até ficar único).
- Nunca invente ou aproxime um trecho que não existe exatamente daquele jeito no código atual.
- Para mudanças em pontos diferentes e não relacionados do arquivo, use múltiplos itens em "edits", cada um pequeno e focado numa única mudança.

Se o arquivo estiver vazio ou você estiver criando algo totalmente novo do zero, responda com:
{
  "mode": "full",
  "content": "código fonte completo do zero"
}

Retorne APENAS o JSON acima, sem explicações, sem texto fora dele, sem cercas de markdown.`;

export function buildCodeEditSystemInstruction(roleIntro: string): string {
  return CODE_EDIT_SYSTEM_INSTRUCTION_TEMPLATE(roleIntro);
}

export interface CodeEditModelResponse {
  mode: 'edits' | 'full';
  edits?: CodeEdit[];
  content?: string;
}

/**
 * Recebe o texto cru retornado pelo modelo (esperado no formato { mode, edits | content }),
 * aplica sobre o conteúdo atual e retorna o novo conteúdo + um resumo do que foi aplicado.
 * Nunca lança: em caso de resposta inesperada, cai de volta para tratar o texto como o
 * conteúdo completo do arquivo (comportamento antigo), preservando compatibilidade.
 */
export function applyModelCodeResponse(rawText: string, currentContent: string): {
  content: string;
  summary: string;
  hadFailures: boolean;
} {
  let parsed: CodeEditModelResponse | null = null;
  try {
    parsed = parseModelJson(rawText);
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed !== 'object') {
    // Resposta não veio no formato esperado: trata como conteúdo integral (fallback seguro).
    let fallbackText = (rawText || '').trim();
    if (fallbackText.startsWith('```')) {
      fallbackText = fallbackText.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    }
    return { content: fallbackText, summary: '', hadFailures: false };
  }

  if (parsed.mode === 'full' && typeof parsed.content === 'string') {
    return { content: parsed.content, summary: '', hadFailures: false };
  }

  if (parsed.mode === 'edits' && Array.isArray(parsed.edits)) {
    const { content, appliedCount, failedEdits } = applyCodeEdits(currentContent, parsed.edits);
    const parts: string[] = [];
    if (appliedCount > 0) parts.push(`${appliedCount} edição(ões) aplicada(s) com precisão`);
    if (failedEdits.length > 0) {
      parts.push(`${failedEdits.length} edição(ões) não puderam ser aplicadas: ${failedEdits.map(f => f.reason).join('; ')}`);
    }
    return { content, summary: parts.join('. '), hadFailures: failedEdits.length > 0 };
  }

  // Formato desconhecido: fallback seguro para não perder a resposta do modelo.
  if (typeof parsed.content === 'string') {
    return { content: parsed.content, summary: '', hadFailures: false };
  }

  return { content: currentContent, summary: 'Resposta do modelo em formato inesperado; nenhuma alteração aplicada.', hadFailures: true };
}
