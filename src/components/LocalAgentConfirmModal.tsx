import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FolderSync, 
  Trash2, 
  ShieldAlert, 
  Check, 
  X, 
  ArrowRight, 
  FileText, 
  FolderCheck,
  AlertTriangle
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface PendingLocalAgentConfirmation {
  id: string;
  type: 'organize_folder_execute' | 'trash_local_file';
  folderKey: string;
  baseDir?: string;
  planArray?: Array<{ fileName: string; targetSubfolder: string; extension?: string }>;
  fileName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

interface LocalAgentConfirmModalProps {
  pending: PendingLocalAgentConfirmation | null;
}

export function LocalAgentConfirmModal({ pending }: LocalAgentConfirmModalProps) {
  if (!pending) return null;

  const isOrganize = pending.type === 'organize_folder_execute';

  // Group plan array by targetSubfolder for clean breakdown
  const folderGroups: Record<string, string[]> = {};
  if (isOrganize && pending.planArray) {
    pending.planArray.forEach(item => {
      const folder = item.targetSubfolder || 'Outros';
      if (!folderGroups[folder]) folderGroups[folder] = [];
      folderGroups[folder].push(item.fileName);
    });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6 bg-her-bg/85 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0.92, y: 15, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 15, opacity: 0 }}
          className="w-full max-w-2xl max-h-[85vh] bg-her-bg border border-white/10 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="shrink-0 p-6 md:p-8 border-b border-white/[0.06] flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center border shadow-lg shrink-0",
                isOrganize 
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-emerald-500/10" 
                  : "bg-red-500/20 text-red-400 border-red-500/30 shadow-red-500/10"
              )}>
                {isOrganize ? <FolderSync size={26} className="animate-pulse" /> : <Trash2 size={26} />}
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-serif italic text-white leading-tight">
                  {isOrganize ? "Organização de Pasta Local" : "Mover Arquivo para Lixeira"}
                </h2>
                <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-400 font-bold mt-0.5">
                  OSONE Local Agent • Confirmação Humana Obrigatória
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-300 text-[9px] uppercase tracking-wider font-bold">
              <ShieldAlert size={12} />
              Segurança OSONE
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar space-y-6">
            <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
              <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90 leading-relaxed font-sans">
                {isOrganize 
                  ? `O OSONE solicita autorização para mover arquivos na pasta local "${pending.folderKey.toUpperCase()}". NENHUM arquivo será deletado — eles apenas serão organizados em subpastas.`
                  : `O OSONE solicita autorização para enviar um arquivo da pasta "${pending.folderKey.toUpperCase()}" para a lixeira interna do Agente Local.`}
              </p>
            </div>

            {isOrganize && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <FolderCheck size={14} className="text-emerald-400" />
                    Resumo do Plano ({pending.planArray?.length || 0} arquivos)
                  </span>
                  <span className="text-[10px] text-her-muted bg-white/5 px-3 py-1 rounded-full font-mono max-w-[280px] truncate" title={pending.baseDir || pending.folderKey}>
                    Caminho: {pending.baseDir || `~/${pending.folderKey}`}
                  </span>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                  {Object.keys(folderGroups).length === 0 ? (
                    <p className="text-xs text-her-muted italic">Nenhum item alterado no plano.</p>
                  ) : (
                    Object.entries(folderGroups).map(([subfolder, files]) => (
                      <div key={subfolder} className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                            📁 {subfolder}
                          </span>
                          <span className="text-[10px] text-her-muted font-mono bg-emerald-500/10 px-2 py-0.5 rounded-md text-emerald-300">
                            {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}
                          </span>
                        </div>
                        <ul className="space-y-1 pl-4 text-[11px] text-her-muted font-mono">
                          {files.slice(0, 5).map((f, i) => (
                            <li key={i} className="truncate flex items-center gap-1.5">
                              <FileText size={11} className="shrink-0 text-white/40" />
                              <span className="truncate">{f}</span>
                            </li>
                          ))}
                          {files.length > 5 && (
                            <li className="text-[10px] text-emerald-400/80 italic pt-1">
                              ...e mais {files.length - 5} arquivo(s)
                            </li>
                          )}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {!isOrganize && (
              <div className="p-5 bg-white/[0.02] border border-white/[0.05] rounded-2xl space-y-3">
                <div className="text-xs font-bold text-white uppercase tracking-wider">
                  Arquivo Alvo
                </div>
                <div className="flex items-center gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-200 font-mono text-xs">
                  <FileText size={18} className="text-red-400 shrink-0" />
                  <div className="truncate flex-1">
                    <p className="font-bold text-white truncate">{pending.fileName}</p>
                    <p className="text-[10px] text-red-300/70">Localização: ~/{pending.folderKey}/{pending.fileName}</p>
                  </div>
                </div>
                <p className="text-[11px] text-her-muted leading-relaxed italic">
                  * A lixeira interna do Agente Local preserva o arquivo na pasta <code className="text-emerald-400 font-mono">.osone_trash</code>, permitindo restauração manual a qualquer momento.
                </p>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="shrink-0 p-6 md:p-8 border-t border-white/[0.06] bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[11px] text-her-muted text-center sm:text-left leading-relaxed">
              O OSONE aguarda a sua autorização para prosseguir.
            </p>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={pending.onCancel}
                className="flex-1 sm:flex-none px-6 py-3.5 bg-white/[0.04] hover:bg-white/[0.08] text-her-muted hover:text-white rounded-2xl transition-all border border-white/10 text-[10px] uppercase tracking-[0.15em] font-medium flex items-center justify-center gap-2 cursor-pointer"
              >
                <X size={15} />
                Cancelar
              </button>
              <button
                type="button"
                onClick={pending.onConfirm}
                className={cn(
                  "flex-1 sm:flex-none px-8 py-3.5 text-white rounded-2xl transition-all text-[10px] uppercase tracking-[0.15em] font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer",
                  isOrganize 
                    ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20" 
                    : "bg-red-500 hover:bg-red-600 shadow-red-500/20"
                )}
              >
                <Check size={16} />
                {isOrganize ? "Confirmar Organização" : "Mover para Lixeira"}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
