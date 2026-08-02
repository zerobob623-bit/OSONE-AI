import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { exec, execFile, spawn } from 'child_process';
import { Request, Response, NextFunction, Router } from 'express';

// ============================================================================
// SEÇÃO 1: CONFIGURAÇÃO E INICIALIZAÇÃO
// ============================================================================

const CONFIG_PATH = path.join(process.cwd(), 'config.json');
const AUDIT_LOG_PATH = path.join(process.cwd(), 'audit.log');
const TRASH_DIR_PATH = path.join(process.cwd(), 'trash');

/**
 * Caminho real da instalação do OSONE que está rodando agora — a ÚNICA coisa que o agente é
 * proibido de apagar/sobrescrever.
 *
 * Precisa funcionar nos dois formatos em que este código roda, e eles não compartilham as
 * mesmas variáveis: o bundle de produção é CommonJS (tem __dirname, e process.cwd() é inútil
 * porque o app empacotado o aponta para a pasta de dados do usuário), enquanto em
 * desenvolvimento o tsx executa como módulo ES, onde __dirname simplesmente não existe e
 * referenciá-lo derruba o processo no carregamento. Por isso a verificação por typeof, e não
 * um uso direto: em dev caímos em process.cwd(), que é a raiz do projeto (nada faz chdir
 * nesse modo), e em produção usamos __dirname (<instalação>/dist) subindo um nível.
 */
export const OSONE_INSTALL_DIR: string = typeof __dirname !== 'undefined'
  ? path.resolve(__dirname, '..')
  : process.cwd();

/** Diretório onde comandos e aberturas devem acontecer por padrão: a casa do usuário. */
const USER_HOME_DIR = os.homedir();

/**
 * Nomes que se referem ao próprio OSONE. Fechar qualquer um deles derrubaria o processo que
 * está executando a ação, então são recusados explicitamente.
 */
const OWN_PROCESS_NAMES = new Set(['osone', 'osone g5', 'osone-app', 'osone.exe', 'node', 'electron']);

/** Expande '~' para a pasta do usuário e normaliza o caminho. */
function expandHomePath(inputPath: string): string {
  const raw = String(inputPath || '').trim();
  if (raw === '~') return USER_HOME_DIR;
  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    return path.join(USER_HOME_DIR, raw.slice(2));
  }
  return raw;
}

/**
 * Nomes possíveis das pastas padrão do usuário, POR IDIOMA.
 *
 * Um sistema em português nomeia as pastas "Documentos" e "Área de Trabalho"; a configuração
 * antiga assumia os nomes em inglês ("Documents", "Desktop") e portanto apontava para pastas
 * que sequer existem nessas máquinas — o agente falhava em qualquer operação nelas. Aqui
 * testamos os nomes reais no disco e usamos o primeiro que existir de fato.
 */
const WELL_KNOWN_FOLDER_ALIASES: Record<string, string[]> = {
  downloads: ['Downloads', 'Descargas', 'Transferências', 'Baixados'],
  desktop: ['Desktop', 'Área de Trabalho', 'Area de Trabalho', 'Escritorio', 'Escritório'],
  documents: ['Documents', 'Documentos'],
  pictures: ['Pictures', 'Imagens', 'Fotos'],
  music: ['Music', 'Música', 'Musicas', 'Músicas'],
  videos: ['Videos', 'Vídeos'],
  home: [''],
};

/**
 * Converte o que o modelo mandou num caminho ABSOLUTO real do disco.
 *
 * Aceita tanto um caminho completo ("/home/user/projetos", "C:\\Users\\x\\Downloads", "~/x")
 * quanto um apelido de pasta conhecida ("downloads", "documentos", "área de trabalho"). Antes
 * só apelidos em inglês eram aceitos, e qualquer caminho real era recusado — que é a razão de
 * o agente "não achar os caminhos" e falhar ao criar, escrever ou apagar qualquer coisa.
 */
export function resolveAnyPath(input: string): string {
  const raw = expandHomePath(String(input || '').trim());
  if (!raw) return USER_HOME_DIR;

  // Já é um caminho absoluto: usa como veio.
  if (path.isAbsolute(raw)) return path.resolve(raw);

  // Apelido de pasta conhecida (em qualquer idioma suportado).
  const key = raw.toLowerCase().replace(/\s+/g, '_');
  const aliasKey = Object.keys(WELL_KNOWN_FOLDER_ALIASES).find(k =>
    k === key || WELL_KNOWN_FOLDER_ALIASES[k].some(n => n.toLowerCase().replace(/\s+/g, '_') === key)
  );
  if (aliasKey) {
    for (const candidate of WELL_KNOWN_FOLDER_ALIASES[aliasKey]) {
      const full = candidate ? path.join(USER_HOME_DIR, candidate) : USER_HOME_DIR;
      if (fs.existsSync(full)) return full;
    }
    // Nenhum nome existe ainda: usa o primeiro, que será criado quando necessário.
    const fallback = WELL_KNOWN_FOLDER_ALIASES[aliasKey][0];
    return fallback ? path.join(USER_HOME_DIR, fallback) : USER_HOME_DIR;
  }

  // Caminho relativo qualquer: interpreta a partir da pasta do usuário, nunca da pasta do app.
  return path.resolve(USER_HOME_DIR, raw);
}

/**
 * Categorias de extensões de arquivo para organização automática
 */
export const FILE_CATEGORIES: Record<string, string[]> = {
  Imagens: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.ico', '.heic'],
  Documentos: ['.pdf', '.docx', '.doc', '.txt', '.rtf', '.odt', '.epub', '.md', '.pages', '.tex'],
  Planilhas: ['.xlsx', '.xls', '.csv', '.ods', '.tsv', '.numbers'],
  Videos: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v'],
  Audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'],
  Compactados: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz'],
  Instaladores: ['.exe', '.msi', '.deb', '.rpm', '.appimage', '.dmg', '.pkg', '.iso'],
  Outros: [] // Categoria padrão caso a extensão não coincida
};

export interface LocalAgentConfig {
  port: number;
  token: string;
  allowedOrigin: string;
  apps: Record<string, { win32?: string; linux?: string; processName?: { win32?: string; linux?: string } }>;
  allowedFolders: Record<string, string>;
}

export let CONFIG: LocalAgentConfig = {
  port: 3000,
  token: '',
  allowedOrigin: '*',
  apps: {
    spotify: {
      win32: 'start spotify:',
      linux: 'spotify',
      processName: {
        win32: 'Spotify.exe',
        linux: 'spotify'
      }
    },
    vscode: {
      win32: 'code',
      linux: 'code',
      processName: {
        win32: 'Code.exe',
        linux: 'code'
      }
    },
    filemanager: {
      win32: 'explorer',
      linux: 'xdg-open .',
      processName: {
        win32: 'explorer.exe',
        linux: 'nautilus'
      }
    },
    terminal: {
      win32: 'start cmd',
      linux: 'gnome-terminal',
      processName: {
        win32: 'cmd.exe',
        linux: 'gnome-terminal'
      }
    },
    browser: {
      win32: 'start https://google.com',
      linux: 'xdg-open https://google.com',
      processName: {
        win32: 'chrome.exe',
        linux: 'chrome'
      }
    }
  },
  allowedFolders: {
    downloads: '~/Downloads',
    desktop: '~/Desktop',
    documents: '~/Documents'
  }
};

/**
 * Carrega ou gera o arquivo config.json
 */
export function initializeConfig(): LocalAgentConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const fileData = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(fileData);
      CONFIG = { ...CONFIG, ...parsed };
    }
  } catch (err: any) {
    console.warn('[CONFIG WARNING] Erro ao ler config.json. Usando padrão.', err.message);
  }

  // Se o token não existir, estiver vazio, OU ainda for o valor padrão inseguro que já esteve
  // hardcoded neste projeto (mesmo texto em toda instalação = qualquer um lendo o código no
  // GitHub tinha acesso de terminal a qualquer computador rodando o agente), gera um novo
  // token criptograficamente forte e único para esta instalação.
  const INSECURE_LEGACY_TOKENS = new Set(['osone-local-agent-secret-token']);
  if (!CONFIG.token || CONFIG.token.trim() === '' || INSECURE_LEGACY_TOKENS.has(CONFIG.token.trim())) {
    CONFIG.token = crypto.randomBytes(32).toString('hex');
    saveConfig();
    console.warn('[SECURITY] Token do Agente Local ausente ou inseguro foi substituído por um novo token forte gerado automaticamente. Atualize o campo "Token do Agente Local" nas Configurações do OSONE com o novo valor salvo em config.json.');
  }

  // Garante que o diretório da lixeira local exista
  if (!fs.existsSync(TRASH_DIR_PATH)) {
    try {
      fs.mkdirSync(TRASH_DIR_PATH, { recursive: true });
    } catch (err: any) {
      console.error('[TRASH INIT ERROR]', err.message);
    }
  }

  return CONFIG;
}

/**
 * Salva as configurações atuais no arquivo config.json
 */
export function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2), 'utf8');
  } catch (err: any) {
    console.error('[CONFIG SAVE ERROR]', err.message);
  }
}

// ============================================================================
// SEÇÃO 2: AUDITORIA E LOGS (audit.log)
// ============================================================================

export function logAudit(level: 'INFO' | 'WARN' | 'ERROR' | 'SECURITY', action: string, message: string, metadata: any = null) {
  const timestamp = new Date().toISOString();
  const metaStr = metadata ? ` | ${JSON.stringify(metadata)}` : '';
  const logLine = `[${timestamp}] [${level}] [${action}] ${message}${metaStr}\n`;

  console.log(`[AUDIT ${level}] ${action}: ${message}`);

  try {
    fs.appendFileSync(AUDIT_LOG_PATH, logLine, 'utf8');
  } catch (err: any) {
    console.error('[AUDIT WRITE ERROR]', err.message);
  }
}

// ============================================================================
// SEÇÃO 3: SEGURANÇA DE CAMINHOS (JAIL DE DIRETÓRIO)
// ============================================================================

export function resolveSafePath(folderKey: string, relativeSubPath: string = '') {
  if (!folderKey || typeof folderKey !== 'string') {
    throw new Error('Pasta não especificada ou inválida.');
  }

  const configuredPath = CONFIG.allowedFolders[folderKey];
  if (!configuredPath) {
    throw new Error(`Pasta '${folderKey}' não está na lista de allowedFolders autorizadas.`);
  }

  let expandedBase = configuredPath;
  if (expandedBase.startsWith('~')) {
    expandedBase = path.join(os.homedir(), expandedBase.slice(1));
  }

  const baseDir = path.resolve(expandedBase);

  if (!fs.existsSync(baseDir)) {
    try {
      fs.mkdirSync(baseDir, { recursive: true });
    } catch (err) {
      throw new Error(`Pasta base '${folderKey}' (${baseDir}) não existe e não pôde ser criada.`);
    }
  }

  const cleanSubPath = relativeSubPath ? String(relativeSubPath).trim() : '';
  const targetPath = path.resolve(baseDir, cleanSubPath);

  const isExactBase = targetPath === baseDir;
  const isInsideBase = targetPath.startsWith(baseDir + path.sep);

  if (!isExactBase && !isInsideBase) {
    logAudit('SECURITY', 'PATH_TRAVERSAL_BLOCKED', `Tentativa de saída do jail bloqueada para folderKey=${folderKey}`, {
      subPath: relativeSubPath,
      resolvedTarget: targetPath,
      baseDir
    });
    throw new Error('Acesso Negado: Tentativa de Path Traversal ou acesso fora do diretório permitido.');
  }

  return { baseDir, targetPath };
}

// ============================================================================
// SEÇÃO 4: CATEGORIZAÇÃO DE ARQUIVOS
// ============================================================================

export function getCategoryForFile(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (!ext) return 'Outros';

  for (const [category, extensions] of Object.entries(FILE_CATEGORIES)) {
    if (extensions.includes(ext)) {
      return category;
    }
  }

  return 'Outros';
}

// ============================================================================
// SEÇÃO 5: EXPRESS ROUTER & MIDDLEWARE DE SEGURANÇA
// ============================================================================

initializeConfig();

export const agentRouter = Router();

/**
 * GET /provision-token — entrega o token deste agente para a própria interface do OSONE, para
 * que o usuário não precise abrir o config.json à mão. No app empacotado (.exe) esse arquivo
 * fica na pasta de dados do sistema, que o usuário praticamente nunca encontra — era por isso
 * que o Agente Local parecia "só funcionar no npm run dev".
 *
 * Fica ANTES do middleware de autenticação (é justamente o que fornece a credencial), então a
 * proteção aqui é a origem da requisição: apenas o próprio computador (loopback) pode obter o
 * token. Pedidos vindos da rede são recusados, mesmo o servidor escutando em 0.0.0.0.
 */
agentRouter.get('/provision-token', (req: Request, res: Response) => {
  const remote = req.socket.remoteAddress || '';
  const isLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';

  if (!isLoopback) {
    logAudit('SECURITY', 'TOKEN_PROVISION_DENIED', `Pedido de token recusado: origem não é a máquina local`, { ip: remote });
    return res.status(403).json({
      error: 'O token do Agente Local só pode ser obtido a partir do próprio computador onde o OSONE está instalado.'
    });
  }

  if (!CONFIG.token || CONFIG.token.trim() === '') {
    CONFIG.token = crypto.randomBytes(32).toString('hex');
    saveConfig();
    logAudit('INFO', 'TOKEN_GENERATED', 'Token do Agente Local gerado sob demanda pela interface do OSONE.');
  }

  logAudit('INFO', 'TOKEN_PROVISIONED', 'Token do Agente Local entregue à interface local do OSONE.', { ip: remote });
  return res.status(200).json({ token: CONFIG.token, platform: process.platform });
});

// Middleware de Autenticação por Token Bearer
agentRouter.use((req: Request, res: Response, next: NextFunction) => {
  // Preflight OPTIONS responde diretamente
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers['authorization'] || '';
  const expectedToken = CONFIG.token;
  const tokenMatch = authHeader === `Bearer ${expectedToken}`;

  if (!tokenMatch) {
    logAudit('SECURITY', 'AUTH_FAILED', `Tentativa de acesso não autorizada em ${req.originalUrl}`, {
      ip: req.socket.remoteAddress,
      receivedAuthHeader: authHeader ? 'Presente mas Inválido' : 'Ausente'
    });
    return res.status(401).json({ error: 'Não autorizado. Token de autenticação Bearer inválido ou ausente.' });
  }

  next();
});

/**
 * GET /status
 */
const handleStatus = (req: Request, res: Response) => {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  return res.status(200).json({
    status: 'online',
    agentName: 'osone-local-agent',
    version: '2.0.0',
    // Informação de plataforma detalhada: o modelo precisa saber exatamente em que sistema
    // está para não misturar sintaxe (ex: mandar comando de PowerShell numa máquina Linux).
    platform: process.platform,
    osName: isWindows ? 'Windows' : isMac ? 'macOS' : 'Linux',
    osRelease: os.release(),
    shell: isWindows ? 'cmd/powershell' : 'bash/sh',
    pathSeparator: path.sep,
    homeDir: USER_HOME_DIR,
    userName: os.userInfo().username,
    defaultWorkingDir: USER_HOME_DIR,
    protectedPath: OSONE_INSTALL_DIR,
    // Caminhos REAIS das pastas do usuário, já resolvidos no disco e com o nome que elas
    // têm neste sistema (num Linux em português, "Documentos" e "Área de Trabalho", não
    // "Documents"/"Desktop"). Assim o modelo não precisa adivinhar nem tentar caminhos.
    userFolders: (() => {
      const out: Record<string, string> = {};
      for (const key of Object.keys(WELL_KNOWN_FOLDER_ALIASES)) {
        const resolved = resolveAnyPath(key);
        if (fs.existsSync(resolved)) out[key] = resolved;
      }
      return out;
    })(),
    availableApps: Object.keys(CONFIG.apps || {}),
    allowedFolders: Object.keys(CONFIG.allowedFolders || {})
  });
};

/**
 * POST /open-app
 */
const handleOpenApp = (req: Request, res: Response) => {
  const { appName } = req.body || {};

  if (!appName || typeof appName !== 'string') {
    return res.status(400).json({
      error: 'Nome do aplicativo (appName) é obrigatório.',
      availableApps: Object.keys(CONFIG.apps || {})
    });
  }

  const appEntry = CONFIG.apps[appName];
  if (!appEntry) {
    logAudit('WARN', 'APP_OPEN_REJECTED', `Aplicativo '${appName}' não está na allowlist`, { appName });
    return res.status(400).json({
      error: `Aplicativo '${appName}' não existe na allowlist do config.json.`,
      availableApps: Object.keys(CONFIG.apps || {})
    });
  }

  const platformKey = process.platform === 'win32' ? 'win32' : 'linux';
  const command = appEntry[platformKey];

  if (!command) {
    logAudit('WARN', 'APP_OPEN_NO_COMMAND', `Nenhum comando configurado para plataforma '${platformKey}' no app '${appName}'`);
    return res.status(400).json({
      error: `Nenhum comando configurado para a plataforma '${platformKey}' no aplicativo '${appName}'.`
    });
  }

  // Executa o comando em processo filho isolado
  exec(command, (error, stdout, stderr) => {
    if (error) {
      logAudit('ERROR', 'APP_OPEN_FAILED', `Falha ao abrir app '${appName}': ${error.message}`, { command });
    } else {
      logAudit('INFO', 'APP_OPEN_SUCCESS', `Aplicativo '${appName}' aberto com sucesso`, { command });
    }
  });

  return res.status(200).json({
    message: `Comando enviado para abrir '${appName}'.`,
    appName,
    platform: platformKey
  });
};

/**
 * POST /organize/plan
 */
const handleOrganizePlan = (req: Request, res: Response) => {
  try {
    const { folderKey } = req.body || {};

    const { baseDir } = resolveSafePath(folderKey, '');

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const plan = [];

    for (const entry of entries) {
      if (entry.isDirectory()) continue;

      const fileName = entry.name;
      const category = getCategoryForFile(fileName);
      const fromPath = path.join(baseDir, fileName);
      const toFolder = path.join(baseDir, category);
      const toPath = path.join(toFolder, fileName);

      plan.push({
        file: fileName,
        extension: path.extname(fileName).toLowerCase(),
        category,
        from: fromPath,
        toFolder,
        to: toPath
      });
    }

    logAudit('INFO', 'ORGANIZE_PLAN_GENERATED', `Plano de organização gerado para folderKey=${folderKey}`, {
      folderKey,
      totalFilesFound: plan.length
    });

    return res.status(200).json({
      folderKey,
      baseDir,
      totalFiles: plan.length,
      plan
    });

  } catch (err: any) {
    logAudit('ERROR', 'ORGANIZE_PLAN_FAILED', err.message);
    return res.status(400).json({ error: err.message });
  }
};

/**
 * POST /organize/execute
 */
const handleOrganizeExecute = (req: Request, res: Response) => {
  try {
    const { folderKey, plan, confirmed } = req.body || {};

    if (confirmed !== true) {
      return res.status(400).json({
        error: 'Confirmação necessária para executar a organização de arquivos. Envie confirmed: true.'
      });
    }

    if (!Array.isArray(plan) || plan.length === 0) {
      return res.status(400).json({ error: 'O plano fornecido está vazio ou é inválido.' });
    }

    const results = [];

    for (const item of plan) {
      try {
        if (!item || !item.file) {
          results.push({ file: 'desconhecido', status: 'error', error: 'Item de plano inválido' });
          continue;
        }

        const fileName = String(item.file);
        
        const { targetPath: safeSource } = resolveSafePath(folderKey, fileName);
        
        if (!fs.existsSync(safeSource)) {
          results.push({ file: fileName, status: 'skipped', error: 'Arquivo fonte não encontrado (pode ter sido movido)' });
          continue;
        }

        const category = getCategoryForFile(fileName);
        const { targetPath: safeToFolder } = resolveSafePath(folderKey, category);

        if (!fs.existsSync(safeToFolder)) {
          fs.mkdirSync(safeToFolder, { recursive: true });
        }

        let destFileName = fileName;
        let safeDest = path.join(safeToFolder, destFileName);
        let counter = 1;

        const nameWithoutExt = path.basename(fileName, path.extname(fileName));
        const ext = path.extname(fileName);

        while (fs.existsSync(safeDest)) {
          destFileName = `${nameWithoutExt} (${counter})${ext}`;
          safeDest = path.join(safeToFolder, destFileName);
          counter++;
        }

        try {
          fs.renameSync(safeSource, safeDest);
        } catch (renameErr: any) {
          if (renameErr.code === 'EXDEV') {
            fs.copyFileSync(safeSource, safeDest);
            fs.unlinkSync(safeSource);
          } else {
            throw renameErr;
          }
        }

        results.push({
          file: fileName,
          status: 'moved',
          category,
          from: safeSource,
          to: safeDest
        });

      } catch (fileErr: any) {
        results.push({
          file: item.file || 'desconhecido',
          status: 'error',
          error: fileErr.message
        });
      }
    }

    const movedCount = results.filter(r => r.status === 'moved').length;
    logAudit('INFO', 'ORGANIZE_EXECUTED', `Organização concluída em folderKey=${folderKey}: ${movedCount} movidos de ${results.length}`, {
      folderKey,
      movedCount,
      totalCount: results.length
    });

    return res.status(200).json({
      message: `Organização concluída. ${movedCount} arquivo(s) movidos com sucesso.`,
      folderKey,
      results
    });

  } catch (err: any) {
    logAudit('ERROR', 'ORGANIZE_EXECUTE_FAILED', err.message);
    return res.status(400).json({ error: err.message });
  }
};

/**
 * POST /file/trash
 */
const handleFileTrash = (req: Request, res: Response) => {
  try {
    const { folderKey, fileName } = req.body || {};

    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ error: 'O nome do arquivo (fileName) é obrigatório.' });
    }

    // Aceita qualquer arquivo do computador: caminho absoluto direto em fileName, ou pasta
    // (absoluta/apelido em qualquer idioma) + nome. A jail antiga só aceitava três apelidos em
    // inglês, apontando para pastas que nem existem num sistema em português — motivo real de
    // "não consegue apagar nada". A confirmação por parâmetro também saiu: o dono da máquina
    // concedeu acesso total, e a exclusão é reversível (vai para a lixeira do agente).
    const safeSource = path.isAbsolute(expandHomePath(fileName))
      ? path.resolve(expandHomePath(fileName))
      : path.join(resolveAnyPath(folderKey || 'home'), fileName);

    if (isProtectedInstallPath(safeSource)) {
      logAudit('SECURITY', 'TRASH_BLOCKED_SELF', `Exclusão bloqueada dentro da instalação do OSONE`, { safeSource });
      return res.status(403).json({ error: `Bloqueado: '${safeSource}' faz parte da instalação do OSONE em uso, o único lugar protegido.` });
    }

    if (!fs.existsSync(safeSource)) {
      return res.status(404).json({ error: `Arquivo não encontrado: '${safeSource}'. Use list_path para conferir o caminho real antes de apagar.` });
    }

    if (!fs.existsSync(TRASH_DIR_PATH)) {
      fs.mkdirSync(TRASH_DIR_PATH, { recursive: true });
    }

    const timestampPrefix = `${Date.now()}_`;
    const trashFileName = `${timestampPrefix}${path.basename(fileName)}`;
    const trashDest = path.join(TRASH_DIR_PATH, trashFileName);

    try {
      fs.renameSync(safeSource, trashDest);
    } catch (renameErr: any) {
      if (renameErr.code === 'EXDEV') {
        fs.copyFileSync(safeSource, trashDest);
        fs.unlinkSync(safeSource);
      } else {
        throw renameErr;
      }
    }

    logAudit('INFO', 'FILE_TRASHED', `Arquivo '${fileName}' de '${folderKey}' movido para a lixeira do agente`, {
      folderKey,
      originalName: fileName,
      trashPath: trashDest
    });

    return res.status(200).json({
      message: `Arquivo '${fileName}' movido para a lixeira do agente.`,
      status: 'trashed',
      folderKey,
      originalFile: fileName,
      trashPath: trashDest
    });

  } catch (err: any) {
    logAudit('ERROR', 'FILE_TRASH_FAILED', err.message);
    return res.status(400).json({ error: err.message });
  }
};

/**
 * POST /close-app - Fecha um aplicativo local autorizado na allowlist
 */
const handleCloseApp = (req: Request, res: Response) => {
  const appId = (req.body?.appId || req.body?.appName || '').toString().trim();

  if (!appId) {
    return res.status(400).json({
      error: 'ID/nome do aplicativo (appId) é obrigatório.',
      availableApps: Object.keys(CONFIG.apps || {})
    });
  }

  const appEntry = CONFIG.apps[appId];
  if (!appEntry) {
    logAudit('WARN', 'APP_CLOSE_REJECTED', `Aplicativo '${appId}' não está na allowlist`, { appId });
    return res.status(400).json({
      error: `Aplicativo '${appId}' não existe na allowlist do config.json.`,
      availableApps: Object.keys(CONFIG.apps || {})
    });
  }

  const platformKey = process.platform === 'win32' ? 'win32' : 'linux';
  const processName = appEntry.processName?.[platformKey] || (platformKey === 'win32' ? `${appId}.exe` : appId);

  const command = platformKey === 'win32' 
    ? `taskkill /IM ${processName} /F` 
    : `pkill -f ${processName}`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      logAudit('ERROR', 'APP_CLOSE_FAILED', `Falha ao fechar app '${appId}' (Processo: ${processName}): ${error.message}`, { command, processName });
    } else {
      logAudit('INFO', 'APP_CLOSE_SUCCESS', `Aplicativo '${appId}' fechado com sucesso (Processo: ${processName})`, { command, processName });
    }
  });

  return res.status(200).json({
    message: `Comando enviado para fechar '${appId}'.`,
    appId,
    processName,
    platform: platformKey
  });
};

/**
 * POST /create-folder - Cria uma subpasta dentro de uma das pastas autorizadas em allowedFolders
 */
const handleCreateFolder = (req: Request, res: Response) => {
  try {
    const { parentFolder, folderName } = req.body || {};

    if (!parentFolder || typeof parentFolder !== 'string') {
      return res.status(400).json({ error: 'Pasta pai (parentFolder) é obrigatória.' });
    }

    if (!folderName || typeof folderName !== 'string') {
      return res.status(400).json({ error: 'Nome da pasta (folderName) é obrigatório.' });
    }

    // Qualquer caminho do computador é aceito (absoluto, com '~', ou apelido de pasta
    // conhecida em português/inglês). A única recusa é escrever dentro da instalação do OSONE.
    const safeFolderPath = path.join(resolveAnyPath(parentFolder), folderName);

    if (isProtectedInstallPath(safeFolderPath)) {
      logAudit('SECURITY', 'FOLDER_CREATE_BLOCKED_SELF', `Criação bloqueada dentro da instalação do OSONE`, { safeFolderPath });
      return res.status(403).json({ error: `Bloqueado: '${safeFolderPath}' fica dentro da instalação do OSONE em uso, o único lugar protegido.` });
    }

    if (!fs.existsSync(safeFolderPath)) {
      fs.mkdirSync(safeFolderPath, { recursive: true });
    }

    logAudit('INFO', 'FOLDER_CREATED', `Pasta '${folderName}' criada com sucesso em '${parentFolder}'`, {
      parentFolder,
      folderName,
      createdPath: safeFolderPath
    });

    return res.status(200).json({
      message: `Pasta '${folderName}' criada com sucesso em '${parentFolder}'.`,
      parentFolder,
      folderName,
      path: safeFolderPath
    });

  } catch (err: any) {
    logAudit('ERROR', 'FOLDER_CREATE_FAILED', err.message);
    return res.status(400).json({ error: err.message });
  }
};

/**
 * POST /write-file - Cria ou escreve um arquivo em uma pasta autorizada em allowedFolders
 */
const handleWriteFile = (req: Request, res: Response) => {
  try {
    const { folder, fileName, content } = req.body || {};

    if (!folder || typeof folder !== 'string' || !folder.trim()) {
      return res.status(400).json({ error: 'O parâmetro folder é obrigatório.' });
    }

    if (!fileName || typeof fileName !== 'string' || !fileName.trim()) {
      return res.status(400).json({ error: 'O parâmetro fileName é obrigatório.' });
    }

    if (content === undefined || content === null) {
      return res.status(400).json({ error: 'O parâmetro content é obrigatório.' });
    }

    const fileContent = String(content);

    // Qualquer pasta do computador serve (caminho absoluto, com '~', ou apelido conhecido em
    // português/inglês). Só a instalação do OSONE é protegida contra escrita.
    const destDir = resolveAnyPath(folder);
    const caminhoValidado = path.join(destDir, fileName);

    if (isProtectedInstallPath(caminhoValidado)) {
      logAudit('SECURITY', 'WRITE_FILE_BLOCKED_SELF', `Escrita bloqueada dentro da instalação do OSONE`, { caminhoValidado });
      return res.status(403).json({ error: `Bloqueado: '${caminhoValidado}' fica dentro da instalação do OSONE em uso, o único lugar protegido.` });
    }

    // Cria a pasta de destino se ainda não existir, para o pedido não falhar por um detalhe.
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const fileExists = fs.existsSync(caminhoValidado);

    // Escrever arquivo
    fs.writeFileSync(caminhoValidado, fileContent, 'utf8');

    if (fileExists) {
      logAudit('WARN', 'FILE_OVERWRITE', `AÇÃO SENSÍVEL: Arquivo '${fileName}' foi sobrescrito em '${folder}'`, {
        folder,
        fileName,
        path: caminhoValidado,
        contentLength: fileContent.length
      });
    } else {
      logAudit('INFO', 'FILE_CREATE', `Arquivo '${fileName}' criado com sucesso em '${folder}'`, {
        folder,
        fileName,
        path: caminhoValidado,
        contentLength: fileContent.length
      });
    }

    return res.status(200).json({
      message: fileExists
        ? `Arquivo '${fileName}' sobrescrito com sucesso em '${folder}'.`
        : `Arquivo '${fileName}' criado com sucesso em '${folder}'.`,
      folder,
      fileName,
      overwritten: fileExists,
      path: caminhoValidado
    });

  } catch (err: any) {
    logAudit('ERROR', 'WRITE_FILE_FAILED', err.message);
    return res.status(400).json({ error: err.message });
  }
};

/**
 * GET /audit/logs
 */
const handleAuditLogs = (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(AUDIT_LOG_PATH)) {
      return res.status(200).json({ logs: [] });
    }

    const content = fs.readFileSync(AUDIT_LOG_PATH, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const lastLines = lines.slice(-100);

    return res.status(200).json({ logs: lastLines });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao ler audit.log' });
  }
};

// ============================================================================
// SEÇÃO 6: ABRIR QUALQUER APP/ARQUIVO/PASTA/URL SEM PRECISAR DE ALLOWLIST
// ============================================================================

function runShell(cmd: string, timeoutMs: number = 10000, cwd: string = USER_HOME_DIR): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const workingDir = fs.existsSync(cwd) ? cwd : USER_HOME_DIR;
    exec(cmd, { timeout: timeoutMs, windowsHide: true, cwd: workingDir }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr?.toString().trim() || error.message));
      resolve({ stdout: stdout?.toString() || '', stderr: stderr?.toString() || '' });
    });
  });
}

/**
 * Como runShell, mas roda o binário direto (sem passar por um shell), com argumentos como
 * array. Usado quando o texto envolvido vem de linguagem natural do usuário/IA e não pode ser
 * interpolado numa string de comando de shell (aspas, '$()', ';' etc. quebrariam o comando ou,
 * pior, seriam interpretados como injeção de shell).
 */
function execFileShellSafe(bin: string, args: string[], timeoutMs: number = 10000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr?.toString().trim() || error.message));
      resolve({ stdout: stdout?.toString() || '', stderr: stderr?.toString() || '' });
    });
  });
}

/**
 * Nomes "conceito" de aplicativo (o jeito que um usuário ou a IA naturalmente pede, ex:
 * "notepad", "explorer", "calculadora") mapeados para candidatos reais por plataforma. Sem
 * isso, um pedido para abrir o "notepad" ou o "explorer" em uma máquina Linux tentaria abrir
 * literalmente um arquivo com esse nome (que não existe) em vez do editor de texto ou
 * gerenciador de arquivos equivalente. No Linux, onde não existe um único programa padrão
 * garantido, tenta uma lista de candidatos comuns em ordem até um deles existir no PATH.
 */
const APP_CONCEPT_ALIASES: Record<string, { win32: string; darwin: string; linux: string[] }> = {
  notepad: { win32: 'notepad', darwin: 'open -e', linux: ['gedit', 'gnome-text-editor', 'kate', 'xed', 'mousepad', 'leafpad'] },
  texteditor: { win32: 'notepad', darwin: 'open -e', linux: ['gedit', 'gnome-text-editor', 'kate', 'xed', 'mousepad', 'leafpad'] },
  bloco_de_notas: { win32: 'notepad', darwin: 'open -e', linux: ['gedit', 'gnome-text-editor', 'kate', 'xed', 'mousepad', 'leafpad'] },
  explorer: { win32: 'explorer', darwin: 'open', linux: ['nautilus', 'dolphin', 'pcmanfm', 'thunar', 'nemo', 'xdg-open'] },
  filemanager: { win32: 'explorer', darwin: 'open', linux: ['nautilus', 'dolphin', 'pcmanfm', 'thunar', 'nemo', 'xdg-open'] },
  gerenciador_de_arquivos: { win32: 'explorer', darwin: 'open', linux: ['nautilus', 'dolphin', 'pcmanfm', 'thunar', 'nemo', 'xdg-open'] },
  calculator: { win32: 'calc', darwin: 'open -a Calculator', linux: ['gnome-calculator', 'kcalc', 'qalculate-gtk', 'xcalc'] },
  calculadora: { win32: 'calc', darwin: 'open -a Calculator', linux: ['gnome-calculator', 'kcalc', 'qalculate-gtk', 'xcalc'] },
  terminal: { win32: 'start cmd', darwin: 'open -a Terminal', linux: ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'] },
};

/**
 * Aliases que abrem "um lugar" (gerenciador de arquivos, terminal) e portanto recebem um
 * caminho. Antes eles usavam "." — o diretório do processo, que no app empacotado é a pasta do
 * próprio OSONE, e era exatamente por isso que o terminal e o explorador abriam sempre dentro
 * da pasta do app em vez do lugar pedido.
 */
const LOCATION_ALIASES = new Set(['explorer', 'filemanager', 'gerenciador_de_arquivos', 'terminal']);

/** Verifica rapidamente (comando que sempre retorna na hora) se um binário existe no PATH. */
function binaryExists(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec(`command -v ${binary}`, { timeout: 2000 }, (error) => resolve(!error));
  });
}

/**
 * Lança um comando em segundo plano, totalmente desacoplado do processo do servidor
 * (spawn + detached + unref), sem esperar o app fechar — crucial para apps que ficam
 * abertos indefinidamente (ex: um editor de texto ou um terminal), diferente de exec com
 * timeout, que mataria o app assim que o tempo limite estourasse.
 */
function launchDetached(command: string, cwd: string = USER_HOME_DIR): void {
  const workingDir = fs.existsSync(cwd) ? cwd : USER_HOME_DIR;
  const child = spawn(command, { shell: true, detached: true, stdio: 'ignore', cwd: workingDir });
  child.unref();
}

/**
 * Tenta, em ordem, cada candidato de comando cujo binário existe no PATH, e lança o primeiro
 * encontrado em segundo plano (sem esperar ele fechar).
 */
async function tryCommandsInOrder(commands: string[], cwd: string = USER_HOME_DIR): Promise<{ command: string }> {
  for (const cmd of commands) {
    const binary = cmd.split(' ')[0];
    if (await binaryExists(binary)) {
      launchDetached(cmd, cwd);
      return { command: cmd };
    }
  }
  throw new Error(`Nenhum dos programas testados está instalado (${commands.join(', ')}).`);
}

/**
 * POST /open-any - Abre QUALQUER app instalado, arquivo, pasta ou URL pelo nome/caminho,
 * sem precisar estar pré-cadastrado em config.json (diferente de /open-app, que só abre
 * apps da allowlist). Usa os abridores nativos do sistema operacional, com tradução de
 * nomes-conceito de app (ex: 'notepad', 'explorer') para o equivalente real da plataforma.
 */
const handleOpenAny = async (req: Request, res: Response) => {
  const target = (req.body?.target || '').toString().trim();
  if (!target) {
    return res.status(400).json({ error: "Parâmetro 'target' é obrigatório (nome de app, caminho de arquivo/pasta ou URL)." });
  }

  const platform = process.platform;
  const conceptKey = target.toLowerCase().replace(/\s+/g, '_');
  const alias = APP_CONCEPT_ALIASES[conceptKey];

  // Para terminal/gerenciador de arquivos, o local a abrir é o caminho pedido (ou a casa do
  // usuário) — nunca o diretório do próprio OSONE.
  const requestedPath = req.body?.path ? expandHomePath(String(req.body.path)) : USER_HOME_DIR;
  const openAtDir = fs.existsSync(requestedPath) ? requestedPath : USER_HOME_DIR;

  try {
    if (alias) {
      const isLocationAlias = LOCATION_ALIASES.has(conceptKey);

      if (platform === 'linux') {
        // Gerenciadores de arquivo recebem a pasta como argumento; terminais são lançados
        // já com o diretório de trabalho correto (cwd), que é como eles herdam o local.
        const candidates = (conceptKey === 'terminal' || !isLocationAlias)
          ? alias.linux
          : alias.linux.map(bin => `${bin} "${openAtDir}"`);
        const { command } = await tryCommandsInOrder(candidates, openAtDir);
        logAudit('INFO', 'OPEN_ANY_SUCCESS', `'${target}' aberto com sucesso via alias`, { target, command, cwd: openAtDir });
        return res.status(200).json({ message: `'${target}' aberto com sucesso.`, target, path: isLocationAlias ? openAtDir : undefined });
      }

      let command: string;
      if (platform === 'win32') {
        command = conceptKey === 'terminal'
          ? `start "" cmd /K "cd /d ""${openAtDir}"""`
          : isLocationAlias
            ? `start "" ${alias.win32} "${openAtDir}"`
            : `start "" ${alias.win32}`;
      } else {
        command = isLocationAlias ? `${alias.darwin} "${openAtDir}"` : `${alias.darwin}`;
      }
      await runShell(command, 4000);
      logAudit('INFO', 'OPEN_ANY_SUCCESS', `'${target}' aberto com sucesso via alias`, { target, command, cwd: openAtDir });
      return res.status(200).json({ message: `'${target}' aberto com sucesso.`, target, path: isLocationAlias ? openAtDir : undefined });
    }

    const expandedTarget = expandHomePath(target);
    const safeTarget = expandedTarget.replace(/"/g, '\\"');
    const command = platform === 'win32'
      ? `start "" "${safeTarget}"`
      : platform === 'darwin'
        ? `open "${safeTarget}"`
        : `xdg-open "${safeTarget}"`;
    // cwd na casa do usuário para que caminhos relativos nunca resolvam para a pasta do app.
    await runShell(command, 4000, USER_HOME_DIR);
    logAudit('INFO', 'OPEN_ANY_SUCCESS', `'${target}' aberto com sucesso`, { target, command });
    return res.status(200).json({ message: `'${target}' aberto com sucesso.`, target });
  } catch (error: any) {
    logAudit('ERROR', 'OPEN_ANY_FAILED', `Falha ao abrir '${target}': ${error.message}`, { target });
    return res.status(500).json({ error: `Não foi possível abrir '${target}': ${error.message}` });
  }
};

// ============================================================================
// SEÇÃO 7: CONTROLE DE VOLUME DO SISTEMA
// ============================================================================

/**
 * POST /volume - Ajusta o volume do sistema. action: 'set' | 'up' | 'down' | 'mute' | 'unmute'.
 * 'set' exige 'value' (0-100). No Windows, 'set' é melhor esforço (usa nircmd se disponível
 * no PATH; caso contrário, aproxima com passos relativos), já que ajustar volume para um
 * valor exato ali normalmente depende de uma ferramenta externa. up/down/mute são sempre
 * confiáveis em qualquer plataforma suportada.
 */
const handleSetVolume = async (req: Request, res: Response) => {
  const action = (req.body?.action || '').toString();
  const value = req.body?.value;
  const platform = process.platform;

  if (!['set', 'up', 'down', 'mute', 'unmute'].includes(action)) {
    return res.status(400).json({ error: "Parâmetro 'action' deve ser 'set', 'up', 'down', 'mute' ou 'unmute'." });
  }
  if (action === 'set' && (value === undefined || isNaN(Number(value)))) {
    return res.status(400).json({ error: "Ação 'set' exige o parâmetro numérico 'value' (0-100)." });
  }

  try {
    if (platform === 'darwin') {
      if (action === 'set') {
        const v = Math.max(0, Math.min(100, Math.round(Number(value))));
        await runShell(`osascript -e "set volume output volume ${v}"`);
      } else if (action === 'mute') {
        await runShell(`osascript -e "set volume output muted true"`);
      } else if (action === 'unmute') {
        await runShell(`osascript -e "set volume output muted false"`);
      } else {
        const { stdout } = await runShell(`osascript -e "output volume of (get volume settings)"`);
        const current = parseInt(stdout.trim(), 10) || 50;
        const next = Math.max(0, Math.min(100, current + (action === 'up' ? 10 : -10)));
        await runShell(`osascript -e "set volume output volume ${next}"`);
      }
    } else if (platform === 'win32') {
      const sendKeys = (key: string, times: number = 1) => {
        const presses = Array(times).fill(`[System.Windows.Forms.SendKeys]::SendWait('${key}')`).join('; Start-Sleep -Milliseconds 80; ');
        return `Add-Type -AssemblyName System.Windows.Forms; ${presses}`;
      };
      if (action === 'up') {
        await runShell(`powershell -NoProfile -Command "${sendKeys('{VOLUME_UP}', 2)}"`);
      } else if (action === 'down') {
        await runShell(`powershell -NoProfile -Command "${sendKeys('{VOLUME_DOWN}', 2)}"`);
      } else if (action === 'mute' || action === 'unmute') {
        await runShell(`powershell -NoProfile -Command "${sendKeys('{VOLUME_MUTE}')}"`);
      } else if (action === 'set') {
        const v = Math.max(0, Math.min(100, Math.round(Number(value))));
        try {
          // Melhor esforço: usa nircmd se estiver instalado/no PATH (ajuste exato).
          await runShell(`nircmd.exe setsysvolume ${Math.round((v / 100) * 65535)}`);
        } catch {
          // Sem nircmd: aproxima com passos relativos (impreciso, mas não falha silenciosamente).
          const steps = Math.round(v / 10);
          if (steps > 0) await runShell(`powershell -NoProfile -Command "${sendKeys('{VOLUME_UP}', steps)}"`);
          logAudit('WARN', 'VOLUME_SET_APPROXIMATE', `nircmd não encontrado; volume ajustado por aproximação no Windows.`, { requestedValue: v });
        }
      }
    } else {
      // Linux: tenta PulseAudio (pactl), cai para ALSA (amixer) se indisponível.
      if (action === 'set') {
        const v = Math.max(0, Math.min(100, Math.round(Number(value))));
        try {
          await runShell(`pactl set-sink-volume @DEFAULT_SINK@ ${v}%`);
        } catch {
          await runShell(`amixer -D pulse sset Master ${v}%`);
        }
      } else if (action === 'mute') {
        try { await runShell(`pactl set-sink-mute @DEFAULT_SINK@ 1`); } catch { await runShell(`amixer -D pulse sset Master mute`); }
      } else if (action === 'unmute') {
        try { await runShell(`pactl set-sink-mute @DEFAULT_SINK@ 0`); } catch { await runShell(`amixer -D pulse sset Master unmute`); }
      } else {
        const delta = action === 'up' ? '+10%' : '-10%';
        try { await runShell(`pactl set-sink-volume @DEFAULT_SINK@ ${delta}`); } catch { await runShell(`amixer -D pulse sset Master 10%${action === 'up' ? '+' : '-'}`); }
      }
    }

    logAudit('INFO', 'VOLUME_CHANGED', `Volume ajustado: ${action}${action === 'set' ? ` (${value}%)` : ''}`, { action, value, platform });
    return res.status(200).json({ success: true, action, value, platform });
  } catch (err: any) {
    logAudit('ERROR', 'VOLUME_CHANGE_FAILED', err.message, { action, value, platform });
    return res.status(500).json({ error: `Erro ao ajustar o volume: ${err.message}` });
  }
};

// ============================================================================
// SEÇÃO 8: CHECAGEM DE SAÚDE DO SISTEMA (CPU, MEMÓRIA, DISCO, UPTIME)
// ============================================================================

/**
 * GET /system-check - Retorna um panorama do estado atual da máquina local.
 */
const handleSystemCheck = async (req: Request, res: Response) => {
  const platform = process.platform;
  const info: any = {
    platform,
    hostname: os.hostname(),
    osType: os.type(),
    osRelease: os.release(),
    uptimeSeconds: Math.round(os.uptime()),
    cpuModel: os.cpus()[0]?.model || 'desconhecido',
    cpuCount: os.cpus().length,
    loadAvg1m: platform === 'win32' ? null : os.loadavg()[0],
    totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
    freeMemMB: Math.round(os.freemem() / 1024 / 1024),
  };
  info.usedMemPercent = Math.round(((info.totalMemMB - info.freeMemMB) / info.totalMemMB) * 100);

  try {
    if (platform === 'win32') {
      const { stdout } = await runShell(`wmic logicaldisk get Caption,FreeSpace,Size`);
      info.diskRaw = stdout.trim();
    } else {
      const { stdout } = await runShell(`df -h`);
      info.diskRaw = stdout.trim();
    }
  } catch {
    info.diskRaw = null;
    info.diskCheckError = 'Não foi possível consultar espaço em disco nesta máquina.';
  }

  logAudit('INFO', 'SYSTEM_CHECK', `Checagem de sistema executada`, { platform });
  return res.status(200).json(info);
};

// ============================================================================
// SEÇÃO 9: TERMINAL — EXECUÇÃO DE COMANDOS COM CONFIRMAÇÃO PARA AÇÕES IMPORTANTES
// ============================================================================

/**
 * Classifica um comando como "importante" (exige confirmação explícita do usuário) ou seguro
 * para rodar direto. Por padrão o agente tem permissão ampla — só pede confirmação para
 * categorias de comando com risco real de dano (apagar em massa, formatar, instalar/remover
 * programas, elevar privilégios, mexer em firewall/antivírus/registro, etc.). Em caso de
 * dúvida, o comando cai no bloco de "requer confirmação" (mais seguro pedir demais do que
 * de menos).
 */
function classifyCommandRisk(command: string): string | null {
  const patterns: Array<{ re: RegExp; reason: string }> = [
    { re: /\brm\s+-[a-z]*r[a-z]*f\b|\brm\s+-[a-z]*f[a-z]*r\b|\bdel\s+\/[fsq]/i, reason: 'Exclusão em massa/forçada de arquivos ou pastas.' },
    { re: /\bformat\b|\bmkfs\b|\bdiskpart\b/i, reason: 'Formatação ou particionamento de disco.' },
    { re: /\bshutdown\b|\breboot\b|\bhalt\b|\bpoweroff\b/i, reason: 'Desligamento ou reinicialização do sistema.' },
    { re: /\b(apt|apt-get|yum|dnf|brew|choco|winget|pip3?|npm)\s+(install|remove|uninstall|purge)\b/i, reason: 'Instalação ou remoção de programas/pacotes.' },
    { re: /\bsudo\b|\brunas\b/i, reason: 'Comando com elevação de privilégios administrativos.' },
    { re: /\bpasswd\b|\buseradd\b|\buserdel\b|\busermod\b|\bnet\s+user\b/i, reason: 'Alteração de usuários ou senhas do sistema.' },
    { re: /\bchmod\s+777\b|\bchown\b/i, reason: 'Alteração de permissões ou dono de arquivos.' },
    { re: /\bufw\b|\biptables\b|\bnetsh\s+advfirewall\b/i, reason: 'Alteração de regras de firewall.' },
    { re: /set-mppreference|defender/i, reason: 'Alteração de configurações de antivírus/segurança do Windows.' },
    { re: /\bregedit\b|\breg\s+(add|delete)\b/i, reason: 'Alteração do registro do Windows.' },
    { re: />\s*\/dev\/sd|dd\s+if=.*of=\/dev/i, reason: 'Escrita direta em um dispositivo de disco.' },
    { re: /\bgit\s+(push|reset\s+--hard|clean\s+-f)/i, reason: 'Operação Git potencialmente destrutiva ou que publica alterações.' },
  ];
  for (const { re, reason } of patterns) {
    if (re.test(command)) return reason;
  }
  return null;
}

/**
 * Bloqueia (não apenas pede confirmação, recusa de fato) qualquer comando que pareça tentar
 * modificar a própria instalação do OSONE — o usuário pediu acesso total ao PC "menos
 * reescrever o próprio código".
 */
function targetsOwnInstallation(command: string): boolean {
  // Só o caminho REAL da instalação conta. Antes isto usava process.cwd() (que no app
  // empacotado é a pasta de dados do usuário, não a instalação) e ainda casava com qualquer
  // texto contendo "OSONE-AI" — o que bloqueava até cópias e clones do projeto em outros
  // lugares. O usuário pode mexer livremente em clones; protegido é apenas o código que está
  // rodando agora.
  if (!command.includes(OSONE_INSTALL_DIR)) return false;
  const writeVerbs = /\b(rm|del|rmdir|mv|move|cp\s+-f|sed\s+-i|truncate|shred)\b|>>?\s|\btee\b/i;
  return writeVerbs.test(command);
}

/** Bloqueia apagar/sobrescrever a própria instalação, mas permite qualquer outro caminho. */
function isProtectedInstallPath(targetPath: string): boolean {
  const resolved = path.resolve(expandHomePath(targetPath));
  return resolved === OSONE_INSTALL_DIR || resolved.startsWith(OSONE_INSTALL_DIR + path.sep);
}

/**
 * POST /exec - Executa um comando de terminal na máquina local. Comandos classificados como
 * "importantes" por classifyCommandRisk() exigem 'confirmed: true' no corpo da requisição
 * (o cliente mostra um modal de confirmação para o usuário antes de reenviar com confirmed).
 */
const handleExec = async (req: Request, res: Response) => {
  const command = (req.body?.command || '').toString();
  const confirmed = req.body?.confirmed === true;

  if (!command.trim()) {
    return res.status(400).json({ error: "Parâmetro 'command' é obrigatório." });
  }

  if (targetsOwnInstallation(command)) {
    logAudit('SECURITY', 'EXEC_BLOCKED_SELF', `Comando bloqueado por tentar modificar a própria instalação do OSONE`, { command });
    return res.status(403).json({ error: `Bloqueado: este comando modificaria a própria instalação do OSONE (${OSONE_INSTALL_DIR}), a única coisa que o agente não pode alterar. Cópias e clones do projeto em outros caminhos podem ser modificados normalmente.` });
  }

  // Execução livre por decisão explícita do dono da máquina: o agente é uma ferramenta local
  // de automação pessoal e não impõe mais um gate de confirmação por categoria de comando.
  // A classificação continua sendo calculada apenas para registrar no log de auditoria quais
  // comandos foram sensíveis, permitindo revisão posterior do que foi executado.
  const risk = classifyCommandRisk(command);

  // Sem cwd explícito, o comando herdaria o diretório do processo — que no app empacotado é a
  // pasta de dados do OSONE. Era por isso que o terminal abria sempre dentro da pasta do
  // próprio app em vez do lugar pedido. O padrão agora é a casa do usuário.
  const requestedCwd = req.body?.cwd ? resolveAnyPath(String(req.body.cwd)) : USER_HOME_DIR;

  // Modo visível: abre um terminal DE VERDADE na tela rodando o comando, em vez de executá-lo
  // escondido. Sem isto o comando roda de forma invisível — o agente lê a saída, mas o usuário
  // não vê nada acontecendo e parece que nada foi feito. O terminal fica aberto no fim para
  // que a saída possa ser lida com calma.
  if (req.body?.visible === true) {
    const workDir = fs.existsSync(requestedCwd) ? requestedCwd : USER_HOME_DIR;
    try {
      if (process.platform === 'win32') {
        // /K mantém a janela aberta depois que o comando termina.
        launchDetached(`start "OSONE" cmd /K "${command.replace(/"/g, '""')}"`, workDir);
      } else if (process.platform === 'darwin') {
        const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        launchDetached(`osascript -e 'tell application "Terminal" to do script "cd ${workDir} && ${escaped}"' -e 'tell application "Terminal" to activate'`, workDir);
      } else {
        const shellCmd = `${command}; echo; echo '[OSONE] Comando finalizado. Pressione Enter para fechar.'; read`;
        const escaped = shellCmd.replace(/'/g, `'\\''`);
        await tryCommandsInOrder([
          `gnome-terminal --working-directory='${workDir}' -- bash -c '${escaped}'`,
          `konsole --workdir '${workDir}' -e bash -c '${escaped}'`,
          `xfce4-terminal --working-directory='${workDir}' -e "bash -c '${escaped}'"`,
          `xterm -hold -e bash -c '${escaped}'`
        ], workDir);
      }
      logAudit('INFO', 'EXEC_VISIBLE', `Comando aberto em terminal visível`, { command, cwd: workDir });
      return res.status(200).json({
        success: true,
        visible: true,
        message: `Comando aberto numa janela de terminal visível em '${workDir}'. A saída aparece na janela, não aqui.`
      });
    } catch (err: any) {
      return res.status(500).json({ error: `Não foi possível abrir um terminal visível: ${err.message}` });
    }
  }

  const workingDir = fs.existsSync(requestedCwd) ? requestedCwd : USER_HOME_DIR;

  exec(command, { cwd: workingDir, timeout: 120000, maxBuffer: 1024 * 1024 * 20, windowsHide: true }, (error, stdout, stderr) => {
    const success = !error;
    logAudit(success ? 'INFO' : 'ERROR', 'EXEC_COMMAND', `Comando executado: ${success ? 'sucesso' : 'falha'}`, {
      command,
      cwd: workingDir,
      sensitive: risk || null,
      exitCode: (error as any)?.code
    });

    if (error && (error as any).killed) {
      return res.status(500).json({ error: 'O comando excedeu o tempo limite de 2 minutos e foi encerrado.' });
    }

    return res.status(200).json({
      success,
      exitCode: error ? ((error as any).code ?? 1) : 0,
      stdout: (stdout || '').toString().slice(0, 20000),
      stderr: (stderr || '').toString().slice(0, 20000)
    });
  });
};

// ============================================================================
// SEÇÃO 10: CONTROLE DE MOUSE (CONTROLE POR VISÃO / GESTOS DE MÃO)
// ============================================================================

/**
 * GET /screen-info - Retorna as dimensões da tela virtual (união de todos os monitores
 * conectados), usada pelo frontend para mapear a posição da mão detectada pela câmera para
 * coordenadas absolutas de tela, incluindo monitores estendidos.
 */
async function obterDimensoesDaTela(): Promise<{ width: number; height: number; offsetX: number; offsetY: number }> {
  const platform = process.platform;
  if (platform === 'linux') {
    const { stdout } = await runShell(`xdotool getdisplaygeometry`);
    const [width, height] = stdout.trim().split(/\s+/).map(Number);
    return { width, height, offsetX: 0, offsetY: 0 };
  }
  if (platform === 'win32') {
    const script = `Add-Type -AssemblyName System.Windows.Forms; $vs = [System.Windows.Forms.SystemInformation]::VirtualScreen; Write-Output "$($vs.Width)|$($vs.Height)|$($vs.X)|$($vs.Y)"`;
    const { stdout } = await runShell(`powershell -NoProfile -Command "${script}"`);
    const [width, height, offsetX, offsetY] = stdout.trim().split('|').map(Number);
    return { width, height, offsetX, offsetY };
  }
  throw new Error(`Plataforma '${platform}' não suportada para leitura das dimensões de tela.`);
};

const handleGetScreenInfo = async (_req: Request, res: Response) => {
  const platform = process.platform;
  try {
    const info = await obterDimensoesDaTela();
    return res.status(200).json({ ...info, monitors: 'union' });
  } catch (err: any) {
    if (platform !== 'linux' && platform !== 'win32') {
      return res.status(501).json({ error: `Controle de mouse ainda não suportado na plataforma '${platform}'.` });
    }
    logAudit('ERROR', 'SCREEN_INFO_FAILED', err.message, { platform });
    return res.status(500).json({ error: `Não foi possível obter as dimensões da tela: ${err.message}. No Linux é necessário ter o pacote 'xdotool' instalado.` });
  }
};

/** Monta o comando PowerShell que dispara um evento nativo de mouse via user32.dll (mouse_event). */
function winMouseEventCommand(flag: number, x?: number, y?: number): string {
  const moveCmd = (x !== undefined && y !== undefined)
    ? `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)},${Math.round(y)}); `
    : '';
  const script = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class OsoneMouse { [DllImport("user32.dll")] public static extern void mouse_event(int flags, int dx, int dy, int data, int extra); }'; ${moveCmd}[OsoneMouse]::mouse_event(${flag},0,0,0,0);`;
  return `powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`;
}

const WIN_MOUSEEVENTF = { LEFTDOWN: 0x0002, LEFTUP: 0x0004, RIGHTDOWN: 0x0008, RIGHTUP: 0x0010 };

/**
 * POST /mouse/move - Move o cursor do sistema para coordenadas absolutas de tela (x, y),
 * podendo cobrir qualquer monitor conectado. É a base do controle por visão: cada quadro em
 * que a câmera detecta a posição da mão, o frontend chama este endpoint (com controle de taxa
 * no próprio frontend para não sobrecarregar).
 */
const handleMouseMove = async (req: Request, res: Response) => {
  const x = Number(req.body?.x);
  const y = Number(req.body?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return res.status(400).json({ error: "Parâmetros 'x' e 'y' (numéricos) são obrigatórios." });
  }
  const platform = process.platform;
  try {
    if (platform === 'linux') {
      await runShell(`xdotool mousemove ${Math.round(x)} ${Math.round(y)}`, 3000);
    } else if (platform === 'win32') {
      await runShell(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)},${Math.round(y)})"`, 3000);
    } else {
      return res.status(501).json({ error: `Controle de mouse ainda não suportado na plataforma '${platform}'.` });
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao mover o cursor: ${err.message}` });
  }
};

/**
 * POST /mouse/button - Ação de botão do mouse. action: 'down' | 'up' | 'click'.
 * button: 'left' | 'right' (padrão 'left'). Usado pelo controle por visão para gestos:
 * pinça iniciando = down, soltando rápido = click, soltando após arrastar = up (o down/up
 * separados permitem que o gesto de arrastar funcione, já que o frontend manda 'down',
 * uma sequência de /mouse/move, e por fim 'up').
 */
const handleMouseButton = async (req: Request, res: Response) => {
  const action = (req.body?.action || 'click').toString();
  const button = (req.body?.button || 'left').toString();
  const double = req.body?.double === true;

  if (!['down', 'up', 'click'].includes(action)) {
    return res.status(400).json({ error: "Parâmetro 'action' deve ser 'down', 'up' ou 'click'." });
  }
  if (!['left', 'right'].includes(button)) {
    return res.status(400).json({ error: "Parâmetro 'button' deve ser 'left' ou 'right'." });
  }

  const platform = process.platform;
  const xdotoolButton = button === 'left' ? '1' : '3';
  try {
    if (platform === 'linux') {
      if (action === 'down') await runShell(`xdotool mousedown ${xdotoolButton}`, 3000);
      else if (action === 'up') await runShell(`xdotool mouseup ${xdotoolButton}`, 3000);
      else await runShell(`xdotool click ${double ? '--repeat 2 --delay 120 ' : ''}${xdotoolButton}`, 3000);
    } else if (platform === 'win32') {
      const down = button === 'left' ? WIN_MOUSEEVENTF.LEFTDOWN : WIN_MOUSEEVENTF.RIGHTDOWN;
      const up = button === 'left' ? WIN_MOUSEEVENTF.LEFTUP : WIN_MOUSEEVENTF.RIGHTUP;
      if (action === 'down') await runShell(winMouseEventCommand(down), 3000);
      else if (action === 'up') await runShell(winMouseEventCommand(up), 3000);
      else {
        await runShell(winMouseEventCommand(down), 3000);
        await runShell(winMouseEventCommand(up), 3000);
        if (double) {
          await runShell(winMouseEventCommand(down), 3000);
          await runShell(winMouseEventCommand(up), 3000);
        }
      }
    } else {
      return res.status(501).json({ error: `Controle de mouse ainda não suportado na plataforma '${platform}'.` });
    }
    return res.status(200).json({ success: true, action, button });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao executar ação de mouse '${action}': ${err.message}` });
  }
};

/** Monta o comando PowerShell que dispara a roda do mouse (scroll) via mouse_event/MOUSEEVENTF_WHEEL. */
function winMouseWheelCommand(wheelData: number, x?: number, y?: number): string {
  const moveCmd = (x !== undefined && y !== undefined)
    ? `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)},${Math.round(y)}); `
    : '';
  const script = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class OsoneWheel { [DllImport("user32.dll")] public static extern void mouse_event(int flags, int dx, int dy, int data, int extra); }'; ${moveCmd}[OsoneWheel]::mouse_event(0x0800,0,0,${Math.round(wheelData)},0);`;
  return `powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`;
}

/**
 * POST /mouse/scroll - Rola a página/janela sob o cursor (ou nas coordenadas opcionais x,y).
 * direction: 'up' | 'down'. amount: quantos "cliques" de roda (padrão 3, como um giro normal de
 * roda de mouse físico). Complementa /mouse/move e /mouse/button para o agente de visão navegar
 * em páginas e documentos longos sem depender de atalhos de teclado.
 */
const handleMouseScroll = async (req: Request, res: Response) => {
  const direction = (req.body?.direction || '').toString();
  const rawAmount = Number(req.body?.amount);
  const amount = Number.isFinite(rawAmount) ? Math.max(1, Math.min(50, Math.round(rawAmount))) : 3;
  const x = req.body?.x !== undefined ? Number(req.body.x) : undefined;
  const y = req.body?.y !== undefined ? Number(req.body.y) : undefined;

  if (!['up', 'down'].includes(direction)) {
    return res.status(400).json({ error: "Parâmetro 'direction' deve ser 'up' ou 'down'." });
  }
  if ((x !== undefined && !Number.isFinite(x)) || (y !== undefined && !Number.isFinite(y))) {
    return res.status(400).json({ error: "Parâmetros 'x' e 'y', quando informados, devem ser numéricos." });
  }

  const platform = process.platform;
  try {
    if (platform === 'linux') {
      if (x !== undefined && y !== undefined) {
        await runShell(`xdotool mousemove ${Math.round(x)} ${Math.round(y)}`, 3000);
      }
      const xdotoolButton = direction === 'up' ? '4' : '5';
      await runShell(`xdotool click --repeat ${amount} --delay 40 ${xdotoolButton}`, 6000);
    } else if (platform === 'win32') {
      const wheelData = (direction === 'up' ? 1 : -1) * 120 * amount;
      await runShell(winMouseWheelCommand(wheelData, x, y), 3000);
    } else {
      return res.status(501).json({ error: `Controle de mouse ainda não suportado na plataforma '${platform}'.` });
    }
    return res.status(200).json({ success: true, direction, amount });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao rolar a página: ${err.message}` });
  }
};

const MAX_TYPE_TEXT_LENGTH = 4000;

/**
 * Gera o comando PowerShell que digita texto arbitrário via SendInput/KEYEVENTF_UNICODE,
 * caractere a caractere. Evita por completo as regras de escape do SendKeys (que trata
 * +^%~(){} como caracteres especiais) — essencial aqui porque o texto vem de linguagem natural
 * do usuário/IA e pode conter qualquer um desses caracteres, além de acentos e emojis. O texto
 * chega em base64 (UTF-16LE) para não precisar de nenhum escape de aspas/shell na montagem do
 * comando: o payload só contém caracteres do alfabeto base64, que são inofensivos em qualquer
 * contexto de shell ou string do PowerShell.
 */
function winTypeUnicodeCommand(base64Utf16Text: string): string {
  const csharp = [
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class OsoneKeyboard {',
    '  [StructLayout(LayoutKind.Sequential)]',
    '  struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }',
    '  [StructLayout(LayoutKind.Explicit)]',
    '  struct INPUTUNION { [FieldOffset(0)] public KEYBDINPUT ki; }',
    '  struct INPUT { public uint type; public INPUTUNION u; }',
    '  [DllImport("user32.dll")] static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);',
    '  const uint KEYEVENTF_UNICODE = 0x0004;',
    '  const uint KEYEVENTF_KEYUP = 0x0002;',
    '  public static void TypeText(string text) {',
    '    int size = Marshal.SizeOf(typeof(INPUT));',
    '    foreach (char c in text) {',
    '      var down = new INPUT { type = 1, u = new INPUTUNION { ki = new KEYBDINPUT { wVk = 0, wScan = c, dwFlags = KEYEVENTF_UNICODE, time = 0, dwExtraInfo = IntPtr.Zero } } };',
    '      var up = down; up.u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;',
    '      SendInput(1, new INPUT[] { down }, size);',
    '      SendInput(1, new INPUT[] { up }, size);',
    '      System.Threading.Thread.Sleep(8);',
    '    }',
    '  }',
    '}'
  ].join(' ');
  const script = `Add-Type -TypeDefinition '${csharp}'; $bytes = [Convert]::FromBase64String("${base64Utf16Text}"); $s = [System.Text.Encoding]::Unicode.GetString($bytes); [OsoneKeyboard]::TypeText($s);`;
  return `powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`;
}

/**
 * POST /keyboard/type - Digita texto livre no campo atualmente em foco (o que estiver com o
 * cursor de texto ativo na tela: uma barra de busca, um formulário, um editor). Junto de
 * /mouse/move, /mouse/button e /keyboard/key, fecha o conjunto de ações que faltava para o
 * agente de visão não só ver a tela, mas também interagir com ela como um usuário faria.
 */
const handleKeyboardType = async (req: Request, res: Response) => {
  const text = (req.body?.text ?? '').toString();
  if (!text) {
    return res.status(400).json({ error: "Parâmetro 'text' é obrigatório." });
  }
  if (text.length > MAX_TYPE_TEXT_LENGTH) {
    return res.status(400).json({ error: `Texto muito longo (máx. ${MAX_TYPE_TEXT_LENGTH} caracteres por chamada).` });
  }

  const platform = process.platform;
  try {
    if (platform === 'linux') {
      await execFileShellSafe('xdotool', ['type', '--clearmodifiers', '--delay', '12', '--', text], 20000);
    } else if (platform === 'win32') {
      const base64Text = Buffer.from(text, 'utf16le').toString('base64');
      await runShell(winTypeUnicodeCommand(base64Text), 20000);
    } else {
      return res.status(501).json({ error: `Digitação por teclado ainda não suportada na plataforma '${platform}'.` });
    }
    return res.status(200).json({ success: true, length: text.length });
  } catch (err: any) {
    logAudit('ERROR', 'KEYBOARD_TYPE_FAILED', err.message, { platform, length: text.length });
    return res.status(500).json({ error: `Falha ao digitar texto: ${err.message}. No Linux é necessário ter o pacote 'xdotool' instalado.` });
  }
};

/** Teclas nomeadas aceitas por /keyboard/key, mapeadas para o nome esperado por xdotool (Linux)
 * e pela sintaxe do SendKeys (Windows). */
const KEY_NAME_MAP: Record<string, { xdotool: string; sendkeys: string }> = {
  enter: { xdotool: 'Return', sendkeys: '{ENTER}' },
  tab: { xdotool: 'Tab', sendkeys: '{TAB}' },
  escape: { xdotool: 'Escape', sendkeys: '{ESC}' },
  backspace: { xdotool: 'BackSpace', sendkeys: '{BACKSPACE}' },
  delete: { xdotool: 'Delete', sendkeys: '{DELETE}' },
  arrowup: { xdotool: 'Up', sendkeys: '{UP}' },
  arrowdown: { xdotool: 'Down', sendkeys: '{DOWN}' },
  arrowleft: { xdotool: 'Left', sendkeys: '{LEFT}' },
  arrowright: { xdotool: 'Right', sendkeys: '{RIGHT}' },
  home: { xdotool: 'Home', sendkeys: '{HOME}' },
  end: { xdotool: 'End', sendkeys: '{END}' },
  pageup: { xdotool: 'Prior', sendkeys: '{PGUP}' },
  pagedown: { xdotool: 'Next', sendkeys: '{PGDN}' },
};

/**
 * POST /keyboard/key - Pressiona uma tecla nomeada (enter, tab, escape, setas, backspace...) ou
 * um único caractere alfanumérico, com modificadores opcionais (ctrl/alt/shift). Complementa
 * /keyboard/type (texto livre): usado para atalhos e navegação — Enter para enviar um
 * formulário, Ctrl+A para selecionar tudo, Tab para mudar de campo, setas para navegar em
 * listas/menus. 'key' e 'modifiers' são validados contra uma lista fechada antes de montar
 * qualquer comando, então não há risco de injeção mesmo repassando o texto vindo do modelo.
 */
const handleKeyboardKey = async (req: Request, res: Response) => {
  const rawKey = (req.body?.key || '').toString();
  const key = rawKey.toLowerCase();
  const modifiersInput: any[] = Array.isArray(req.body?.modifiers) ? req.body.modifiers : [];
  const modifiers = modifiersInput
    .map((m) => String(m).toLowerCase())
    .filter((m) => ['ctrl', 'alt', 'shift'].includes(m));

  const named = KEY_NAME_MAP[key];
  const isSingleChar = /^[a-z0-9]$/.test(key);
  if (!named && !isSingleChar) {
    return res.status(400).json({ error: `Tecla '${rawKey}' não reconhecida. Use uma tecla nomeada (${Object.keys(KEY_NAME_MAP).join(', ')}) ou um único caractere alfanumérico.` });
  }

  const platform = process.platform;
  try {
    if (platform === 'linux') {
      const keysym = named ? named.xdotool : key;
      const combo = [...modifiers, keysym].join('+');
      await runShell(`xdotool key ${combo}`, 5000);
    } else if (platform === 'win32') {
      const prefix = modifiers.map(m => m === 'ctrl' ? '^' : m === 'alt' ? '%' : '+').join('');
      const token = named ? named.sendkeys : key;
      const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${prefix}${token}')`;
      await runShell(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, 5000);
    } else {
      return res.status(501).json({ error: `Controle de teclado ainda não suportado na plataforma '${platform}'.` });
    }
    return res.status(200).json({ success: true, key: rawKey, modifiers });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao pressionar a tecla '${rawKey}': ${err.message}` });
  }
};

/**
 * GET /screen/capture - Tira uma captura de tela (todos os monitores) e devolve como base64.
 * Diferente do compartilhamento de tela via WebRTC no navegador (que exige clique manual do
 * usuário por restrição do próprio navegador), esta captura roda direto no sistema operacional,
 * então pode ser chamada sob demanda a qualquer momento — inclusive fora de uma sessão de voz
 * com compartilhamento ativo — para o agente conferir o estado atual da tela.
 */
const handleScreenCapture = async (_req: Request, res: Response) => {
  const platform = process.platform;
  const tmpFile = path.join(os.tmpdir(), `osone-screenshot-${crypto.randomBytes(6).toString('hex')}.png`);
  try {
    if (platform === 'win32') {
      const winPath = tmpFile.replace(/'/g, "''");
      const script = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $vs = [System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp = New-Object System.Drawing.Bitmap($vs.Width, $vs.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($vs.X, $vs.Y, 0, 0, $bmp.Size); $bmp.Save('${winPath}', [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose();`;
      await runShell(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, 15000);
    } else if (platform === 'linux') {
      const candidates = [
        `import -window root -silent "${tmpFile}"`,
        `scrot -o "${tmpFile}"`,
        `gnome-screenshot -f "${tmpFile}"`,
      ];
      let lastError = '';
      let captured = false;
      for (const cmd of candidates) {
        try {
          await runShell(cmd, 15000);
          if (fs.existsSync(tmpFile) && fs.statSync(tmpFile).size > 0) {
            captured = true;
            break;
          }
        } catch (err: any) {
          lastError = err.message;
        }
      }
      if (!captured) {
        throw new Error(`Nenhuma ferramenta de captura de tela disponível no sistema (tentado: ImageMagick 'import', 'scrot', 'gnome-screenshot'). ${lastError}`);
      }
    } else {
      return res.status(501).json({ error: `Captura de tela ainda não suportada na plataforma '${platform}'.` });
    }

    if (!fs.existsSync(tmpFile) || fs.statSync(tmpFile).size === 0) {
      throw new Error('A captura de tela retornou vazia.');
    }
    const buffer = fs.readFileSync(tmpFile);
    fs.unlink(tmpFile, () => {});

    // As dimensões vão junto com a imagem de propósito: antes a captura era devolvida "crua", e
    // quem olhasse a foto não tinha como saber a que tamanho de tela ela corresponde — uma foto
    // sem régua. Sem isso, qualquer coordenada devolvida é um chute sobre a escala.
    let tela: { width: number; height: number; offsetX: number; offsetY: number } | null = null;
    try {
      tela = await obterDimensoesDaTela();
    } catch (_) { /* a imagem sozinha ainda é útil; segue sem as dimensões */ }

    return res.status(200).json({
      image: `data:image/png;base64,${buffer.toString('base64')}`,
      mimeType: 'image/png',
      ...(tela ? { screenWidth: tela.width, screenHeight: tela.height } : {})
    });
  } catch (err: any) {
    fs.unlink(tmpFile, () => {});
    logAudit('ERROR', 'SCREEN_CAPTURE_FAILED', err.message, { platform });
    return res.status(500).json({ error: `Não foi possível capturar a tela: ${err.message}. No Linux é necessário ter 'ImageMagick' (import), 'scrot' ou 'gnome-screenshot' instalado.` });
  }
};

// ============================================================================
// SEÇÃO 11: CONTROLE AMPLO DO SISTEMA (JANELAS, MÍDIA, ARQUIVOS, CONFIGURAÇÕES)
// ============================================================================

/**
 * POST /window/close - Fecha uma janela ou encerra um aplicativo pelo nome/título, sem
 * precisar que ele esteja pré-cadastrado numa allowlist (diferente de /close-app).
 */
const handleCloseWindow = async (req: Request, res: Response) => {
  const targetName = (req.body?.target || '').toString().trim();
  const force = req.body?.force === true;
  if (!targetName) {
    return res.status(400).json({ error: "Parâmetro 'target' é obrigatório (nome do app ou título da janela)." });
  }

  const platform = process.platform;
  // Remove aspas e metacaracteres de shell: o nome vem de linguagem natural do usuário e é
  // interpolado num comando, então não pode carregar ';', '&&', '|', '$(...)' etc.
  const safe = targetName.replace(/["'`;&|$<>\\]/g, '').trim();
  if (!safe) {
    return res.status(400).json({ error: 'Nome de aplicativo/janela inválido.' });
  }

  if (OWN_PROCESS_NAMES.has(safe.toLowerCase())) {
    logAudit('SECURITY', 'WINDOW_CLOSE_BLOCKED_SELF', `Recusado fechar o próprio OSONE`, { target: targetName });
    return res.status(403).json({ error: `Bloqueado: '${targetName}' encerraria o próprio OSONE, que está executando esta ação.` });
  }

  try {
    if (platform === 'win32') {
      // Tenta pelo nome do processo e, se não achar, pelo título da janela.
      const asProcess = safe.toLowerCase().endsWith('.exe') ? safe : `${safe}.exe`;
      try {
        await runShell(`taskkill ${force ? '/F ' : ''}/IM "${asProcess}"`, 8000);
      } catch {
        await runShell(`taskkill ${force ? '/F ' : ''}/FI "WINDOWTITLE eq ${safe}*"`, 8000);
      }
    } else if (platform === 'darwin') {
      await runShell(`osascript -e 'quit app "${safe}"'`, 8000);
    } else {
      // Fecha a janela educadamente (permite salvar) e só encerra o processo se necessário.
      //
      // Deliberadamente NÃO usamos 'pkill -f': essa flag casa com a linha de comando INTEIRA de
      // todo processo, então fechar "chrome" mataria qualquer processo que apenas mencionasse
      // "chrome" nos argumentos — inclusive o próprio servidor do OSONE, derrubando o app no
      // meio da ação. '-x' exige correspondência exata do nome do executável, que é o que o
      // usuário quer dizer com "feche o Spotify".
      try {
        await runShell(`wmctrl -c "${safe}"`, 6000);
      } catch {
        if (OWN_PROCESS_NAMES.has(safe.toLowerCase())) {
          throw new Error(`Recusado: '${safe}' encerraria o próprio OSONE.`);
        }
        await runShell(`${force ? 'pkill -9' : 'pkill'} -x "${safe}"`, 6000);
      }
    }
    logAudit('INFO', 'WINDOW_CLOSED', `Janela/app '${targetName}' fechado.`, { target: targetName, force, platform });
    return res.status(200).json({ success: true, message: `'${targetName}' foi fechado.` });
  } catch (err: any) {
    logAudit('ERROR', 'WINDOW_CLOSE_FAILED', err.message, { target: targetName });
    return res.status(500).json({ error: `Não foi possível fechar '${targetName}': ${err.message}. Verifique se ele está realmente aberto.` });
  }
};

/**
 * POST /media - Controla a reprodução de mídia do sistema (funciona com Spotify, YouTube no
 * navegador, players locais — qualquer app que responda às teclas de mídia do sistema).
 */
const handleMediaControl = async (req: Request, res: Response) => {
  const action = (req.body?.action || '').toString();
  const valid = ['playpause', 'play', 'pause', 'next', 'previous', 'stop'];
  if (!valid.includes(action)) {
    return res.status(400).json({ error: `Parâmetro 'action' deve ser um de: ${valid.join(', ')}.` });
  }

  const platform = process.platform;
  try {
    if (platform === 'linux') {
      const playerctlAction = action === 'previous' ? 'previous' : action === 'playpause' ? 'play-pause' : action;
      try {
        await runShell(`playerctl ${playerctlAction}`, 5000);
      } catch {
        const keyMap: Record<string, string> = {
          playpause: 'XF86AudioPlay', play: 'XF86AudioPlay', pause: 'XF86AudioPause',
          next: 'XF86AudioNext', previous: 'XF86AudioPrev', stop: 'XF86AudioStop'
        };
        await runShell(`xdotool key ${keyMap[action]}`, 5000);
      }
    } else if (platform === 'win32') {
      // Códigos de tecla virtual de mídia do Windows, disparados via user32.
      const vkMap: Record<string, number> = {
        playpause: 0xB3, play: 0xB3, pause: 0xB3, next: 0xB0, previous: 0xB1, stop: 0xB2
      };
      const vk = vkMap[action];
      const script = `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class OsoneKeys { [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo); }'; [OsoneKeys]::keybd_event(${vk},0,0,0); [OsoneKeys]::keybd_event(${vk},0,2,0);`;
      await runShell(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, 8000);
    } else {
      const osaMap: Record<string, string> = {
        playpause: 'playpause', play: 'play', pause: 'pause',
        next: 'next track', previous: 'previous track', stop: 'stop'
      };
      await runShell(`osascript -e 'tell application "Music" to ${osaMap[action]}'`, 8000);
    }
    logAudit('INFO', 'MEDIA_CONTROL', `Controle de mídia: ${action}`, { action, platform });
    return res.status(200).json({ success: true, action });
  } catch (err: any) {
    return res.status(500).json({ error: `Não foi possível controlar a mídia (${action}): ${err.message}` });
  }
};

/**
 * POST /path/delete - Apaga QUALQUER arquivo ou pasta do computador, movendo para a lixeira do
 * agente (reversível). O único caminho recusado é a própria instalação do OSONE — cópias e
 * clones do projeto em outros lugares podem ser apagados normalmente.
 */
const handleDeletePath = (req: Request, res: Response) => {
  const rawTarget = (req.body?.target || '').toString().trim();
  if (!rawTarget) {
    return res.status(400).json({ error: "Parâmetro 'target' é obrigatório (caminho do arquivo ou pasta)." });
  }

  const targetPath = path.resolve(expandHomePath(rawTarget));

  if (isProtectedInstallPath(targetPath)) {
    logAudit('SECURITY', 'DELETE_BLOCKED_SELF', `Exclusão bloqueada: caminho pertence à instalação do OSONE`, { targetPath });
    return res.status(403).json({
      error: `Bloqueado: '${targetPath}' faz parte da instalação do OSONE em uso (${OSONE_INSTALL_DIR}), a única coisa que não pode ser apagada. Cópias e clones em outros caminhos podem.`
    });
  }

  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: `O caminho '${targetPath}' não existe.` });
  }

  try {
    if (!fs.existsSync(TRASH_DIR_PATH)) fs.mkdirSync(TRASH_DIR_PATH, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destination = path.join(TRASH_DIR_PATH, `${stamp}__${path.basename(targetPath)}`);
    // Renomear falha entre sistemas de arquivos diferentes; nesse caso copiamos e removemos.
    try {
      fs.renameSync(targetPath, destination);
    } catch {
      fs.cpSync(targetPath, destination, { recursive: true });
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
    logAudit('INFO', 'PATH_DELETED', `'${targetPath}' movido para a lixeira do agente.`, { targetPath, destination });
    return res.status(200).json({
      success: true,
      message: `'${path.basename(targetPath)}' foi movido para a lixeira do OSONE (reversível).`,
      restorePath: destination
    });
  } catch (err: any) {
    logAudit('ERROR', 'PATH_DELETE_FAILED', err.message, { targetPath });
    return res.status(500).json({ error: `Não foi possível apagar '${targetPath}': ${err.message}` });
  }
};

/**
 * POST /path/manage - Move, copia ou renomeia qualquer caminho do computador (usado para
 * organizar pastas conforme o pedido do usuário).
 */
const handleManagePath = (req: Request, res: Response) => {
  const action = (req.body?.action || '').toString();
  const source = path.resolve(expandHomePath((req.body?.source || '').toString()));
  const destination = path.resolve(expandHomePath((req.body?.destination || '').toString()));

  if (!['move', 'copy', 'rename'].includes(action)) {
    return res.status(400).json({ error: "Parâmetro 'action' deve ser 'move', 'copy' ou 'rename'." });
  }
  if (!req.body?.source || !req.body?.destination) {
    return res.status(400).json({ error: "Parâmetros 'source' e 'destination' são obrigatórios." });
  }
  // Copiar PARA fora da instalação é livre; apenas alterar/remover a instalação é proibido.
  if (action !== 'copy' && isProtectedInstallPath(source)) {
    return res.status(403).json({ error: `Bloqueado: '${source}' faz parte da instalação do OSONE em uso e não pode ser movida/renomeada.` });
  }
  if (isProtectedInstallPath(destination)) {
    return res.status(403).json({ error: `Bloqueado: não é permitido escrever dentro da instalação do OSONE (${OSONE_INSTALL_DIR}).` });
  }
  if (!fs.existsSync(source)) {
    return res.status(404).json({ error: `A origem '${source}' não existe.` });
  }

  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (action === 'copy') {
      fs.cpSync(source, destination, { recursive: true });
    } else {
      try {
        fs.renameSync(source, destination);
      } catch {
        fs.cpSync(source, destination, { recursive: true });
        fs.rmSync(source, { recursive: true, force: true });
      }
    }
    logAudit('INFO', 'PATH_MANAGED', `${action}: '${source}' -> '${destination}'`, { action, source, destination });
    return res.status(200).json({ success: true, action, source, destination });
  } catch (err: any) {
    logAudit('ERROR', 'PATH_MANAGE_FAILED', err.message, { action, source, destination });
    return res.status(500).json({ error: `Falha ao ${action} '${source}': ${err.message}` });
  }
};

/**
 * POST /system/settings - Abre painéis de configuração do sistema (câmera, privacidade, som,
 * rede, display, bluetooth, etc.).
 */
const handleOpenSettings = async (req: Request, res: Response) => {
  const panel = (req.body?.panel || 'main').toString().toLowerCase();
  const platform = process.platform;

  const WINDOWS_PANELS: Record<string, string> = {
    main: 'ms-settings:', camera: 'ms-settings:privacy-webcam', microphone: 'ms-settings:privacy-microphone',
    sound: 'ms-settings:sound', display: 'ms-settings:display', network: 'ms-settings:network',
    bluetooth: 'ms-settings:bluetooth', privacy: 'ms-settings:privacy', apps: 'ms-settings:appsfeatures',
    power: 'ms-settings:powersleep', update: 'ms-settings:windowsupdate', taskbar: 'ms-settings:taskbar'
  };
  const LINUX_PANELS: Record<string, string> = {
    main: '', camera: 'camera', microphone: 'sound', sound: 'sound', display: 'display',
    network: 'network', bluetooth: 'bluetooth', privacy: 'privacy', apps: 'applications',
    power: 'power', update: 'info-overview', taskbar: 'ubuntu'
  };

  try {
    if (platform === 'win32') {
      const uri = WINDOWS_PANELS[panel] || WINDOWS_PANELS.main;
      await runShell(`start "" "${uri}"`, 6000);
    } else if (platform === 'darwin') {
      await runShell(`open -a "System Settings"`, 6000);
    } else {
      const section = LINUX_PANELS[panel] ?? '';
      await tryCommandsInOrder([
        `gnome-control-center ${section}`.trim(),
        `systemsettings5 ${section}`.trim(),
        'xfce4-settings-manager',
        'gnome-control-center'
      ]);
    }
    logAudit('INFO', 'SETTINGS_OPENED', `Painel de configurações '${panel}' aberto.`, { panel, platform });
    return res.status(200).json({ success: true, panel });
  } catch (err: any) {
    return res.status(500).json({ error: `Não foi possível abrir as configurações ('${panel}'): ${err.message}` });
  }
};

/**
 * POST /path/list - Lista o conteúdo de qualquer pasta, para o agente inspecionar antes de
 * organizar/apagar em vez de agir às cegas.
 */
const handleListPath = (req: Request, res: Response) => {
  const rawTarget = (req.body?.target || '').toString().trim();
  const targetPath = path.resolve(expandHomePath(rawTarget || USER_HOME_DIR));

  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: `A pasta '${targetPath}' não existe.` });
  }

  try {
    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory()) {
      return res.status(200).json({ path: targetPath, isDirectory: false, sizeBytes: stats.size });
    }
    const entries = fs.readdirSync(targetPath, { withFileTypes: true }).slice(0, 500).map((entry) => {
      const full = path.join(targetPath, entry.name);
      let sizeBytes: number | null = null;
      try { sizeBytes = entry.isFile() ? fs.statSync(full).size : null; } catch { /* sem permissão de leitura */ }
      return { name: entry.name, path: full, isDirectory: entry.isDirectory(), sizeBytes };
    });
    return res.status(200).json({ path: targetPath, isDirectory: true, entries });
  } catch (err: any) {
    return res.status(500).json({ error: `Não foi possível listar '${targetPath}': ${err.message}` });
  }
};

// Mapeamento das rotas no router
agentRouter.get('/status', handleStatus);
agentRouter.post('/window/close', handleCloseWindow);
agentRouter.post('/media', handleMediaControl);
agentRouter.post('/path/delete', handleDeletePath);
agentRouter.post('/path/manage', handleManagePath);
agentRouter.post('/path/list', handleListPath);
agentRouter.post('/system/settings', handleOpenSettings);
agentRouter.post('/open-app', handleOpenApp);
agentRouter.post('/open-any', handleOpenAny);
agentRouter.post('/close-app', handleCloseApp);
agentRouter.post('/create-folder', handleCreateFolder);
agentRouter.post('/write-file', handleWriteFile);
agentRouter.post('/organize/plan', handleOrganizePlan);
agentRouter.post('/organize/execute', handleOrganizeExecute);
agentRouter.post('/file/trash', handleFileTrash);
agentRouter.post('/volume', handleSetVolume);
agentRouter.get('/system-check', handleSystemCheck);
agentRouter.post('/exec', handleExec);
agentRouter.get('/screen-info', handleGetScreenInfo);
agentRouter.post('/mouse/move', handleMouseMove);
agentRouter.post('/mouse/button', handleMouseButton);
agentRouter.post('/mouse/scroll', handleMouseScroll);
agentRouter.post('/keyboard/type', handleKeyboardType);
agentRouter.post('/keyboard/key', handleKeyboardKey);
agentRouter.get('/screen/capture', handleScreenCapture);
agentRouter.get('/audit/logs', handleAuditLogs);
