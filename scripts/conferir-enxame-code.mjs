/**
 * Confere que o ENXAME do OSONE CODE constrói o que foi pedido — e não sempre um jogo.
 *
 * ====== O DEFEITO QUE ISTO TRAVA ======
 *
 * O Enxame tem quatro agentes (Produto → Arquitetura → Engenharia → QA), com iterações e o retorno
 * do QA voltando ao Engenheiro. A infraestrutura sempre foi boa. O alvo é que estava errado, e
 * estava escrito nas instruções:
 *
 *   - o Arquiteto tinha "index.html" como estrutura padrão e projetava "game loop e detecção de
 *     colisões";
 *   - o Engenheiro era mandado produzir "o código completo no arquivo index.html", com "som de
 *     tiro, dano, pulo e game over" e "tela de Game Over com botão de Reiniciar";
 *   - o QA reprovava por não encontrar game loop e telas de menu.
 *
 * Pedir "um app de gestão de estoque com login" fazia quatro agentes trabalharem para entregar um
 * HTML único com game loop. Não era falha de execução: era o alvo, e nenhum teste apontava para
 * ele porque o código compilava perfeitamente.
 *
 * Estas conferências são de TEXTO das instruções e de FIAÇÃO, e é o que cabe aqui: a saída real
 * depende do modelo, mas o que se manda para ele, não. Uma instrução que só sabe pedir jogo produz
 * jogo por mais capaz que o modelo seja.
 *
 * Como rodar:
 *   node scripts/conferir-enxame-code.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../src/components/CodeWorkspace.tsx', import.meta.url), 'utf8');

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

/** Só o que é MANDADO ao modelo conta. Comentário que explica a história não é instrução. */
const semComentarios = code
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

// ============================================================================
// 1) O PRODUTO É CLASSIFICADO ANTES DE QUALQUER COISA
// ============================================================================
{
  registrar('o Agente de Produto classifica o tipo do que foi pedido',
    /"tipo": "jogo" \| "aplicativo" \| "site" \| "ferramenta"/.test(semComentarios),
    'é a decisão que define o formato do projeto inteiro');

  registrar('a especificação pede CAPACIDADES do usuário, não nomes de arquivo',
    /nunca como nomes de arquivo/.test(semComentarios),
    '"cadastrar produto", e não "criar CadastroProduto.tsx"');
}

// ============================================================================
// 2) O ARQUITETO SEGUE O FORMATO ESCOLHIDO ANTES DE GERAR
// ============================================================================
{
  registrar('o Arquiteto devolve uma LISTA de arquivos, e não uma string fixa',
    /"arquivos": \[/.test(semComentarios) && /"caminho": "src\/main\.tsx"/.test(semComentarios),
    'era literalmente fileStructure: "index.html"');

  registrar('a pessoa escolhe arquivo único ou árvore completa antes de criar',
    /type FormatoProjetoDoCode = 'single' \| 'tree'/.test(semComentarios)
      && /swarmProjectFormat/.test(semComentarios)
      && /Arquivo único/.test(code)
      && /Árvore completa/.test(code),
    'o formato deixa de ser uma adivinhação do modelo');

  registrar('arquivo único trava a arquitetura em index.html',
    /"arquivo único": projete EXATAMENTE UM arquivo, "index\.html"/.test(semComentarios)
      && /formatoEscolhido === 'single'[\s\S]{0,120}\{ caminho: 'index\.html'/.test(semComentarios),
    'preview instantâneo para jogo/protótipo sem misturar pastas');

  registrar('árvore completa trava a arquitetura em projeto React',
    /"árvore completa": projete vários arquivos reais/.test(semComentarios)
      && /arquivosBaseParaArvore/.test(semComentarios)
      && /const projetoDeVariosArquivos = formatoEscolhido === 'tree'/.test(semComentarios),
    'entrando por src/main.tsx quando a pessoa escolhe árvore');

  registrar('a árvore tem teto, porque cada arquivo é escrito inteiro de uma vez',
    /NO MÁXIMO 12 arquivos/.test(semComentarios),
    'projeto grande demais chega cortado, e arquivo cortado é descartado');
}

// ============================================================================
// 3) O ENGENHEIRO SEGUE O FORMATO ESCOLHIDO
// ============================================================================
{
  registrar('a instrução do Engenheiro depende do formato, e não é uma só',
    /const coderRoleIntro = projetoDeVariosArquivos\s*\?/.test(semComentarios),
    'não adianta o Arquiteto planejar árvore se quem escreve recebe ordem de fazer jogo');

  registrar('no projeto de vários arquivos ele recebe o formato de escrita de projeto',
    /\$\{INSTRUCAO_DE_PROJETO_MULTIARQUIVO\}/.test(semComentarios),
    'os blocos por arquivo');

  /**
   * O trecho de jogo continua existindo — e deve. O erro era ele valer SEMPRE; agora ele está
   * atrás da classificação do produto.
   */
  const trechoDeJogo = semComentarios.match(/game loop com requestAnimationFrame[^`]*/);
  registrar('as exigências de jogo ficam condicionadas ao tipo "jogo"',
    !!trechoDeJogo && /\(pmParsed\?\.tipo \|\| ''\) === 'jogo'/.test(semComentarios),
    'um sistema de estoque não recebe mais ordem de ter tela de Game Over');

  registrar('a ordem de correção do projeto não manda usar SEARCH/REPLACE',
    /Reescreva INTEIROS, no formato de projeto/.test(semComentarios),
    'mandar um formato que este caminho não lê gastaria a iteração sem gravar nada');
}

// ============================================================================
// 4) A GRAVAÇÃO NÃO PASSA UM FORMATO PELO OUTRO
// ============================================================================
{
  registrar('resposta de projeto é aplicada pelo caminho de projeto',
    /if \(projetoDeVariosArquivos\) \{[\s\S]{0,400}aplicarArquivosDoModelo\(coderResult\.text/.test(semComentarios),
    'passar por applyModelCodeResponse gravaria os marcadores crus num arquivo só');

  registrar('a gravação de arquivo único não acontece no caminho de projeto',
    /if \(!projetoDeVariosArquivos\) applyCodeToRepository\(lastCode/.test(semComentarios),
    'jogaria o retrato do projeto inteiro dentro do arquivo principal');

  registrar('cada iteração do Enxame é um ponto de retorno',
    /pushHistory\(filesRef\.current\);[\s\S]{0,200}aplicarArquivosDoModelo/.test(semComentarios),
    'importa quando a iteração 3 piora o que a 2 fez');
}

// ============================================================================
// 5) O QA DEIXA DE COBRAR O QUE O PRODUTO NÃO DEVERIA TER
// ============================================================================
{
  registrar('os critérios do QA dependem do tipo do produto',
    /const criteriosDoTipo = projetoDeVariosArquivos/.test(semComentarios),
    'antes ele procurava game loop em qualquer projeto');

  registrar('o QA passa a conferir se os imports apontam para arquivos que existem',
    /imports de um apontam para arquivos que estão de fato no projeto/.test(semComentarios),
    'é o que quebra um projeto de vários arquivos e não aparece lendo um só');

  registrar('o QA é proibido de cobrar recurso que o produto não deveria ter',
    /NÃO cobre recursos que o produto não deveria ter/.test(semComentarios),
    'reprovar um cadastro por falta de game loop é pior que não revisar');

  registrar('o QA lê o projeto inteiro, e não só um arquivo',
    /projetoDeVariosArquivos \? retratoDoProjeto\(\) : lastCode/.test(semComentarios),
    'aprovar arquivo por arquivo deixa passar peças que não se encaixam');
}

// ============================================================================
// 6) O QUE FOI FEITO APARECE PARA QUEM ESTÁ OLHANDO
// ============================================================================
{
  registrar('o painel do Enxame não fala mais de GDD nem de Game Loop por padrão',
    !/desc: 'GDD & Requisitos'/.test(code) && !/desc: 'Game Loop & Canvas'/.test(code),
    'os rótulos descreviam um Enxame que só fazia jogo');

  registrar('o registro ao vivo diz quantos arquivos o projeto vai ter',
    /projeto de \$\{arquivosPlanejados\.length\} arquivos/.test(semComentarios),
    'a pessoa vê a árvore sendo decidida');
}

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências do Enxame do OSONE CODE passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
