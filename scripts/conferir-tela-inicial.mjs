/**
 * O APP ABRE? — a conferência que faltava, e que teria evitado a tela branca.
 *
 * Todos os outros conferidores deste projeto testam PARTES: o agente, o plano, a memória, as
 * câmeras. Nenhum testava a coisa mais básica de todas — se o app, depois de construído, chega a
 * desenhar alguma coisa na tela. E foi exatamente aí que ele quebrou: um erro de inicialização
 * entre pedaços do pacote derrubava o JavaScript ANTES do React montar. Nada renderizava, em
 * nenhuma aba, e o build passava limpo porque, para o compilador, estava tudo certo.
 *
 * Repare no detalhe que torna esse tipo de falha tão cruel: ela não aparece no `tsc`, não aparece
 * no `vite build`, e não aparece em nenhum teste de unidade. Ela só aparece num navegador de
 * verdade executando o pacote de verdade. É isso que este arquivo faz.
 *
 * Duas conferências, da mais barata para a mais cara:
 *
 *   1. A REGRA DE IMPORTAÇÃO (instantânea, sem navegador). O projeto usa 'motion/react'. Importar
 *      'framer-motion' em UM arquivo que seja põe duas cópias do mesmo motor de animação no grafo
 *      de módulos, e o fatiamento em pedaços transforma isso numa dependência circular entre
 *      pedaços — "Cannot access 'X' before initialization", tela branca no app inteiro. Foi
 *      literalmente uma linha de import que apagou o app. Esta regra é o pente fino que impede a
 *      mesma linha de voltar.
 *
 *   2. O APP DESENHANDO (precisa de dist/ e do Chromium). Abre o pacote construído num Chromium
 *      sem interface, espera, e confere duas coisas: que #root tem conteúdo e que nenhuma exceção
 *      não capturada apareceu no console. É o teste de fumaça que separa "compilou" de "abre".
 *
 * Como rodar:
 *   npm run build && node scripts/conferir-tela-inicial.mjs
 */
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

// ============================================================================
// 1) A REGRA DE IMPORTAÇÃO
// ============================================================================
function arquivosDoFonte(pasta) {
  const achados = [];
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) achados.push(...arquivosDoFonte(caminho));
    else if (/\.(ts|tsx)$/.test(item.name)) achados.push(caminho);
  }
  return achados;
}

{
  const infratores = arquivosDoFonte(path.join(RAIZ, 'src')).filter(arquivo =>
    /from\s+['"]framer-motion['"]/.test(fs.readFileSync(arquivo, 'utf8'))
  ).map(a => path.relative(RAIZ, a));

  registrar('nenhuma tela importa de "framer-motion" — o projeto usa "motion/react"',
    infratores.length === 0,
    infratores.length
      ? `${infratores.join(', ')} — duas cópias do motor de animação derrubam o app inteiro`
      : 'uma cópia só do motor de animação');
}

// ============================================================================
// 2) O APP DESENHANDO, NUM NAVEGADOR DE VERDADE
// ============================================================================
const PASTA_DO_PACOTE = path.join(RAIZ, 'dist');
const CHROMIUM = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome'].find(c => { try { return fs.existsSync(c); } catch { return false; } });

if (!fs.existsSync(path.join(PASTA_DO_PACOTE, 'index.html'))) {
  console.log('  (pulado) não há dist/index.html — rode "npm run build" antes para conferir se o app abre.');
} else if (!CHROMIUM) {
  console.log('  (pulado) nenhum Chromium encontrado nesta máquina para abrir o app.');
} else {
  const dormir = (ms) => new Promise(r => setTimeout(r, ms));
  const TIPOS = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
    '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };

  const servidor = http.createServer((req, res) => {
    const limpo = decodeURIComponent(req.url.split('?')[0]);
    let arquivo = path.join(PASTA_DO_PACOTE, limpo);
    if (!arquivo.startsWith(PASTA_DO_PACOTE)) { res.writeHead(400); res.end(); return; }
    if (!fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
      if (path.extname(limpo)) { res.writeHead(404); res.end(); return; }
      arquivo = path.join(PASTA_DO_PACOTE, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
    fs.createReadStream(arquivo).pipe(res);
  });
  await new Promise(r => servidor.listen(4399, '127.0.0.1', r));

  const perfil = fs.mkdtempSync(path.join(RAIZ, 'node_modules', '.perfil-chrome-'));
  const navegador = spawn(CHROMIUM, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-port=9344', `--user-data-dir=${perfil}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  const pegarJson = (caminho) => new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:9344${caminho}`, res => {
      let corpo = ''; res.on('data', d => corpo += d);
      res.on('end', () => { try { resolve(JSON.parse(corpo)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });

  let ws = null;
  try {
    for (let i = 0; i < 60 && !ws; i++) {
      try {
        const abas = await pegarJson('/json/list');
        const aba = abas.find(a => a.type === 'page');
        if (aba) {
          ws = new WebSocket(aba.webSocketDebuggerUrl);
          await new Promise(r => ws.addEventListener('open', r));
        }
      } catch { await dormir(500); }
    }
    if (!ws) throw new Error('o Chromium não respondeu.');

    let proximoId = 1;
    const pendentes = new Map();
    const explosoes = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pendentes.has(msg.id)) { pendentes.get(msg.id)(msg); pendentes.delete(msg.id); return; }
      // Exceção não capturada é o que produz a tela branca: o script morre antes do React montar.
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        explosoes.push((d.exception?.description || d.text || '').split('\n')[0]);
      }
    });
    const enviar = (method, params = {}) => new Promise(resolve => {
      const id = proximoId++;
      pendentes.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await enviar('Runtime.enable');
    await enviar('Page.enable');
    await enviar('Page.navigate', { url: 'http://127.0.0.1:4399/' });

    /**
     * Espera até desenhar, e não um tempo fixo.
     *
     * Um prazo fixo tem os dois defeitos ao mesmo tempo: curto demais acusa tela branca numa
     * primeira abertura fria (que é justamente quando o pacote inteiro está sendo baixado e
     * compilado), e longo demais faz cada rodada custar meio minuto à toa. Perguntando de meio em
     * meio segundo, o caso bom termina assim que o app monta e só o caso ruim paga o prazo cheio.
     */
    let estado = { filhos: 0, texto: '' };
    for (let i = 0; i < 60; i++) {
      const r = await enviar('Runtime.evaluate', {
        expression: `JSON.stringify({
          filhos: document.getElementById('root')?.children.length ?? -1,
          texto: (document.getElementById('root')?.innerText || '').slice(0, 90)
        })`, returnByValue: true
      });
      estado = JSON.parse(r.result.result.value);
      if (estado.filhos > 0) break;
      // Uma exceção antes de montar não vai se resolver esperando mais: o script já morreu.
      if (explosoes.length) break;
      await dormir(500);
    }

    registrar('o app desenha alguma coisa em vez de deixar a tela branca',
      estado.filhos > 0,
      estado.filhos > 0 ? JSON.stringify(estado.texto.replace(/\n/g, ' ').slice(0, 60)) : '#root ficou vazio');

    registrar('nenhuma exceção não capturada antes do app montar',
      explosoes.length === 0,
      explosoes.length ? explosoes[0] : 'console limpo');
  } catch (err) {
    registrar('o app desenha alguma coisa em vez de deixar a tela branca', false, err.message);
  } finally {
    try { navegador.kill('SIGKILL'); } catch { /* já morreu */ }
    servidor.close();
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* some depois */ }
  }
}

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências da tela inicial passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
