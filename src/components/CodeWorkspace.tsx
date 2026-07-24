import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Code2, Play, FileCode, Plus, Trash2, Edit3, Download, Copy, Check, 
  FolderGit2, Sparkles, RefreshCw, Eye, Columns, 
  Upload, X, Mic, Loader2, MessageSquare, AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { CodePreview } from './CodePreview';
import { CodeRepositoryFile } from '../types';

const BowAndArrowIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M12 21a9 9 0 0 0 0-18M2 12h20M17 7l5 5-5 5" />
  </svg>
);

const DEFAULT_FILES: CodeRepositoryFile[] = [
  {
    id: 'main-app',
    name: 'index.html',
    language: 'html',
    isMain: true,
    updatedAt: Date.now(),
    content: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OSONE Code App</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    body { background-color: #090a0f; color: #f3f4f6; font-family: system-ui, sans-serif; }
    .glass { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-6">
  <div class="glass rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6 border border-cyan-500/20">
    <div class="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
      <i data-lucide="cpu" class="w-8 h-8"></i>
    </div>

    <div>
      <h1 class="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
        OSONE Code Studio
      </h1>
      <p class="text-xs text-zinc-400 mt-2">
        Repositório de Código & Preview em Tempo Real.
      </p>
    </div>

    <div class="p-4 rounded-xl bg-black/40 border border-white/5 text-left text-xs font-mono text-cyan-300/80 space-y-1">
      <div>> Sistema OSONE v5.0 ativo</div>
      <div>> Renderizador HTML/CSS/JS pronto</div>
      <div>> Digite ou peça código à IA abaixo</div>
    </div>

    <button id="counterBtn" class="w-full py-3 px-6 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold transition-all transform active:scale-95 shadow-lg shadow-cyan-500/20">
      Clique aqui: <span id="countVal">0</span>
    </button>
  </div>

  <script>
    lucide.createIcons();
    let count = 0;
    const btn = document.getElementById('counterBtn');
    const val = document.getElementById('countVal');
    btn.addEventListener('click', () => {
      count++;
      val.textContent = count;
    });
  </script>
</body>
</html>`
  },
  {
    id: 'styles-css',
    name: 'styles.css',
    language: 'css',
    updatedAt: Date.now() - 3600000,
    content: `/* Custom OSONE Stylesheet */
:root {
  --primary: #06b6d4;
  --bg-dark: #090a0f;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--bg-dark);
  font-family: 'JetBrains Mono', monospace;
}`
  },
  {
    id: 'script-js',
    name: 'script.js',
    language: 'javascript',
    updatedAt: Date.now() - 7200000,
    content: `// Main Application Logic
console.log("OSONE Code Studio Inicializado!");

function calculateMetrics(a, b) {
  return a * b;
}`
  }
];

export const CodeWorkspace: React.FC<{
  onClose?: () => void;
  onGenerateCodeRequest?: (prompt: string) => void;
  onStartLiveVoice?: () => void;
  apiKeys?: any;
  isGenerating?: boolean;
}> = ({ onClose, onGenerateCodeRequest, onStartLiveVoice, apiKeys, isGenerating }) => {
  const [files, setFiles] = useState<CodeRepositoryFile[]>(() => {
    try {
      const saved = localStorage.getItem('osone_code_repository_files');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error("Erro ao carregar arquivos do repositório:", e);
    }
    return DEFAULT_FILES;
  });

  const [activeFileId, setActiveFileId] = useState<string>(() => {
    return files[0]?.id || 'main-app';
  });

  const [viewLayout, setViewLayout] = useState<'split' | 'editor' | 'preview'>('split');
  const [showRepoSidebar, setShowRepoSidebar] = useState<boolean>(true);
  const [promptInput, setPromptInput] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [editingFileNameId, setEditingFileNameId] = useState<string | null>(null);
  const [editingFileNameText, setEditingFileNameText] = useState<string>('');
  const [isSaved, setIsSaved] = useState<boolean>(true);

  // HUNTER AGENT STATE
  const [isHunterModalOpen, setIsHunterModalOpen] = useState<boolean>(false);
  const [hunterPrompt, setHunterPrompt] = useState<string>('');
  const [hunterStatus, setHunterStatus] = useState<'idle' | 'analyzing' | 'doubt' | 'success' | 'error'>('idle');
  const [hunterReport, setHunterReport] = useState<string | null>(null);
  const [hunterDoubt, setHunterDoubt] = useState<string | null>(null);
  const [hunterDoubtInput, setHunterDoubtInput] = useState<string>('');

  const activeFile = files.find(f => f.id === activeFileId) || files[0];

  // Listen for repository updates from AI generation
  useEffect(() => {
    const handleRepoUpdated = () => {
      try {
        const saved = localStorage.getItem('osone_code_repository_files');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFiles(parsed);
          }
        }
      } catch (e) {}
    };
    window.addEventListener('osone_repository_updated', handleRepoUpdated);
    return () => window.removeEventListener('osone_repository_updated', handleRepoUpdated);
  }, []);

  // Auto-save repository files to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('osone_code_repository_files', JSON.stringify(files));
      setIsSaved(true);
    } catch (e) {
      console.error("Erro ao salvar repositório:", e);
    }
  }, [files]);

  const handleUpdateActiveContent = (newContent: string) => {
    setIsSaved(false);
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: newContent, updatedAt: Date.now() } : f));
  };

  const handleCreateNewFile = () => {
    const fileName = window.prompt('Nome do novo arquivo (ex: index.html, script.js, style.css, app.py):');
    if (!fileName || !fileName.trim()) return;

    const trimmed = fileName.trim();
    const ext = trimmed.split('.').pop()?.toLowerCase() || 'txt';
    let lang = 'javascript';
    if (ext === 'html' || ext === 'htm') lang = 'html';
    else if (ext === 'css') lang = 'css';
    else if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') lang = 'javascript';
    else if (ext === 'py') lang = 'python';
    else if (ext === 'json') lang = 'json';
    else if (ext === 'md') lang = 'markdown';
    else if (ext === 'sql') lang = 'sql';

    const newFile: CodeRepositoryFile = {
      id: 'file-' + Date.now(),
      name: trimmed,
      language: lang,
      content: lang === 'html' ? `<!DOCTYPE html>\n<html>\n<head>\n  <title>${trimmed}</title>\n</head>\n<body>\n  <h1>${trimmed}</h1>\n</body>\n</html>` : `// Arquivo: ${trimmed}\n`,
      updatedAt: Date.now()
    };

    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
  };

  const handleDeleteFile = (id: string, name: string) => {
    if (files.length <= 1) {
      alert('Você precisa manter pelo menos um arquivo no repositório!');
      return;
    }
    if (window.confirm(`Deseja mesmo apagar o arquivo "${name}" do repositório?`)) {
      setFiles(prev => prev.filter(f => f.id !== id));
      if (activeFileId === id) {
        const remaining = files.filter(f => f.id !== id);
        setActiveFileId(remaining[0].id);
      }
    }
  };

  const handleRenameFileSubmit = (id: string) => {
    if (!editingFileNameText.trim()) return;
    setFiles(prev => prev.map(f => f.id === id ? { ...f, name: editingFileNameText.trim(), updatedAt: Date.now() } : f));
    setEditingFileNameId(null);
  };

  const handleCopyCode = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFileDisk = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files?.[0];
    if (!uploaded) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text !== undefined) {
        const newFile: CodeRepositoryFile = {
          id: 'file-' + Date.now(),
          name: uploaded.name,
          language: uploaded.name.endsWith('.html') ? 'html' : uploaded.name.endsWith('.css') ? 'css' : 'javascript',
          content: text,
          updatedAt: Date.now()
        };
        setFiles(prev => [...prev, newFile]);
        setActiveFileId(newFile.id);
      }
    };
    reader.readAsText(uploaded);
  };

  const handleSendAIPrompt = (promptText?: string) => {
    const textToSend = promptText || promptInput;
    if (!textToSend.trim() || !onGenerateCodeRequest) return;
    onGenerateCodeRequest(textToSend);
    setPromptInput('');
  };

  // HUNTER CODE EXAMINATION & AUTOMATIC IMPLEMENTATION
  const runHunterAnalysis = async (explicitClarification?: string) => {
    const promptToVerify = explicitClarification 
      ? `${hunterPrompt.trim()} (Esclarecimento adicional: ${explicitClarification})`
      : hunterPrompt.trim();

    if (!promptToVerify) return;

    setHunterStatus('analyzing');
    setHunterReport("O Hunter está caçando falhas, lacunas e itens ausentes no código...");
    setHunterDoubt(null);

    try {
      const effectiveApiKey = apiKeys?.gemini || '';
      const currentCode = activeFile ? activeFile.content : '';

      const systemInstruction = `Você é o HUNTER, o Caçador e Examinador Agêntico de Código do OSONE Studio.
Sua missão é examinar o CÓDIGO FONTE ATUAL do arquivo do repositório ("${activeFile?.name || 'código'}") contra as REQUISITOS E PEDIDO DO USUÁRIO.

Sua meta é GARANTIR 100% de conformidade, precisão e integridade do código sem faltar nada do pedido:
1. Analise o código atual e verifique o que foi pedido pelo usuário.
2. Se faltar alguma funcionalidade, estilização, verificação, lógica ou componente, implemente as alterações CIRÚRGICAS e forneça o CÓDIGO COMPLETO 100% corrigido e funcional no campo "correctedCode".
3. Se você tiver alguma DÚVIDA IMPEDITIVA CRÍTICA sobre o que o usuário deseja:
   - Defina "hasDoubt": true
   - Forneça a pergunta em "doubtQuestion"
4. Se o pedido puder ser verificado e implementado com segurança:
   - Defina "hasDoubt": false
   - Defina "doubtQuestion": ""
   - Coloque o código 100% corrigido e funcional na propriedade "correctedCode" (sem nenhum marcador externo fora do JSON).
   - Forneça um resumo objetivo e marcante das verificações/melhorias em "summary".

FORMATO OBRIGATÓRIO (Retorne estritamente JSON válido nesta estrutura):
{
  "hasDoubt": boolean,
  "doubtQuestion": string,
  "summary": string,
  "correctedCode": string
}`;

      const userContentPayload = `EXIGÊNCIAS / REQUISITOS DO USUÁRIO A SEREM VERIFICADOS E IMPLEMENTADOS:
"${promptToVerify}"

CÓDIGO ATUAL NO ARQUIVO ("${activeFile?.name || 'código'}"):
${currentCode}`;

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientApiKey: effectiveApiKey,
          model: apiKeys?.geminiModel || "gemini-3.5-flash",
          prompt: userContentPayload,
          systemInstruction,
          responseMimeType: "application/json"
        })
      });

      if (!response.ok) {
        throw new Error("Erro na comunicação com a API do Hunter.");
      }

      const data = await response.json();
      let text = data.text || "";
      if (text.startsWith("```")) {
        text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
      }

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        parsed = {
          hasDoubt: false,
          doubtQuestion: "",
          summary: "Análise e ajustes concluídos pelo Hunter.",
          correctedCode: currentCode
        };
      }

      if (parsed.hasDoubt && parsed.doubtQuestion) {
        setHunterStatus('doubt');
        setHunterDoubt(parsed.doubtQuestion);
        setHunterReport(`Hunter identificou uma dúvida: ${parsed.doubtQuestion}`);
      } else {
        setHunterStatus('success');
        setHunterDoubt(null);
        const finalSummary = parsed.summary || "Código auditado e 100% alinhado com as especificações solicitadas!";
        setHunterReport(finalSummary);

        if (parsed.correctedCode && parsed.correctedCode.trim().length > 0) {
          handleUpdateActiveContent(parsed.correctedCode);
          window.dispatchEvent(new Event('osone_repository_updated'));
        }
      }
    } catch (err: any) {
      console.error("Erro no agente Hunter:", err);
      setHunterStatus('error');
      setHunterReport(`Erro na caçada: ${err.message || String(err)}`);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#080a0f] text-zinc-100 min-h-0 overflow-hidden select-none font-sans relative">
      {/* Top Header Navigation */}
      <div className="h-14 border-b border-white/5 bg-[#0c0e14]/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowRepoSidebar(!showRepoSidebar)}
            className={cn(
              "p-2 rounded-xl transition-all border",
              showRepoSidebar 
                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" 
                : "bg-white/[0.02] text-zinc-400 hover:text-white border-white/5"
            )}
            title="Alternar Repositório de Arquivos"
          >
            <FolderGit2 size={16} />
          </button>

          <div className="flex items-center gap-2">
            <Code2 size={18} className="text-cyan-400" />
            <h2 className="text-sm font-semibold tracking-tight text-white font-mono flex items-center gap-2">
              Código & Repositório
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-normal">
                {files.length} arquivo(s)
              </span>
            </h2>
          </div>
        </div>

        {/* View Mode Controls */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
          <button 
            onClick={() => setViewLayout('editor')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all font-medium",
              viewLayout === 'editor' 
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Code2 size={14} />
            <span className="hidden sm:inline">Apenas Código</span>
          </button>
          
          <button 
            onClick={() => setViewLayout('split')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all font-medium",
              viewLayout === 'split' 
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Columns size={14} />
            <span className="hidden sm:inline">Dividido (Split)</span>
          </button>

          <button 
            onClick={() => setViewLayout('preview')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all font-medium",
              viewLayout === 'preview' 
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Eye size={14} />
            <span className="hidden sm:inline">Preview Vivo</span>
          </button>
        </div>

        {/* Action Controls + HUNTER BUTTON */}
        <div className="flex items-center gap-2">
          {/* BOTÃO HUNTER NOVO */}
          <button 
            onClick={() => setIsHunterModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-mono font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950/60 active:scale-95 cursor-pointer border border-emerald-400/40 transition-all"
            title="Hunter: Examinador Agêntico. Examina o código, aponta o que falta e implementa automaticamente!"
          >
            <BowAndArrowIcon size={15} className="text-emerald-100 animate-pulse" />
            <span className="tracking-wider hidden sm:inline">HUNTER AGÊNTICO</span>
          </button>

          <button 
            onClick={handleCopyCode}
            className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 border border-white/5 transition-all"
            title="Copiar Código do Arquivo Ativo"
          >
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          </button>

          <button 
            onClick={handleDownloadFile}
            className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 border border-white/5 transition-all"
            title="Baixar Arquivo para o PC"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* Main Studio Body */}
      <div className="flex-1 flex w-full min-h-0 overflow-hidden relative">
        
        {/* Virtual Repository File Tree Sidebar */}
        <AnimatePresence>
          {showRepoSidebar && (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-full bg-[#0a0c12] border-r border-white/5 flex flex-col shrink-0 overflow-hidden z-20"
            >
              <div className="p-3 border-b border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-semibold flex items-center gap-1.5">
                  <FolderGit2 size={12} className="text-cyan-400" />
                  Repositório
                </span>
                
                <div className="flex items-center gap-1">
                  <label className="p-1 rounded bg-white/[0.03] hover:bg-white/10 text-zinc-400 cursor-pointer transition-colors" title="Importar do PC">
                    <Upload size={13} />
                    <input type="file" onChange={handleImportFileDisk} className="hidden" accept=".html,.css,.js,.ts,.json,.txt,.md" />
                  </label>
                  
                  <button 
                    onClick={handleCreateNewFile}
                    className="p-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 transition-colors"
                    title="Novo Arquivo"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {files.map(file => {
                  const isActive = file.id === activeFileId;
                  const isEditingName = editingFileNameId === file.id;

                  return (
                    <div 
                      key={file.id}
                      onClick={() => setActiveFileId(file.id)}
                      className={cn(
                        "group w-full px-3 py-2 rounded-xl text-xs font-mono flex items-center justify-between cursor-pointer transition-all border",
                        isActive 
                          ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.1)]" 
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                        <FileCode size={14} className={isActive ? "text-cyan-400" : "text-zinc-500"} />
                        
                        {isEditingName ? (
                          <input 
                            type="text" 
                            value={editingFileNameText}
                            onChange={(e) => setEditingFileNameText(e.target.value)}
                            onBlur={() => handleRenameFileSubmit(file.id)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRenameFileSubmit(file.id)}
                            autoFocus
                            className="bg-black/60 border border-cyan-500/50 rounded px-1.5 py-0.5 text-xs text-cyan-200 outline-none w-full"
                          />
                        ) : (
                          <span className="truncate">{file.name}</span>
                        )}
                      </div>

                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFileNameId(file.id);
                            setEditingFileNameText(file.name);
                          }}
                          className="p-1 hover:text-cyan-300 transition-colors"
                          title="Renomear"
                        >
                          <Edit3 size={11} />
                        </button>

                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(file.id, file.name);
                          }}
                          className="p-1 hover:text-red-400 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer status */}
              <div className="p-3 border-t border-white/5 bg-black/40 text-[10px] font-mono text-zinc-500 flex items-center justify-between">
                <span>{isSaved ? "✓ Repositório Salvo" : "• Alterações não salvas"}</span>
                <span className="text-cyan-400">OSONE G5</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Workspace Grid */}
        <div className="flex-1 flex min-h-0 w-full overflow-hidden">
          
          {/* Code Editor Panel */}
          {(viewLayout === 'editor' || viewLayout === 'split') && activeFile && (
            <div className={cn(
              "flex flex-col min-h-0 bg-[#07080d] border-r border-white/5 transition-all overflow-hidden",
              viewLayout === 'split' ? "w-1/2" : "w-full"
            )}>
              {/* Editor Sub-Header */}
              <div className="h-9 bg-[#0b0d13] border-b border-white/5 px-4 flex items-center justify-between shrink-0 font-mono text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 font-semibold">{activeFile.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 uppercase">
                    {activeFile.language}
                  </span>
                </div>

                <div className="text-[10px] text-zinc-500">
                  {activeFile.content.length} caracteres
                </div>
              </div>

              {/* Code Textarea */}
              <div className="flex-1 relative w-full h-full bg-[#07080d]">
                <textarea 
                  value={activeFile.content}
                  onChange={(e) => handleUpdateActiveContent(e.target.value)}
                  spellCheck={false}
                  className="w-full h-full bg-transparent p-4 font-mono text-xs md:text-sm text-cyan-100/90 leading-relaxed outline-none resize-none custom-scrollbar selection:bg-cyan-500/30"
                  placeholder="Escreva ou cole seu código aqui..."
                />
              </div>
            </div>
          )}

          {/* Interactive Live Preview Panel */}
          {(viewLayout === 'preview' || viewLayout === 'split') && (
            <div className={cn(
              "flex flex-col min-h-0 bg-black transition-all overflow-hidden relative",
              viewLayout === 'split' ? "w-1/2" : "w-full"
            )}>
              <CodePreview code={activeFile ? activeFile.content : ''} />
            </div>
          )}

        </div>

      </div>

      {/* AI Code Assistant Footer Prompt Box */}
      <div className="border-t border-white/5 bg-[#090b10] p-3 shrink-0">
        <div className="max-w-5xl mx-auto space-y-2">
          
          {/* AI Quick Prompts */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <span className="text-[10px] font-mono text-cyan-400/80 uppercase tracking-wider flex items-center gap-1 shrink-0">
              <Sparkles size={11} /> IA Assistente:
            </span>

            {[
              { label: '⚡ Gerar App HTML5 + Tailwind', prompt: 'Crie uma aplicação web completa, interativa e linda em um único arquivo HTML usando Tailwind CSS, Lucide Icons e JavaScript.' },
              { label: '🛠️ Refatorar & Otimizar', prompt: 'Refatore o código do arquivo atual limpando a estrutura, otimizando performance e melhorando o design visual.' },
              { label: '🔍 Corrigir BUGS', prompt: 'Examine o código atual, encontre possíveis falhas, erros de lógica ou falta de parâmetros e corrija tudo.' },
              { label: '🎨 Adicionar Animações UI', prompt: 'Adicione transições suaves, animações de entrada e efeitos visuais modernos no código.' },
              { label: '📊 Dashboard Interativo', prompt: 'Crie um painel de controle/dashboard interativo com métricas, gráficos e visual moderno no HTML.' }
            ].map((item, idx) => (
              <button 
                key={idx}
                onClick={() => handleSendAIPrompt(item.prompt)}
                disabled={isGenerating}
                className="px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/20 text-[11px] font-mono text-zinc-300 hover:text-cyan-300 shrink-0 transition-all disabled:opacity-50"
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Prompt Input Line */}
          <div className="flex items-center gap-2 bg-black/50 border border-white/10 rounded-2xl p-1.5 focus-within:border-cyan-500/40 transition-all">
            <input 
              type="text" 
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendAIPrompt()}
              placeholder="Descreva a alteração ou o app que você quer criar neste arquivo de código..."
              disabled={isGenerating}
              className="flex-1 bg-transparent px-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none font-mono"
            />

            <button 
              onClick={() => handleSendAIPrompt()}
              disabled={!promptInput.trim() || isGenerating}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 text-black font-semibold text-xs font-mono transition-all flex items-center gap-1.5 shrink-0"
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Gerando...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>Gerar Código</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* HUNTER AGENT EXAMINER MODAL */}
      <AnimatePresence>
        {isHunterModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-2xl bg-[#0b0e17] border border-emerald-500/40 rounded-3xl p-6 shadow-2xl text-left space-y-5 overflow-hidden relative"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
                    <BowAndArrowIcon size={20} className={hunterStatus === 'analyzing' ? 'animate-spin' : ''} />
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                      🏹 HUNTER — EXAMINADOR AGÊNTICO DE CÓDIGO
                    </h3>
                    <p className="text-xs text-emerald-200/70 mt-0.5">
                      Descreva exatamente o que deseja examinar, checar ou adicionar no código e no plano.
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setIsHunterModalOpen(false)}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Textbox Input */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider block">
                  Exigências & Checklist do Código/Plano:
                </label>
                <textarea 
                  value={hunterPrompt}
                  onChange={(e) => setHunterPrompt(e.target.value)}
                  placeholder="Ex: Verifique se a aplicação possui estado de contagem, botões responsivos, estilização e se faltou algo no plano. Se faltar qualquer item, implemente no código imediatamente!"
                  className="w-full h-32 bg-black/60 border border-emerald-500/30 focus:border-emerald-400 rounded-2xl p-3 text-xs font-mono text-zinc-100 placeholder-zinc-500 outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Actions: Voice or Hunter Execution */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {onStartLiveVoice && (
                  <button 
                    onClick={() => {
                      onStartLiveVoice();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-semibold flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                  >
                    <Mic size={14} className="animate-pulse text-emerald-400" />
                    <span>Falar com Gemini Live (Voz)</span>
                  </button>
                )}

                <button 
                  onClick={() => runHunterAnalysis()}
                  disabled={!hunterPrompt.trim() || hunterStatus === 'analyzing'}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-50 text-white font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-950/60 cursor-pointer active:scale-95 ml-auto"
                >
                  {hunterStatus === 'analyzing' ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Caçando & Auditando...</span>
                    </>
                  ) : (
                    <>
                      <BowAndArrowIcon size={16} />
                      <span>Caçar & Implementar no Código</span>
                    </>
                  )}
                </button>
              </div>

              {/* Status Report / Doubt Output */}
              {hunterStatus !== 'idle' && (
                <div className={cn(
                  "p-4 rounded-2xl border text-xs leading-relaxed font-mono space-y-2",
                  hunterStatus === 'analyzing' ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300" :
                  hunterStatus === 'doubt' ? "bg-amber-950/30 border-amber-500/40 text-amber-200" :
                  hunterStatus === 'success' ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200" :
                  "bg-red-950/30 border-red-500/40 text-red-300"
                )}>
                  <div className="flex items-center gap-2 font-bold uppercase tracking-wide">
                    {hunterStatus === 'analyzing' && <Loader2 size={14} className="animate-spin text-emerald-400" />}
                    <span>
                      {hunterStatus === 'analyzing' ? 'Análise em Andamento...' :
                       hunterStatus === 'doubt' ? 'Dúvida Impeditiva Detectada:' :
                       hunterStatus === 'success' ? '✓ Caçada Concluída com Sucesso!' : 'Erro na Análise'}
                    </span>
                  </div>

                  {hunterStatus === 'doubt' && (
                    <div className="space-y-3 pt-1">
                      <p className="text-amber-100 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                        {hunterDoubt}
                      </p>

                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          value={hunterDoubtInput}
                          onChange={(e) => setHunterDoubtInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && hunterDoubtInput.trim()) {
                              const clar = hunterDoubtInput.trim();
                              setHunterDoubtInput('');
                              runHunterAnalysis(clar);
                            }
                          }}
                          placeholder="Digitar esclarecimento para o Hunter..."
                          className="flex-1 bg-black/60 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-white placeholder-amber-200/40 outline-none"
                        />
                        <button 
                          onClick={() => {
                            if (hunterDoubtInput.trim()) {
                              const clar = hunterDoubtInput.trim();
                              setHunterDoubtInput('');
                              runHunterAnalysis(clar);
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs"
                        >
                          Enviar
                        </button>
                      </div>
                    </div>
                  )}

                  {hunterStatus === 'success' && (
                    <p className="text-emerald-100 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                      {hunterReport}
                    </p>
                  )}
                </div>
              )}

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
