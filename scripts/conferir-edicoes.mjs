/**
 * Confere o que acontece com o código DEPOIS que o modelo responde (src/lib/codeEdits.ts).
 *
 * Relatado com print: o usuário pediu um app, o modelo gerou (o próprio OSONE avisou qual modelo
 * escreveu), e o editor continuou com ZERO caractere. Gerar de novo dava no mesmo — porque o
 * defeito não estava no modelo, estava aqui.
 *
 * Num arquivo em branco não existe trecho para procurar, então TODA edição SEARCH/REPLACE falha e
 * o conteúdo voltava vazio, exatamente como entrou. O código inteiro que o modelo tinha escrito
 * dentro da parte de substituição era descartado no caminho. É o pior desfecho possível: o
 * trabalho foi feito e jogado fora por causa do formato da resposta.
 *
 * O outro lado da moeda tem o mesmo peso: num arquivo QUE JÁ TEM CÓDIGO, um bloco que não casa
 * precisa continuar falhando. Aceitar o "conteúdo proposto" ali dentro sobrescreveria o arquivo
 * inteiro com um pedaço solto — perder código existente é pior do que não aplicar a edição.
 *
 * Como rodar:
 *   node scripts/conferir-edicoes.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-edicoes-'));
const saida = path.join(pastaTemp, 'codeEdits.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/codeEdits.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { applyModelCodeResponse, parseSearchReplaceEdits } = await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const bloco = (busca, troca) => `<<<<<<< SEARCH\n${busca}\n=======\n${troca}\n>>>>>>> REPLACE`;
const PAGINA = '<!DOCTYPE html>\n<html><body><h1>Jogo da Velha</h1></body></html>';

// 1) O CASO RELATADO: arquivo vazio + bloco que não casa. O código não pode se perder.
{
  const r = applyModelCodeResponse(bloco('<body>', PAGINA), '');
  registrar('arquivo vazio: o conteúdo proposto vira o arquivo, em vez de sumir',
    r.content === PAGINA && !r.hadFailures,
    r.content ? `${r.content.length} caracteres gravados` : 'PERDEU o código gerado');
}

// 2) Bloco com SEARCH vazio — o formato que o modelo usa ao criar do zero.
{
  const resposta = `<<<<<<< SEARCH\n=======\n${PAGINA}\n>>>>>>> REPLACE`;
  const r = applyModelCodeResponse(resposta, '');
  const temMarcadores = /<<<<<<<|>>>>>>>|=======/.test(r.content);
  registrar('bloco com busca vazia é reconhecido, e os marcadores não entram no arquivo',
    r.content === PAGINA && !temMarcadores,
    temMarcadores ? 'MARCADORES gravados como se fossem código' : 'arquivo limpo');
}

// 3) Vários blocos num arquivo vazio: tudo o que ele escreveu entra, na ordem.
{
  const resposta = bloco('a', '<html>') + '\n' + bloco('b', '</html>');
  const r = applyModelCodeResponse(resposta, '');
  registrar('vários blocos num arquivo vazio entram todos, na ordem',
    r.content === '<html>\n</html>',
    JSON.stringify(r.content));
}

// 4) O CONTRÁRIO, que tem o mesmo peso: arquivo COM código e bloco que não casa precisa FALHAR.
{
  const original = 'const configuracaoImportante = 1;\nconst outraCoisa = 2;';
  const r = applyModelCodeResponse(bloco('const naoExiste = 9;', 'const trocado = 3;'), original);
  registrar('arquivo com código: bloco que não casa falha e NÃO sobrescreve nada',
    r.content === original && r.hadFailures,
    r.content === original ? 'código existente preservado' : 'SOBRESCREVEU o arquivo');
}

// 5) Edição normal continua funcionando.
{
  const r = applyModelCodeResponse(bloco('const a = 1;', 'const a = 2;'), 'const a = 1;');
  registrar('edição cirúrgica normal continua aplicando',
    r.content === 'const a = 2;' && !r.hadFailures, r.content);
}

// 6) Arquivo só com espaços conta como vazio — é o estado de um arquivo recém-criado.
{
  const r = applyModelCodeResponse(bloco('<body>', PAGINA), '   \n\n  ');
  registrar('arquivo só com espaços é tratado como vazio',
    r.content === PAGINA, r.content === PAGINA ? 'conteúdo aproveitado' : 'descartado');
}

// 7) Resposta sem blocos nenhum continua sendo o arquivo inteiro.
{
  const r = applyModelCodeResponse('```html\n' + PAGINA + '\n```', '');
  registrar('resposta sem blocos continua valendo como arquivo completo',
    r.content === PAGINA, `${r.content.length} caracteres`);
}

// 8) A leitura dos blocos não pode ter regredido com a mudança da expressão.
{
  const dois = parseSearchReplaceEdits(bloco('x', 'y') + '\n' + bloco('w', 'z'));
  const vazio = parseSearchReplaceEdits(`<<<<<<< SEARCH\n=======\nnovo\n>>>>>>> REPLACE`);
  registrar('a leitura de blocos segue reconhecendo os formatos com e sem busca',
    dois.length === 2 && dois[0].old_string === 'x' && dois[1].new_string === 'z'
      && vazio.length === 1 && vazio[0].new_string === 'novo',
    `${dois.length} blocos normais, ${vazio.length} com busca vazia`);
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
