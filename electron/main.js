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
    // Login: abre dentro do app, preservando a ligação com a janela que o chamou.
    if (ehJanelaDeLogin(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          autoHideMenuBar: true,
          // Sem integração com Node nesta janela: ela carrega uma página do Google, e é código
          // de terceiros que não deve ter acesso ao sistema do usuário.
          webPreferences: { nodeIntegration: false, contextIsolation: true }
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

  mainWindow.on('closed', () => {
    mainWindow = null;
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
  setupScreenSharing();
  // O controle vai para o ar ANTES do servidor: é ele que o servidor procura ao responder as
  // rotas de atualização, e um servidor que suba primeiro não encontraria nada.
  publicarControleDeAtualizacao();
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
