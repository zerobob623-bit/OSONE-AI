import { app, BrowserWindow, shell, session, desktopCapturer } from 'electron';
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
const DEFAULT_PORT = Number(process.env.PORT) || 3000;

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
  // Se já existe uma instância do OSONE servindo nesta porta, reaproveita em vez de subir outra.
  if (await isOsoneServerRunning(DEFAULT_PORT)) {
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
    <p style="color:#b8b0a8;font-size:14px;margin:0 0 18px">${String(reason).replace(/[<>&]/g, '')}</p>
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
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  // Remove default menu bar
  mainWindow.setMenu(null);

  if (startupError) {
    // A janela precisa existir antes de conseguirmos mostrar qualquer coisa, então a tela de
    // erro é carregada aqui, e não abortamos a criação da janela.
    mainWindow.show();
    showErrorPage(startupError);
  } else {
    mainWindow.loadURL(`http://${LOOPBACK_HOST}:${activePort}`);
  }

  // Rede local/servidor podem demorar um instante a mais que o esperado para aceitar conexões;
  // em vez de deixar a janela preta para sempre, tentamos recarregar algumas vezes e só então
  // mostramos um erro explicando a situação.
  let reloadAttempts = 0;
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || validatedURL.startsWith('data:')) return;
    if (reloadAttempts < 5) {
      reloadAttempts++;
      console.warn(`[Janela] Falha ao carregar (${errorCode} ${errorDescription}). Tentativa ${reloadAttempts}/5...`);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(`http://${LOOPBACK_HOST}:${activePort}`);
        }
      }, 1000);
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

  // Open external links in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Auto-update via electron-updater, publicando releases no GitHub (owner/repo do package.json).
// Só roda em builds empacotados (app.isPackaged) — em dev não há release para comparar.
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Verificando atualizações...');
  });
  autoUpdater.on('update-available', (info) => {
    console.log(`[AutoUpdater] Atualização disponível: v${info.version}. Baixando...`);
  });
  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] Nenhuma atualização disponível. Versão atual em uso.');
  });
  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Erro ao verificar/baixar atualização:', err);
  });
  autoUpdater.on('download-progress', (progress) => {
    console.log(`[AutoUpdater] Baixando atualização: ${Math.round(progress.percent)}%`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[AutoUpdater] Atualização v${info.version} baixada. Será instalada ao fechar o app.`);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[AutoUpdater] Falha ao iniciar verificação de atualização:', err);
  });
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

app.whenReady().then(async () => {
  setupScreenSharing();
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
