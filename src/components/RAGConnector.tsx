import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Folder, FileText, Search, Link2, Unlink, RefreshCw, Eye, Trash2, 
  Settings, CheckCircle2, AlertCircle, Sparkles, HelpCircle, FileDown, 
  Code, Info, ChevronRight, Check, Database, FolderOpen, UploadCloud, X
} from 'lucide-react';
import { RagFile } from '../types';
import { cn } from '../lib/utils';

// Simple IndexedDB helper for robust RAG persistence
export const openIDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("osone_rag_db", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
    };
  });
};

export const saveRagFileToDB = async (file: RagFile): Promise<void> => {
  try {
    const db = await openIDB();
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    store.put(file);
  } catch (err) {
    console.error("IndexedDB Save Error:", err);
  }
};

export const deleteRagFileFromDB = async (id: string): Promise<void> => {
  try {
    const db = await openIDB();
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    store.delete(id);
  } catch (err) {
    console.error("IndexedDB Delete Error:", err);
  }
};

export const clearRagDB = async (): Promise<void> => {
  try {
    const db = await openIDB();
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    store.clear();
  } catch (err) {
    console.error("IndexedDB Clear Error:", err);
  }
};

export const loadRagFilesFromDB = (): Promise<RagFile[]> => {
  return new Promise((resolve) => {
    openIDB().then(db => {
      const transaction = db.transaction("files", "readonly");
      const store = transaction.objectStore("files");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    }).catch(err => {
      console.error("IndexedDB Load Error:", err);
      resolve([]);
    });
  });
};

export const RAGConnector = ({
  ragFiles,
  setRagFiles,
  onAddNotification
}: {
  ragFiles: RagFile[];
  setRagFiles: React.Dispatch<React.SetStateAction<RagFile[]>>;
  onAddNotification?: (msg: string, type: 'success' | 'info' | 'error') => void;
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [selectedDirectoryName, setSelectedDirectoryName] = useState<string>(() => {
    return localStorage.getItem('osone_rag_directory_name') || '';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<{ fileName: string; snippet: string; score: number }[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<'files' | 'interactive' | 'help'>('files');
  const [selectedFileContents, setSelectedFileContents] = useState<RagFile | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load files from IndexedDB on start
  useEffect(() => {
    loadRagFilesFromDB().then(files => {
      if (files.length > 0) {
        setRagFiles(files);
      }
    });
  }, [setRagFiles]);

  // Handle native showDirectoryPicker
  const handleConnectDirectory = async () => {
    if (!('showDirectoryPicker' in window)) {
      if (onAddNotification) {
        onAddNotification("Este navegador não suporta acesso a pastas locais do PC. Use o botão de envio manual de arquivos!", "error");
      }
      return;
    }

    try {
      setIsScanning(true);
      const dirHandle = await (window as any).showDirectoryPicker();
      setSelectedDirectoryName(dirHandle.name);
      localStorage.setItem('osone_rag_directory_name', dirHandle.name);

      const accumulated: { name: string; path: string; content: string; size: number }[] = [];
      
      const readDir = async (handle: any, currentPath = "") => {
        for await (const entry of handle.values()) {
          const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            const allowedExts = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'csv', 'yaml', 'yml', 'xml', 'log', 'ini', 'conf'];
            
            if (allowedExts.includes(ext) || file.type.startsWith('text/')) {
              try {
                const text = await file.text();
                accumulated.push({
                  name: file.name,
                  path: relativePath,
                  content: text,
                  size: file.size
                });
              } catch (e) {
                console.warn(`Could not read file ${entry.name}`, e);
              }
            }
          } else if (entry.kind === 'directory') {
            if (!['node_modules', '.git', 'dist', '.next', 'build', '.idea', '.vscode'].includes(entry.name)) {
              try {
                const subDir = await handle.getDirectoryHandle(entry.name);
                await readDir(subDir, relativePath);
              } catch (e) {
                console.warn(`Could not access directory ${entry.name}`, e);
              }
            }
          }
        }
      };

      await readDir(dirHandle);

      if (accumulated.length === 0) {
        if (onAddNotification) {
          onAddNotification("Nenhum documento de texto legível encontrado nessa pasta.", "info");
        }
        setIsScanning(false);
        return;
      }

      // Convert to RagFile structure
      const newRagFiles: RagFile[] = accumulated.map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        name: f.name,
        path: f.path,
        content: f.content,
        size: f.size,
        type: f.name.split('.').pop() || 'txt',
        isActive: true
      }));

      // Store in IndexedDB and state
      for (const rf of newRagFiles) {
        await saveRagFileToDB(rf);
      }

      setRagFiles(prev => {
        const combined = [...prev];
        newRagFiles.forEach(nf => {
          if (!combined.some(c => c.path === nf.path)) {
            combined.push(nf);
          }
        });
        return combined;
      });

      if (onAddNotification) {
        onAddNotification(`Conectado com sucesso! ${newRagFiles.length} documentos indexados.`, "success");
      }

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        if (onAddNotification) {
          onAddNotification("Erro ao acessar a pasta do computador.", "error");
        }
      }
    } finally {
      setIsScanning(false);
    }
  };

  // Handle Drag & Drop / Upload manual files
  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    await processUploadedFiles(files);
  };

  const processUploadedFiles = async (files: File[]) => {
    setIsScanning(true);
    let count = 0;
    
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const text = await file.text();
      
      const ragFile: RagFile = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        path: file.name,
        content: text,
        size: file.size,
        type: ext,
        isActive: true
      };

      await saveRagFileToDB(ragFile);
      setRagFiles(prev => {
        if (prev.some(p => p.name === ragFile.name)) {
          return prev.map(p => p.name === ragFile.name ? ragFile : p);
        }
        return [...prev, ragFile];
      });
      count++;
    }

    setIsScanning(false);
    if (onAddNotification && count > 0) {
      onAddNotification(`${count} arquivos manuais indexados no RAG local com sucesso!`, "success");
    }
  };

  // Toggle active RAG files
  const handleToggleFileActive = async (id: string) => {
    setRagFiles(prev => prev.map(f => {
      if (f.id === id) {
        const updated = { ...f, isActive: !f.isActive };
        saveRagFileToDB(updated);
        return updated;
      }
      return f;
    }));
  };

  // Delete specific file
  const handleDeleteFile = async (id: string) => {
    await deleteRagFileFromDB(id);
    setRagFiles(prev => prev.filter(f => f.id !== id));
    if (onAddNotification) {
      onAddNotification("Documento desvinculado do cérebro local.", "info");
    }
  };

  // Disconnect all
  const handleDisconnectAll = async () => {
    if (confirm("Deseja desconectar absolutamente todos os documentos vinculados da sua máquina local?")) {
      await clearRagDB();
      setRagFiles([]);
      setSelectedDirectoryName('');
      localStorage.removeItem('osone_rag_directory_name');
      if (onAddNotification) {
        onAddNotification("Todos os documentos locais foram desvinculados com sucesso.", "success");
      }
    }
  };

  // Local lexical TF-IDF / Keyword match demo
  const handleTestRAG = () => {
    if (!testQuery.trim() || ragFiles.length === 0) return;
    setIsTesting(true);
    
    setTimeout(() => {
      const queryTerms = testQuery.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      const results: { fileName: string; snippet: string; score: number }[] = [];

      ragFiles.forEach(file => {
        if (!file.isActive) return;
        
        // Split file content into paragraphs/blocks
        const paragraphs = file.content.split(/\n\s*\n/).filter(p => p.trim().length > 10);
        
        paragraphs.forEach(p => {
          let score = 0;
          queryTerms.forEach(term => {
            const matches = (p.toLowerCase().match(new RegExp(term, 'g')) || []).length;
            score += matches;
          });

          if (score > 0) {
            // Trim paragraph to a good snippet
            const snippet = p.length > 250 ? p.substring(0, 250) + "..." : p;
            results.push({
              fileName: file.name,
              snippet,
              score
            });
          }
        });
      });

      // Sort results by score descending
      results.sort((a, b) => b.score - a.score);
      setTestResults(results.slice(0, 5));
      setIsTesting(false);
    }, 400);
  };

  const filteredFiles = ragFiles.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-8 select-none">
      {/* RAG Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-white/[0.04] pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-mono tracking-widest bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full select-none">
              Retrieval-Augmented Generation (RAG)
            </span>
          </div>
          <h2 className="text-2xl font-serif text-her-ink/90 font-light italic leading-tight">
            Conexão de Documentos Locais
          </h2>
          <p className="text-xs text-her-muted font-light mt-1 max-w-xl">
            Sincronize pastas de projetos ou notas privadas do seu PC. O OSONE G5 usará essa inteligência exclusiva para responder no chat ou debater por voz (Live).
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {ragFiles.length > 0 && (
            <button
              onClick={handleDisconnectAll}
              className="px-4 py-2 text-xs font-mono uppercase tracking-wider text-red-400 bg-red-400/[0.04] hover:bg-red-400/[0.08] transition-colors border border-red-500/15 rounded-xl flex items-center gap-2"
            >
              <Unlink size={13} />
              Desvincular Tudo
            </button>
          )}

          <button
            onClick={handleConnectDirectory}
            disabled={isScanning}
            className="px-5 py-2.5 text-xs font-mono uppercase tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/15 hover:border-cyan-500/30 transition-all rounded-xl shadow-lg shadow-cyan-950/20 flex items-center gap-2 disabled:opacity-50"
          >
            {isScanning ? (
              <RefreshCw size={13} className="animate-spin text-cyan-300" />
            ) : (
              <FolderOpen size={13} className="text-cyan-400" />
            )}
            {selectedDirectoryName ? "Reconectar Pasta PC" : "Conectar Pasta do Computador"}
          </button>
        </div>
      </div>

      {/* Connection Info Banner */}
      {selectedDirectoryName && (
        <div className="p-4 rounded-2xl bg-cyan-500/[0.02] border border-cyan-500/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Link2 size={18} className="animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-bold text-her-ink/85 font-mono uppercase tracking-wider">
                Pasta Vinculada: / {selectedDirectoryName}
              </p>
              <p className="text-[10px] text-cyan-400/80 font-mono tracking-tight mt-0.5">
                STATUS: CANAL NEURAL ATIVO COM SUA MÁQUINA FISICA • PRIVACIDADE COMPLETA (100% LOCAL)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-cyan-500/5 px-3 py-1.5 border border-cyan-500/10 rounded-xl text-[10px] text-cyan-300 font-mono">
            <Database size={11} />
            {ragFiles.length} Arquivos
          </div>
        </div>
      )}

      {/* RAG Workspace Tabs */}
      <div className="flex border-b border-white/[0.04]">
        <button
          onClick={() => setActiveTab('files')}
          className={cn(
            "px-6 py-3.5 text-xs font-mono uppercase tracking-wider border-b-2 transition-all flex items-center gap-2",
            activeTab === 'files' ? "border-cyan-400 text-cyan-300" : "border-transparent text-her-muted hover:text-her-ink/75"
          )}
        >
          <FileText size={14} />
          Documentos ({ragFiles.length})
        </button>

        <button
          onClick={() => setActiveTab('interactive')}
          className={cn(
            "px-6 py-3.5 text-xs font-mono uppercase tracking-wider border-b-2 transition-all flex items-center gap-2",
            activeTab === 'interactive' ? "border-cyan-400 text-cyan-300" : "border-transparent text-her-muted hover:text-her-ink/75"
          )}
        >
          <Sparkles size={14} />
          Teste de Ativação RAG
        </button>

        <button
          onClick={() => setActiveTab('help')}
          className={cn(
            "px-6 py-3.5 text-xs font-mono uppercase tracking-wider border-b-2 transition-all flex items-center gap-2",
            activeTab === 'help' ? "border-cyan-400 text-cyan-300" : "border-transparent text-her-muted hover:text-her-ink/75"
          )}
        >
          <HelpCircle size={14} />
          Instruções & Conceito
        </button>
      </div>

      {/* Tab Panels */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          {activeTab === 'files' && (
            <div className="space-y-6">
              {/* Toolbar & Search & Manual Upload */}
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
                <div className="relative w-full sm:max-w-md">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-her-muted">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Pesquisar nos documentos conectados..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white/[0.02] border border-white/[0.06] rounded-xl focus:border-cyan-500/40 text-xs font-sans text-her-ink transition-all placeholder:text-her-muted/50 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleUploadFiles}
                    multiple
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] text-her-ink/90 border border-white/[0.06] hover:border-white/[0.1] transition-all rounded-xl text-xs flex items-center gap-2 w-full justify-center sm:w-auto"
                    title="Adicionar arquivos individuais"
                  >
                    <UploadCloud size={14} className="text-her-muted" />
                    Enviar Arquivos do PC
                  </button>
                </div>
              </div>

              {/* Files Database Grid */}
              {filteredFiles.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredFiles.map((file) => (
                    <div 
                      key={file.id}
                      className={cn(
                        "p-4 rounded-2xl border transition-all flex flex-col justify-between hover:bg-white/[0.01]",
                        file.isActive ? "bg-white/[0.02] border-white/[0.06]" : "bg-black/[0.1] border-white/[0.02] opacity-60"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold font-mono",
                            file.isActive ? "bg-cyan-500/10 text-cyan-400" : "bg-white/5 text-her-muted"
                          )}>
                            {file.type ? file.type.toUpperCase() : "TXT"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-her-ink/80 truncate leading-snug">
                              {file.name}
                            </p>
                            <p className="text-[10px] text-her-muted font-mono leading-none mt-1 truncate">
                              Path: {file.path}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleToggleFileActive(file.id)}
                            className={cn(
                              "w-7 h-7 rounded-lg border flex items-center justify-center transition-all",
                              file.isActive 
                                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" 
                                : "bg-white/5 text-her-muted border-white/5"
                            )}
                            title={file.isActive ? "Desativar este arquivo" : "Ativar este arquivo"}
                          >
                            <Check size={12} className={cn(!file.isActive && "opacity-20")} />
                          </button>
                          
                          <button
                            onClick={() => setSelectedFileContents(file)}
                            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-her-muted hover:text-her-ink border border-white/5 flex items-center justify-center transition-all"
                            title="Ver conteúdo puro"
                          >
                            <Eye size={12} />
                          </button>

                          <button
                            onClick={() => handleDeleteFile(file.id)}
                            className="w-7 h-7 rounded-lg bg-red-500/[0.04] hover:bg-red-500/[0.08] text-red-400 border border-red-500/10 flex items-center justify-center transition-all"
                            title="Remover documento"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-mono text-her-muted pr-1 mt-1 border-t border-white/[0.02] pt-2">
                        <span>Tamanho: {(file.size / 1024).toFixed(1)} KB</span>
                        <span className="flex items-center gap-1 font-sans text-[9px] uppercase tracking-wide">
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            file.isActive ? "bg-cyan-400 animate-pulse" : "bg-zinc-600"
                          )} />
                          {file.isActive ? "Indexado no RAG" : "Oculto"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center border border-dashed border-white/[0.06] rounded-3xl bg-black/[0.04]">
                  <FolderOpen size={40} className="mx-auto text-her-muted/20 mb-4" />
                  <h3 className="text-sm font-sans font-medium text-her-ink/70">Nenhum documento conectado</h3>
                  <p className="text-xs text-her-muted font-light mt-1 max-w-sm mx-auto">
                    Conecte uma pasta privada do seu computador clicando no botão "Conectar Pasta" acima ou envie arquivos `.txt`, `.md` de exemplo.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'interactive' && (
            <div className="space-y-6">
              {/* Interactive RAG Playground */}
              <div className="bg-white/[0.01] border border-white/[0.04] rounded-3xl p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={16} className="text-cyan-400" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-her-ink/80">Simulador de Recuperação RAG</h3>
                </div>
                <p className="text-xs text-her-muted font-light leading-relaxed">
                  Faça uma pergunta sobre o assunto de seus arquivos vinculados. Nossa ferramenta de RAG local pesquisará entre todas as linhas dos arquivos e mostrará qual trecho exato seria enviado para a inteligência artificial formular a resposta perfeita.
                </p>

                <div className="flex items-center gap-3 mt-4">
                  <input
                    type="text"
                    value={testQuery}
                    onChange={(e) => setTestQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleTestRAG()}
                    placeholder="Digite sua dúvida (ex: 'ideia', 'fórmula', 'parâmetros')..."
                    className="flex-1 px-4 py-3 bg-white/[0.02] border border-white/[0.06] focus:border-cyan-500/40 rounded-xl text-xs font-sans text-her-ink placeholder:text-her-muted/50 focus:outline-none"
                  />
                  <button
                    onClick={handleTestRAG}
                    disabled={isTesting || !testQuery.trim() || ragFiles.length === 0}
                    className="px-6 h-11 bg-cyan-500/10 hover:bg-cyan-500/15 text-cyan-300 border border-cyan-500/20 rounded-xl text-xs font-mono uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    {isTesting ? "Buscando..." : "Pesquisar RAG"}
                  </button>
                </div>

                <div className="pt-4 border-t border-white/[0.02] space-y-4">
                  {testResults.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        Trechos Relevantes Encontrados ({testResults.length})
                      </p>
                      
                      {testResults.map((res, index) => (
                        <div key={index} className="p-4 rounded-xl bg-black/40 border border-white/[0.04] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-1.5">
                              <FileText size={10} />
                              {res.fileName}
                            </span>
                            <span className="text-[9px] font-mono px-2 py-0.5 bg-white/5 rounded-full text-her-muted">
                              Grau de Relevância: {res.score}
                            </span>
                          </div>
                          <p className="text-xs font-serif font-light text-her-ink/70 leading-relaxed italic bg-white/[0.01] p-3 rounded-lg border border-white/5">
                            "{res.snippet}"
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : testQuery && !isTesting ? (
                    <div className="p-4 text-center rounded-xl bg-black/20 border border-white/[0.03]">
                      <AlertCircle size={16} className="mx-auto text-her-muted mb-2" />
                      <p className="text-xs text-her-muted font-light">Nenhum trecho com relevância léxica encontrado para a sua busca.</p>
                    </div>
                  ) : (
                    <p className="text-[10.5px] font-mono text-her-muted italic text-center p-4">Insira uma pergunta para simular os trechos que serão pinçados no RAG local.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'help' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-2">
              <div className="space-y-4">
                <h3 className="text-sm font-sans font-medium text-her-ink/80 flex items-center gap-2">
                  <Database size={16} className="text-cyan-400" />
                  Como funciona o RAG PC Link?
                </h3>
                <div className="text-xs text-her-muted font-light space-y-3 leading-relaxed">
                  <p>
                    O OSONE G5 utiliza o padrão **RAG (Retrieval-Augmented Generation)**. Diferente de treinar novamente uma grande rede neural, o RAG expande o cérebro da nossa inteligência enviando de forma dinâmica os arquivos mais importantes do seu computador como suporte imediato.
                  </p>
                  <p>
                    Utilizando a **API de Acesso ao Sistema de Arquivos do Navegador**, nós conectamos a pasta selecionada de maneira local e segura. O navegador lê os arquivos diretamente do seu HD e realiza o controle sem trafegar seus arquivos por servidores terceiros.
                  </p>
                  <p>
                    Sempre que você manda uma pergunta no chat ou discute sobre qualquer assunto, o OSONE vasculha as palavras e trechos de maior afinidade e os injeta nos prompts de forma síncrona.
                  </p>
                </div>
              </div>

              <div className="space-y-4 bg-white/[0.01] border border-white/[0.03] p-5 rounded-2xl">
                <h3 className="text-sm font-sans font-bold text-her-ink/80 flex items-center gap-2 uppercase tracking-wide text-xs">
                  <Info size={14} className="text-cyan-400" />
                  Privacidade Absoluta
                </h3>
                <div className="text-xs text-her-muted font-light space-y-3 leading-relaxed">
                  <p>
                    Seus dados nunca são doados ou processados em servidores na nuvem sem seu comando. Tudo acontece sob segurança criptográfica local:
                  </p>
                  <ul className="list-disc pl-4 space-y-2">
                    <li>Os arquivos sincronizados residem com segurança no seu próprio navegador via banco de dados **IndexedDB**.</li>
                    <li>Sua chave de API do Gemini no Settings serve de ponte apenas no envio do prompt + trecho final solicitado.</li>
                    <li>O OSONE não possui acesso constante fora do contexto ativo da aplicação. Suas permissões são exclusivas.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* File Details Preview Modal */}
      {selectedFileContents && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-3xl h-[80vh] bg-her-bg border border-white/[0.08] shadow-2xl rounded-3xl flex flex-col overflow-hidden"
          >
            <div className="p-6 border-b border-white/[0.04] flex items-center justify-between">
              <div>
                <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-400">{selectedFileContents.path}</span>
                <h3 className="text-lg font-serif italic text-her-ink/90 font-light mt-0.5">{selectedFileContents.name}</h3>
              </div>
              <button 
                onClick={() => setSelectedFileContents(null)}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-her-muted transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-black/30 font-mono text-[11px] text-zinc-300 leading-relaxed select-text custom-scrollbar">
              <pre className="whitespace-pre-wrap">{selectedFileContents.content}</pre>
            </div>

            <div className="p-4 border-t border-white/[0.04] bg-white/[0.02] flex justify-between items-center text-[10px] font-mono text-her-muted">
              <span>Formato: {selectedFileContents.type ? selectedFileContents.type.toUpperCase() : "TXT"} • Tamanho: {(selectedFileContents.size / 1024).toFixed(1)} KB</span>
              <button
                onClick={() => setSelectedFileContents(null)}
                className="px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/15 text-cyan-300 border border-cyan-500/20 rounded-xl text-[10px] font-mono uppercase "
              >
                Fechar Visualização
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
