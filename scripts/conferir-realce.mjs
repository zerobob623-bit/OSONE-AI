/**
 * Confere o realce de sintaxe do editor do OSONE CODE.
 *
 * A regra que importa aqui não é "colorir bonito" — é NÃO MEXER NO TEXTO.
 *
 * O realce é uma camada desenhada atrás de uma área de texto transparente. As duas precisam ocupar
 * exatamente o mesmo espaço, caractere por caractere: um espaço a mais na camada de trás e o texto
 * colorido descola do texto real, o cursor aparece no lugar errado e o editor fica inutilizável.
 * Por isso o teste central, repetido em toda linguagem, é o mesmo: tirar as marcações do resultado
 * tem de devolver o código original, byte por byte.
 *
 * O segundo risco é o desenho da tela: um `<div>` dentro do código, se não for escapado, fecha a
 * camada de realce e derruba o editor.
 *
 * Como rodar:
 *   node scripts/conferir-realce.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-realce-'));
const saida = path.join(pastaTemp, 'realce.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/realce.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { realcar, textoSemMarcacao, linguagemDoArquivo } = await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const AMOSTRAS = {
  javascript: `// soma dois números
import { x } from './a.js';
const total = 0x1F + 42.5;
function calcular(a, b) {
  if (a > b) return \`\${a} maior\`;
  return null; /* fim */
}
class Coisa extends Base {}`,
  typescript: `interface Pessoa { nome: string; idade: number }
const pessoa: Pessoa = { nome: "Ana", idade: 30 };
console.log(pessoa.nome);`,
  python: `# cabeçalho
import os
@decorador
def calcular(n):
    """documentação
    em várias linhas"""
    if n is not None and n > 0:
        return n * 2
    return None`,
  sql: `-- consulta
CREATE TABLE pessoas (id INTEGER PRIMARY KEY, nome TEXT);
INSERT INTO pessoas VALUES (1, 'Ana');
SELECT nome FROM pessoas WHERE id = 1;`,
  css: `/* comentário */
@media (max-width: 600px) {
  .caixa#topo { color: #ff0000; width: 10px; }
}`,
  html: `<!-- comentário -->
<div class="caixa" id='topo'>
  <p>Olá &amp; tchau</p>
</div>`,
  json: `{"nome": "teste", "n": -1.5e3, "ok": true, "nada": null}`,
  markdown: `# Título
Texto com **negrito** e \`código\`.
\`\`\`js
const a = 1;
\`\`\``,
  texto: 'qualquer coisa <sem> linguagem & tal'
};

// 1..7) O INVARIANTE, em cada linguagem: o texto tem de sobreviver intacto.
for (const [linguagem, amostra] of Object.entries(AMOSTRAS)) {
  const html = realcar(amostra, linguagem);
  const volta = textoSemMarcacao(html);
  registrar(`${linguagem}: o texto sobrevive ao realce sem mudar um caractere`,
    volta === amostra,
    volta === amostra ? `${amostra.length} caracteres preservados` : 'TEXTO ALTERADO — o editor desalinha');
}

// 8) HTML dentro do código não pode escapar para a camada e derrubar o editor.
{
  const codigo = 'const t = "<script>alerta()</" + "script>";';
  const html = realcar(codigo, 'javascript');
  registrar('marcação dentro do código é escapada, e não injetada na tela',
    !html.includes('<script>') && html.includes('&lt;script&gt;'),
    'o < virou &lt;');
}

// 9) Comentário vence palavra-chave: 'for' num comentário não é comando.
{
  const html = realcar('// use for aqui\nfor (;;) {}', 'javascript');
  const primeiroSpan = html.match(/<span class="([^"]+)">([^<]*)/);
  registrar('comentário vence palavra-chave (ordem das regras)',
    primeiroSpan[1] === 'r-com' && primeiroSpan[2].includes('use for aqui'),
    `o comentário inteiro saiu como ${primeiroSpan[1]}`);
}

// 10) Texto entre aspas vence palavra-chave.
{
  const html = realcar('const s = "return null";', 'javascript');
  const temStringInteira = /<span class="r-str">&quot;return null&quot;<\/span>|<span class="r-str">"return null"<\/span>/.test(html);
  registrar('texto entre aspas vence palavra-chave',
    temStringInteira, temStringInteira ? 'a string saiu inteira' : html.slice(0, 90));
}

// 11) Realce de verdade acontece: não é só texto escapado.
{
  const html = realcar(AMOSTRAS.javascript, 'javascript');
  const classes = [...new Set([...html.matchAll(/class="(r-[a-z]+)"/g)].map(m => m[1]))];
  registrar('o realce marca comentário, texto, número e palavra-chave',
    ['r-com', 'r-str', 'r-num', 'r-kw'].every(c => classes.includes(c)),
    classes.join(', '));
}

// 12) Arquivo vazio e código gigante não podem quebrar nem demorar.
{
  const vazio = realcar('', 'javascript');
  const grande = 'const a = 1;\n'.repeat(4000);
  const comecou = Date.now();
  const htmlGrande = realcar(grande, 'javascript');
  const levou = Date.now() - comecou;
  registrar('arquivo vazio e arquivo grande são tratados sem travar',
    vazio === '' && textoSemMarcacao(htmlGrande) === grande && levou < 3000,
    `${grande.length} caracteres em ${levou}ms`);
}

// 13) A linguagem é descoberta pela extensão do arquivo.
{
  const mapa = [['app.tsx', 'typescript'], ['estilo.css', 'css'], ['pagina.html', 'html'],
                ['script.py', 'python'], ['consulta.sql', 'sql'], ['dados.json', 'json'], ['leia.md', 'markdown'],
                ['nota.xyz', 'texto']];
  const erros = mapa.filter(([nome, esperado]) => linguagemDoArquivo(nome) !== esperado);
  registrar('a linguagem é descoberta pela extensão do arquivo',
    erros.length === 0,
    erros.length ? `erraram: ${erros.map(e => e[0]).join(', ')}` : `${mapa.length} extensões corretas`);
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
