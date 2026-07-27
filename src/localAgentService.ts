import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { exec } from 'child_process';
import { Request, Response, NextFunction, Router } from 'express';

// ============================================================================
// SEÇÃO 1: CONFIGURAÇÃO E INICIALIZAÇÃO
// ============================================================================

const CONFIG_PATH = path.join(process.cwd(), 'config.json');
const AUDIT_LOG_PATH = path.join(process.cwd(), 'audit.log');
const TRASH_DIR_PATH = path.join(process.cwd(), 'trash');

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
  apps: Record<string, { win32?: string; linux?: string }>;
  allowedFolders: Record<string, string>;
}

export let CONFIG: LocalAgentConfig = {
  port: 3000,
  token: '',
  allowedOrigin: '*',
  apps: {
    spotify: {
      win32: 'start spotify:',
      linux: 'spotify'
    },
    vscode: {
      win32: 'code',
      linux: 'code'
    },
    filemanager: {
      win32: 'explorer',
      linux: 'xdg-open .'
    },
    terminal: {
      win32: 'start cmd',
      linux: 'gnome-terminal'
    },
    browser: {
      win32: 'start https://google.com',
      linux: 'xdg-open https://google.com'
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

  // Se token não existir ou estiver vazio, gera um novo token criptograficamente forte
  if (!CONFIG.token || CONFIG.token.trim() === '') {
    CONFIG.token = crypto.randomBytes(32).toString('hex');
    saveConfig();
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
  const currentPlatform = process.platform === 'win32' ? 'win32' : 'linux';
  return res.status(200).json({
    status: 'online',
    agentName: 'osone-local-agent',
    version: '1.0.0',
    platform: currentPlatform,
    systemOS: os.type(),
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
    const { folderKey, fileName, confirmed } = req.body || {};

    if (confirmed !== true) {
      return res.status(400).json({
        error: 'Confirmação necessária para mover para a lixeira. Envie confirmed: true.'
      });
    }

    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ error: 'O nome do arquivo (fileName) é obrigatório.' });
    }

    const { targetPath: safeSource } = resolveSafePath(folderKey, fileName);

    if (!fs.existsSync(safeSource)) {
      return res.status(404).json({ error: `Arquivo '${fileName}' não foi encontrado em '${folderKey}'.` });
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

// Mapeamento das rotas no router
agentRouter.get('/status', handleStatus);
agentRouter.post('/open-app', handleOpenApp);
agentRouter.post('/organize/plan', handleOrganizePlan);
agentRouter.post('/organize/execute', handleOrganizeExecute);
agentRouter.post('/file/trash', handleFileTrash);
agentRouter.get('/audit/logs', handleAuditLogs);
