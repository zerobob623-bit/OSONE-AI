/**
 * Caminhos internos do OSONE CODE.
 *
 * O editor começou como uma lista simples de arquivos (`index.html`, `styles.css`). Quando o
 * projeto vira fullstack, esse modelo quebra: `frontend/index.html`, `server/api.js` e
 * `src/app.ts` precisam continuar sendo caminhos reais no preview, no zip e no GitHub.
 *
 * Ao mesmo tempo, esses caminhos vêm de texto digitado pelo usuário ou pela IA. Por isso a regra é:
 * preservar pastas úteis, mas nunca aceitar caminho absoluto, `..` ou caracteres que fazem um zip
 * escrever fora da pasta escolhida ao extrair.
 */

const CARACTERES_INVALIDOS_SEGMENTO = /[<>:"|?*\x00-\x1f]/g;

export function ehEnderecoExternoDoCode(caminho: string): boolean {
  return /^(https?:)?\/\//i.test(caminho || '')
    || /^(data|blob|mailto|tel):/i.test(caminho || '')
    || /^[a-z][a-z0-9+.-]*:/i.test(caminho || '');
}

export function semQueryEAncora(caminho: string): string {
  return (caminho || '').split(/[?#]/)[0] || '';
}

function limparSegmento(segmento: string, reserva: string): string {
  const limpo = (segmento || '')
    .replace(CARACTERES_INVALIDOS_SEGMENTO, '-')
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+$/, '')
    .replace(/^\.+(?=[^.])/, '');
  return (limpo || reserva).slice(0, 120);
}

/**
 * Normaliza um caminho de arquivo do projeto virtual preservando subpastas.
 *
 * Exemplos:
 * - `frontend/index.html` fica `frontend/index.html`
 * - `./src/app.ts` fica `src/app.ts`
 * - `../../.env` vira `env` dentro do projeto, nunca fora dele
 */
export function normalizarCaminhoDoCode(caminho: string, reserva = 'arquivo.txt'): string {
  const cru = semQueryEAncora(caminho)
    .replace(/\\/g, '/')
    .replace(/^[a-z]:/i, '')
    .replace(/^\/+/, '')
    .trim();

  const partes = cru
    .split('/')
    .map(p => p.trim())
    .filter(p => p && p !== '.' && p !== '..')
    .map((p, i) => limparSegmento(p, i === 0 ? reserva : 'pasta'));

  const junto = partes.join('/').slice(0, 240);
  return junto || reserva;
}

export function nomeBaseDoCaminho(caminho: string, reserva = 'arquivo.txt'): string {
  const normalizado = normalizarCaminhoDoCode(caminho, reserva);
  return normalizado.split('/').filter(Boolean).pop() || reserva;
}

export function pastaDoCaminho(caminho: string): string {
  const normalizado = normalizarCaminhoDoCode(caminho);
  const partes = normalizado.split('/').filter(Boolean);
  partes.pop();
  return partes.join('/');
}

export function chaveDeCaminho(caminho: string): string {
  return normalizarCaminhoDoCode(caminho).toLowerCase();
}

export function resolverCaminhoRelativo(origem: string, referencia: string): string {
  const ref = semQueryEAncora(referencia).replace(/\\/g, '/').trim();
  if (!ref) return '';
  if (ehEnderecoExternoDoCode(ref)) return ref;
  if (ref.startsWith('/')) return normalizarCaminhoDoCode(ref);

  const base = ref.startsWith('./') || ref.startsWith('../')
    ? pastaDoCaminho(origem)
    : pastaDoCaminho(origem);

  const partes = [...base.split('/').filter(Boolean), ...ref.split('/').filter(Boolean)];
  const pilha: string[] = [];
  for (const parte of partes) {
    if (!parte || parte === '.') continue;
    if (parte === '..') {
      pilha.pop();
      continue;
    }
    pilha.push(parte);
  }
  return normalizarCaminhoDoCode(pilha.join('/'));
}

export function caminhoDisponivel(desejado: string, ocupados: Iterable<string>): string {
  const base = normalizarCaminhoDoCode(desejado);
  const usados = new Set(Array.from(ocupados, chaveDeCaminho));
  if (!usados.has(chaveDeCaminho(base))) return base;

  const partes = base.split('/');
  const nome = partes.pop() || 'arquivo.txt';
  const ponto = nome.lastIndexOf('.');
  const raiz = ponto === -1 ? nome : nome.slice(0, ponto);
  const ext = ponto === -1 ? '' : nome.slice(ponto);
  const pasta = partes.length ? `${partes.join('/')}/` : '';

  for (let n = 2; n < 1000; n++) {
    const tentativa = `${pasta}${raiz}-${n}${ext}`;
    if (!usados.has(chaveDeCaminho(tentativa))) return tentativa;
  }
  return `${pasta}${raiz}-${Date.now()}${ext}`;
}
