import type { SoundEffect } from '../types';

export type TipoDeAudio = 'efeito' | 'musica' | 'ambiente';
export const CATEGORIAS_DE_AUDIO = ['comico', 'terror', 'suspense', 'interface', 'magia', 'impacto', 'natureza', 'ambiente', 'musica'] as const;
const CATEGORIAS = new Set<string>(CATEGORIAS_DE_AUDIO);

export function tipoDaCategoria(category: string): TipoDeAudio {
  if (category === 'musica') return 'musica';
  if (category === 'ambiente' || category === 'natureza') return 'ambiente';
  return 'efeito';
}

export function validarAudioDaBiblioteca(bruto: Partial<SoundEffect>):
  { ok: true; audio: Omit<SoundEffect, 'id'> } | { ok: false; erro: string } {
  const name = String(bruto.name || '').trim().replace(/\s+/g, ' ');
  const category = String(bruto.category || '').trim().toLowerCase();
  const url = String(bruto.url || '').trim();
  if (name.length < 2 || name.length > 100) return { ok: false, erro: 'O nome precisa ter entre 2 e 100 caracteres.' };
  if (!CATEGORIAS.has(category)) return { ok: false, erro: `Categoria inválida: ${category || '(vazia)'}.` };
  if (!url) return { ok: false, erro: 'Informe uma fonte de áudio real.' };
  const interna = /^(db:\/\/|data:audio\/|synth:\/\/)/i.test(url);
  let web = false;
  if (/^https:\/\//i.test(url)) {
    try { const u = new URL(url); web = /\.(mp3|wav|ogg|m4a|aac|flac)(?:$|[?#])/i.test(u.pathname + u.search + u.hash); } catch { web = false; }
  }
  if (!interna && !web) return { ok: false, erro: 'A fonte precisa ser HTTPS e apontar para um arquivo de áudio real.' };
  const tipo = bruto.tipo || tipoDaCategoria(category);
  if (tipo !== tipoDaCategoria(category)) return { ok: false, erro: `A categoria “${category}” não corresponde ao tipo “${tipo}”.` };
  return { ok: true, audio: { name, category, url, tipo, origem: String(bruto.origem || '').trim() || undefined } };
}

export function normalizarBibliotecaDeSons(lista: SoundEffect[]): SoundEffect[] {
  const mapa: Record<string, string> = { funny: 'comico', halloween: 'terror', horror: 'terror', sneaky: 'suspense', epic: 'musica', synth: 'musica', ambient: 'ambiente' };
  return (lista || []).map(s => { const category = mapa[s.category] || s.category; return { ...s, category, tipo: tipoDaCategoria(category) }; });
}
