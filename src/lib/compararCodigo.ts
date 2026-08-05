import { CodeRepositoryFile } from '../types';

/**
 * Mostra o que a IA MUDOU, linha por linha.
 *
 * O desfazer já existia, mas era cego: dava para voltar atrás, não para saber do que se estava
 * voltando. Depois de um pedido, o arquivo tinha simplesmente OUTRO conteúdo — e num jogo de 50
 * mil caracteres não há como conferir de olho se o modelo mexeu só onde devia. Sobravam duas
 * saídas ruins: aceitar no escuro, ou desfazer por precaução e perder também o que estava certo.
 *
 * Ver a diferença resolve a dúvida no lugar onde ela nasce.
 */

export type TipoDeLinha = 'igual' | 'adicionada' | 'removida';

export interface LinhaComparada {
  tipo: TipoDeLinha;
  texto: string;
  /** Número da linha no arquivo ANTES (vazio quando a linha é nova). */
  numeroAntes?: number;
  /** Número da linha no arquivo DEPOIS (vazio quando a linha foi removida). */
  numeroDepois?: number;
}

export interface ComparacaoDeArquivo {
  nome: string;
  situacao: 'criado' | 'apagado' | 'alterado';
  linhas: LinhaComparada[];
  adicionadas: number;
  removidas: number;
  /** true quando o arquivo era grande demais para comparar linha a linha (ver LIMITE_DA_MALHA). */
  comparacaoGrosseira?: boolean;
}

/**
 * O tamanho a partir do qual a comparação exata deixa de valer a pena.
 *
 * Comparar linha a linha custa (linhas de A × linhas de B) em memória. Num par de arquivos de
 * cinco mil linhas isso são 25 milhões de células — a aba congela por segundos e pode ficar sem
 * memória, para mostrar uma tela que a pessoa não vai ler inteira de qualquer jeito. Passando
 * daqui, o trecho diferente é mostrado em bloco: menos detalhe, mas a aba continua respondendo.
 */
const LIMITE_DA_MALHA = 4_000_000;

/**
 * As linhas iguais no começo e no fim, que não precisam entrar na comparação cara.
 *
 * É o que torna a comparação exata viável em arquivo grande: uma edição de três linhas no meio de
 * um jogo de mil e quinhentas deixa quase tudo idêntico nas pontas, e o miolo a comparar encolhe
 * de mil e quinhentas para poucas dezenas.
 */
function recortarPontasIguais(a: string[], b: string[]) {
  let inicio = 0;
  while (inicio < a.length && inicio < b.length && a[inicio] === b[inicio]) inicio++;

  let fim = 0;
  while (
    fim < a.length - inicio &&
    fim < b.length - inicio &&
    a[a.length - 1 - fim] === b[b.length - 1 - fim]
  ) fim++;

  return { inicio, fim, mioloA: a.slice(inicio, a.length - fim), mioloB: b.slice(inicio, b.length - fim) };
}

/** A maior subsequência comum, que é o que separa "linha movida" de "linha reescrita". */
function malhaDeComuns(a: string[], b: string[]): number[][] {
  const m = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      m[i][j] = a[i] === b[j] ? m[i + 1][j + 1] + 1 : Math.max(m[i + 1][j], m[i][j + 1]);
    }
  }
  return m;
}

/** Compara dois textos linha a linha. */
export function compararLinhas(antes: string, depois: string): { linhas: LinhaComparada[]; grosseira: boolean } {
  const a = (antes || '').split('\n');
  const b = (depois || '').split('\n');
  const { inicio, fim, mioloA, mioloB } = recortarPontasIguais(a, b);

  const linhas: LinhaComparada[] = [];
  for (let i = 0; i < inicio; i++) {
    linhas.push({ tipo: 'igual', texto: a[i], numeroAntes: i + 1, numeroDepois: i + 1 });
  }

  let grosseira = false;
  if (mioloA.length * mioloB.length > LIMITE_DA_MALHA) {
    // Grande demais para a comparação exata: o miolo inteiro vira "saiu isto, entrou aquilo".
    grosseira = true;
    mioloA.forEach((texto, i) => linhas.push({ tipo: 'removida', texto, numeroAntes: inicio + i + 1 }));
    mioloB.forEach((texto, i) => linhas.push({ tipo: 'adicionada', texto, numeroDepois: inicio + i + 1 }));
  } else {
    const m = malhaDeComuns(mioloA, mioloB);
    let i = 0, j = 0;
    while (i < mioloA.length && j < mioloB.length) {
      if (mioloA[i] === mioloB[j]) {
        linhas.push({ tipo: 'igual', texto: mioloA[i], numeroAntes: inicio + i + 1, numeroDepois: inicio + j + 1 });
        i++; j++;
      } else if (m[i + 1][j] >= m[i][j + 1]) {
        linhas.push({ tipo: 'removida', texto: mioloA[i], numeroAntes: inicio + i + 1 });
        i++;
      } else {
        linhas.push({ tipo: 'adicionada', texto: mioloB[j], numeroDepois: inicio + j + 1 });
        j++;
      }
    }
    while (i < mioloA.length) { linhas.push({ tipo: 'removida', texto: mioloA[i], numeroAntes: inicio + i + 1 }); i++; }
    while (j < mioloB.length) { linhas.push({ tipo: 'adicionada', texto: mioloB[j], numeroDepois: inicio + j + 1 }); j++; }
  }

  for (let k = 0; k < fim; k++) {
    const iA = a.length - fim + k;
    const iB = b.length - fim + k;
    linhas.push({ tipo: 'igual', texto: a[iA], numeroAntes: iA + 1, numeroDepois: iB + 1 });
  }

  return { linhas, grosseira };
}

/**
 * Deixa só o que interessa olhar: os trechos que mudaram, com algumas linhas de contexto.
 *
 * Sem isto, comparar um jogo de mil e quinhentas linhas mostraria mil e quinhentas linhas para
 * revelar três diferentes — e quem estivesse conferindo teria que caçá-las rolando. As linhas
 * omitidas viram uma marca, para ficar claro que o arquivo continua entre um trecho e outro.
 */
export function apenasOsTrechosQueMudaram(linhas: LinhaComparada[], contexto = 3): LinhaComparada[] {
  const interessa = new Set<number>();
  linhas.forEach((l, i) => {
    if (l.tipo === 'igual') return;
    for (let k = Math.max(0, i - contexto); k <= Math.min(linhas.length - 1, i + contexto); k++) interessa.add(k);
  });

  const resultado: LinhaComparada[] = [];
  let pulando = false;
  linhas.forEach((l, i) => {
    if (interessa.has(i)) {
      resultado.push(l);
      pulando = false;
    } else if (!pulando) {
      resultado.push({ tipo: 'igual', texto: '⋯' });
      pulando = true;
    }
  });
  return resultado;
}

/** Compara duas versões do projeto e devolve só os arquivos que mudaram. */
export function compararProjeto(
  antes: CodeRepositoryFile[],
  depois: CodeRepositoryFile[]
): ComparacaoDeArquivo[] {
  const porIdAntes = new Map((antes || []).map(f => [f.id, f]));
  const porIdDepois = new Map((depois || []).map(f => [f.id, f]));
  const comparacoes: ComparacaoDeArquivo[] = [];

  for (const arquivo of depois || []) {
    const anterior = porIdAntes.get(arquivo.id);
    if (anterior && anterior.content === arquivo.content) continue;

    const { linhas, grosseira } = compararLinhas(anterior?.content ?? '', arquivo.content ?? '');
    comparacoes.push({
      nome: arquivo.name,
      situacao: anterior ? 'alterado' : 'criado',
      linhas,
      adicionadas: linhas.filter(l => l.tipo === 'adicionada').length,
      removidas: linhas.filter(l => l.tipo === 'removida').length,
      comparacaoGrosseira: grosseira
    });
  }

  // Arquivo que existia e sumiu também é uma mudança — e das que mais importam ver.
  for (const arquivo of antes || []) {
    if (porIdDepois.has(arquivo.id)) continue;
    const { linhas } = compararLinhas(arquivo.content ?? '', '');
    comparacoes.push({
      nome: arquivo.name,
      situacao: 'apagado',
      linhas,
      adicionadas: 0,
      removidas: linhas.filter(l => l.tipo === 'removida').length
    });
  }

  return comparacoes;
}
