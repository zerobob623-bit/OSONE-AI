import { CodeRepositoryFile } from '../types';

/**
 * BUSCA E SUBSTITUIÇÃO EM TODOS OS ARQUIVOS.
 *
 * É a ferramenta mais usada de qualquer editor depois do próprio editor, e não existia: para achar
 * onde uma função era chamada, só abrindo arquivo por arquivo e lendo com o olho. Renomear uma
 * variável usada em quatro arquivos era quatro edições manuais, com a chance de esquecer uma — e
 * uma chamada esquecida só aparece quando o programa quebra, longe de onde a mudança foi feita.
 *
 * A busca é feita no conteúdo guardado, e não no que está na tela: o arquivo aberto pode estar
 * sendo digitado neste instante, e é o texto em edição que vale para ele.
 */

export interface OcorrenciaNaBusca {
  arquivoId: string;
  arquivoNome: string;
  /** Linha onde está, começando em 1 — é assim que se fala de linha em código. */
  linha: number;
  /** A linha inteira, para dar contexto sem precisar abrir o arquivo. */
  textoDaLinha: string;
  /** Posição do trecho dentro do arquivo, para o editor poder selecioná-lo. */
  inicio: number;
  fim: number;
}

export interface OpcoesDeBusca {
  /** Diferenciar maiúsculas de minúsculas. */
  caseSensitive?: boolean;
  /** Casar só palavra inteira: procurar "id" não devolve "width". */
  palavraInteira?: boolean;
  /** Tratar o termo como expressão regular. */
  regex?: boolean;
}

export interface ResultadoDaBusca {
  ocorrencias: OcorrenciaNaBusca[];
  /** Quando o termo é uma expressão regular inválida, a busca explica em vez de não achar nada. */
  erro?: string;
}

function escaparRegex(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function montarPadrao(termo: string, opcoes: OpcoesDeBusca): RegExp | { erro: string } {
  const corpo = opcoes.regex ? termo : escaparRegex(termo);
  // \b não funciona em volta de símbolo (procurar "+" com palavra inteira nunca casaria); a
  // fronteira só é aplicada quando o termo começa e termina com caractere de palavra.
  const podeFronteira = /^\w/.test(termo) && /\w$/.test(termo);
  const comFronteira = opcoes.palavraInteira && podeFronteira ? `\\b${corpo}\\b` : corpo;
  try {
    return new RegExp(comFronteira, opcoes.caseSensitive ? 'g' : 'gi');
  } catch (e: any) {
    return { erro: `Expressão de busca inválida: ${e?.message || e}` };
  }
}

/** Índice da linha (base 1) e início dela, para um deslocamento dentro do texto. */
function linhaDoIndice(texto: string, indice: number): { linha: number; inicioDaLinha: number } {
  let linha = 1;
  let inicioDaLinha = 0;
  for (let i = 0; i < indice; i++) {
    if (texto.charCodeAt(i) === 10) {
      linha++;
      inicioDaLinha = i + 1;
    }
  }
  return { linha, inicioDaLinha };
}

/** Limite de ocorrências devolvidas: uma busca por "e" num projeto grande travaria a tela. */
export const MAXIMO_DE_OCORRENCIAS = 500;

export function buscarNoProjeto(
  arquivos: CodeRepositoryFile[],
  termo: string,
  opcoes: OpcoesDeBusca = {}
): ResultadoDaBusca {
  if (!termo) return { ocorrencias: [] };

  const padrao = montarPadrao(termo, opcoes);
  if ('erro' in padrao) return { ocorrencias: [], erro: padrao.erro };

  const ocorrencias: OcorrenciaNaBusca[] = [];

  for (const arquivo of arquivos || []) {
    const conteudo = arquivo?.content || '';
    padrao.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = padrao.exec(conteudo)) !== null) {
      // Casamento vazio (uma regex como 'a*') não avança o cursor e prenderia o laço para sempre.
      if (m[0].length === 0) {
        padrao.lastIndex++;
        continue;
      }

      const { linha, inicioDaLinha } = linhaDoIndice(conteudo, m.index);
      const fimDaLinha = conteudo.indexOf('\n', m.index);
      ocorrencias.push({
        arquivoId: arquivo.id,
        arquivoNome: arquivo.name,
        linha,
        textoDaLinha: conteudo.slice(inicioDaLinha, fimDaLinha === -1 ? conteudo.length : fimDaLinha).trim().slice(0, 200),
        inicio: m.index,
        fim: m.index + m[0].length
      });

      if (ocorrencias.length >= MAXIMO_DE_OCORRENCIAS) {
        return { ocorrencias, erro: `Mostrando as primeiras ${MAXIMO_DE_OCORRENCIAS} ocorrências. Refine a busca para ver o resto.` };
      }
    }
  }

  return { ocorrencias };
}

export interface ResultadoDaSubstituicao {
  arquivos: CodeRepositoryFile[];
  /** Quantos trechos foram trocados, e em quantos arquivos — o que o usuário precisa conferir. */
  trocas: number;
  arquivosAfetados: string[];
  erro?: string;
}

/**
 * Substitui em todos os arquivos e devolve uma lista NOVA.
 *
 * Não altera nada no lugar: quem chama decide o que fazer com o resultado, e é isso que permite a
 * troca entrar no histórico de desfazer como uma única ação. Uma substituição em massa sem desfazer
 * é a operação mais perigosa de um editor.
 */
export function substituirNoProjeto(
  arquivos: CodeRepositoryFile[],
  termo: string,
  substituto: string,
  opcoes: OpcoesDeBusca = {}
): ResultadoDaSubstituicao {
  if (!termo) return { arquivos: arquivos || [], trocas: 0, arquivosAfetados: [] };

  const padrao = montarPadrao(termo, opcoes);
  if ('erro' in padrao) return { arquivos: arquivos || [], trocas: 0, arquivosAfetados: [], erro: padrao.erro };

  let trocas = 0;
  const arquivosAfetados: string[] = [];

  const novos = (arquivos || []).map(arquivo => {
    const conteudo = arquivo?.content || '';
    padrao.lastIndex = 0;
    let trocasAqui = 0;

    const novoConteudo = conteudo.replace(padrao, (achado) => {
      if (achado.length === 0) return achado;
      trocasAqui++;
      return substituto;
    });

    if (trocasAqui === 0) return arquivo;
    trocas += trocasAqui;
    arquivosAfetados.push(arquivo.name);
    return { ...arquivo, content: novoConteudo, updatedAt: Date.now() };
  });

  return { arquivos: novos, trocas, arquivosAfetados };
}
