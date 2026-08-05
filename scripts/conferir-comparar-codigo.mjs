/**
 * Confere a comparação "antes × depois" do que a IA mudou no código.
 *
 * O desfazer já existia, mas era cego: dava para voltar atrás, não para saber do que se estava
 * voltando. Num jogo de 50 mil caracteres não há como conferir de olho se o modelo mexeu só onde
 * devia, e sobravam duas saídas ruins — aceitar no escuro, ou desfazer por precaução e perder
 * junto o que estava certo.
 *
 * O que se confere aqui é o que faz essa tela ser confiável:
 *
 *  - que uma edição pequena apareça como uma edição pequena. Um algoritmo ingênuo marca o arquivo
 *    inteiro como trocado assim que uma linha entra no meio, e aí a tela não informa nada.
 *  - que ela não trave a aba. Comparar linha a linha custa (linhas × linhas) em memória; num par
 *    de arquivos grandes isso são dezenas de milhões de células.
 *
 * Como rodar:
 *   node scripts/conferir-comparar-codigo.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-comparar-'));
const saida = path.join(pastaTemp, 'comparar.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/compararCodigo.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { compararLinhas, compararProjeto, apenasOsTrechosQueMudaram } = await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const arq = (id, name, content) => ({ id, name, language: 'javascript', updatedAt: 1, content });
const conta = (linhas, tipo) => linhas.filter(l => l.tipo === tipo).length;

// ====== 1) UMA LINHA TROCADA É UMA LINHA TROCADA ======
// O erro clássico de um comparador ingênuo é marcar tudo a partir do ponto da mudança.
{
  const antes = 'linha 1\nlinha 2\nlinha 3\nlinha 4\nlinha 5';
  const depois = 'linha 1\nlinha 2\nMUDOU\nlinha 4\nlinha 5';
  const { linhas } = compararLinhas(antes, depois);

  registrar('trocar uma linha marca exatamente uma saindo e uma entrando',
    conta(linhas, 'removida') === 1 && conta(linhas, 'adicionada') === 1,
    `-${conta(linhas, 'removida')} +${conta(linhas, 'adicionada')}`);

  registrar('as outras quatro linhas continuam marcadas como iguais',
    conta(linhas, 'igual') === 4, `${conta(linhas, 'igual')} iguais`);
}

// ====== 2) UMA LINHA INSERIDA NÃO PODE DESLOCAR TODO O RESTO ======
// Este é o caso que separa uma comparação útil de uma inútil: inserir no meio empurra tudo para
// baixo, e um comparador que só olha posição declara o arquivo inteiro reescrito.
{
  const antes = 'a\nb\nc\nd\ne\nf\ng\nh';
  const depois = 'a\nb\nc\nNOVA\nd\ne\nf\ng\nh';
  const { linhas } = compararLinhas(antes, depois);

  registrar('inserir uma linha no meio NÃO marca o resto do arquivo como mudado',
    conta(linhas, 'adicionada') === 1 && conta(linhas, 'removida') === 0,
    `-${conta(linhas, 'removida')} +${conta(linhas, 'adicionada')} (um comparador ingênuo marcaria 5 e 5)`);
}

{
  const antes = 'a\nb\nc\nd\ne';
  const depois = 'a\nc\nd\ne';
  const { linhas } = compararLinhas(antes, depois);
  registrar('apagar uma linha do meio marca só ela',
    conta(linhas, 'removida') === 1 && conta(linhas, 'adicionada') === 0,
    `-${conta(linhas, 'removida')} +${conta(linhas, 'adicionada')}`);
}

// ====== 3) A NUMERAÇÃO PRECISA APONTAR PARA O ARQUIVO CERTO ======
// A linha removida tem número no ANTES; a adicionada, no DEPOIS. Trocar isso mandaria a pessoa
// olhar para o lugar errado do editor.
{
  const { linhas } = compararLinhas('a\nb\nc', 'a\nX\nc');
  const removida = linhas.find(l => l.tipo === 'removida');
  const adicionada = linhas.find(l => l.tipo === 'adicionada');
  registrar('linha removida numera pelo arquivo antigo e a adicionada pelo novo',
    removida.numeroAntes === 2 && removida.numeroDepois === undefined
      && adicionada.numeroDepois === 2 && adicionada.numeroAntes === undefined,
    `removida na linha ${removida.numeroAntes}, adicionada na ${adicionada.numeroDepois}`);
}

// ====== 4) ARQUIVOS IGUAIS NÃO APARECEM NA COMPARAÇÃO ======
{
  const antes = [arq('1', 'index.html', '<h1>oi</h1>'), arq('2', 'game.js', 'const a = 1;')];
  const depois = [arq('1', 'index.html', '<h1>oi</h1>'), arq('2', 'game.js', 'const a = 2;')];
  const r = compararProjeto(antes, depois);
  registrar('só o arquivo que mudou entra na comparação',
    r.length === 1 && r[0].nome === 'game.js' && r[0].situacao === 'alterado',
    r.map(c => c.nome).join(', ') || 'nenhum');
}

{
  const iguais = [arq('1', 'a.js', 'x')];
  registrar('projeto sem nenhuma mudança devolve comparação vazia',
    compararProjeto(iguais, iguais).length === 0, 'nada a mostrar');
}

// ====== 5) ARQUIVO CRIADO E ARQUIVO APAGADO ======
// Apagado é a mudança que mais importa ver: é a que destrói trabalho.
{
  const antes = [arq('1', 'index.html', '<h1>oi</h1>')];
  const depois = [arq('1', 'index.html', '<h1>oi</h1>'), arq('2', 'styles.css', 'body{}')];
  const r = compararProjeto(antes, depois);
  registrar('arquivo criado aparece como criado',
    r.length === 1 && r[0].situacao === 'criado' && r[0].nome === 'styles.css',
    `${r[0]?.situacao} ${r[0]?.nome}`);
}

{
  const antes = [arq('1', 'index.html', '<h1>oi</h1>'), arq('2', 'importante.js', 'const segredo = 1;\nconst outro = 2;')];
  const depois = [arq('1', 'index.html', '<h1>oi</h1>')];
  const r = compararProjeto(antes, depois);
  registrar('arquivo APAGADO aparece, com as linhas que sumiram',
    r.length === 1 && r[0].situacao === 'apagado' && r[0].removidas === 2,
    `${r[0]?.nome}: -${r[0]?.removidas} linha(s)`);
}

// ====== 6) MOSTRAR SÓ O QUE MUDOU, COM CONTEXTO ======
// Mostrar mil e quinhentas linhas para revelar três diferentes não informa: faz caçar.
{
  const antes = Array.from({ length: 200 }, (_, i) => `linha ${i}`).join('\n');
  const depois = antes.replace('linha 100', 'linha CEM MUDOU');
  const { linhas } = compararLinhas(antes, depois);
  const enxuto = apenasOsTrechosQueMudaram(linhas, 3);

  registrar('numa mudança de uma linha em 200, a tela mostra pouca coisa',
    enxuto.length < 12 && enxuto.length > 4, `${enxuto.length} linhas exibidas, de ${linhas.length}`);

  registrar('o trecho exibido contém a mudança e o contexto ao redor',
    enxuto.some(l => l.texto === 'linha CEM MUDOU') && enxuto.some(l => l.texto === 'linha 99'),
    'a mudança e as vizinhas');

  registrar('o que foi omitido é marcado, para não parecer que o arquivo acaba ali',
    enxuto.some(l => l.texto === '⋯'), 'marca de continuação presente');
}

{
  // Duas mudanças distantes viram dois trechos, e não um bloco só.
  const antes = Array.from({ length: 100 }, (_, i) => `l${i}`).join('\n');
  const depois = antes.replace('l10', 'DEZ').replace('l90', 'NOVENTA');
  const enxuto = apenasOsTrechosQueMudaram(compararLinhas(antes, depois).linhas, 2);
  const marcas = enxuto.filter(l => l.texto === '⋯').length;
  registrar('mudanças distantes viram trechos separados',
    marcas >= 2 && enxuto.some(l => l.texto === 'DEZ') && enxuto.some(l => l.texto === 'NOVENTA'),
    `${marcas} marca(s) de continuação`);
}

// ====== 7) ARQUIVO GRANDE NÃO PODE TRAVAR A ABA ======
// É o caso do usuário: um jogo de 50 mil caracteres. Comparar exato custa linhas × linhas.
{
  const antes = Array.from({ length: 1500 }, (_, i) => `  const variavel${i} = ${i};`).join('\n');
  const depois = antes.replace('const variavel750 = 750;', 'const variavel750 = 999;');

  const comecou = Date.now();
  const { linhas, grosseira } = compararLinhas(antes, depois);
  const levou = Date.now() - comecou;

  registrar('jogo de 1500 linhas com uma mudança compara rápido e com precisão',
    !grosseira && conta(linhas, 'removida') === 1 && conta(linhas, 'adicionada') === 1 && levou < 1500,
    `${levou}ms, -${conta(linhas, 'removida')} +${conta(linhas, 'adicionada')}`);
}

{
  // Dois arquivos enormes e COMPLETAMENTE diferentes: aqui não há pontas iguais para recortar, e a
  // comparação exata explodiria em memória. A saída é mostrar em bloco, sem travar.
  const antes = Array.from({ length: 3000 }, (_, i) => `antigo ${i}`).join('\n');
  const depois = Array.from({ length: 3000 }, (_, i) => `novo ${i}`).join('\n');

  const comecou = Date.now();
  const { linhas, grosseira } = compararLinhas(antes, depois);
  const levou = Date.now() - comecou;

  registrar('dois arquivos enormes e totalmente diferentes não travam a aba',
    grosseira === true && levou < 2000 && linhas.length === 6000,
    `${levou}ms, comparação em bloco (${linhas.length} linhas)`);
}

// ====== 8) OS CASOS DE BORDA ======
{
  const { linhas } = compararLinhas('', 'primeira linha\nsegunda');
  registrar('arquivo que era vazio mostra tudo como adicionado',
    conta(linhas, 'adicionada') === 2, `+${conta(linhas, 'adicionada')}`);
}

{
  const { linhas } = compararLinhas('a\nb', 'a\nb');
  registrar('textos idênticos não marcam mudança nenhuma',
    conta(linhas, 'adicionada') === 0 && conta(linhas, 'removida') === 0, 'sem diferenças');
}

{
  const antes = 'x\ny\nz';
  const depois = 'x\ny\nz\n';
  const { linhas } = compararLinhas(antes, depois);
  registrar('uma quebra de linha no fim é uma mudança pequena, e não o arquivo inteiro',
    conta(linhas, 'adicionada') + conta(linhas, 'removida') <= 2,
    `-${conta(linhas, 'removida')} +${conta(linhas, 'adicionada')}`);
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
