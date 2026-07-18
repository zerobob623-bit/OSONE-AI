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
  
  for (let i = start; i < str.length; i++) {
    if (str[i] === openChar) depth++;
    else if (str[i] === closeChar) {
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
