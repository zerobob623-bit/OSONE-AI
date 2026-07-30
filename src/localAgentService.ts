import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { exec, spawn } from 'child_process';
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

    // Validação estrita do Jail e permissão da pasta base
    const { targetPath: safeFolderPath } = resolveSafePath(parentFolder, folderName);

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

    // Validação de pasta autorizada em allowedFolders
    if (!CONFIG.allowedFolders || !CONFIG.allowedFolders[folder]) {
      logAudit('WARN', 'WRITE_FILE_REJECTED', `Pasta '${folder}' não está autorizada em allowedFolders.`, { folder, fileName });
      return res.status(403).json({ error: `A pasta '${folder}' não está na lista de allowedFolders autorizadas.` });
    }

    const fileContent = String(content);

    // Validação de Jail de diretório usando resolveSafePath()
    const { targetPath: caminhoValidado } = resolveSafePath(folder, fileName);

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

function runShell(cmd: string, timeoutMs: number = 10000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
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
  explorer: { win32: 'explorer', darwin: 'open .', linux: ['nautilus .', 'dolphin .', 'pcmanfm .', 'thunar .', 'nemo .', 'xdg-open .'] },
  filemanager: { win32: 'explorer', darwin: 'open .', linux: ['nautilus .', 'dolphin .', 'pcmanfm .', 'thunar .', 'nemo .', 'xdg-open .'] },
  gerenciador_de_arquivos: { win32: 'explorer', darwin: 'open .', linux: ['nautilus .', 'dolphin .', 'pcmanfm .', 'thunar .', 'nemo .', 'xdg-open .'] },
  calculator: { win32: 'calc', darwin: 'open -a Calculator', linux: ['gnome-calculator', 'kcalc', 'qalculate-gtk', 'xcalc'] },
  calculadora: { win32: 'calc', darwin: 'open -a Calculator', linux: ['gnome-calculator', 'kcalc', 'qalculate-gtk', 'xcalc'] },
  terminal: { win32: 'start cmd', darwin: 'open -a Terminal', linux: ['gnome-terminal', 'konsole', 'xterm', 'xfce4-terminal'] },
};

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
function launchDetached(command: string): void {
  const child = spawn(command, { shell: true, detached: true, stdio: 'ignore' });
  child.unref();
}

/**
 * Tenta, em ordem, cada candidato de comando cujo binário existe no PATH, e lança o primeiro
 * encontrado em segundo plano (sem esperar ele fechar).
 */
async function tryCommandsInOrder(commands: string[]): Promise<{ command: string }> {
  for (const cmd of commands) {
    const binary = cmd.split(' ')[0];
    if (await binaryExists(binary)) {
      launchDetached(cmd);
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

  try {
    if (alias) {
      if (platform === 'linux') {
        const { command } = await tryCommandsInOrder(alias.linux);
        logAudit('INFO', 'OPEN_ANY_SUCCESS', `'${target}' aberto com sucesso via alias`, { target, command });
        return res.status(200).json({ message: `'${target}' aberto com sucesso.`, target });
      }
      const command = platform === 'win32' ? `start "" ${alias.win32}` : `${alias.darwin}`;
      await runShell(command, 4000);
      logAudit('INFO', 'OPEN_ANY_SUCCESS', `'${target}' aberto com sucesso via alias`, { target, command });
      return res.status(200).json({ message: `'${target}' aberto com sucesso.`, target });
    }

    const safeTarget = target.replace(/"/g, '\\"');
    const command = platform === 'win32'
      ? `start "" "${safeTarget}"`
      : platform === 'darwin'
        ? `open "${safeTarget}"`
        : `xdg-open "${safeTarget}"`;
    await runShell(command, 4000);
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
  const projectDir = process.cwd();
  if (!command.includes(projectDir) && !command.includes('OSONE-AI')) return false;
  const writeVerbs = /\b(rm|del|mv|move|cp\s+-f|sed\s+-i|git\s+(commit|push)|npm\s+publish)\b|>>?\s|\btee\b/i;
  return writeVerbs.test(command);
}

/**
 * POST /exec - Executa um comando de terminal na máquina local. Comandos classificados como
 * "importantes" por classifyCommandRisk() exigem 'confirmed: true' no corpo da requisição
 * (o cliente mostra um modal de confirmação para o usuário antes de reenviar com confirmed).
 */
const handleExec = (req: Request, res: Response) => {
  const command = (req.body?.command || '').toString();
  const confirmed = req.body?.confirmed === true;

  if (!command.trim()) {
    return res.status(400).json({ error: "Parâmetro 'command' é obrigatório." });
  }

  if (targetsOwnInstallation(command)) {
    logAudit('SECURITY', 'EXEC_BLOCKED_SELF', `Comando bloqueado por tentar modificar a própria instalação do OSONE`, { command });
    return res.status(403).json({ error: 'Bloqueado: este comando parece tentar modificar a própria instalação do OSONE, o que não é permitido.' });
  }

  const risk = classifyCommandRisk(command);
  if (risk && !confirmed) {
    logAudit('WARN', 'EXEC_REQUIRES_CONFIRMATION', `Comando classificado como importante, aguardando confirmação`, { command, risk });
    return res.status(400).json({
      error: 'Confirmação explícita obrigatória para este comando.',
      requiresConfirmation: true,
      reason: risk
    });
  }

  exec(command, { timeout: 30000, maxBuffer: 1024 * 1024 * 5, windowsHide: true }, (error, stdout, stderr) => {
    const success = !error;
    logAudit(success ? 'INFO' : 'ERROR', 'EXEC_COMMAND', `Comando executado: ${success ? 'sucesso' : 'falha'}`, {
      command,
      confirmed,
      exitCode: (error as any)?.code
    });

    if (error && (error as any).killed) {
      return res.status(500).json({ error: 'O comando excedeu o tempo limite de 30 segundos e foi encerrado.' });
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
const handleGetScreenInfo = async (_req: Request, res: Response) => {
  const platform = process.platform;
  try {
    if (platform === 'linux') {
      const { stdout } = await runShell(`xdotool getdisplaygeometry`);
      const [width, height] = stdout.trim().split(/\s+/).map(Number);
      return res.status(200).json({ width, height, offsetX: 0, offsetY: 0, monitors: 'union' });
    }
    if (platform === 'win32') {
      const script = `Add-Type -AssemblyName System.Windows.Forms; $vs = [System.Windows.Forms.SystemInformation]::VirtualScreen; Write-Output "$($vs.Width)|$($vs.Height)|$($vs.X)|$($vs.Y)"`;
      const { stdout } = await runShell(`powershell -NoProfile -Command "${script}"`);
      const [width, height, offsetX, offsetY] = stdout.trim().split('|').map(Number);
      return res.status(200).json({ width, height, offsetX, offsetY, monitors: 'union' });
    }
    return res.status(501).json({ error: `Controle de mouse ainda não suportado na plataforma '${platform}'.` });
  } catch (err: any) {
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

// Mapeamento das rotas no router
agentRouter.get('/status', handleStatus);
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
agentRouter.get('/audit/logs', handleAuditLogs);
