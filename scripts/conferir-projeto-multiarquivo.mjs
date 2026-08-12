/**
 * Confere a escrita de VÁRIOS arquivos numa resposta só — e, principalmente, quando ela NÃO deve
 * escrever nada.
 *
 * Este caminho é o mais perigoso do OSONE CODE, porque ele grava por cima do trabalho da pessoa.
 * Um parser de edição que erra não devolve erro: devolve um projeto quebrado com aparência de
 * projeto pronto. Os três modos de estragar, em ordem de gravidade:
 *
 *   1. RESPOSTA CORTADA. O modelo estoura o limite de tokens no meio de um arquivo. O bloco fica
 *      sem o marcador de fim, e meia função é gravada por cima de uma que funcionava. É silencioso
 *      e é o que destrói mais trabalho — foi exatamente o defeito que o codeEdits.ts já tinha
 *      aprendido a evitar no caminho de um arquivo só.
 *   2. CAMINHO ESCAPANDO DO PROJETO. "../../.env" ou "/etc/passwd" vindos do modelo não podem
 *      virar caminho de verdade.
 *   3. SEGREDO GERADO. O modelo adora criar um ".env" com chaves de exemplo, e é justamente o
 *      arquivo que a pessoa publica sem olhar.
 *
 * Como rodar:
 *   node scripts/conferir-projeto-multiarquivo.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-multiarquivo-'));
const saida = path.join(pastaTemp, 'multi.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/projetoMultiArquivo.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { lerArquivosDoModelo, aplicarArquivosDoModelo, INSTRUCAO_DE_PROJETO_MULTIARQUIVO } =
  await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const bloco = (caminho, conteudo) =>
  `<<<<<<< ARQUIVO: ${caminho}\n${conteudo}\n>>>>>>> FIM ARQUIVO`;

const arquivo = (nome, conteudo) => ({
  id: `id-${nome}`, name: nome, language: 'plaintext', content: conteudo, updatedAt: 1
});

// ============================================================================
// 1) O CAMINHO FELIZ: UM PROJETO INTEIRO NUMA RESPOSTA
// ============================================================================
{
  const resposta = [
    'Criei a base do app.',
    bloco('package.json', '{\n  "name": "meu-app"\n}'),
    bloco('src/App.tsx', 'export default function App() {\n  return <h1>Oi</h1>;\n}'),
    bloco('src/components/Header.tsx', 'export const Header = () => <header />;'),
    'Pronto.'
  ].join('\n\n');

  const r = aplicarArquivosDoModelo(resposta, [], { linguagemDe: () => 'typescript' });

  registrar('vários arquivos numa resposta só viram vários arquivos no projeto',
    r.arquivos.length === 3 && !r.cortada,
    r.arquivos.map(a => a.name).join(', '));

  registrar('as pastas são preservadas, e não achatadas para a raiz',
    r.arquivos.some(a => a.name === 'src/components/Header.tsx'),
    'src/components/Header.tsx continua dentro das pastas');

  registrar('o conteúdo entra inteiro, sem o texto que veio em volta',
    r.arquivos.find(a => a.name === 'src/App.tsx')?.content === 'export default function App() {\n  return <h1>Oi</h1>;\n}',
    'nem "Criei a base do app." nem "Pronto." vazam para dentro do arquivo');

  registrar('o resumo diz o que entrou, para o registro da conversa',
    /3 arquivo\(s\) criado\(s\)/.test(r.resumo), r.resumo.slice(0, 70));
}

// ============================================================================
// 2) A RESPOSTA CORTADA — o defeito que destrói trabalho
// ============================================================================
{
  const original = [arquivo('src/App.tsx', 'CONTEUDO ORIGINAL QUE FUNCIONA')];
  const cortada = [
    bloco('src/util.ts', 'export const ok = 1;'),
    '<<<<<<< ARQUIVO: src/App.tsx',
    'export default function App() {',
    '  const [x, setX] = useState(0);   // o modelo parou aqui'
  ].join('\n\n');

  const r = aplicarArquivosDoModelo(cortada, original);

  registrar('arquivo sem marcador de fim NÃO é gravado',
    r.arquivos.find(a => a.name === 'src/App.tsx')?.content === 'CONTEUDO ORIGINAL QUE FUNCIONA',
    'o que funcionava continua intacto');

  registrar('o arquivo que veio COMPLETO antes do corte é aproveitado',
    r.arquivos.some(a => a.name === 'src/util.ts'),
    'perder o que estava certo junto com o que veio pela metade seria pior');

  registrar('o corte é reportado, com o nome do arquivo que ficou pela metade',
    r.cortada === true && r.caminhoCortado === 'src/App.tsx',
    `cortada=${r.cortada}, arquivo="${r.caminhoCortado}"`);

  registrar('o resumo manda pedir a continuação em vez de comemorar',
    /continuação/i.test(r.resumo), r.resumo.slice(-80));
}

// ============================================================================
// 3) CAMINHO NÃO ESCAPA DO PROJETO
// ============================================================================
{
  const perigosos = [
    '../../.ssh/id_rsa',
    '/etc/passwd',
    'C:\\Windows\\System32\\drivers\\etc\\hosts',
    '../../../fora.txt'
  ];
  const resposta = perigosos.map((c, i) => bloco(c, `conteudo ${i}`)).join('\n\n');
  const r = aplicarArquivosDoModelo(resposta, []);

  const escapou = r.arquivos.filter(a =>
    a.name.startsWith('/') || a.name.includes('..') || /^[a-z]:/i.test(a.name));
  registrar('caminho do modelo nunca sai da pasta do projeto',
    escapou.length === 0,
    escapou.length ? `ESCAPOU: ${escapou.map(a => a.name).join(', ')}` : r.arquivos.map(a => a.name).join(', '));
}

// ============================================================================
// 4) O QUE NÃO SE ESCREVE NUNCA
// ============================================================================
{
  const resposta = [
    bloco('.env', 'GEMINI_API_KEY=AIzaSyDminhachavereal'),
    bloco('.env.example', 'GEMINI_API_KEY='),
    bloco('node_modules/react/index.js', 'module.exports = {}')
  ].join('\n\n');
  const r = aplicarArquivosDoModelo(resposta, []);

  registrar('".env" com valor real é recusado',
    !r.arquivos.some(a => a.name === '.env') && r.recusados.some(x => x.caminho === '.env'),
    'é justamente o arquivo que a pessoa publica sem olhar');

  registrar('".env.example" continua permitido — é o jeito certo de documentar a variável',
    r.arquivos.some(a => a.name === '.env.example'),
    'sem valores, serve de documentação');

  registrar('node_modules não entra no projeto',
    !r.arquivos.some(a => a.name.startsWith('node_modules/')),
    'dependência não é código do usuário');

  registrar('a recusa aparece no resumo, e não acontece em silêncio',
    /recusado/i.test(r.resumo), r.resumo.slice(0, 90));
}

// ============================================================================
// 5) REESCREVER O QUE JÁ EXISTE
// ============================================================================
{
  const antes = [arquivo('src/App.tsx', 'versão antiga'), arquivo('outro.txt', 'não mexer')];
  const r = aplicarArquivosDoModelo(bloco('src/App.tsx', 'versão nova'), antes);

  registrar('arquivo existente é atualizado, e não duplicado',
    r.arquivos.filter(a => a.name === 'src/App.tsx').length === 1
      && r.arquivos.find(a => a.name === 'src/App.tsx')?.content === 'versão nova',
    `${r.arquivos.length} arquivo(s) no total`);

  registrar('o id do arquivo atualizado é preservado',
    r.arquivos.find(a => a.name === 'src/App.tsx')?.id === 'id-src/App.tsx',
    'trocar o id faria a aba aberta perder a referência');

  registrar('quem não foi citado fica intocado',
    r.arquivos.find(a => a.name === 'outro.txt')?.content === 'não mexer',
    'o modelo só mexe no que escreveu');
}

// ============================================================================
// 6) O QUE O MODELO FAZ DE ERRADO POR HÁBITO
// ============================================================================
{
  const comCerca = aplicarArquivosDoModelo(
    '<<<<<<< ARQUIVO: src/a.ts\n```typescript\nexport const a = 1;\n```\n>>>>>>> FIM ARQUIVO', []);
  registrar('a cerca de markdown dentro do bloco é removida',
    comCerca.arquivos[0]?.content === 'export const a = 1;',
    JSON.stringify(comCerca.arquivos[0]?.content));

  const semFormato = aplicarArquivosDoModelo('Claro! Aqui está o código que você pediu.', [arquivo('a.txt', 'intacto')]);
  registrar('resposta sem nenhum bloco não mexe em arquivo nenhum',
    semFormato.arquivos.length === 1 && semFormato.arquivos[0].content === 'intacto' && !semFormato.cortada,
    semFormato.resumo);

  const gigante = aplicarArquivosDoModelo(bloco('grande.txt', 'x'.repeat(500_000)), []);
  registrar('arquivo absurdamente grande é recusado em vez de travar a tela',
    gigante.arquivos.length === 0 && gigante.recusados.length === 1,
    gigante.recusados[0]?.motivo);
}


// ============================================================================
// 8) DOTFILES — o conjunto que todo projeto de verdade tem
// ============================================================================
/**
 * Um projeto que se parece com projeto tem ".gitignore", ".env.example" e às vezes
 * ".github/workflows". O normalizador de caminho comia o ponto do começo desses nomes, e o estrago
 * era invisível: o arquivo aparecia na árvore com o nome quase certo, e um "gitignore" sem ponto
 * não é ignorado por git nenhum. Valia também para repositório importado do GitHub, que voltava
 * com os arquivos de configuração mudos.
 */
{
  const resposta = [
    bloco('.gitignore', 'node_modules\ndist'),
    bloco('.env.example', 'API_KEY='),
    bloco('.github/workflows/ci.yml', 'name: CI')
  ].join('\n\n');
  const r = aplicarArquivosDoModelo(resposta, []);
  const nomes = r.arquivos.map(a => a.name);

  registrar('o ponto do começo dos dotfiles é preservado',
    nomes.includes('.gitignore') && nomes.includes('.env.example') && nomes.includes('.github/workflows/ci.yml'),
    nomes.join(', '));
}

// ============================================================================
// 7) A INSTRUÇÃO CONTA AS REGRAS QUE O CÓDIGO APLICA
// ============================================================================
{
  const t = INSTRUCAO_DE_PROJETO_MULTIARQUIVO;
  registrar('a instrução mostra o formato exato do bloco',
    t.includes('<<<<<<< ARQUIVO:') && t.includes('>>>>>>> FIM ARQUIVO'),
    'abertura com caminho e fechamento explícito');

  registrar('a instrução proíbe "resto igual" e reticências no meio do arquivo',
    /resto igual/i.test(t) && t.includes('INTEIRO'),
    'o que for omitido some do arquivo — precisa estar dito');

  registrar('a instrução avisa que bloco cortado é DESCARTADO',
    /DESCARTADO/i.test(t), 'é o que faz o modelo preferir arquivos completos');

  registrar('a instrução proíbe gerar ".env" com valor real',
    /\.env/.test(t) && /\.env\.example/.test(t),
    'a regra que o código aplica também está escrita para o modelo');
}

// ============================================================================
// 9) AS TRÊS PONTAS LIGADAS
// ============================================================================
/**
 * O parser pode estar perfeito e o recurso não existir: basta ninguém ensinar o formato ao modelo,
 * ou o texto com os blocos ser entregue à função de arquivo único — que gravaria os marcadores
 * crus por cima do arquivo aberto, transformando o projeto inteiro em lixo dentro de um arquivo.
 * Estas conferências olham a fiação, que nenhum teste de unidade alcança.
 */
{
  const app = fs.readFileSync(path.join(RAIZ, 'src/App.tsx'), 'utf8');
  const editor = fs.readFileSync(path.join(RAIZ, 'src/components/CodeWorkspace.tsx'), 'utf8');

  registrar('o modelo é ENSINADO a responder no formato de projeto',
    app.includes('INSTRUCAO_DE_PROJETO_MULTIARQUIVO'),
    'a instrução entra na geração de código');

  // A ordem importa: se applyModelCodeResponse vier primeiro, os marcadores viram conteúdo.
  const posicaoDaLeitura = app.indexOf('lerArquivosDoModelo(data.text)');
  const posicaoDoArquivoUnico = app.indexOf('applyModelCodeResponse(data.text, currentCode)');
  registrar('o projeto é lido ANTES de o texto ser tratado como arquivo único',
    posicaoDaLeitura > 0 && posicaoDoArquivoUnico > 0 && posicaoDaLeitura < posicaoDoArquivoUnico,
    `leitura em ${posicaoDaLeitura}, arquivo único em ${posicaoDoArquivoUnico}`);

  registrar('o editor aplica os arquivos e empilha o histórico antes de gravar',
    editor.includes('aplicarArquivosDoModelo(resultado.projetoMultiArquivo')
      && /pushHistory\(filesRef\.current\);\s*\n\s*const r = aplicarArquivosDoModelo/.test(editor),
    'criar oito arquivos precisa caber num Ctrl+Z');
}


fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências da escrita multi-arquivo passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
