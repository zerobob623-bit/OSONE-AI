/**
 * REALCE DE SINTAXE — as cores do editor, sem trazer um editor inteiro junto.
 *
 * Por que escrito aqui em vez de usar CodeMirror ou Monaco: os dois pesam perto de um megabyte, e
 * o pacote deste app já passa de quatro. Trocar um editor de texto por um editor completo também
 * traria o comportamento inteiro deles — rolagem, seleção, atalhos —, jogando fora a régua de
 * linhas, o Tab que indenta e o desfazer que já funcionam aqui e já têm conferidor.
 *
 * COMO FUNCIONA, e por que a exatidão importa mais do que as cores:
 *
 * O realce é uma camada desenhada ATRÁS de uma área de texto transparente. As duas precisam
 * ocupar exatamente o mesmo espaço, caractere por caractere: um espaço a mais na camada de trás e
 * o texto colorido descola do texto real, o cursor aparece no lugar errado e o editor fica
 * inutilizável. Por isso a regra desta função não é "colorir bonito", é NÃO MEXER NO TEXTO —
 * tirar as marcações do resultado tem de devolver o original, byte por byte. É isso que o
 * conferidor verifica em cada linguagem.
 *
 * A ordem das regras é a outra metade da correção: comentário e texto entre aspas vêm ANTES de
 * palavra-chave, senão a palavra 'for' escrita dentro de um comentário sai pintada como comando.
 */

export type LinguagemDeRealce = 'javascript' | 'css' | 'html' | 'python' | 'json' | 'markdown' | 'texto';

/** Descobre a linguagem pelo nome do arquivo — é o que o editor tem em mãos. */
export function linguagemDoArquivo(nome: string, linguagemDeclarada?: string): LinguagemDeRealce {
  const ext = (nome || '').split('.').pop()?.toLowerCase() || '';
  if (['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx'].includes(ext)) return 'javascript';
  if (ext === 'css' || ext === 'scss' || ext === 'less') return 'css';
  if (ext === 'html' || ext === 'htm' || ext === 'svg' || ext === 'xml') return 'html';
  if (ext === 'py') return 'python';
  if (ext === 'json') return 'json';
  if (ext === 'md' || ext === 'markdown') return 'markdown';

  const d = (linguagemDeclarada || '').toLowerCase();
  if (['javascript', 'typescript'].includes(d)) return 'javascript';
  if (['css', 'html', 'python', 'json', 'markdown'].includes(d)) return d as LinguagemDeRealce;
  return 'texto';
}

/** Sem isto, um `<div>` no código fecharia a camada de realce e derrubaria o desenho da tela. */
function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface Regra {
  classe: string;
  re: RegExp;
}

const PALAVRAS_JS = 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|typeof|instanceof|in|of|try|catch|finally|throw|async|await|yield|import|export|from|as|default|delete|void|static|get|set';
const LITERAIS_JS = 'true|false|null|undefined|NaN|Infinity';

const PALAVRAS_PY = 'def|return|if|elif|else|for|while|break|continue|class|import|from|as|try|except|finally|raise|with|lambda|global|nonlocal|assert|del|pass|yield|async|await|in|is|not|and|or';
const LITERAIS_PY = 'True|False|None|self';

/**
 * As regras de cada linguagem, EM ORDEM DE PRIORIDADE. A primeira que casar num ponto vence.
 * Comentário e texto entre aspas primeiro, sempre.
 */
const REGRAS: Record<LinguagemDeRealce, Regra[]> = {
  javascript: [
    { classe: 'r-com', re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
    { classe: 'r-str', re: /`(?:\\[\s\S]|[^`\\])*`|'(?:\\[\s\S]|[^'\\\n])*'|"(?:\\[\s\S]|[^"\\\n])*"/y },
    { classe: 'r-num', re: /\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y },
    { classe: 'r-lit', re: new RegExp(`\\b(?:${LITERAIS_JS})\\b`, 'y') },
    { classe: 'r-kw', re: new RegExp(`\\b(?:${PALAVRAS_JS})\\b`, 'y') },
    { classe: 'r-fn', re: /\b[A-Za-z_$][\w$]*(?=\s*\()/y },
    { classe: 'r-tipo', re: /\b[A-Z][\w$]*\b/y }
  ],
  python: [
    { classe: 'r-com', re: /#[^\n]*/y },
    { classe: 'r-str', re: /"""[\s\S]*?"""|'''[\s\S]*?'''|'(?:\\[\s\S]|[^'\\\n])*'|"(?:\\[\s\S]|[^"\\\n])*"/y },
    { classe: 'r-num', re: /\b\d+(?:\.\d+)?\b/y },
    { classe: 'r-lit', re: new RegExp(`\\b(?:${LITERAIS_PY})\\b`, 'y') },
    { classe: 'r-kw', re: new RegExp(`\\b(?:${PALAVRAS_PY})\\b`, 'y') },
    { classe: 'r-dec', re: /@[A-Za-z_][\w.]*/y },
    { classe: 'r-fn', re: /\b[A-Za-z_][\w]*(?=\s*\()/y }
  ],
  css: [
    { classe: 'r-com', re: /\/\*[\s\S]*?\*\//y },
    { classe: 'r-str', re: /'(?:\\[\s\S]|[^'\\\n])*'|"(?:\\[\s\S]|[^"\\\n])*"/y },
    { classe: 'r-at', re: /@[a-zA-Z-]+/y },
    { classe: 'r-num', re: /-?\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b|#[0-9a-fA-F]{3,8}\b/y },
    { classe: 'r-sel', re: /[.#][A-Za-z_-][\w-]*/y },
    { classe: 'r-prop', re: /[a-zA-Z-]+(?=\s*:)/y }
  ],
  html: [
    { classe: 'r-com', re: /&lt;!--[\s\S]*?--&gt;|<!--[\s\S]*?-->/y },
    { classe: 'r-str', re: /'(?:[^'\n])*'|"(?:[^"\n])*"/y },
    { classe: 'r-tag', re: /<\/?[A-Za-z][\w-]*|\/?>/y },
    { classe: 'r-attr', re: /\b[a-zA-Z-]+(?==)/y }
  ],
  json: [
    { classe: 'r-chave', re: /"(?:\\[\s\S]|[^"\\\n])*"(?=\s*:)/y },
    { classe: 'r-str', re: /"(?:\\[\s\S]|[^"\\\n])*"/y },
    { classe: 'r-num', re: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y },
    { classe: 'r-lit', re: /\b(?:true|false|null)\b/y }
  ],
  markdown: [
    { classe: 'r-com', re: /^```[\s\S]*?```/my },
    { classe: 'r-kw', re: /^#{1,6}[^\n]*/my },
    { classe: 'r-str', re: /`[^`\n]*`/y },
    { classe: 'r-lit', re: /\*\*[^*\n]+\*\*|\*[^*\n]+\*/y }
  ],
  texto: []
};

/**
 * Devolve o código em HTML, com trechos envolvidos em <span class="r-...">.
 *
 * O que entra e o que sai têm exatamente o mesmo texto: só as marcações são acrescentadas. Essa é
 * a condição para a camada colorida ficar alinhada com a área de escrita, e é o que o conferidor
 * confere em toda linguagem.
 */
export function realcar(codigo: string, linguagem: LinguagemDeRealce): string {
  const texto = codigo || '';
  const regras = REGRAS[linguagem] || [];
  if (regras.length === 0) return escapar(texto);

  let saida = '';
  let i = 0;
  let pendente = '';

  const despejarPendente = () => {
    if (pendente) {
      saida += escapar(pendente);
      pendente = '';
    }
  };

  while (i < texto.length) {
    let casou = false;

    for (const regra of regras) {
      regra.re.lastIndex = i;
      const m = regra.re.exec(texto);
      // Regex 'sticky' (y) só casa exatamente na posição i, então não há risco de pular texto.
      if (m && m[0].length > 0) {
        despejarPendente();
        saida += `<span class="${regra.classe}">${escapar(m[0])}</span>`;
        i += m[0].length;
        casou = true;
        break;
      }
    }

    if (!casou) {
      // Caractere sem regra: vai para o texto comum. Acumular em vez de despejar um a um evita
      // milhares de concatenações num arquivo grande.
      pendente += texto[i];
      i++;
    }
  }

  despejarPendente();
  return saida;
}

/**
 * Tira as marcações e devolve só o texto — usado pelo conferidor para provar que o realce não
 * alterou uma vírgula sequer do código.
 */
export function textoSemMarcacao(html: string): string {
  return html
    .replace(/<span class="[^"]*">/g, '')
    .replace(/<\/span>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
