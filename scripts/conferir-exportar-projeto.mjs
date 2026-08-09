/**
 * Confere a exportação do projeto em .zip — gerando o pacote de verdade e REABRINDO ele.
 *
 * Dava para baixar um arquivo por vez, e o trabalho ficava preso dentro do app: sem o projeto na
 * mão não dá para publicar, mandar para alguém, versionar em outro lugar nem simplesmente
 * guardar. Um jogo que levou uma tarde para nascer não pode existir só no localStorage de um
 * navegador.
 *
 * Gerar um zip é fácil; o que precisa de conferência é o NOME dos arquivos dentro dele. Eles
 * chegam como o usuário (ou a IA) escreveu, e o zip vai ser extraído no computador de quem
 * baixou:
 *
 *  - "../../.bashrc" faz alguns extratores gravarem FORA da pasta escolhida. Quem baixa um
 *    pacote espera que ele encoste só onde foi mandado encostar.
 *  - ':' e '?' são proibidos em nome de arquivo no Windows — o pacote simplesmente não extrai.
 *  - E sanear pode COLIDIR: dois caminhos equivalentes, como "src/app.js" e "src\\app.js", não
 *    podem apagar um ao outro dentro do zip em silêncio. Perder um arquivo na exportação é o tipo
 *    de falha que só se descobre depois, ao abrir o pacote e achar que o trabalho sumiu.
 *
 * Por isso cada caso aqui abre o zip gerado e lê o que tem dentro, em vez de conferir só o que a
 * função devolveu — o que importa é o pacote, não a intenção dele.
 *
 * Como rodar:
 *   node scripts/conferir-exportar-projeto.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-exportar-'));
const saida = path.join(pastaTemp, 'exportar.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/exportarProjeto.ts')],
  bundle: true, format: 'esm', outfile: saida, platform: 'browser',
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { montarPacote, prepararEntradas, nomeSeguroDeArquivo, nomeDoPacote, caminhoSeguroNoPacote } =
  await import('file://' + saida);

const JSZip = (await import(path.join(RAIZ, 'node_modules/jszip/lib/index.js'))).default;

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const arq = (name, content) => ({ id: name, name, language: 'html', updatedAt: 1, content });

/** Abre o pacote gerado e devolve o que tem dentro. É o que prova o resultado. */
const abrirPacote = async (blob) => {
  const bytes = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(bytes);
  const dentro = {};
  for (const nome of Object.keys(zip.files)) {
    if (!zip.files[nome].dir) dentro[nome] = await zip.files[nome].async('string');
  }
  return dentro;
};

const PROJETO = [
  arq('index.html', '<!DOCTYPE html><html><body><h1>Kart</h1></body></html>'),
  arq('styles.css', 'body { background: #101020; }'),
  arq('game.js', "console.log('acelera');")
];

// ====== 1) O PACOTE CONTÉM O PROJETO, COM O CONTEÚDO EXATO ======
{
  const pacote = await montarPacote('Projeto 1', PROJETO);
  const dentro = await abrirPacote(pacote.blob);

  registrar('o pacote contém todos os arquivos do projeto',
    Object.keys(dentro).length === 3 && dentro['index.html'] && dentro['styles.css'] && dentro['game.js'],
    Object.keys(dentro).join(' + '));

  registrar('o conteúdo dentro do zip é idêntico ao do editor',
    dentro['index.html'] === PROJETO[0].content
      && dentro['styles.css'] === PROJETO[1].content
      && dentro['game.js'] === PROJETO[2].content,
    'byte por byte');
}

{
  const pacote = await montarPacote('Meu Jogo de Kart', PROJETO);
  registrar('o nome do .zip vem do nome do projeto, com a data',
    /^meu-jogo-de-kart-\d{4}-\d{2}-\d{2}\.zip$/.test(pacote.nome), pacote.nome);
}

// ====== 2) O QUE PROTEGE O COMPUTADOR DE QUEM BAIXA ======
// Um nome com "../" faz alguns extratores gravarem fora da pasta escolhida.
{
  const perigoso = [arq('../../.bashrc', 'código do usuário'), arq('index.html', '<h1>ok</h1>')];
  const pacote = await montarPacote('Projeto', perigoso);
  const dentro = await abrirPacote(pacote.blob);
  const nomes = Object.keys(dentro);

  registrar('nome com "../" não sai da pasta: o pacote não escreve fora do destino',
    !nomes.some(n => n.includes('..') || n.startsWith('/')), nomes.join(' + '));

  registrar('e o conteúdo desse arquivo continua no pacote, só que com nome seguro',
    Object.values(dentro).includes('código do usuário'), 'nada foi perdido no caminho');
}

{
  const invalidos = [arq('rela:tório?.js', 'const a = 1;'), arq('index.html', '<h1>ok</h1>')];
  const pacote = await montarPacote('Projeto', invalidos);
  const nomes = Object.keys(await abrirPacote(pacote.blob));
  registrar('caracteres que o Windows recusa são trocados, para o pacote extrair em qualquer sistema',
    !nomes.some(n => /[<>:"|?*\\]/.test(n)), nomes.join(' + '));
}

// ====== 3) SANEAR PODE COLIDIR — E COLISÃO APAGARIA UM ARQUIVO ======
{
  const colidem = [
    arq('src/util.js', 'PRIMEIRO'),
    arq('src\\util.js', 'SEGUNDO'),
    arq('util.js', 'TERCEIRO')
  ];
  const pacote = await montarPacote('Projeto', colidem);
  const dentro = await abrirPacote(pacote.blob);
  const conteudos = Object.values(dentro);

  registrar('três arquivos que sanearam para o mesmo nome continuam sendo três',
    Object.keys(dentro).length === 3, Object.keys(dentro).join(' + '));

  registrar('nenhum deles foi apagado pelo outro',
    conteudos.includes('PRIMEIRO') && conteudos.includes('SEGUNDO') && conteudos.includes('TERCEIRO'),
    'os três conteúdos estão no pacote');
}

// ====== 4) NÃO ENTREGAR UM PACOTE VAZIO ======
// Um zip vazio faria a pessoa achar que exportou, e só descobrir o contrário na hora de usar.
{
  const vazio = await montarPacote('Projeto', [arq('index.html', '   '), arq('vazio.js', '')]);
  registrar('projeto sem conteúdo não vira pacote — devolve nada, para a tela poder explicar',
    vazio === null, vazio === null ? 'nenhum pacote gerado' : 'GEROU um zip vazio');
}

{
  registrar('lista de arquivos vazia também não vira pacote',
    (await montarPacote('Projeto', [])) === null, 'nenhum pacote');
}

{
  // Arquivo vazio no meio de um projeto com conteúdo não impede a exportação — só não entra.
  const misto = await montarPacote('Projeto', [arq('index.html', '<h1>ok</h1>'), arq('vazio.js', '  ')]);
  const dentro = await abrirPacote(misto.blob);
  registrar('arquivo vazio é deixado de fora, mas não atrapalha o resto',
    Object.keys(dentro).length === 1 && dentro['index.html'], Object.keys(dentro).join(' + '));
}

// ====== 5) OS NOMES, EM DETALHE ======
{
  registrar('nome vazio ganha um nome de reserva em vez de quebrar o pacote',
    nomeSeguroDeArquivo('') === 'arquivo.txt' && nomeSeguroDeArquivo('   ') === 'arquivo.txt',
    nomeSeguroDeArquivo(''));
}

{
  registrar('acento e espaço são preservados — eles funcionam e são o que a pessoa escreveu',
    nomeSeguroDeArquivo('coração do jogo.js') === 'coração do jogo.js',
    nomeSeguroDeArquivo('coração do jogo.js'));
}

{
  registrar('pastas úteis são preservadas dentro do pacote fullstack',
    caminhoSeguroNoPacote('frontend/index.html') === 'frontend/index.html'
      && caminhoSeguroNoPacote('server/api.js') === 'server/api.js',
    `${caminhoSeguroNoPacote('frontend/index.html')} + ${caminhoSeguroNoPacote('server/api.js')}`);
}

{
  const enorme = 'a'.repeat(300) + '.js';
  registrar('nome absurdamente longo é encurtado, para não estourar limite de sistema de arquivos',
    nomeSeguroDeArquivo(enorme).length <= 120, `${nomeSeguroDeArquivo(enorme).length} caracteres`);
}

{
  registrar('projeto sem nome ainda gera um .zip com nome utilizável',
    /^projeto-\d{4}-\d{2}-\d{2}\.zip$/.test(nomeDoPacote('')), nomeDoPacote(''));
}

{
  const entradas = prepararEntradas([arq('a.js', '1'), arq('frontend/b.js', '2')]);
  registrar('a preparação não mexe em nomes e pastas que já são seguros',
    entradas[0].caminho === 'a.js' && entradas[1].caminho === 'frontend/b.js',
    entradas.map(e => e.caminho).join(' + '));
}

// ====== 6) UM PROJETO GRANDE DE VERDADE ======
{
  const grande = [arq('index.html', '<html>' + 'x'.repeat(50000) + '</html>')];
  const pacote = await montarPacote('Kart', grande);
  const dentro = await abrirPacote(pacote.blob);
  registrar('projeto de 50 mil caracteres é empacotado e volta inteiro',
    dentro['index.html'] === grande[0].content,
    `${pacote.blob.size} bytes comprimidos, de ${grande[0].content.length} caracteres`);
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
