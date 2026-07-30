import { app, BrowserWindow, shell } from 'electron';
import electronUpdaterPkg from 'electron-updater';
import path from 'path';
import http from 'http';
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
const PORT = process.env.PORT || 3000;

// Function to check if server is already running on port
function isServerRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/whatsapp/status`, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// Function to wait until server is listening
async function waitForServer(port, timeoutMs = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const running = await isServerRunning(port);
    if (running) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

// Start the internal Express backend server
async function startBackendServer() {
  const running = await isServerRunning(PORT);
  if (running) {
    console.log(`Backend server already active on port ${PORT}`);
    return;
  }

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

  console.log("Starting embedded Express server...");

  try {
    const serverBundlePath = path.join(__dirname, '../dist/server.cjs');
    if (fs.existsSync(serverBundlePath)) {
      require(serverBundlePath);
    } else {
      const serverTsPath = path.join(__dirname, '../server.ts');
      if (fs.existsSync(serverTsPath)) {
        require('tsx/cli');
        require('../server.ts');
      } else {
        console.error("Server entry point not found!");
      }
    }
  } catch (err) {
    console.error("Error starting internal Express server:", err);
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
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  // Remove default menu bar
  mainWindow.setMenu(null);

  const serverUrl = `http://localhost:${PORT}`;
  mainWindow.loadURL(serverUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

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

app.whenReady().then(async () => {
  await startBackendServer();
  await waitForServer(PORT);
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
