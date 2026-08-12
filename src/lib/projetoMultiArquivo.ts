import { CodeRepositoryFile } from '../types';
import { chaveDeCaminho, normalizarCaminhoDoCode } from './caminhosDoCode';

/**
 * A IA ESCREVENDO MAIS DE UM ARQUIVO POR VEZ.
 *
 * ====== O QUE ESTAVA FALTANDO ======
 *
 * O OSONE CODE tem árvore de pastas, preview que monta o projeto inteiro, GitHub, enxame de
 * agentes e laço de conserto. Mas o caminho da IA até o repositório passava por um funil de um
 * arquivo só: applyModelCodeResponse recebe o conteúdo do arquivo ABERTO e devolve o conteúdo do
 * arquivo ABERTO. Não havia como o modelo dizer "crie src/App.tsx, src/components/Header.tsx e
 * package.json" — a árvore existia, e só a mão da pessoa a preenchia.
 *
 * O efeito prático era que o CODE gerava página, e não projeto. Pedir "um app com login, listagem
 * e um servidor" produzia um arquivo gigante ou uma resposta que falava de arquivos que ninguém
 * criou.
 *
 * ====== POR QUE ESTE FORMATO, E NÃO JSON ======
 *
 * Pela mesma razão que os blocos SEARCH/REPLACE não são JSON (ver codeEdits.ts): pedir código-fonte
 * dentro de JSON obriga o modelo a escapar aspas, barras e quebras de linha em arquivos inteiros, e
 * um único escape errado invalida a resposta toda — perdendo junto os arquivos que estavam certos.
 * Aqui o conteúdo vai cru, entre marcadores, e cada arquivo é independente dos outros.
 *
 * ====== A REGRA QUE MAIS IMPORTA: RESPOSTA CORTADA ======
 *
 * O modelo estoura o limite de tokens no meio de um arquivo com alguma frequência, e essa é a
 * falha que destrói trabalho. Um bloco sem o marcador de fim está incompleto POR DEFINIÇÃO — pode
 * ser meia função, meio HTML, meia tag. Gravar isso por cima de um arquivo que funcionava é o
 * pior resultado possível, e é silencioso: o app anuncia sucesso e o projeto quebra.
 *
 * Então: só entra no projeto o que veio FECHADO. O que ficou pela metade é descartado e reportado,
 * para quem chamou poder pedir a continuação em vez de comemorar.
 */

/** O marcador de abertura carrega o caminho; o de fechamento prova que o arquivo veio inteiro. */
const BLOCO_DE_ARQUIVO_RE = /<{5,}[ \t]*ARQUIVO[ \t]*:[ \t]*(.+?)[ \t]*\r?\n([\s\S]*?)\r?\n?>{5,}[ \t]*FIM[ \t]*ARQUIVO/g;
const ABERTURA_DE_ARQUIVO_RE = /<{5,}[ \t]*ARQUIVO[ \t]*:[ \t]*(.+?)[ \t]*\r?\n/;

export interface ArquivoDoModelo {
  caminho: string;
  conteudo: string;
}

export interface LeituraDeArquivos {
  arquivos: ArquivoDoModelo[];
  /** Veio um bloco aberto e sem fechar: a resposta acabou no meio de um arquivo. */
  cortada: boolean;
  /** O caminho do arquivo que ficou pela metade, quando dá para saber. */
  caminhoCortado?: string;
}

/**
 * Lê os blocos de arquivo de uma resposta — e diz se ela acabou no meio de um.
 *
 * A varredura de blocos completos, sozinha, não distingue "o modelo não usou o formato" de "o
 * modelo usou e foi cortado". As duas devolvem lista vazia, e a diferença é enorme: no primeiro
 * caso a resposta é texto comum; no segundo, existe meio arquivo que NÃO pode ser gravado.
 */
export function lerArquivosDoModelo(texto: string): LeituraDeArquivos {
  const bruto = (texto || '').trim();
  const arquivos: ArquivoDoModelo[] = [];

  const re = new RegExp(BLOCO_DE_ARQUIVO_RE.source, 'g');
  let ultimoFim = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bruto)) !== null) {
    const caminho = normalizarCaminhoDoCode(m[1] || '', '');
    if (caminho) arquivos.push({ caminho, conteudo: limparCerca(m[2] ?? '') });
    ultimoFim = re.lastIndex;
  }

  // Depois do último bloco fechado, sobrou uma abertura? Então foi cortado ali.
  const sobra = bruto.slice(ultimoFim);
  const aberturaSolta = ABERTURA_DE_ARQUIVO_RE.exec(sobra);
  if (aberturaSolta) {
    return {
      arquivos,
      cortada: true,
      caminhoCortado: normalizarCaminhoDoCode(aberturaSolta[1] || '', '') || undefined
    };
  }

  return { arquivos, cortada: false };
}

/**
 * Tira a cerca de markdown de dentro do bloco.
 *
 * O modelo põe ```tsx em volta do código por hábito, e o hábito é forte o bastante para vencer a
 * instrução. Gravar a cerca junto quebra o arquivo de um jeito difícil de enxergar: o preview
 * falha numa linha que a pessoa não escreveu e não entende de onde veio.
 */
function limparCerca(conteudo: string): string {
  const t = conteudo.replace(/^\s*\r?\n/, '').replace(/\r?\n\s*$/, '');
  const abre = /^```[a-zA-Z0-9+#.-]*[ \t]*\r?\n/;
  if (!abre.test(t)) return t;
  return t.replace(abre, '').replace(/\r?\n?```[ \t]*$/, '');
}

export interface ResultadoDaAplicacao {
  arquivos: CodeRepositoryFile[];
  criados: string[];
  atualizados: string[];
  /** Caminhos recusados, com o motivo — recusa em silêncio é o que faz o projeto sair errado. */
  recusados: Array<{ caminho: string; motivo: string }>;
  cortada: boolean;
  caminhoCortado?: string;
  /** Uma frase pronta para o registro da conversa. */
  resumo: string;
}

/**
 * Arquivos que este caminho NUNCA cria, por mais que o modelo peça.
 *
 * Não é purismo: são arquivos que carregam segredo ou que quebram a instalação de quem baixar o
 * projeto. O ".env" é o caso claro — o modelo adora gerar um com chaves de exemplo, e um ".env"
 * gerado por IA no meio de um projeto é exatamente o arquivo que a pessoa publica sem olhar.
 * O ".env.example", sem valores, continua permitido de propósito.
 */
const NUNCA_ESCREVER = [/^\.env$/i, /^\.env\.local$/i, /(^|\/)node_modules\//i, /(^|\/)\.git\//i];

/** Acima disto não é arquivo de projeto, é despejo — e trava o navegador ao renderizar. */
const TAMANHO_MAXIMO_DO_ARQUIVO = 400_000;

export function aplicarArquivosDoModelo(
  texto: string,
  atuais: CodeRepositoryFile[],
  opcoes: { idade?: () => string; linguagemDe?: (caminho: string) => string } = {}
): ResultadoDaAplicacao {
  const { arquivos: lidos, cortada, caminhoCortado } = lerArquivosDoModelo(texto);

  const novoId = opcoes.idade ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const linguagemDe = opcoes.linguagemDe ?? (() => 'plaintext');

  const porChave = new Map(atuais.map(a => [chaveDeCaminho(a.name), a]));
  const resultado: CodeRepositoryFile[] = [...atuais];
  const criados: string[] = [];
  const atualizados: string[] = [];
  const recusados: Array<{ caminho: string; motivo: string }> = [];

  for (const arquivo of lidos) {
    if (NUNCA_ESCREVER.some(re => re.test(arquivo.caminho))) {
      recusados.push({
        caminho: arquivo.caminho,
        motivo: 'arquivo de segredo ou de sistema — use ".env.example" sem valores reais'
      });
      continue;
    }
    if (arquivo.conteudo.length > TAMANHO_MAXIMO_DO_ARQUIVO) {
      recusados.push({
        caminho: arquivo.caminho,
        motivo: `passou de ${Math.round(TAMANHO_MAXIMO_DO_ARQUIVO / 1000)} mil caracteres num arquivo só`
      });
      continue;
    }

    const existente = porChave.get(chaveDeCaminho(arquivo.caminho));
    if (existente) {
      const indice = resultado.findIndex(a => a.id === existente.id);
      if (indice >= 0) {
        resultado[indice] = { ...resultado[indice], content: arquivo.conteudo, updatedAt: Date.now() };
        atualizados.push(arquivo.caminho);
      }
      continue;
    }

    const novo: CodeRepositoryFile = {
      id: `ia-${novoId()}`,
      name: arquivo.caminho,
      language: linguagemDe(arquivo.caminho),
      content: arquivo.conteudo,
      updatedAt: Date.now()
    };
    resultado.push(novo);
    porChave.set(chaveDeCaminho(arquivo.caminho), novo);
    criados.push(arquivo.caminho);
  }

  const partes: string[] = [];
  if (criados.length) partes.push(`${criados.length} arquivo(s) criado(s): ${criados.join(', ')}`);
  if (atualizados.length) partes.push(`${atualizados.length} atualizado(s): ${atualizados.join(', ')}`);
  if (recusados.length) partes.push(`${recusados.length} recusado(s): ${recusados.map(r => `${r.caminho} (${r.motivo})`).join('; ')}`);
  if (cortada) {
    partes.push(
      `a resposta acabou no meio de ${caminhoCortado ? `"${caminhoCortado}"` : 'um arquivo'} e essa parte NÃO foi gravada — ` +
      'peça a continuação para não perder o que já entrou'
    );
  }

  return {
    arquivos: resultado,
    criados, atualizados, recusados,
    cortada, caminhoCortado,
    resumo: partes.length ? partes.join(' · ') : 'Nenhum arquivo veio no formato de projeto.'
  };
}

/**
 * A instrução do formato, para colar na instrução de sistema de quem gera projeto.
 *
 * Ela é explícita sobre o que NÃO fazer porque cada proibição aqui é um erro observado em modelo:
 * escrever "resto igual" no meio de um arquivo, mandar um arquivo pela metade "por brevidade", e
 * cercar tudo em markdown.
 */
export const INSTRUCAO_DE_PROJETO_MULTIARQUIVO = `FORMATO OBRIGATÓRIO PARA ESCREVER ARQUIVOS DO PROJETO

Para CADA arquivo que você criar ou reescrever, use um bloco assim:

<<<<<<< ARQUIVO: src/components/Header.tsx
(o conteúdo COMPLETO do arquivo, do começo ao fim)
>>>>>>> FIM ARQUIVO

Regras rígidas:
- O caminho vem depois de "ARQUIVO:", com as pastas. Ex: "src/App.tsx", "server/index.ts", "package.json".
- O conteúdo é o arquivo INTEIRO, sempre. NUNCA escreva "resto igual", "…", "// mantém o que já existia" ou qualquer resumo: o que estiver no bloco é o que fica gravado, e o que você omitir some do arquivo.
- NÃO cerque o conteúdo em crase tripla (\`\`\`). O bloco já delimita o arquivo.
- Um bloco por arquivo. Para 6 arquivos, 6 blocos, um atrás do outro.
- Se o projeto for grande, PREFIRA menos arquivos e mais completos a muitos arquivos pela metade. Uma resposta cortada no meio de um bloco faz aquele arquivo ser DESCARTADO inteiro.
- NUNCA escreva um arquivo ".env" com valores reais. Use ".env.example" com os nomes das variáveis e valores vazios.
- Fora dos blocos, escreva no máximo duas frases explicando o que fez.`;
