import { app, BrowserWindow, shell, session, desktopCapturer, screen } from 'electron';
import electronUpdaterPkg from 'electron-updater';
import path from 'path';
import http from 'http';
import net from 'net';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// electron-updater é um módulo CommonJS cujo export 'autoUpdater' é uma propriedade getter
// (lazy-loaded), o que o cjs-module-lexer do Node não detecta de forma confiável como export
// nomeado em contexto ESM — importar como named export ("import { autoUpdater } from ...")
// derruba o processo principal com SyntaxError assim que o app inicia. Importar o pacote
// inteiro e desestruturar funciona porque aciona o getter normalmente.
const { autoUpdater } = electronUpdaterPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

let mainWindow = null;
let mascotWindow = null;
let mascotOverlayEnabled = false;
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
let logStream = null;

/**
 * O QUE ACONTECEU COM A JANELA DE LOGIN — o dado que faltava para sair do escuro.
 *
 * O login falha e o Firebase devolve "popup fechado pelo usuário", que é o mesmo código para
 * situações opostas: a pessoa desistiu, o Google recusou o navegador, a página não carregou, ou a
 * janela nem chegou a abrir. Do lado da interface esses casos são indistinguíveis, e foi por isso
 * que a primeira suspeita (o user agent do Electron) foi tratada como causa sem prova.
 *
 * Aqui o processo principal registra o que a janela realmente fez: se abriu, para onde navegou e
 * onde parou. O endereço final é a resposta — uma URL de recusa do Google diz uma coisa, uma falha
 * de carregamento diz outra, e nenhuma janela aberta diz uma terceira.
 */
const eventosDoLogin = [];

function registrarEventoDeLogin(oQue, url) {
  eventosDoLogin.unshift({ quando: new Date().toISOString(), oQue, url: String(url || '').slice(0, 300) });
  if (eventosDoLogin.length > 12) eventosDoLogin.pop();
  console.log(`[Login] ${oQue}${url ? ' — ' + url : ''}`);
}

function escaparHtml(valor) {
  return String(valor || '').replace(/[<>&]/g, '');
}

function htmlDoMascoteOsone() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  html, body {
    margin: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: transparent;
    pointer-events: none;
    user-select: none;
  }

  .stage {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    font-family: Inter, system-ui, sans-serif;
  }

  .walker {
    position: absolute;
    left: 26px;
    bottom: 34px;
    width: 152px;
    height: 190px;
    transform-origin: 50% 100%;
    animation: travel 34s linear infinite;
  }

  .mascot {
    position: absolute;
    left: 18px;
    bottom: 12px;
    width: 116px;
    height: 154px;
    transform-origin: 50% 100%;
    animation: breathe 2.6s ease-in-out infinite;
  }

  .body {
    position: absolute;
    left: 13px;
    top: 8px;
    width: 90px;
    height: 94px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 34% 28%, rgba(255,255,255,.34), transparent 14%),
      radial-gradient(circle at 66% 68%, rgba(151,61,0,.28), transparent 33%),
      linear-gradient(145deg, #ffb133 0%, #ff861f 48%, #f06a12 100%);
    border: 1px solid rgba(110,47,0,.45);
    box-shadow: inset -10px -13px 18px rgba(129,47,0,.24), inset 7px 8px 14px rgba(255,219,114,.34), 0 14px 26px rgba(0,0,0,.38);
  }

  .shadow {
    position: absolute;
    left: 22px;
    bottom: 2px;
    width: 72px;
    height: 16px;
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgba(0,0,0,.42), rgba(0,0,0,0));
    filter: blur(1px);
  }

  .eye {
    position: absolute;
    top: 34px;
    width: 19px;
    height: 22px;
    border-radius: 50%;
    background: #fff7e8;
    border: 2px solid rgba(94,48,10,.55);
    box-shadow: inset 0 -2px 0 rgba(0,0,0,.13);
    animation: blink 6.2s ease-in-out infinite;
  }

  .eye.left { left: 25px; }
  .eye.right { right: 25px; }
  .eye::after {
    content: "";
    position: absolute;
    left: 6px;
    top: 6px;
    width: 8px;
    height: 9px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 28%, #fff 0 18%, #24140c 24% 100%);
    transition: transform 260ms ease;
  }

  .brow {
    position: absolute;
    top: 25px;
    width: 20px;
    height: 5px;
    border-radius: 999px;
    border-top: 3px solid rgba(112,55,11,.7);
  }

  .brow.left { left: 24px; transform: rotate(-13deg); }
  .brow.right { right: 23px; transform: rotate(13deg); }

  .mouth {
    position: absolute;
    left: 39px;
    top: 64px;
    width: 15px;
    height: 8px;
    border-radius: 0 0 999px 999px;
    border-bottom: 3px solid #4e230d;
    transition: all 220ms ease;
  }

  .arm, .leg {
    position: absolute;
    display: block;
    background: linear-gradient(180deg, #ff941f, #de5f0d);
    border: 1px solid rgba(113,48,0,.28);
    box-shadow: inset 3px 4px 5px rgba(255,201,88,.24);
    transform-origin: 50% 8px;
  }

  .arm {
    top: 65px;
    width: 16px;
    height: 48px;
    border-radius: 999px 999px 13px 13px;
  }

  .arm.left { left: 8px; transform: rotate(21deg); }
  .arm.right { right: 8px; transform: rotate(-21deg); }
  .leg {
    top: 91px;
    width: 17px;
    height: 55px;
    border-radius: 999px 999px 11px 11px;
  }

  .leg.left { left: 34px; transform: rotate(6deg); }
  .leg.right { right: 34px; transform: rotate(-6deg); }

  .bubble {
    position: absolute;
    left: 78px;
    bottom: 144px;
    width: 164px;
    min-height: 40px;
    padding: 9px 10px;
    border-radius: 8px;
    background: rgba(13,12,11,.88);
    border: 1px solid rgba(255,137,45,.34);
    color: #fff7e8;
    font: 700 10px/1.35 Inter, system-ui, sans-serif;
    box-shadow: 0 16px 34px rgba(0,0,0,.34);
    opacity: 0;
    transform: translateY(8px) scale(.96);
    transition: opacity 260ms ease, transform 260ms ease;
  }

  .bubble::after {
    content: "";
    position: absolute;
    left: 15px;
    bottom: -7px;
    width: 13px;
    height: 13px;
    background: inherit;
    border-right: 1px solid rgba(255,137,45,.28);
    border-bottom: 1px solid rgba(255,137,45,.28);
    transform: rotate(45deg);
  }

  .speak .bubble, .point-right .bubble, .point-up .bubble, .point-down .bubble {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  .speak .mouth {
    left: 37px;
    top: 62px;
    width: 19px;
    height: 17px;
    border: 3px solid #4e230d;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 66%, #ffb17d 0 22%, #3b170c 24% 100%);
    animation: talk 340ms ease-in-out infinite;
  }

  .point-right .arm.right {
    width: 72px;
    height: 14px;
    right: -51px;
    top: 58px;
    border-radius: 999px;
    transform: rotate(-6deg);
  }

  .point-up .arm.right {
    width: 15px;
    height: 70px;
    right: 18px;
    top: 7px;
    transform: rotate(33deg);
  }

  .point-down .arm.right {
    width: 15px;
    height: 64px;
    right: 4px;
    top: 72px;
    transform: rotate(-120deg);
  }

  .walk .leg.left { animation: legLeft 520ms ease-in-out infinite; }
  .walk .leg.right { animation: legRight 520ms ease-in-out infinite; }
  .walk .arm.left { animation: armLeft 520ms ease-in-out infinite; }
  .walk .arm.right { animation: armRight 520ms ease-in-out infinite; }
  .jump { animation: jump 1s cubic-bezier(.2,.9,.2,1) infinite; }
  .jump .shadow { animation: shadowJump 1s cubic-bezier(.2,.9,.2,1) infinite; }
  .look .eye::after, .point-right .eye::after { transform: translateX(3px); }
  .point-up .eye::after { transform: translateY(-3px); }
  .point-down .eye::after { transform: translateY(3px); }

  @keyframes travel {
    0% { transform: translateX(0) scaleX(1); }
    16% { transform: translateX(calc(100vw - 230px)) scaleX(1); }
    19% { transform: translateX(calc(100vw - 230px)) scaleX(-1); }
    34% { transform: translateX(22vw) scaleX(-1); }
    39% { transform: translateX(22vw) scaleX(1); }
    54% { transform: translateX(62vw) scaleX(1); }
    59% { transform: translateX(62vw) scaleX(-1); }
    78% { transform: translateX(6vw) scaleX(-1); }
    82% { transform: translateX(6vw) scaleX(1); }
    100% { transform: translateX(0) scaleX(1); }
  }

  @keyframes breathe {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-4px) scale(1.015, .99); }
  }

  @keyframes blink {
    0%, 45%, 49%, 100% { transform: scaleY(1); }
    47% { transform: scaleY(.08); }
  }

  @keyframes talk {
    0%, 100% { transform: scaleY(.76); }
    50% { transform: scaleY(1.12); }
  }

  @keyframes legLeft {
    0%, 100% { transform: rotate(20deg) translateY(0); }
    50% { transform: rotate(-18deg) translateY(2px); }
  }

  @keyframes legRight {
    0%, 100% { transform: rotate(-18deg) translateY(2px); }
    50% { transform: rotate(20deg) translateY(0); }
  }

  @keyframes armLeft {
    0%, 100% { transform: rotate(-18deg); }
    50% { transform: rotate(28deg); }
  }

  @keyframes armRight {
    0%, 100% { transform: rotate(28deg); }
    50% { transform: rotate(-18deg); }
  }

  @keyframes jump {
    0%, 100% { transform: translateY(0) scale(1); }
    45% { transform: translateY(-42px) scale(.98, 1.04); }
    72% { transform: translateY(3px) scale(1.06, .94); }
  }

  @keyframes shadowJump {
    0%, 100% { transform: scale(1); opacity: 1; }
    45% { transform: scale(.58); opacity: .45; }
    72% { transform: scale(1.15); opacity: 1; }
  }
</style>
</head>
<body>
<div class="stage">
  <div class="walker">
    <div id="mascot" class="mascot idle">
      <div id="bubble" class="bubble">Estou olhando junto.</div>
      <div class="shadow"></div>
      <div class="body">
        <span class="brow left"></span>
        <span class="brow right"></span>
        <span class="eye left"></span>
        <span class="eye right"></span>
        <span class="mouth"></span>
        <span class="arm left"></span>
        <span class="arm right"></span>
        <span class="leg left"></span>
        <span class="leg right"></span>
      </div>
    </div>
  </div>
</div>
<script>
  const states = ['idle', 'walk', 'speak', 'point-right', 'look', 'point-up', 'jump', 'point-down'];
  const phrases = [
    'Estou olhando junto.',
    'Posso apontar o proximo passo.',
    'Esse botao parece importante.',
    'Quando voce chama, eu venho.',
    'Fico por fora da janela para ajudar sem cobrir o app.'
  ];
  const mascot = document.getElementById('mascot');
  const bubble = document.getElementById('bubble');
  let index = 0;
  setInterval(() => {
    index += 1;
    mascot.className = 'mascot ' + states[index % states.length];
    bubble.textContent = phrases[index % phrases.length];
  }, 3300);
</script>
</body>
</html>`;
}

function ajustarJanelaDoMascote() {
  if (!mascotWindow || mascotWindow.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  mascotWindow.setBounds({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height
  });
}

function criarJanelaDoMascote() {
  if (process.env.OSONE_MASCOT_OVERLAY === '0') return;
  mascotOverlayEnabled = true;
  if (mascotWindow && !mascotWindow.isDestroyed()) return;

  const display = screen.getPrimaryDisplay();
  mascotWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mascotWindow.setIgnoreMouseEvents(true, { forward: true });
  mascotWindow.setAlwaysOnTop(true, 'screen-saver');
  mascotWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlDoMascoteOsone())}`);
  mascotWindow.once('ready-to-show', () => {
    if (!mascotWindow || mascotWindow.isDestroyed()) return;
    ajustarJanelaDoMascote();
    mascotWindow.showInactive();
  });
  mascotWindow.on('closed', () => {
    mascotWindow = null;
  });
}

function fecharJanelaDoMascote() {
  mascotOverlayEnabled = false;
  if (!mascotWindow || mascotWindow.isDestroyed()) {
    mascotWindow = null;
    return;
  }
  mascotWindow.close();
}

function setupFileLogging() {
  try {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    logStream = fs.createWriteStream(path.join(logsDir, 'main.log'), { flags: 'a' });

    const escrever = (nivel, args) => {
      const linha = `[${new Date().toISOString()}] [${nivel}] ${args.map((arg) => {
        if (arg instanceof Error) return arg.stack || arg.message;
        if (typeof arg === 'string') return arg;
        try { return JSON.stringify(arg); } catch { return String(arg); }
      }).join(' ')}\n`;
      logStream.write(linha);
    };

    for (const nivel of ['log', 'warn', 'error']) {
      const original = console[nivel].bind(console);
      console[nivel] = (...args) => {
        escrever(nivel, args);
        original(...args);
      };
    }

    process.on('exit', () => {
      try { logStream?.end(); } catch {}
    });
  } catch (err) {
    console.error('[Startup] Não foi possível ativar log em arquivo:', err);
  }
}

/**
 * Tira do user agent as marcas que denunciam um navegador embutido.
 *
 * O Google recusa a tela de login quando reconhece um navegador embutido, respondendo "este
 * navegador ou app pode não ser seguro" em vez do formulário. O user agent do Electron traz duas
 * marcas assim: o token "Electron/versão" e o nome do próprio app logo antes de "Chrome/". Sem
 * elas sobra um user agent de Chrome comum, que é o que a janela de login realmente é.
 *
 * O sintoma disso era pior do que um erro: a janela de login abria, o Google recusava, o usuário
 * fechava — e "popup fechado pelo usuário" não é tratado como erro, então o app não dizia nada.
 * Clicar em entrar e não acontecer absolutamente nada era o resultado no app instalado, enquanto
 * no navegador o mesmo login funcionava.
 *
 * O nome do app é removido pela POSIÇÃO (o que estiver entre "like Gecko)" e "Chrome/"), e não
 * pelo texto: o nome muda entre o modo de desenvolvimento e o app empacotado, e um dos dois
 * escaparia de qualquer regra escrita com o nome fixo.
 */
function userAgentDeNavegadorComum(original) {
  return String(original || '')
    .replace(/(\(KHTML, like Gecko\)\s).*?(Chrome\/)/, '$1$2')
    .replace(/\sElectron\/[^\s]+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

app.userAgentFallback = userAgentDeNavegadorComum(app.userAgentFallback);

// A porta em que o servidor interno realmente subiu, e o último erro fatal de inicialização
// (usado para mostrar uma tela de erro legível em vez de uma janela preta e muda).
let activePort = DEFAULT_PORT;
let startupError = null;

// SEMPRE 127.0.0.1, nunca "localhost": no Windows, "localhost" costuma resolver primeiro para
// ::1 (IPv6), enquanto o servidor interno escuta em 0.0.0.0 (somente IPv4) — a conexão é
// recusada e a janela fica preta. No Linux "localhost" resolve para 127.0.0.1 primeiro, o que
// mascarava esse bug inteiramente fora do Windows.
const LOOPBACK_HOST = '127.0.0.1';

/**
 * Confirma que quem responde na porta é REALMENTE o servidor do OSONE, checando a assinatura
 * de /api/health. Uma checagem que aceitasse qualquer resposta HTTP seria enganada por
 * qualquer outro programa ocupando a porta (um 404 alheio também "responde").
 */
function isOsoneServerRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: LOOPBACK_HOST, port, path: '/api/health', timeout: 2000 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(false);
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body)?.service === 'osone-server');
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

/** Espera o servidor interno ficar pronto. Retorna a porta ativa, ou null se desistiu. */
async function waitForServer(timeoutMs = 60000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    // O servidor publica a porta que conseguiu abrir (pode ter havido fallback se a porta
    // preferida estivesse indisponível), então reconsultamos a cada tentativa.
    const candidatePort = Number(process.env.OSONE_ACTIVE_PORT) || activePort;
    if (await isOsoneServerRunning(candidatePort)) {
      activePort = candidatePort;
      return candidatePort;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}

/**
 * Procura uma porta realmente livre abrindo-a de verdade. Só tentar "ver se alguém responde"
 * não basta no Windows: portas dentro das faixas reservadas pelo Hyper-V/WSL não têm ninguém
 * escutando, mas mesmo assim recusam o bind (EACCES) — o que derrubava a inicialização do
 * servidor em silêncio.
 */
function isPortBindable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, '0.0.0.0');
  });
}

async function findFreePort(startPort, maxAttempts = 20) {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    if (await isPortBindable(port)) return port;
  }
  return null;
}

// Start the internal Express backend server
async function startBackendServer() {
  // O app instalado SEMPRE sobe o próprio servidor, mesmo que já exista outro OSONE na porta.
  //
  // Antes ele se pendurava em qualquer servidor OSONE que encontrasse — normalmente o do
  // `npm run dev`. O resultado era um app que parecia funcionar mas dependia de um processo
  // externo: fechar o terminal do modo desenvolvimento derrubava o servidor por baixo do app
  // instalado, junto com o Agente Local. Rodando o seu próprio servidor em porta própria, o
  // app instalado fica autossuficiente e nada fora dele pode derrubá-lo.
  if (!app.isPackaged && await isOsoneServerRunning(DEFAULT_PORT)) {
    console.log(`Backend server already active on port ${DEFAULT_PORT}`);
    activePort = DEFAULT_PORT;
    return;
  }

  const freePort = await findFreePort(DEFAULT_PORT);
  if (freePort === null) {
    startupError = `Não foi possível encontrar nenhuma porta de rede livre a partir da ${DEFAULT_PORT}. Verifique se outro programa está ocupando essas portas ou se o firewall está bloqueando o OSONE.`;
    console.error(`[Startup] ${startupError}`);
    return;
  }
  if (freePort !== DEFAULT_PORT) {
    console.warn(`[Startup] Porta ${DEFAULT_PORT} indisponível; usando a porta livre ${freePort}.`);
  }
  activePort = freePort;
  // O servidor lê a porta daqui (mesmo processo, pois é carregado via require abaixo).
  process.env.PORT = String(freePort);

  // Handle data directory for packaged Electron app
  if (app.isPackaged) {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    // Set current working directory to userData so process.cwd() stores data safely
    try {
      process.chdir(userDataPath);
      console.log(`Data directory configured to: ${userDataPath}`);
    } catch (err) {
      console.error("Could not set working directory to userData:", err);
    }
  }

  console.log(`Starting embedded Express server on port ${freePort}...`);

  try {
    const serverBundlePath = path.join(__dirname, '../dist/server.cjs');
    if (fs.existsSync(serverBundlePath)) {
      // Roda o bundle já compilado (dist/server.cjs) em modo produção: serve os arquivos
      // estáticos do frontend já buildados, em vez de subir o middleware de desenvolvimento do
      // Vite (mais lento, e desnecessário — o app instalado nunca precisa de hot-reload).
      process.env.NODE_ENV = 'production';
      require(serverBundlePath);
    } else {
      const serverTsPath = path.join(__dirname, '../server.ts');
      if (fs.existsSync(serverTsPath)) {
        require('tsx/cli');
        require('../server.ts');
      } else {
        startupError = 'Arquivos do servidor interno não encontrados na instalação (dist/server.cjs ausente). Reinstale o OSONE.';
        console.error("Server entry point not found!");
      }
    }
  } catch (err) {
    startupError = `Falha ao iniciar o servidor interno: ${err?.message || err}`;
    console.error("Error starting internal Express server:", err);
  }
}

/**
 * Tela de erro legível. Sem isto, qualquer falha de carregamento resultava numa janela preta e
 * silenciosa, sem nenhuma pista do que deu errado nem do que fazer a respeito.
 */
function showErrorPage(reason) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const logPath = path.join(app.getPath('userData'), 'logs');
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>OSONE G5 — Erro ao iniciar</title></head>
<body style="margin:0;background:#0d0c0b;color:#e8e3dd;font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
  <div style="max-width:640px;padding:40px;line-height:1.6">
    <h1 style="font-weight:300;font-size:22px;color:#ff6b35;margin:0 0 18px">O OSONE não conseguiu iniciar</h1>
    <p style="color:#b8b0a8;font-size:14px;margin:0 0 18px">${escaparHtml(reason)}</p>
    <p style="color:#8a827a;font-size:13px;margin:0 0 8px">O que costuma resolver:</p>
    <ul style="color:#8a827a;font-size:13px;margin:0 0 22px;padding-left:20px">
      <li>Fechar o OSONE completamente (inclusive na bandeja do sistema) e abrir de novo.</li>
      <li>Liberar o OSONE no firewall / antivírus do Windows, se ele pediu permissão.</li>
      <li>Reiniciar o computador, caso outro programa esteja travando a porta de rede.</li>
    </ul>
    <p style="color:#5e5851;font-size:12px;margin:0">Dados e registros do app: ${logPath}</p>
  </div>
</body></html>`;
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  if (!mainWindow.isVisible()) mainWindow.show();
}

function showStartupPage(message = 'Iniciando servidor local...', detail = '') {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>OSONE G5 — Iniciando</title></head>
<body style="margin:0;background:#0d0c0b;color:#e8e3dd;font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
  <div style="max-width:520px;padding:40px;text-align:center;line-height:1.6">
    <div style="width:48px;height:48px;border-radius:50%;border:2px solid rgba(255,107,53,.18);border-top-color:#ff6b35;margin:0 auto 22px;animation:girar 1s linear infinite"></div>
    <h1 style="font-weight:300;font-size:22px;color:#ff8a4c;margin:0 0 10px">Preparando o OSONE</h1>
    <p style="color:#b8b0a8;font-size:14px;margin:0 0 8px">${escaparHtml(message)}</p>
    <p style="color:#756d65;font-size:12px;margin:0">${escaparHtml(detail)}</p>
  </div>
  <style>@keyframes girar{to{transform:rotate(360deg)}}</style>
</body></html>`;
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  if (!mainWindow.isVisible()) mainWindow.show();
}

async function loadOsoneInterface(reason = 'initial') {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (startupError) {
    showErrorPage(startupError);
    return false;
  }

  showStartupPage(
    'Conectando ao servidor interno...',
    `Aguardando http://${LOOPBACK_HOST}:${activePort} (${reason}).`
  );

  const readyPort = await waitForServer(30000);
  if (readyPort === null) {
    showErrorPage(
      `O servidor interno do OSONE não respondeu na porta ${activePort} dentro do tempo esperado. ` +
      `Feche o app completamente e abra de novo; se continuar, libere o OSONE no firewall/antivírus.`
    );
    return false;
  }

  try {
    await mainWindow.loadURL(`http://${LOOPBACK_HOST}:${readyPort}`);
    return true;
  } catch (err) {
    console.error(`[Janela] loadURL falhou em http://${LOOPBACK_HOST}:${readyPort}:`, err);
    return false;
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, '../build/icon.png');

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "OSONE G5 - Sistema Operacional Neural",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: "#0d0c0b",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      /**
       * webSecurity LIGADO, como em qualquer navegador.
       *
       * Estava desligado, e é a última diferença de peso entre o app instalado e o navegador —
       * onde este mesmo login sempre funcionou. O rastro já mostrou que o Google autentica e
       * devolve, e que a ligação 'opener' existe; o que falha é a entrega da credencial, que o
       * Firebase faz por mensagens entre a janela do login e um iframe do firebaseapp.com
       * embutido AQUI. Essas mensagens são conferidas por origem, e desligar a segurança de
       * origem é justamente o que embaralha essa conferência.
       *
       * O app é servido de 127.0.0.1, que o Chromium já trata como origem segura, então nada
       * disso era necessário para as permissões de câmera, microfone ou captura de tela.
       */
      webSecurity: true
    }
  });

  // Remove default menu bar
  mainWindow.setMenu(null);

  /**
   * Ctrl+Shift+I e F12 abrem o console, no app instalado também.
   *
   * O menu foi removido para a janela ficar limpa, e com ele foram os atalhos de desenvolvedor.
   * A consequência só apareceu quando o login passou a falhar apenas no app empacotado: a
   * mensagem de erro do Firebase, os avisos do Chromium e o que a janela do Google escreve no
   * console existiam, mas não havia como olhar — cada tentativa de entender exigia compilar uma
   * versão nova só para ver um texto. Uma tecla resolve isso para sempre.
   */
  const abrirConsoleComAtalho = (conteudo) => {
    conteudo.on('before-input-event', (evento, entrada) => {
      if (entrada.type !== 'keyDown') return;
      const ehF12 = entrada.key === 'F12';
      const ehCtrlShiftI = (entrada.control || entrada.meta) && entrada.shift && entrada.key.toLowerCase() === 'i';
      if (!ehF12 && !ehCtrlShiftI) return;
      evento.preventDefault();
      conteudo.isDevToolsOpened() ? conteudo.closeDevTools() : conteudo.openDevTools({ mode: 'detach' });
    });
  };
  abrirConsoleComAtalho(mainWindow.webContents);

  // Do console do próprio OSONE, só o que fala de autenticação entra no rastro: o resto é ruído
  // de uma interface inteira e afogaria a única linha que importa.
  mainWindow.webContents.on('console-message', (...args) => {
    const texto = typeof args[0] === 'object' && args[0] && 'message' in args[0] ? args[0].message : args[2];
    if (!texto) return;
    if (!/auth|firebase|popup|opener|origin/i.test(String(texto))) return;
    registrarEventoDeLogin('console do OSONE: ' + String(texto).slice(0, 200), '');
  });

  // A janela nunca aponta direto para 127.0.0.1 antes de uma nova prova de vida. Sem essa
  // etapa, qualquer oscilação curta entre o health check e o carregamento desenha a página
  // cinza nativa do Chromium ("ERR_CONNECTION_REFUSED"), que parece app quebrado e não explica
  // nada. A tela própria fica no ar enquanto o servidor responde de verdade.
  void loadOsoneInterface('abertura da janela');

  // Rede local/servidor podem demorar um instante a mais que o esperado para aceitar conexões;
  // em vez de deixar a janela preta para sempre, tentamos recarregar algumas vezes e só então
  // mostramos um erro explicando a situação.
  let reloadAttempts = 0;
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || validatedURL.startsWith('data:')) return;
    if (reloadAttempts < 20) {
      reloadAttempts++;
      console.warn(`[Janela] Falha ao carregar (${errorCode} ${errorDescription}). Tentativa ${reloadAttempts}/20...`);
      showStartupPage(
        'Reconectando ao servidor interno...',
        `${errorDescription || 'conexão recusada'} — tentativa ${reloadAttempts}/20.`
      );
      setTimeout(() => {
        void loadOsoneInterface(`reconexão ${reloadAttempts}/20`);
      }, Math.min(1000 + reloadAttempts * 250, 4000));
      return;
    }
    showErrorPage(
      `Não foi possível carregar a interface em http://${LOOPBACK_HOST}:${activePort} (${errorDescription}). O servidor interno do OSONE não respondeu.`
    );
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Rede de segurança: se por qualquer motivo a janela não tiver aparecido, mostramos assim
  // mesmo — uma janela visível com erro é sempre melhor que nenhuma janela ou uma tela preta.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 10000);

  /**
   * Reconhece as janelas de login (Firebase/Google), que precisam abrir DENTRO do app.
   *
   * O Firebase faz login abrindo um popup por window.open() e espera receber a credencial de
   * volta por ele, usando a ligação "opener" entre as duas janelas. Mandando essa janela para o
   * navegador do sistema, o login até acontece — mas num processo separado, sem ligação nenhuma
   * com o OSONE: a página não consegue se fechar nem devolver o resultado ("Scripts may close
   * only the windows that were opened by them"), e o app nunca fica sabendo que o usuário
   * entrou. Era o que acontecia no app instalado, enquanto no navegador funcionava normalmente.
   */
  const ehJanelaDeLogin = (url) => {
    try {
      const { hostname, pathname } = new URL(url);
      if (hostname === 'accounts.google.com') return true;
      // O manipulador de autenticação do Firebase fica em <projeto>.firebaseapp.com/__/auth/...
      // (ou .web.app). Comparado pelo formato, e não pelo nome do projeto, para seguir valendo
      // em qualquer instalação que use um projeto Firebase próprio.
      if ((hostname.endsWith('.firebaseapp.com') || hostname.endsWith('.web.app')) &&
          pathname.startsWith('/__/auth')) return true;
      return false;
    } catch {
      return false;
    }
  };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    /**
     * Login: abre dentro do app, HERDANDO as preferências da janela que o chamou.
     *
     * Não declarar webPreferences aqui é a correção, e não um descuido. A janela principal roda
     * com webSecurity desligado; a janela de login era criada sem essa opção, ou seja, com ela
     * ligada. Preferências de segurança diferentes fazem o Chromium colocar as duas janelas em
     * instâncias separadas, e isso corta a ligação 'opener' entre elas — que é exatamente o
     * caminho por onde a credencial volta do handler do Firebase para o app.
     *
     * O rastro do login mostrou isso sem margem para dúvida: a janela abriu no handler, foi ao
     * Google, VOLTOU ao handler já com o parâmetro 'state' (ou seja, o Google autenticou e
     * devolveu) e então fechou — sem nada chegar ao app. Não era recusa do Google, nem user
     * agent, nem domínio não autorizado, nem rede: era a volta.
     *
     * Herdando, as duas janelas passam a compartilhar a mesma instância, como acontece num
     * navegador comum, onde este mesmo login sempre funcionou. A contrapartida é que a página do
     * Google roda com a mesma configuração da janela principal; ela some em segundos e nenhuma
     * integração com Node é concedida a ninguém (a janela principal também não tem).
     */
    if (ehJanelaDeLogin(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          autoHideMenuBar: true
        }
      };
    }
    // Qualquer outro link continua indo para o navegador do sistema.
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  /**
   * A janela do Google é acompanhada do início ao fim.
   *
   * 'did-create-window' entrega a janela que o setWindowOpenHandler autorizou. Sem isto, tudo o
   * que se sabe do login é o código genérico que o Firebase devolve no fim.
   */
  mainWindow.webContents.on('did-create-window', (janela, detalhes) => {
    if (!ehJanelaDeLogin(detalhes?.url || '')) return;
    registrarEventoDeLogin('janela de login aberta', detalhes.url);

    const conteudo = janela.webContents;
    // A janela do Google também abre console: quando ela recusa, o motivo costuma estar escrito
    // ali dentro, e não do lado do OSONE.
    abrirConsoleComAtalho(conteudo);
    /**
     * A prova do mecanismo, medida em vez de suposta: existe ligação com a janela que abriu esta?
     *
     * Sem 'opener', o handler do Firebase não tem para quem devolver a credencial, e a única coisa
     * que o app vê é a janela fechando. Registrando isso, uma próxima falha diz na hora se o
     * problema voltou a ser este ou se é outro.
     */
    conteudo.on('did-finish-load', () => {
      conteudo.executeJavaScript('!!window.opener', true)
        .then(temOpener => registrarEventoDeLogin(
          temOpener ? 'ligação com o app OK (window.opener presente)' : 'SEM ligação com o app (window.opener nulo)', ''))
        .catch(() => { /* a página pode ter fechado antes de responder */ });
    });
    /**
     * O console da janela de login vai para o rastro.
     *
     * É ali que o Firebase escreve o motivo real quando a entrega da credencial falha (mensagens
     * como "missing initial state" ou erro do canal de iframes). Sem isso, três hipóteses seguidas
     * foram deduzidas do lado de fora — e duas estavam erradas.
     */
    conteudo.on('console-message', (...args) => {
      // A assinatura mudou entre versões do Electron: nas novas vem um objeto, nas antigas vem
      // (evento, nível, mensagem). Ler os dois formatos evita perder justamente o que interessa.
      const texto = typeof args[0] === 'object' && args[0] && 'message' in args[0]
        ? args[0].message
        : args[2];
      if (texto) registrarEventoDeLogin('console do login: ' + String(texto).slice(0, 200), '');
    });
    conteudo.on('did-navigate', (_e, url) => registrarEventoDeLogin('navegou para', url));
    conteudo.on('did-navigate-in-page', (_e, url) => registrarEventoDeLogin('mudou de tela em', url));
    conteudo.on('did-fail-load', (_e, codigo, descricao, url) => {
      registrarEventoDeLogin(`FALHOU ao carregar (${codigo} ${descricao})`, url);
    });
    conteudo.on('render-process-gone', (_e, detalhe) => {
      registrarEventoDeLogin(`a janela travou (${detalhe?.reason || 'motivo desconhecido'})`, '');
    });
    janela.on('closed', () => registrarEventoDeLogin('janela de login fechada', ''));
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (mascotWindow && !mascotWindow.isDestroyed()) {
      mascotWindow.close();
    }
  });
}

/**
 * ATUALIZAÇÃO — o que está acontecendo, em estado consultável.
 *
 * Antes tudo isto ia só para o console: o app checava uma vez ao abrir, baixava calado e instalava
 * ao fechar, e ninguém nunca via nada. Quando falhava — sem internet, GitHub fora do ar, release
 * publicada sem o manifesto — falhava igualmente calado. Na prática era impossível responder
 * "estou na versão nova?" sem abrir o console de um app empacotado, que ninguém faz.
 *
 * Guardando o estado num objeto e publicando um controle em globalThis, a interface passa a poder
 * perguntar e mandar. Funciona sem preload nem IPC porque o servidor do OSONE é carregado DENTRO
 * deste mesmo processo (ver startBackendServer) — as duas metades compartilham memória.
 */
const estadoDaAtualizacao = {
  /** Só o app instalado se atualiza; rodando pelo código-fonte não há release para comparar. */
  suportado: false,
  versaoAtual: app.getVersion(),
  /** ocioso | procurando | disponivel | baixando | baixada | atualizado | erro */
  fase: 'ocioso',
  versaoNova: null,
  progresso: 0,
  mensagem: '',
  ultimaChecagem: null
};

function publicarDiagnosticoDeLogin() {
  globalThis.__osoneLogin = {
    userAgent: app.userAgentFallback,
    eventos: () => eventosDoLogin.slice()
  };
}

function publicarControleDoMascote() {
  globalThis.__osoneMascote = {
    estado: () => ({
      suportado: process.env.OSONE_MASCOT_OVERLAY !== '0',
      ativo: mascotOverlayEnabled,
      externo: true,
      mensagem: process.env.OSONE_MASCOT_OVERLAY === '0'
        ? 'Mascote externo desativado por OSONE_MASCOT_OVERLAY=0.'
        : ''
    }),
    definir: (ativo) => {
      if (process.env.OSONE_MASCOT_OVERLAY === '0') {
        return {
        ok: false,
        suportado: false,
        ativo: false,
          externo: true,
          mensagem: 'Mascote externo desativado por OSONE_MASCOT_OVERLAY=0.'
        };
      }
      if (ativo) {
        criarJanelaDoMascote();
      } else {
        fecharJanelaDoMascote();
      }
      return {
        ok: true,
        suportado: true,
        ativo: mascotOverlayEnabled,
        externo: true,
        mensagem: ativo ? 'Mascote ativado.' : 'Mascote ocultado.'
      };
    }
  };
}

function publicarControleDeAtualizacao() {
  globalThis.__osoneAtualizador = {
    estado: () => ({ ...estadoDaAtualizacao }),
    checar: async () => {
      if (!estadoDaAtualizacao.suportado) return { ...estadoDaAtualizacao };
      // Uma checagem por vez: clicar duas vezes no botão não deve abrir dois downloads.
      if (estadoDaAtualizacao.fase === 'procurando' || estadoDaAtualizacao.fase === 'baixando') {
        return { ...estadoDaAtualizacao };
      }
      estadoDaAtualizacao.fase = 'procurando';
      estadoDaAtualizacao.mensagem = '';
      try {
        await autoUpdater.checkForUpdates();
      } catch (err) {
        estadoDaAtualizacao.fase = 'erro';
        estadoDaAtualizacao.mensagem = err?.message || String(err);
      }
      estadoDaAtualizacao.ultimaChecagem = new Date().toISOString();
      return { ...estadoDaAtualizacao };
    },
    instalar: () => {
      if (estadoDaAtualizacao.fase !== 'baixada') {
        return { ok: false, erro: 'Não há atualização baixada para instalar.' };
      }
      // O fechamento precisa acontecer depois da resposta HTTP, senão a interface nunca recebe a
      // confirmação e o usuário fica olhando um botão travado enquanto o app some.
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 400);
      return { ok: true };
    }
  };
}

// De quanto em quanto tempo o app procura atualização sozinho enquanto fica aberto. Antes só havia
// a checagem da abertura, então um app que passa dias ligado nunca via versão nova nenhuma.
const INTERVALO_DE_CHECAGEM_MS = 6 * 60 * 60 * 1000;

// Auto-update via electron-updater, publicando releases no GitHub (owner/repo do package.json).
// Só roda em builds empacotados (app.isPackaged) — em dev não há release para comparar.
function setupAutoUpdater() {
  estadoDaAtualizacao.suportado = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    estadoDaAtualizacao.fase = 'procurando';
    console.log('[AutoUpdater] Verificando atualizações...');
  });
  autoUpdater.on('update-available', (info) => {
    estadoDaAtualizacao.fase = 'disponivel';
    estadoDaAtualizacao.versaoNova = info?.version || null;
    estadoDaAtualizacao.progresso = 0;
    console.log(`[AutoUpdater] Atualização disponível: v${info.version}. Baixando...`);
  });
  autoUpdater.on('update-not-available', () => {
    estadoDaAtualizacao.fase = 'atualizado';
    estadoDaAtualizacao.versaoNova = null;
    console.log('[AutoUpdater] Nenhuma atualização disponível. Versão atual em uso.');
  });
  autoUpdater.on('error', (err) => {
    estadoDaAtualizacao.fase = 'erro';
    estadoDaAtualizacao.mensagem = err?.message || String(err);
    console.error('[AutoUpdater] Erro ao verificar/baixar atualização:', err);
  });
  autoUpdater.on('download-progress', (progress) => {
    estadoDaAtualizacao.fase = 'baixando';
    estadoDaAtualizacao.progresso = Math.round(progress?.percent || 0);
    console.log(`[AutoUpdater] Baixando atualização: ${estadoDaAtualizacao.progresso}%`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    estadoDaAtualizacao.fase = 'baixada';
    estadoDaAtualizacao.versaoNova = info?.version || estadoDaAtualizacao.versaoNova;
    estadoDaAtualizacao.progresso = 100;
    console.log(`[AutoUpdater] Atualização v${info.version} baixada. Será instalada ao fechar o app.`);
  });

  const procurar = () => {
    estadoDaAtualizacao.ultimaChecagem = new Date().toISOString();
    autoUpdater.checkForUpdates().catch((err) => {
      estadoDaAtualizacao.fase = 'erro';
      estadoDaAtualizacao.mensagem = err?.message || String(err);
      console.error('[AutoUpdater] Falha ao iniciar verificação de atualização:', err);
    });
  };

  procurar();
  setInterval(procurar, INTERVALO_DE_CHECAGEM_MS);
}

/**
 * Compartilhamento de tela dentro do app instalado.
 *
 * No navegador, getDisplayMedia() abre sozinho o seletor de janela/tela do próprio navegador.
 * No Electron não existe esse seletor embutido: sem um handler registrado, a chamada
 * simplesmente falha — era por isso que compartilhar a tela funcionava no navegador e não
 * funcionava no .exe. Aqui entregamos a tela inteira diretamente, já que quem pede é a própria
 * interface do OSONE rodando localmente.
 */
function setupScreenSharing() {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const primaryScreen = sources.find((s) => s.id.startsWith('screen:')) || sources[0];
      if (!primaryScreen) {
        console.error('[ScreenShare] Nenhuma fonte de captura disponível.');
        return callback({});
      }
      // audio: 'loopback' captura também o som do sistema no Windows; no Linux é ignorado.
      callback({ video: primaryScreen, audio: process.platform === 'win32' ? 'loopback' : undefined });
    } catch (err) {
      console.error('[ScreenShare] Falha ao obter fontes de captura:', err);
      callback({});
    }
  }, { useSystemPicker: true });

  // A interface roda em http://127.0.0.1, uma origem local e confiável: concede câmera,
  // microfone e captura de tela sem repetir prompts que travariam os recursos de voz/visão.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'display-capture', 'audioCapture', 'videoCapture', 'clipboard-read', 'notifications'];
    callback(allowed.includes(permission));
  });
}

// Uma instância só. Abrir o OSONE de novo (atalho, duplo clique) passa a focar a janela que
// já existe, em vez de subir um segundo app com um segundo servidor e um segundo Agente Local
// disputando os mesmos arquivos de dados.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  setupFileLogging();
  setupScreenSharing();
  screen.on('display-metrics-changed', ajustarJanelaDoMascote);
  screen.on('display-added', ajustarJanelaDoMascote);
  screen.on('display-removed', ajustarJanelaDoMascote);
  // O controle vai para o ar ANTES do servidor: é ele que o servidor procura ao responder as
  // rotas de atualização, e um servidor que suba primeiro não encontraria nada.
  publicarControleDoMascote();
  publicarControleDeAtualizacao();
  publicarDiagnosticoDeLogin();
  await startBackendServer();

  if (!startupError) {
    // O retorno era descartado: mesmo quando o servidor nunca subia, a janela era criada e
    // carregava um endereço morto — exatamente o cenário da tela preta. Agora um servidor que
    // não responde vira uma mensagem de erro explicando o que aconteceu.
    const readyPort = await waitForServer();
    if (readyPort === null) {
      startupError = `O servidor interno do OSONE não respondeu na porta ${activePort} dentro do tempo esperado. Isso costuma acontecer quando o firewall/antivírus bloqueia o app ou outro programa está ocupando a porta.`;
      console.error(`[Startup] ${startupError}`);
    }
  }

  createWindow();

  if (app.isPackaged) {
    setupAutoUpdater();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
