import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function extractJson(str: string): string {
  const firstOpenBrace = str.indexOf('{');
  const firstOpenBracket = str.indexOf('[');
  
  let start = -1;
  let type: '{' | '[' | null = null;
  
  if (firstOpenBrace !== -1 && (firstOpenBracket === -1 || firstOpenBrace < firstOpenBracket)) {
    start = firstOpenBrace;
    type = '{';
  } else if (firstOpenBracket !== -1) {
    start = firstOpenBracket;
    type = '[';
  }

  if (start === -1 || !type) return str.trim();

  const closeChar = type === '{' ? '}' : ']';
  const openChar = type;
  let depth = 0;

  /**
   * A contagem ignora o que está DENTRO de uma string.
   *
   * Contando chaves cruas, um texto do modelo com chave solta numa string — "use } para fechar",
   * um trecho de código, uma regex — fechava a conta antes da hora e devolvia um pedaço cortado
   * do JSON, que o JSON.parse recusava. Como esta função alimenta o safeJsonParse usado em todo
   * o app, o efeito era a resposta inteira virar o valor de reserva sem ninguém entender por quê.
   * Pular as strings (e o caractere escapado logo depois da barra) faz a conta valer só para a
   * estrutura de verdade.
   */
  let dentroDeString = false;
  let escapado = false;

  for (let i = start; i < str.length; i++) {
    const c = str[i];

    if (dentroDeString) {
      if (escapado) escapado = false;
      else if (c === '\\') escapado = true;
      else if (c === '"') dentroDeString = false;
      continue;
    }

    if (c === '"') {
      dentroDeString = true;
    } else if (c === openChar) {
      depth++;
    } else if (c === closeChar) {
      depth--;
      if (depth === 0) {
        return str.substring(start, i + 1);
      }
    }
  }

  // Fallback to simple lastIndexOf if nesting search fails
  const lastClose = str.lastIndexOf(closeChar);
  if (lastClose > start) {
    return str.substring(start, lastClose + 1);
  }
  
  return str.trim();
}

export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    const cleaned = extractJson(str);
    return JSON.parse(cleaned) as T;
  } catch (e) {
    console.error("Failed to parse JSON:", e, "Original string:", str);
    return fallback;
  }
}
