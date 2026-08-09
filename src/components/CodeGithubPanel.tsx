import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle, CheckCircle2, Download, ExternalLink, GitBranch, Github, GitPullRequest,
  Loader2, Lock, RefreshCw, ShieldCheck, Upload, X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { CodeRepositoryFile } from '../types';
import {
  auditarSegredosNosArquivos,
  buscarUsuarioGithub,
  fazerMergeDoPullRequestGithub,
  GithubImportResult,
  GithubPublishResult,
  GithubRepoResumo,
  GithubSecretFinding,
  importarProjetoDoGithub,
  listarBranchesGithub,
  listarRepositoriosGithub,
  nomeDeBranchSugerido,
  nomeDeRepositorioSugerido,
  publicarProjetoNoGithub
} from '../lib/githubDoCode';

interface CodeGithubPanelProps {
  files: CodeRepositoryFile[];
  projectName: string;
  onClose: () => void;
  onNotify: (message: string, type: 'success' | 'error' | 'info') => void;
  onImportFiles: (files: CodeRepositoryFile[], result: GithubImportResult) => void;
}

const TOKEN_KEY = 'osone_code_github_token';

export const CodeGithubPanel: React.FC<CodeGithubPanelProps> = ({
  files,
  projectName,
  onClose,
  onNotify,
  onImportFiles
}) => {
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  });
  const [usuario, setUsuario] = useState<{ login: string; htmlUrl: string } | null>(null);
  const [repos, setRepos] = useState<GithubRepoResumo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [modo, setModo] = useState<'existente' | 'novo'>('existente');
  const [repoFullName, setRepoFullName] = useState('');
  const [newRepoName, setNewRepoName] = useState(() => nomeDeRepositorioSugerido(projectName));
  const [privateRepo, setPrivateRepo] = useState(false);
  const [branchName, setBranchName] = useState(() => nomeDeBranchSugerido(projectName));
  const [commitMessage, setCommitMessage] = useState(() => `Atualiza ${projectName || 'projeto'} pelo OSONE CODE`);
  const [prTitle, setPrTitle] = useState(() => `Atualização do OSONE CODE: ${projectName || 'projeto'}`);
  const [ultimoResultado, setUltimoResultado] = useState<GithubPublishResult | null>(null);
  const [fazendoMerge, setFazendoMerge] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [importBranch, setImportBranch] = useState('');
  const [importando, setImportando] = useState(false);
  const [ultimoImport, setUltimoImport] = useState<GithubImportResult | null>(null);
  const [achadosDeSegredo, setAchadosDeSegredo] = useState<GithubSecretFinding[]>([]);

  const arquivosPublicaveis = useMemo(
    () => files.filter(f => f.name.trim() && !f.name.includes('\0')),
    [files]
  );

  useEffect(() => {
    try {
      if (token.trim()) localStorage.setItem(TOKEN_KEY, token.trim());
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* chave local apenas */ }
  }, [token]);

  const conectar = async () => {
    setCarregando(true);
    try {
      const user = await buscarUsuarioGithub(token);
      setUsuario(user);
      const lista = await listarRepositoriosGithub(token);
      setRepos(lista);
      if (!repoFullName && lista[0]) {
        setRepoFullName(lista[0].fullName);
        setImportBranch(lista[0].defaultBranch);
      }
      onNotify(`GitHub conectado como ${user.login}.`, 'success');
    } catch (erro: any) {
      setUsuario(null);
      setRepos([]);
      onNotify(`Não consegui conectar ao GitHub: ${erro?.message || erro}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  const carregarBranches = async (repo = repoFullName) => {
    if (!token.trim() || !repo.trim()) return;
    try {
      const lista = await listarBranchesGithub(token, repo);
      setBranches(lista.map(b => b.name));
      const repoInfo = repos.find(r => r.fullName === repo);
      setImportBranch(atual => atual || repoInfo?.defaultBranch || lista[0]?.name || '');
    } catch {
      setBranches([]);
    }
  };

  useEffect(() => {
    const repoInfo = repos.find(r => r.fullName === repoFullName);
    if (repoInfo && !importBranch) setImportBranch(repoInfo.defaultBranch);
  }, [repoFullName, repos, importBranch]);

  const importarRepo = async () => {
    if (!repoFullName.trim()) {
      onNotify('Escolha um repositório existente para importar.', 'error');
      return;
    }
    const ok = window.confirm(
      `Importar ${repoFullName}${importBranch ? `@${importBranch}` : ''} para o projeto atual do OSONE CODE? Isso substitui os arquivos atuais deste projeto, mas o Ctrl+Z ainda pode desfazer.`
    );
    if (!ok) return;

    setImportando(true);
    setUltimoImport(null);
    try {
      const resultado = await importarProjetoDoGithub({
        token,
        repoFullName,
        branch: importBranch
      });
      setUltimoImport(resultado);
      setAchadosDeSegredo(auditarSegredosNosArquivos(resultado.files));
      onImportFiles(resultado.files, resultado);
      onNotify(
        `Importei ${resultado.files.length} arquivo(s) de ${resultado.owner}/${resultado.repo}@${resultado.branch}.`,
        'success'
      );
    } catch (erro: any) {
      onNotify(`Não consegui importar o repositório: ${erro?.message || erro}`, 'error');
    } finally {
      setImportando(false);
    }
  };

  const auditarSegredos = () => {
    const achados = auditarSegredosNosArquivos(files);
    setAchadosDeSegredo(achados);
    onNotify(
      achados.length
        ? `Auditoria encontrou ${achados.length} possível(is) segredo(s). Confira a lista antes de publicar.`
        : 'Auditoria não encontrou padrões óbvios de chave/API nos arquivos atuais.',
      achados.length ? 'error' : 'success'
    );
  };

  const publicar = async () => {
    setPublicando(true);
    setUltimoResultado(null);
    try {
      const resultado = await publicarProjetoNoGithub({
        token,
        files: arquivosPublicaveis,
        projectName,
        repoFullName: modo === 'existente' ? repoFullName : undefined,
        newRepoName: modo === 'novo' ? newRepoName : undefined,
        privateRepo,
        branchName,
        commitMessage,
        prTitle,
        prBody: [
          `Publicado pelo OSONE CODE a partir do projeto local "${projectName}".`,
          '',
          'Observações de segurança:',
          '- A API do GitHub não tem cobrança própria nesta integração; ela só respeita limites de uso/rate limits.',
          '- Se este repositório privado tiver GitHub Actions, a execução de workflows pode consumir a cota grátis da conta GitHub.',
          '- Faça merge apenas depois de revisar o diff.'
        ].join('\n')
      });
      setUltimoResultado(resultado);
      onNotify(`PR #${resultado.prNumber} criado no GitHub.`, 'success');
    } catch (erro: any) {
      onNotify(`Falha ao publicar no GitHub: ${erro?.message || erro}`, 'error');
    } finally {
      setPublicando(false);
    }
  };

  const mergePr = async () => {
    if (!ultimoResultado) return;
    const ok = window.confirm(
      `Fazer MERGE do PR #${ultimoResultado.prNumber} em ${ultimoResultado.owner}/${ultimoResultado.repo}? Esta ação altera a branch ${ultimoResultado.defaultBranch}.`
    );
    if (!ok) return;

    setFazendoMerge(true);
    try {
      await fazerMergeDoPullRequestGithub(
        token,
        ultimoResultado.owner,
        ultimoResultado.repo,
        ultimoResultado.prNumber,
        `Merge do OSONE CODE: ${projectName}`
      );
      onNotify(`Merge do PR #${ultimoResultado.prNumber} concluído.`, 'success');
    } catch (erro: any) {
      onNotify(`Não consegui fazer merge: ${erro?.message || erro}`, 'error');
    } finally {
      setFazendoMerge(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.96, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 16 }}
        className="w-full max-w-3xl rounded-3xl border border-white/10 bg-[#0b1018] shadow-2xl shadow-black/60 overflow-hidden"
      >
        <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-300 text-[11px] font-mono uppercase tracking-[0.22em]">
              <Github size={15} /> GitHub no OSONE CODE
            </div>
            <h3 className="text-xl font-semibold text-white mt-2">Ler repo, corrigir e devolver por PR</h3>
            <p className="text-sm text-zinc-400 mt-1">
              Importa arquivos do GitHub para o OSONE CODE, publica branch/PR e só faz merge com confirmação.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Fechar GitHub"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto custom-scrollbar">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-100 leading-relaxed flex gap-2">
            <ShieldCheck size={16} className="shrink-0 mt-0.5 text-emerald-300" />
            <div>
              <strong>Sem API paga:</strong> a API do GitHub não cobra por esta integração. Ela tem limites de uso.
              Atenção só ao GitHub Actions: em repositórios privados, workflows podem consumir a cota grátis da conta.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-mono">Token GitHub local</span>
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="github_pat_... ou ghp_..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
              />
              <p className="text-[11px] text-zinc-500">
                Para repo existente: Contents/Git e Pull Requests com escrita. Para criar repo novo com token fine-grained:
                Administration com escrita. Em repo privado, libere acesso ao repo privado.
              </p>
            </label>
            <button
              onClick={conectar}
              disabled={!token.trim() || carregando}
              className={cn(
                "self-start md:self-center px-4 py-2.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 transition-colors",
                token.trim() && !carregando
                  ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/25"
                  : "bg-white/[0.03] border-white/10 text-zinc-600 cursor-not-allowed"
              )}
            >
              {carregando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Conectar
            </button>
          </div>

          {usuario && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-300 flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-300" />
              Conectado como <a href={usuario.htmlUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">{usuario.login}</a>
              <span className="text-zinc-600">•</span>
              {repos.length} repositório(s) visíveis
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setModo('existente')}
              className={cn(
                "rounded-2xl border p-3 text-left transition-colors",
                modo === 'existente' ? "border-cyan-400/50 bg-cyan-500/15 text-white" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]"
              )}
            >
              <div className="text-sm font-semibold flex items-center gap-2"><GitBranch size={14} /> Repo existente</div>
              <p className="text-[11px] text-zinc-500 mt-1">Cria branch, commit e PR.</p>
            </button>
            <button
              onClick={() => setModo('novo')}
              className={cn(
                "rounded-2xl border p-3 text-left transition-colors",
                modo === 'novo' ? "border-cyan-400/50 bg-cyan-500/15 text-white" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]"
              )}
            >
              <div className="text-sm font-semibold flex items-center gap-2"><Github size={14} /> Criar novo</div>
              <p className="text-[11px] text-zinc-500 mt-1">Cria repo e abre o primeiro PR.</p>
            </button>
          </div>

          {modo === 'existente' ? (
            <label className="space-y-1.5 block">
              <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-mono">Repositório</span>
              <input
                value={repoFullName}
                onChange={e => {
                  setRepoFullName(e.target.value);
                  setImportBranch('');
                }}
                onBlur={() => carregarBranches()}
                list="osone-github-repos"
                placeholder="dono/repositorio"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
              />
              <datalist id="osone-github-repos">
                {repos.map(repo => <option key={repo.fullName} value={repo.fullName} />)}
              </datalist>
            </label>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
              <label className="space-y-1.5">
                <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-mono">Nome do novo repo</span>
                <input
                  value={newRepoName}
                  onChange={e => setNewRepoName(e.target.value)}
                  placeholder="meu-app"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
                />
              </label>
              <button
                onClick={() => setPrivateRepo(v => !v)}
                className={cn(
                  "self-end px-4 py-2.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 transition-colors",
                  privateRepo ? "border-amber-400/40 bg-amber-500/15 text-amber-100" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                )}
              >
                {privateRepo ? <Lock size={14} /> : <ShieldCheck size={14} />}
                {privateRepo ? 'Privado' : 'Público'}
              </button>
            </div>
          )}

          {modo === 'existente' && (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-cyan-100 flex items-center gap-2">
                    <Download size={15} /> Importar estado atual do GitHub
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Traz arquivos de texto/código para o OSONE CODE. Binários, `node_modules`, `dist` e arquivos grandes ficam de fora.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={importBranch}
                    onFocus={() => carregarBranches()}
                    onChange={e => setImportBranch(e.target.value)}
                    list="osone-github-branches"
                    placeholder="branch padrão"
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/60 min-w-[150px]"
                  />
                  <datalist id="osone-github-branches">
                    {branches.map(branch => <option key={branch} value={branch} />)}
                  </datalist>
                  <button
                    onClick={importarRepo}
                    disabled={importando || !token.trim() || !repoFullName.trim()}
                    className={cn(
                      "px-3 py-2 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-2 transition-colors",
                      !importando && token.trim() && repoFullName.trim()
                        ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/25"
                        : "bg-white/[0.03] border-white/10 text-zinc-600 cursor-not-allowed"
                    )}
                  >
                    {importando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Importar para o Code
                  </button>
                </div>
              </div>

              {ultimoImport && (
                <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-[11px] text-zinc-400">
                  Importado de <span className="text-cyan-200">{ultimoImport.owner}/{ultimoImport.repo}@{ultimoImport.branch}</span>
                  <span className="text-zinc-600"> • </span>
                  commit <span className="text-zinc-300">{ultimoImport.commitSha.slice(0, 8)}</span>
                  <span className="text-zinc-600"> • </span>
                  ignorados: {ultimoImport.skipped.ignored}, binários/grandes: {ultimoImport.skipped.binaryOrLarge}
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-amber-100 flex items-center gap-2">
                  <AlertTriangle size={15} /> Auditoria rápida de chaves vazadas
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Procura padrões comuns como Stripe, GitHub, OpenAI, Anthropic, Google/Firebase e chaves privadas. Prévia sempre mascarada.
                </p>
              </div>
              <button
                onClick={auditarSegredos}
                className="px-3 py-2 rounded-xl border border-amber-400/35 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 text-xs font-mono font-bold flex items-center justify-center gap-2"
              >
                <AlertTriangle size={14} />
                Buscar vazamentos
              </button>
            </div>

            {achadosDeSegredo.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {achadosDeSegredo.slice(0, 12).map((achado, i) => (
                  <div key={`${achado.file}-${achado.line}-${i}`} className="rounded-xl border border-red-400/20 bg-red-500/[0.07] p-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-2 text-red-100">
                      <span className="font-semibold">{achado.label}</span>
                      <span className="text-red-300/70">{achado.file}:{achado.line}</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-full border",
                        achado.severity === 'alta' ? "border-red-300/30 text-red-100" : "border-amber-300/30 text-amber-100"
                      )}>
                        {achado.severity}
                      </span>
                    </div>
                    <code className="block mt-1 text-red-100/80 break-all">{achado.preview}</code>
                  </div>
                ))}
                {achadosDeSegredo.length > 12 && (
                  <div className="text-[11px] text-zinc-500">
                    Mostrando 12 de {achadosDeSegredo.length}. Use busca do projeto para ir aos demais.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-mono">Branch</span>
              <input
                value={branchName}
                onChange={e => setBranchName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-mono">Título do PR</span>
              <input
                value={prTitle}
                onChange={e => setPrTitle(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
              />
            </label>
          </div>

          <label className="space-y-1.5 block">
            <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-mono">Mensagem do commit</span>
            <input
              value={commitMessage}
              onChange={e => setCommitMessage(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
            />
          </label>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-400 flex items-start gap-2">
            <AlertTriangle size={15} className="text-amber-300 shrink-0 mt-0.5" />
            <div>
              Serão publicados {arquivosPublicaveis.length} arquivo(s) do projeto atual. Merge nunca acontece sozinho:
              depois do PR criado, você precisa apertar o botão e confirmar.
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button
              onClick={publicar}
              disabled={publicando || !token.trim() || (modo === 'existente' ? !repoFullName.trim() : !newRepoName.trim())}
              className={cn(
                "px-4 py-3 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-2 transition-colors",
                !publicando && token.trim() && (modo === 'existente' ? repoFullName.trim() : newRepoName.trim())
                  ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/25"
                  : "bg-white/[0.03] border-white/10 text-zinc-600 cursor-not-allowed"
              )}
            >
              {publicando ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              Publicar branch e abrir PR
            </button>

            {ultimoResultado && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <a
                  href={ultimoResultado.prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20 flex items-center gap-2"
                >
                  <GitPullRequest size={14} /> Ver PR #{ultimoResultado.prNumber} <ExternalLink size={12} />
                </a>
                <button
                  onClick={mergePr}
                  disabled={fazendoMerge}
                  className="px-3 py-2 rounded-xl border border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {fazendoMerge ? <Loader2 size={14} className="animate-spin" /> : <GitPullRequest size={14} />}
                  Merge com confirmação
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
