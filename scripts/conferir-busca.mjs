/**
 * Confere a busca e a substituição em todos os arquivos do OSONE CODE.
 *
 * Por que existe: é a ferramenta mais usada de qualquer editor depois do próprio editor, e não
 * existia. Achar onde uma função era chamada exigia abrir arquivo por arquivo e ler com o olho, e
 * renomear algo usado em quatro arquivos eram quatro edições manuais — com a chance de esquecer
 * uma. Uma chamada esquecida só aparece quando o programa quebra, longe de onde a mudança foi feita.
 *
 * Substituir em massa é a operação mais perigosa de um editor, então os casos aqui cuidam tanto de
 * ela funcionar quanto de ela NÃO fazer o que não foi pedido.
 *
 * Como rodar:
 *   node scripts/conferir-busca.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-busca-'));
const saida = path.join(pastaTemp, 'busca.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/buscarNoProjeto.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { buscarNoProjeto, substituirNoProjeto } = await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const PROJETO = [
  { id: 'f1', name: 'app.js', content: "import { calcular } from './util.js';\nconst total = calcular(10);\nconsole.log(total);" },
  { id: 'f2', name: 'util.js', content: "export function calcular(n) {\n  return n * 2;\n}\n// calcular dobra o valor" },
  { id: 'f3', name: 'index.html', content: '<h1>Largura total</h1>\n<div id="total"></div>' }
];

// 1) Acha em todos os arquivos, não só no aberto.
{
  const r = buscarNoProjeto(PROJETO, 'calcular');
  const arquivos = [...new Set(r.ocorrencias.map(o => o.arquivoNome))];
  registrar('acha o termo em todos os arquivos do projeto',
    r.ocorrencias.length === 4 && arquivos.length === 2,
    `${r.ocorrencias.length} ocorrência(s) em ${arquivos.join(', ')}`);
}

// 2) Cada ocorrência traz linha e contexto, para não precisar abrir o arquivo para entender.
{
  const r = buscarNoProjeto(PROJETO, 'return n');
  const o = r.ocorrencias[0];
  registrar('cada ocorrência traz o número da linha e a linha inteira',
    o.linha === 2 && o.textoDaLinha === 'return n * 2;',
    `linha ${o.linha}: "${o.textoDaLinha}"`);
}

// 3) Palavra inteira: procurar "total" não pode trazer "Largura total"? — traz, é palavra.
//    O caso real é o inverso: "id" não pode casar dentro de "width".
{
  const projeto = [{ id: 'x', name: 'a.css', content: '.caixa { width: 10px; }\n#id { color: red; }' }];
  const solto = buscarNoProjeto(projeto, 'id');
  const inteiro = buscarNoProjeto(projeto, 'id', { palavraInteira: true });
  registrar('palavra inteira não casa dentro de outra palavra',
    solto.ocorrencias.length === 2 && inteiro.ocorrencias.length === 1,
    `solto: ${solto.ocorrencias.length}, palavra inteira: ${inteiro.ocorrencias.length}`);
}

// 4) Maiúsculas/minúsculas.
{
  const semDistincao = buscarNoProjeto(PROJETO, 'LARGURA');
  const comDistincao = buscarNoProjeto(PROJETO, 'LARGURA', { caseSensitive: true });
  registrar('a distinção de maiúsculas funciona nos dois modos',
    semDistincao.ocorrencias.length === 1 && comDistincao.ocorrencias.length === 0,
    `sem distinção: ${semDistincao.ocorrencias.length}, com: ${comDistincao.ocorrencias.length}`);
}

// 5) Símbolo com "palavra inteira" não pode sumir — \b em volta de '+' nunca casaria.
{
  const projeto = [{ id: 'x', name: 'a.js', content: 'const s = a + b;' }];
  const r = buscarNoProjeto(projeto, '+', { palavraInteira: true });
  registrar('buscar um símbolo com palavra inteira ainda acha',
    r.ocorrencias.length === 1,
    `${r.ocorrencias.length} ocorrência(s)`);
}

// 6) Regex inválida explica, em vez de devolver "nada encontrado".
{
  const r = buscarNoProjeto(PROJETO, '[abc', { regex: true });
  registrar('expressão inválida devolve o motivo, e não um vazio silencioso',
    !!r.erro && r.ocorrencias.length === 0,
    r.erro ? r.erro.slice(0, 50) + '…' : 'não explicou');
}

// 7) Regex que casa vazio não pode prender o laço para sempre.
{
  const r = buscarNoProjeto([{ id: 'x', name: 'a.js', content: 'aaa' }], 'b*', { regex: true });
  registrar('expressão que casa vazio não trava a busca',
    Array.isArray(r.ocorrencias),
    'a busca terminou');
}

// 8) Substituir troca em todos os arquivos e conta o que fez.
{
  const r = substituirNoProjeto(PROJETO, 'calcular', 'somar');
  const app = r.arquivos.find(f => f.name === 'app.js');
  const util = r.arquivos.find(f => f.name === 'util.js');
  registrar('substituir troca em todos os arquivos e relata quantos',
    r.trocas === 4 && app.content.includes('somar(10)') && util.content.includes('function somar'),
    `${r.trocas} troca(s) em ${r.arquivosAfetados.join(', ')}`);
}

// 9) A lista original não pode ser alterada — é isso que permite desfazer a troca inteira.
{
  const antes = JSON.stringify(PROJETO);
  substituirNoProjeto(PROJETO, 'calcular', 'somar');
  registrar('a substituição não altera a lista original (permite desfazer)',
    JSON.stringify(PROJETO) === antes,
    'lista de entrada intacta');
}

// 10) Arquivo sem o termo tem de sair INTACTO, e não recriado.
{
  const r = substituirNoProjeto(PROJETO, 'calcular', 'somar');
  const html = r.arquivos.find(f => f.name === 'index.html');
  registrar('arquivo sem o termo não é tocado',
    html === PROJETO[2],
    'mesma referência, sem updatedAt novo');
}

// 11) Substituição com palavra inteira não estraga palavras que contêm o termo.
{
  const projeto = [{ id: 'x', name: 'a.js', content: 'const id = 1; const width = 2; const idade = 3;' }];
  const r = substituirNoProjeto(projeto, 'id', 'chave', { palavraInteira: true });
  registrar('substituir com palavra inteira não corrompe palavras vizinhas',
    r.arquivos[0].content === 'const chave = 1; const width = 2; const idade = 3;',
    r.arquivos[0].content);
}

// 12) Termo vazio não pode varrer o projeto.
{
  const r = substituirNoProjeto(PROJETO, '', 'X');
  registrar('termo vazio não substitui nada',
    r.trocas === 0 && r.arquivos === PROJETO,
    'nada foi trocado');
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
