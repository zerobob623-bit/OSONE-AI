/**
 * Confere que o OSONE consegue LER e EDITAR arquivos do computador — e servir uma pasta num
 * localhost.
 *
 * Por que existe: o agente tinha escrita ('/write-file') e listagem, mas não leitura. Na prática
 * o OSONE achava e abria um arquivo, e criava outro por cima, mas nunca via o que já estava
 * escrito — o usuário precisava COMPARTILHAR A TELA para ele ler pela câmera o que poderia ter
 * lido do disco. E sem leitura não existe edição consciente: escrever sem ler antes é sempre
 * sobrescrever às cegas.
 *
 * Os casos que mais importam aqui são os de RECUSA, porque são os que protegem trabalho alheio:
 *
 *   1. TRECHO AMBÍGUO. Se o texto a trocar aparece cinco vezes, o modelo não disse qual queria.
 *      Trocar a primeira é adivinhação silenciosa — a edição precisa ser recusada com o arquivo
 *      INTACTO, e o teste confere as duas coisas.
 *   2. FUGA DA PASTA SERVIDA. Um "GET /../../.ssh/id_rsa" no servidor de preview não pode sair
 *      da pasta do projeto.
 *   3. ARQUIVO BINÁRIO. Ler um .png despeja megabytes de lixo no contexto do modelo e pode
 *      estourar o limite de tokens sozinho.
 *
 * Como rodar:
 *   node scripts/conferir-arquivos-do-agente.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(RAIZ, '.tmp-teste-'));
const saida = path.join(pastaTemp, 'agente.cjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/localAgentService.ts')],
  bundle: true, format: 'cjs', platform: 'node', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent',
  external: ['express']
});

const { createRequire } = await import('module');
const require = createRequire(import.meta.url);
const express = require(path.join(RAIZ, 'node_modules/express'));
const mod = require(saida);
const agentRouter = mod.agentRouter;

// Descobre o token gerado pelo próprio serviço
let token = '';
try { token = JSON.parse(fs.readFileSync(path.join(RAIZ,'config.json'), 'utf8')).token || ''; } catch(e) { console.log('erro:', e.message); }
if (!token) {
  for (const p of [path.join(RAIZ, 'config.json'), path.join(os.homedir(), '.config/osone/config.json')]) {
    try { token = JSON.parse(fs.readFileSync(p, 'utf8')).localAgentToken || ''; if (token) break; } catch {}
  }
}
console.log('token encontrado:', token ? 'sim' : 'NAO');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/agent', agentRouter);
const servidor = app.listen(0, '127.0.0.1');
await new Promise(r => servidor.on('listening', r));
const porta = servidor.address().port;
const base = `http://127.0.0.1:${porta}/api/agent`;
const H = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

const chamar = async (rota, corpo) => {
  const r = await fetch(base + rota, { method: 'POST', headers: H, body: JSON.stringify(corpo) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

// ---- Cenário de teste ----
const areaDeTeste = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-cenario-'));
const arquivo = path.join(areaDeTeste, 'exemplo.txt');
fs.writeFileSync(arquivo, 'linha um\nlinha dois\nlinha tres\n');

let ok = 0, falhou = 0;
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) { ok++; console.log(`  ok    ${nome}`); }
  else { falhou++; console.log(`  FALHOU ${nome} ${detalhe}`); }
};

console.log('\n=== LER ARQUIVO ===');
let r = await chamar('/read-file', { target: arquivo });
conferir('lê o conteúdo do arquivo', r.body.content === 'linha um\nlinha dois\nlinha tres\n', JSON.stringify(r.body).slice(0,200));
conferir('conta as linhas', r.body.totalDeLinhas === 4, JSON.stringify(r.body.totalDeLinhas));

r = await chamar('/read-file', { target: path.join(areaDeTeste, 'naoexiste.txt') });
conferir('arquivo inexistente devolve 404', r.status === 404);

r = await chamar('/read-file', { target: areaDeTeste });
conferir('pasta devolve erro explicando', r.status === 400 && /pasta/i.test(r.body.error || ''));

const bin = path.join(areaDeTeste, 'bin.dat');
fs.writeFileSync(bin, Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff]));
r = await chamar('/read-file', { target: bin });
conferir('binário é recusado, não despejado no contexto', r.status === 400 && /binário/i.test(r.body.error || ''));

console.log('\n=== EDITAR ARQUIVO (cirúrgico) ===');
r = await chamar('/edit-file', { target: arquivo, search: 'linha dois', replace: 'LINHA DOIS EDITADA' });
conferir('edita o trecho pedido', r.status === 200);
conferir('preserva o resto do arquivo',
  fs.readFileSync(arquivo, 'utf8') === 'linha um\nLINHA DOIS EDITADA\nlinha tres\n',
  JSON.stringify(fs.readFileSync(arquivo, 'utf8')));

r = await chamar('/edit-file', { target: arquivo, search: 'nao existe isso', replace: 'x' });
conferir('trecho inexistente devolve 404 e orienta ler antes', r.status === 404 && /ler_arquivo/.test(r.body.error || ''));

const ambiguo = path.join(areaDeTeste, 'ambiguo.txt');
fs.writeFileSync(ambiguo, 'repete\nrepete\nrepete\n');
r = await chamar('/edit-file', { target: ambiguo, search: 'repete', replace: 'trocado' });
conferir('trecho ambíguo é RECUSADO em vez de chutar', r.status === 409 && r.body.ocorrencias === 3);
conferir('arquivo ambíguo permanece intacto após recusa',
  fs.readFileSync(ambiguo, 'utf8') === 'repete\nrepete\nrepete\n');

r = await chamar('/edit-file', { target: ambiguo, search: 'repete', replace: 'trocado', all: true });
conferir('com todas=true troca todas', r.status === 200 && r.body.substituicoes === 3);

console.log('\n=== SERVIDOR LOCAL (localhost) ===');
const projeto = path.join(areaDeTeste, 'jogo');
fs.mkdirSync(projeto);
fs.writeFileSync(path.join(projeto, 'index.html'), '<h1>OI JOGO</h1>');
fs.writeFileSync(path.join(projeto, 'app.js'), 'console.log(1)');
r = await chamar('/serve-folder', { folder: projeto });
conferir('sobe servidor e devolve url', r.status === 200 && /^http:\/\/127\.0\.0\.1:\d+$/.test(r.body.url || ''), JSON.stringify(r.body));

if (r.body.url) {
  const pagina = await fetch(r.body.url).then(x => x.text());
  conferir('serve o index.html na raiz', pagina === '<h1>OI JOGO</h1>', pagina);
  const js = await fetch(r.body.url + '/app.js');
  conferir('serve .js com Content-Type correto', (js.headers.get('content-type') || '').includes('javascript'));
  const fuga = await fetch(r.body.url + '/../../../etc/passwd');
  conferir('bloqueia fuga da pasta servida', fuga.status === 403 || fuga.status === 404, 'status=' + fuga.status);
  const r2 = await chamar('/serve-folder', { folder: projeto });
  conferir('reaproveita servidor da mesma pasta', r2.body.porta === r.body.porta && r2.body.reaproveitado === true);
}

console.log('\n=== LEITURA POR FAIXA DE LINHAS ===');
const grande = path.join(areaDeTeste, 'grande.txt');
fs.writeFileSync(grande, Array.from({length: 500}, (_, i) => `linha ${i + 1}`).join('\n'));

r = await chamar('/read-file', { target: grande, linhaInicial: 10, linhaFinal: 12 });
conferir('faixa devolve exatamente as linhas pedidas',
  r.body.content === 'linha 10\nlinha 11\nlinha 12', JSON.stringify(r.body.content));
conferir('informa o total de linhas do arquivo', r.body.totalDeLinhas === 500);
conferir('informa onde a leitura começou e parou', r.body.linhaInicial === 10 && r.body.linhaFinal === 12);

r = await chamar('/read-file', { target: grande, linhaInicial: 9999 });
conferir('linha inicial além do fim devolve erro claro', r.status === 400 && /500 linhas/.test(r.body.error || ''));

// O caso real que motivou a mudança: o proprio App.tsx do OSONE tem ~770 KB e nao cabe
// numa leitura so. Ler cortado sem avisar era o defeito.
const appTsx = path.join(RAIZ, 'src/App.tsx');
r = await chamar('/read-file', { target: appTsx });
conferir('arquivo de 770 KB é lido sem erro', r.status === 200);
conferir('avisa que o arquivo NÃO acabou', r.body.truncated === true && /NÃO acabou/.test(r.body.aviso || ''));
conferir('diz a linha exata para continuar',
  new RegExp(`linhaInicial=${r.body.linhaFinal + 1}`).test(r.body.aviso || ''), r.body.aviso);
const totalReal = fs.readFileSync(appTsx, 'utf8').split('\n').length;
conferir('conta o total de linhas do arquivo inteiro, não só do pedaço lido',
  r.body.totalDeLinhas === totalReal, `${r.body.totalDeLinhas} vs ${totalReal}`);
conferir('corta em fronteira de LINHA, sem partir a última no meio',
  fs.readFileSync(appTsx, 'utf8').split('\n')[r.body.linhaFinal - 1] === r.body.content.split('\n').pop());

// Continuar a leitura de onde parou precisa emendar exatamente, sem pular nem repetir linha.
const r2 = await chamar('/read-file', { target: appTsx, linhaInicial: r.body.linhaFinal + 1 });
conferir('a continuação começa na linha seguinte, sem pular nem repetir',
  r2.body.content.split('\n')[0] === fs.readFileSync(appTsx, 'utf8').split('\n')[r.body.linhaFinal]);

console.log('\n=== CONFERÊNCIA DE PROJETO (laço de conserto) ===');
const bom = path.join(areaDeTeste, 'proj-bom');
fs.mkdirSync(bom);
fs.writeFileSync(path.join(bom, 'index.html'), '<script src="jogo.js"></script>');
fs.writeFileSync(path.join(bom, 'jogo.js'), 'const a = 1; function ok(){ return a; }');
r = await chamar('/check-project', { folder: bom });
conferir('projeto íntegro passa sem problemas', r.body.ok === true, JSON.stringify(r.body.problemas));

const quebrado = path.join(areaDeTeste, 'proj-quebrado');
fs.mkdirSync(quebrado);
// Resposta cortada no meio: chave que nunca fecha. É o defeito nº1 do gerador.
fs.writeFileSync(path.join(quebrado, 'index.html'), '<script src="jogo.js"></script>');
fs.writeFileSync(path.join(quebrado, 'jogo.js'), 'function quebrado() { if (x) {');
r = await chamar('/check-project', { folder: quebrado });
conferir('pega JS cortado no meio (chave sem fechar)',
  r.body.ok === false && r.body.problemas.some(p => /sintaxe/i.test(p.problema)), JSON.stringify(r.body.problemas));

const semIndex = path.join(areaDeTeste, 'proj-sem-index');
fs.mkdirSync(semIndex);
fs.writeFileSync(path.join(semIndex, 'outro.html'), '<h1>oi</h1>');
r = await chamar('/check-project', { folder: semIndex });
conferir('pega falta de index.html',
  r.body.ok === false && r.body.problemas.some(p => /index\.html/.test(p.problema)));

const refQuebrada = path.join(areaDeTeste, 'proj-ref');
fs.mkdirSync(refQuebrada);
fs.writeFileSync(path.join(refQuebrada, 'index.html'), '<script src="naoexiste.js"></script><link href="https://cdn.exemplo/x.css">');
r = await chamar('/check-project', { folder: refQuebrada });
conferir('pega referência local quebrada',
  r.body.ok === false && r.body.problemas.some(p => /naoexiste\.js/.test(p.problema)));
conferir('NÃO reclama de CDN externo',
  !r.body.problemas.some(p => /cdn\.exemplo/.test(p.problema)), JSON.stringify(r.body.problemas));

// Projeto moderno com import/export é válido e não pode ser reprovado por engano.
const comModulo = path.join(areaDeTeste, 'proj-modulo');
fs.mkdirSync(comModulo);
fs.writeFileSync(path.join(comModulo, 'index.html'), '<script type="module" src="app.js"></script>');
fs.writeFileSync(path.join(comModulo, 'app.js'), 'import { x } from "./outro.js";\nexport const y = x + 1;');
fs.writeFileSync(path.join(comModulo, 'outro.js'), 'export const x = 1;');
r = await chamar('/check-project', { folder: comModulo });
conferir('projeto com import/export NÃO é reprovado por engano',
  r.body.ok === true, JSON.stringify(r.body.problemas));

console.log(`\n${ok} passaram, ${falhou} falharam`);
servidor.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });
fs.rmSync(areaDeTeste, { recursive: true, force: true });
process.exit(falhou > 0 ? 1 : 0);
