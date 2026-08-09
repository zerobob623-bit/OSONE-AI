import { CodeRepositoryFile } from '../types';

export interface GithubRepoResumo {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  updatedAt?: string;
}

export interface GithubPublishOptions {
  token: string;
  files: CodeRepositoryFile[];
  projectName: string;
  repoFullName?: string;
  newRepoName?: string;
  privateRepo?: boolean;
  branchName: string;
  commitMessage: string;
  prTitle: string;
  prBody?: string;
}

export interface GithubPublishResult {
  owner: string;
  repo: string;
  branch: string;
  defaultBranch: string;
  commitSha: string;
  prNumber: number;
  prUrl: string;
  repoUrl: string;
}

export interface GithubBranchResumo {
  name: string;
  sha: string;
  protected: boolean;
}

export interface GithubImportOptions {
  token: string;
  repoFullName: string;
  branch?: string;
  maxFiles?: number;
  maxBytesPerFile?: number;
}

export interface GithubImportResult {
  owner: string;
  repo: string;
  branch: string;
  defaultBranch: string;
  commitSha: string;
  files: CodeRepositoryFile[];
  skipped: {
    binaryOrLarge: number;
    ignored: number;
    totalTreeFiles: number;
  };
}

export interface GithubSecretFinding {
  file: string;
  line: number;
  label: string;
  severity: 'alta' | 'media';
  preview: string;
}

const GITHUB_API = 'https://api.github.com';
const LIMITE_ARQUIVOS_IMPORT = 180;
const LIMITE_BYTES_ARQUIVO = 240 * 1024;

const cabecalhosGithub = (token: string) => ({
  Authorization: `Bearer ${token.trim()}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28'
});

const erroGithub = async (res: Response): Promise<Error> => {
  const dados = await res.json().catch(() => null);
  const mensagem = dados?.message || `GitHub retornou HTTP ${res.status}`;
  const detalhes = Array.isArray(dados?.errors)
    ? dados.errors.map((e: any) => e?.message || e?.code || JSON.stringify(e)).filter(Boolean).join('; ')
    : '';
  return new Error(detalhes ? `${mensagem}: ${detalhes}` : mensagem);
};

async function githubFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      ...cabecalhosGithub(token),
      ...(init?.headers || {})
    }
  });
  if (!res.ok) throw await erroGithub(res);
  if (res.status === 204) return undefined as T;
  return await res.json() as T;
}

const caminhoSeguro = (nome: string): string | null => {
  const limpo = nome.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!limpo || limpo.includes('\0')) return null;
  if (limpo.split('/').some(parte => !parte || parte === '.' || parte === '..')) return null;
  return limpo;
};

const nomeRepoSeguro = (nome: string): string => {
  const seguro = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return seguro || 'osone-code-project';
};

export const nomeDeRepositorioSugerido = (projectName: string): string =>
  nomeRepoSeguro(projectName || 'osone-code-project').toLowerCase();

export const nomeDeBranchSugerido = (projectName: string): string => {
  const base = nomeRepoSeguro(projectName || 'osone-code').toLowerCase();
  return `osone/${base}-${new Date().toISOString().slice(0, 10)}`;
};

export const normalizarRepoFullName = (entrada: string): { owner: string; repo: string } => {
  const texto = entrada.trim()
    .replace(/^https:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/g, '');
  const partes = texto.split('/').filter(Boolean);
  if (partes.length !== 2 || !partes[0] || !partes[1]) {
    throw new Error('Informe o repositório no formato dono/repositorio.');
  }
  return { owner: partes[0], repo: partes[1] };
};

const arquivosParaTree = (files: CodeRepositoryFile[]) => {
  const vistos = new Set<string>();
  const tree = files.flatMap(file => {
    const path = caminhoSeguro(file.name);
    if (!path || vistos.has(path)) return [];
    vistos.add(path);
    return [{
      path,
      mode: '100644',
      type: 'blob',
      content: file.content ?? ''
    }];
  });

  if (!tree.length) {
    tree.push({
      path: 'README.md',
      mode: '100644',
      type: 'blob',
      content: '# Projeto OSONE CODE\n\nPublicado pelo OSONE CODE.\n'
    });
  }

  return tree;
};

const EXTENSOES_DE_TEXTO = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.html', '.htm', '.css', '.scss', '.json', '.md', '.txt',
  '.yml', '.yaml', '.toml', '.env', '.example', '.gitignore', '.sql', '.py', '.rb', '.go',
  '.rs', '.java', '.kt', '.swift', '.php', '.c', '.cpp', '.h', '.hpp', '.cs', '.sh',
  '.bat', '.ps1', '.xml', '.svg', '.vue', '.svelte'
]);

const DIRETORIOS_IGNORADOS = /(^|\/)(node_modules|dist|build|coverage|vendor|\.git|\.next|\.nuxt|android\/app\/build|ios\/Pods)(\/|$)/i;
const EXTENSOES_BINARIAS = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|rar|7z|exe|dll|so|dylib|apk|aab|appimage|mp3|wav|ogg|mp4|mov|avi|ttf|otf|woff2?)$/i;

const extDoCaminho = (caminho: string): string => {
  const nome = caminho.split('/').pop() || '';
  const ponto = nome.lastIndexOf('.');
  return ponto === -1 ? '' : nome.slice(ponto).toLowerCase();
};

const arquivoImportavel = (path: string, size = 0, limiteBytes = LIMITE_BYTES_ARQUIVO): 'ok' | 'ignored' | 'binaryOrLarge' => {
  if (!caminhoSeguro(path) || DIRETORIOS_IGNORADOS.test(path)) return 'ignored';
  if (size > limiteBytes || EXTENSOES_BINARIAS.test(path)) return 'binaryOrLarge';
  const ext = extDoCaminho(path);
  if (!ext && /(^|\/)(Dockerfile|Makefile|Procfile|LICENSE|README)$/i.test(path)) return 'ok';
  if (EXTENSOES_DE_TEXTO.has(ext)) return 'ok';
  return 'ignored';
};

const linguagemDoGithub = (path: string): string => {
  const ext = extDoCaminho(path);
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.css' || ext === '.scss') return 'css';
  if (ext === '.py') return 'python';
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.json') return 'json';
  if (ext === '.md') return 'markdown';
  if (ext === '.sql') return 'sql';
  return 'javascript';
};

const decodificarBase64Utf8 = (conteudo: string): string => {
  const limpo = (conteudo || '').replace(/\s+/g, '');
  const binario = atob(limpo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
};

async function obterCommitDaBranch(token: string, owner: string, repo: string, branch: string): Promise<{ sha: string; treeSha: string }> {
  const ref = await obterRef(token, owner, repo, branch);
  if (!ref?.object?.sha) throw new Error(`Branch "${branch}" não encontrada.`);
  const commit = await githubFetch<any>(token, `/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
  return { sha: ref.object.sha, treeSha: commit.tree?.sha };
}

export async function buscarUsuarioGithub(token: string): Promise<{ login: string; htmlUrl: string }> {
  const user = await githubFetch<any>(token, '/user');
  return { login: user.login, htmlUrl: user.html_url };
}

export async function listarRepositoriosGithub(token: string): Promise<GithubRepoResumo[]> {
  const repos = await githubFetch<any[]>(
    token,
    '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member'
  );
  return repos.map(repo => ({
    fullName: repo.full_name,
    private: !!repo.private,
    defaultBranch: repo.default_branch || 'main',
    htmlUrl: repo.html_url,
    updatedAt: repo.updated_at
  }));
}

export async function listarBranchesGithub(token: string, repoFullName: string): Promise<GithubBranchResumo[]> {
  const { owner, repo } = normalizarRepoFullName(repoFullName);
  const branches = await githubFetch<any[]>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`
  );
  return branches.map(branch => ({
    name: branch.name,
    sha: branch.commit?.sha || '',
    protected: !!branch.protected
  }));
}

export async function importarProjetoDoGithub(opts: GithubImportOptions): Promise<GithubImportResult> {
  const token = opts.token.trim();
  if (!token) throw new Error('Informe um token do GitHub.');

  const { owner, repo } = normalizarRepoFullName(opts.repoFullName);
  const repoInfo = await obterRepositorio(token, owner, repo);
  const defaultBranch = repoInfo.default_branch || 'main';
  const branch = (opts.branch || '').trim() || defaultBranch;
  const limiteArquivos = Math.max(1, Math.min(opts.maxFiles || LIMITE_ARQUIVOS_IMPORT, LIMITE_ARQUIVOS_IMPORT));
  const limiteBytes = Math.max(8 * 1024, Math.min(opts.maxBytesPerFile || LIMITE_BYTES_ARQUIVO, LIMITE_BYTES_ARQUIVO));
  const commit = await obterCommitDaBranch(token, owner, repo, branch);

  const tree = await githubFetch<any>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(commit.treeSha)}?recursive=1`
  );

  const blobs = (tree.tree || []).filter((item: any) => item.type === 'blob' && typeof item.path === 'string');
  let binaryOrLarge = 0;
  let ignored = 0;
  const escolhidos: any[] = [];

  for (const item of blobs) {
    const status = arquivoImportavel(item.path, item.size || 0, limiteBytes);
    if (status === 'binaryOrLarge') {
      binaryOrLarge++;
      continue;
    }
    if (status === 'ignored') {
      ignored++;
      continue;
    }
    if (escolhidos.length < limiteArquivos) escolhidos.push(item);
    else ignored++;
  }

  const files: CodeRepositoryFile[] = [];
  for (let i = 0; i < escolhidos.length; i++) {
    const item = escolhidos[i];
    const blob = await githubFetch<any>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(item.sha)}`
    );
    if (blob.encoding !== 'base64') {
      ignored++;
      continue;
    }
    files.push({
      id: `github-${commit.sha.slice(0, 8)}-${i}`,
      name: item.path,
      language: linguagemDoGithub(item.path),
      content: decodificarBase64Utf8(blob.content || ''),
      updatedAt: Date.now(),
      isMain: /(^|\/)index\.html?$/i.test(item.path)
    });
  }

  if (!files.length) {
    throw new Error('Não encontrei arquivos de texto seguros para importar neste repositório/branch.');
  }

  return {
    owner,
    repo,
    branch,
    defaultBranch,
    commitSha: commit.sha,
    files,
    skipped: {
      binaryOrLarge,
      ignored,
      totalTreeFiles: blobs.length
    }
  };
}

const PADROES_DE_SEGREDO: Array<{ label: string; severity: 'alta' | 'media'; re: RegExp }> = [
  { label: 'Stripe secret key', severity: 'alta', re: /\bsk_(live|test)_[A-Za-z0-9]{16,}/g },
  { label: 'Stripe webhook secret', severity: 'alta', re: /\bwhsec_[A-Za-z0-9]{16,}/g },
  { label: 'Google/Firebase API key', severity: 'media', re: /\bAIza[0-9A-Za-z_-]{20,}/g },
  { label: 'GitHub token', severity: 'alta', re: /\b(?:ghp|github_pat|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}/g },
  { label: 'OpenAI API key', severity: 'alta', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { label: 'Anthropic API key', severity: 'alta', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { label: 'AWS access key id', severity: 'alta', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: 'Firebase/Admin private key', severity: 'alta', re: /-----BEGIN PRIVATE KEY-----/g },
  { label: 'Private key block', severity: 'alta', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g }
];

function mascararLinhaComSegredo(linha: string): string {
  let saida = linha;
  for (const padrao of PADROES_DE_SEGREDO) {
    saida = saida.replace(padrao.re, (match) => {
      if (match.length <= 12) return '••••';
      return `${match.slice(0, 6)}…${match.slice(-4)}`;
    });
  }
  return saida.trim().slice(0, 180);
}

export function auditarSegredosNosArquivos(files: CodeRepositoryFile[]): GithubSecretFinding[] {
  const achados: GithubSecretFinding[] = [];
  for (const file of files || []) {
    const linhas = String(file.content || '').split(/\r?\n/);
    linhas.forEach((linha, indice) => {
      for (const padrao of PADROES_DE_SEGREDO) {
        padrao.re.lastIndex = 0;
        if (!padrao.re.test(linha)) continue;
        achados.push({
          file: file.name,
          line: indice + 1,
          label: padrao.label,
          severity: padrao.severity,
          preview: mascararLinhaComSegredo(linha)
        });
      }
    });
  }
  return achados.slice(0, 80);
}

async function criarRepositorio(token: string, nome: string, privado: boolean): Promise<any> {
  return githubFetch<any>(token, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: nomeRepoSeguro(nome),
      private: privado,
      auto_init: false,
      description: 'Projeto publicado pelo OSONE CODE.'
    })
  });
}

async function obterRepositorio(token: string, owner: string, repo: string): Promise<any> {
  return githubFetch<any>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
}

async function obterRef(token: string, owner: string, repo: string, branch: string): Promise<any | null> {
  try {
    return await githubFetch<any>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`
    );
  } catch (erro: any) {
    if (/not found/i.test(String(erro?.message || erro))) return null;
    throw erro;
  }
}

export async function publicarProjetoNoGithub(opts: GithubPublishOptions): Promise<GithubPublishResult> {
  const token = opts.token.trim();
  if (!token) throw new Error('Informe um token do GitHub.');

  let repoInfo: any;
  if (opts.newRepoName?.trim()) {
    repoInfo = await criarRepositorio(token, opts.newRepoName, !!opts.privateRepo);
  } else if (opts.repoFullName?.trim()) {
    const alvo = normalizarRepoFullName(opts.repoFullName);
    repoInfo = await obterRepositorio(token, alvo.owner, alvo.repo);
  } else {
    throw new Error('Escolha um repositório existente ou informe um nome para criar um novo.');
  }

  const owner = repoInfo.owner?.login || normalizarRepoFullName(repoInfo.full_name).owner;
  const repo = repoInfo.name || normalizarRepoFullName(repoInfo.full_name).repo;
  const defaultBranch = repoInfo.default_branch || 'main';
  const branch = opts.branchName.trim() || nomeDeBranchSugerido(opts.projectName);
  const treeEntries = arquivosParaTree(opts.files);

  const branchRef = await obterRef(token, owner, repo, branch);
  let parentSha: string | null = null;
  let baseTreeSha: string | null = null;

  if (branchRef?.object?.sha) {
    parentSha = branchRef.object.sha;
    const commit = await githubFetch<any>(token, `/repos/${owner}/${repo}/git/commits/${parentSha}`);
    baseTreeSha = commit.tree?.sha || null;
  } else {
    const baseRef = await obterRef(token, owner, repo, defaultBranch);
    if (baseRef?.object?.sha) {
      parentSha = baseRef.object.sha;
      const commit = await githubFetch<any>(token, `/repos/${owner}/${repo}/git/commits/${parentSha}`);
      baseTreeSha = commit.tree?.sha || null;
      await githubFetch<any>(token, `/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: parentSha })
      });
    }
  }

  const tree = await githubFetch<any>(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
      tree: treeEntries
    })
  });

  const commit = await githubFetch<any>(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: opts.commitMessage.trim() || `Atualiza projeto pelo OSONE CODE`,
      tree: tree.sha,
      parents: parentSha ? [parentSha] : []
    })
  });

  if (branchRef?.object?.sha || parentSha) {
    await githubFetch<any>(token, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false })
    });
  } else {
    await githubFetch<any>(token, `/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha })
    });
  }

  const pr = await githubFetch<any>(token, `/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: opts.prTitle.trim() || `Atualização do OSONE CODE`,
      head: branch,
      base: defaultBranch,
      body: opts.prBody || [
        'Publicado pelo OSONE CODE.',
        '',
        '- API do GitHub usada sem cobrança própria; sujeita apenas aos limites gratuitos/rate limits do GitHub.',
        '- Revise os arquivos antes de fazer merge.'
      ].join('\n'),
      draft: false
    })
  });

  return {
    owner,
    repo,
    branch,
    defaultBranch,
    commitSha: commit.sha,
    prNumber: pr.number,
    prUrl: pr.html_url,
    repoUrl: repoInfo.html_url || `https://github.com/${owner}/${repo}`
  };
}

export async function fazerMergeDoPullRequestGithub(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  message?: string
): Promise<{ merged: boolean; sha?: string; message?: string }> {
  return githubFetch<any>(token, `/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
    method: 'PUT',
    body: JSON.stringify({
      merge_method: 'squash',
      commit_title: message || `Merge PR #${prNumber} pelo OSONE CODE`
    })
  });
}
