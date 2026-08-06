/**
 * A ELABORAÇÃO QUE MUDA DE FORMA CONFORME O ASSUNTO.
 *
 * O pedido é explícito: organizar o discurso "nunca de maneira genérica ou igual, sempre de
 * acordo com o assunto". Isso não se resolve pedindo ao modelo que "seja adaptativo" — pedido
 * assim é a forma mais confiável de receber sempre a mesma coisa. Um modelo que recebe um pedido
 * vago cai no formato mais provável do treino dele: título, três bullets, conclusão. Uma aula,
 * uma ata de reunião e um desabafo saem com o mesmo esqueleto, e a única diferença entre eles
 * passa a ser o texto dentro dos bullets.
 *
 * O que faz a escolha acontecer de verdade são três coisas, e todas estão aqui:
 *
 * 1. UM CARDÁPIO COM O SINAL DE CADA PRATO. Não basta listar formatos; cada um vem com a marca
 *    que o denuncia no discurso ("quando"). Escolher deixa de ser gosto e vira reconhecimento.
 * 2. A ESCOLHA TEM DE SER DECLARADA. O modelo devolve, em campos separados, QUAL formato usou e
 *    POR QUE aquele. Quem precisa nomear a escolha não consegue cair no padrão sem perceber — e
 *    quem lê o resultado descobre na hora se a escolha fez sentido.
 * 3. A LISTA É ABERTA. Se nenhum formato do cardápio servir, o modelo inventa o que servir e
 *    explica. Um cardápio fechado só troca um formato genérico por nove.
 */

/** O que o modelo devolve depois de ler o discurso. */
export interface DiscursoElaborado {
  /** O nome que o próprio modelo deu ao tema do que foi falado. */
  tema: string;
  /** O formato escolhido — do cardápio ou inventado para este discurso. */
  formato: string;
  /** O motivo da escolha, tirado do conteúdo do discurso. */
  porqueDoFormato: string;
  /** O discurso organizado, em Markdown. */
  discurso: string;
}

/**
 * Os formatos com o sinal que indica cada um. Ficam em código, e não soltos dentro de um texto
 * de prompt, para poderem ser lidos, conferidos e ampliados sem mexer na instrução inteira.
 */
export const FORMATOS_POSSIVEIS: Array<{ nome: string; quando: string; comoFica: string }> = [
  {
    nome: 'Dissertativo',
    quando: 'a pessoa defende uma ideia, argumenta a favor ou contra algo, ou tenta convencer',
    comoFica: 'tese no começo, argumentos encadeados em parágrafos corridos, conclusão que fecha a tese'
  },
  {
    nome: 'Tópicos hierárquicos',
    quando: 'a fala enumera itens, categorias ou pontos que não dependem uns dos outros',
    comoFica: 'títulos curtos com subitens, sem parágrafos longos'
  },
  {
    nome: 'Linha do tempo',
    quando: 'a fala narra fatos na ordem em que aconteceram, ou descreve uma evolução ao longo do tempo',
    comoFica: 'marcos em ordem cronológica, cada um dizendo o que mudou ali'
  },
  {
    nome: 'Decisões e pendências',
    quando: 'é uma reunião, um alinhamento ou uma conversa que terminou em encaminhamentos',
    comoFica: 'o que ficou decidido, quem faz o quê, e o que continua em aberto'
  },
  {
    nome: 'Passo a passo',
    quando: 'a fala ensina a fazer alguma coisa ou descreve um procedimento',
    comoFica: 'pré-requisitos primeiro, depois passos numerados na ordem de execução'
  },
  {
    nome: 'Perguntas e respostas',
    quando: 'a fala responde a dúvidas, é uma entrevista, uma sabatina ou um atendimento',
    comoFica: 'cada pergunta com a resposta que foi dada a ela'
  },
  {
    nome: 'Comparativo',
    quando: 'a fala confronta duas ou mais opções, épocas, lados ou posições',
    comoFica: 'critérios de comparação, e o que cada lado diz em cada critério'
  },
  {
    nome: 'Narrativa',
    quando: 'é um relato pessoal, uma história ou um depoimento',
    comoFica: 'começo, desenvolvimento e desfecho, preservando a voz de quem falou'
  },
  {
    nome: 'Explicação de conceito',
    quando: 'a fala explica um assunto para quem não conhece',
    comoFica: 'o que é, como funciona, exemplos, e o que costuma confundir'
  },
  {
    nome: 'Roteiro de ação',
    quando: 'a fala é um plano, uma meta ou uma lista de coisas a fazer',
    comoFica: 'objetivo, o que precisa acontecer para chegar lá, e em que ordem'
  }
];

/**
 * Monta a instrução mandada ao modelo.
 *
 * Fica separada da chamada de rede para poder ser lida por inteiro numa conferência — uma
 * instrução que só existe montada dentro de um `fetch` não tem como ser verificada, e é
 * justamente ela que decide se o resultado sai adaptativo ou sai sempre igual.
 */
export function montarPedidoDeElaboracao(transcricao: string): string {
  const cardapio = FORMATOS_POSSIVEIS
    .map(f => `- ${f.nome} — use quando ${f.quando}. Fica assim: ${f.comoFica}.`)
    .join('\n');

  return `Você recebeu a transcrição bruta de um discurso falado. Ela veio de reconhecimento de voz: não tem pontuação confiável, tem repetição, hesitação ("é...", "então...", "tipo assim"), correções no meio da frase e possivelmente palavras trocadas por som parecido.

Sua tarefa é DUPLA:

(A) DAR UM NOME AO TEMA. Um título curto e específico do que foi falado — não uma categoria genérica. "Transcrição de áudio", "Discurso", "Reunião" ou "Análise" são respostas erradas. Se a pessoa falou sobre atraso na obra do galpão, o tema é sobre o atraso na obra do galpão.

(B) ORGANIZAR O DISCURSO NO FORMATO QUE ESTE ASSUNTO PEDE.

Esta segunda parte é a que importa, então leia com atenção: NÃO existe um formato padrão aqui. Você deve LER o discurso, reconhecer que tipo de fala é aquela, e só então escolher a forma. Formatos possíveis:

${cardapio}

Se nenhum destes servir para este discurso, INVENTE o formato que serve e explique-o no campo do porquê. O cardápio acima é um ponto de partida, não uma gaiola.

O que NÃO fazer, em nenhuma hipótese:
- Aplicar o mesmo esqueleto (título + alguns tópicos + conclusão) independentemente do assunto. Se a fala foi uma história, ela sai como história; se foi uma aula, sai como aula.
- Escolher tópicos por serem o formato mais fácil. Muita fala é argumentativa e fica pior picotada em bullets.
- Inventar conteúdo que não foi dito, "completar" raciocínio que ficou pela metade, ou acrescentar recomendações suas.
- Higienizar a ponto de perder o que a pessoa quis dizer. Corte o "é...", o "então" e a repetição; preserve o argumento, os exemplos e os números.

O que fazer sempre:
- Corrigir pontuação, concordância e o que o reconhecimento de voz claramente errou por som.
- Manter tudo que foi dito de relevante — organizar não é resumir. Só encurta o que era hesitação.
- Escrever no mesmo idioma do discurso.
- Se um trecho ficou incompreensível, marque-o como [trecho inaudível] em vez de adivinhar.

Responda SOMENTE com um JSON válido, sem cercas de código, exatamente neste formato:
{
  "tema": "o nome específico do tema",
  "formato": "o nome do formato que você escolheu",
  "porqueDoFormato": "uma frase dizendo o que neste discurso pediu esse formato",
  "discurso": "o discurso organizado, em Markdown"
}

TRANSCRIÇÃO BRUTA:
"""
${transcricao}
"""`;
}

/**
 * Lê a resposta do modelo com tolerância ao que ele costuma acrescentar por conta própria.
 *
 * Mesmo com `responseMimeType: application/json` e a instrução acima, ainda escapa uma cerca
 * ```json em volta ou uma frase de cortesia antes do objeto. Falhar por isso jogaria fora um
 * discurso inteiro por causa de três acentos graves, então o texto é limpo antes e, se ainda
 * assim não for JSON, o que sobrou é entregue como o discurso — melhor devolver o conteúdo sem
 * a etiqueta do que devolver um erro segurando o conteúdo.
 */
export function lerRespostaDaElaboracao(bruto: string): DiscursoElaborado {
  const texto = (bruto || '').trim();
  if (!texto) throw new Error('O modelo respondeu vazio. Tente elaborar de novo.');

  const semCerca = texto
    .replace(/^```[a-zA-Z]*\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();

  // O objeto pode vir precedido de uma frase solta; do primeiro '{' ao último '}' é o que resta.
  const inicio = semCerca.indexOf('{');
  const fim = semCerca.lastIndexOf('}');
  const candidato = inicio >= 0 && fim > inicio ? semCerca.slice(inicio, fim + 1) : semCerca;

  try {
    const obj = JSON.parse(candidato);
    const discurso = String(obj?.discurso || '').trim();
    if (!discurso) throw new Error('sem discurso');
    return {
      tema: String(obj?.tema || '').trim() || 'Discurso sem título',
      formato: String(obj?.formato || '').trim() || 'Formato não declarado',
      porqueDoFormato: String(obj?.porqueDoFormato || '').trim(),
      discurso
    };
  } catch {
    return {
      tema: 'Discurso sem título',
      formato: 'Formato não declarado',
      // Dizer que a etiqueta se perdeu é honesto; fingir que veio tudo certo esconderia do
      // usuário que ele está lendo o texto cru do modelo, e não a resposta estruturada.
      porqueDoFormato: 'O modelo não devolveu a estrutura esperada, então o texto vai como veio.',
      discurso: semCerca
    };
  }
}

/** Quantas palavras um discurso precisa ter para valer a pena elaborar. */
export const MINIMO_DE_PALAVRAS = 5;

/**
 * Manda a transcrição ao Gemini e devolve o discurso elaborado.
 *
 * `temperature` alta de propósito: com o valor baixo que serve para tarefas determinísticas, a
 * escolha do formato colapsa no mesmo de sempre, que é exatamente o defeito que este módulo
 * existe para evitar.
 */
export async function elaborarDiscurso(opcoes: {
  transcricao: string;
  chaveGemini?: string;
  modelo?: string;
}): Promise<DiscursoElaborado> {
  const transcricao = (opcoes.transcricao || '').trim();
  if (!transcricao) throw new Error('Não há nada transcrito para elaborar.');

  const resposta = await fetch('/api/gemini/generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientApiKey: opcoes.chaveGemini || '',
      model: opcoes.modelo || 'gemini-3.6-flash',
      contents: [{ role: 'user', parts: [{ text: montarPedidoDeElaboracao(transcricao) }] }],
      config: { responseMimeType: 'application/json', temperature: 0.9 }
    })
  });

  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(dados?.error || `O servidor recusou a elaboração (HTTP ${resposta.status}).`);
  }

  const texto = dados?.text || dados?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return lerRespostaDaElaboracao(texto);
}
