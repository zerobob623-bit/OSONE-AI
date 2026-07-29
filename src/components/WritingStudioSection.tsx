import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trash2, Copy, Plus, Eye, EyeOff, Volume2, VolumeX, Download, FileText, ChevronDown, 
  Zap, BookOpen, Undo, Sliders, Brain, X, Pause, Play, Square, Paperclip, ImageIcon, 
  Send, Loader2, Sparkles, RotateCcw 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { CodePreview } from './CodePreview';

interface WritingStudioSectionProps {
  writingTheme: string;
  setWritingTheme: (theme: any) => void;
  writingSubMode: 'text' | 'preview';
  setWritingSubMode: (mode: 'text' | 'preview') => void;
  setWorkspaceText: (text: string) => void;
  workspaceText: string;
  handleCopy: () => void;
  addNotification: (msg: string, type?: any) => void;
  customSkill: { name: string; content: string } | null;
  setCustomSkill: (skill: { name: string; content: string } | null) => void;
  isSkillBalloonVisible: boolean;
  setIsSkillBalloonVisible: (visible: boolean) => void;
  setShowWhiteboard: (show: boolean) => void;
  setWhiteboardText: (text: string) => void;
  handleReadWorkspaceText: () => void;
  isReadingWorkspace: boolean;
  handleDownloadWorkspaceTts: () => void;
  isGeneratingWorkspaceMp3: boolean;
  isExportMenuOpen: boolean;
  setIsExportMenuOpen: (open: boolean) => void;
  isGeneratingDocument: string | null;
  handleDownloadDocument: (format: 'txt' | 'md' | 'html' | 'docx' | 'pdf') => void;
  writingFocusMode: boolean;
  setWritingFocusMode: (focus: boolean) => void;
  writingWordGoal: number;
  setWritingWordGoal: (goal: number) => void;
  workspaceHistory: string[];
  handleUndoWorkspaceText: () => void;
  isSidebarSettingsOpen: boolean;
  setIsSidebarSettingsOpen: (open: boolean) => void;
  isSkillBalloonExpanded: boolean;
  setIsSkillBalloonExpanded: (expanded: boolean) => void;
  voiceEngine: string;
  liveState: any;
  liveSessionRef: any;
  handleHomeChat: (prompt: string) => void;
  workspaceAudioUrl: string | null;
  workspaceAudioPlaying: boolean;
  selectedVoice: string;
  handleTogglePlayWorkspaceAudio: () => void;
  handleStopWorkspaceAudio: () => void;
  workspaceAudioCurrentTime: number;
  workspaceAudioDuration: number;
  handleSeekWorkspaceAudio: (time: number) => void;
  setWorkspaceAudioUrl: (url: string | null) => void;
  writingAttachedFiles: { name: string; type: string; data: string }[];
  writingWidthMode: 'compact' | 'classic' | 'wide';
  removeWritingFile: (idx: number) => void;
  writingFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleWritingFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  workspacePrompt: string;
  setWorkspacePrompt: (prompt: string) => void;
  handleGenerate: () => void;
  isGenerating: boolean;
  activeProjectId: string | null;
  playingSoundUrl: string | null;
  showUi: boolean;
  writingFont: 'serif' | 'sans' | 'mono';
  writingFontSize: number;
  playMXKeySound: () => void;
  writingSounds: boolean;
  setWritingFont: (font: 'serif' | 'sans' | 'mono') => void;
  setWritingFontSize: React.Dispatch<React.SetStateAction<number>>;
  setWritingWidthMode: (mode: 'compact' | 'classic' | 'wide') => void;
  setWritingSounds: (sounds: boolean) => void;
  isProjectsDockOpen: boolean;
  setIsProjectsDockOpen: (open: boolean) => void;
  writingProjects: Array<{ id: string; title: string; content: string; createdAt: number }>;
  handleStartNewProject: () => void;
  handleSelectProject: (id: string) => void;
  handleDeleteProject: (id: string, e: React.MouseEvent) => void;
  formatAudioTime: (seconds: number) => string;
}

export const WritingStudioSection: React.FC<WritingStudioSectionProps> = ({
  writingTheme,
  setWritingTheme,
  writingSubMode,
  setWritingSubMode,
  setWorkspaceText,
  workspaceText,
  handleCopy,
  addNotification,
  customSkill,
  setCustomSkill,
  isSkillBalloonVisible,
  setIsSkillBalloonVisible,
  setShowWhiteboard,
  setWhiteboardText,
  handleReadWorkspaceText,
  isReadingWorkspace,
  handleDownloadWorkspaceTts,
  isGeneratingWorkspaceMp3,
  isExportMenuOpen,
  setIsExportMenuOpen,
  isGeneratingDocument,
  handleDownloadDocument,
  writingFocusMode,
  setWritingFocusMode,
  writingWordGoal,
  setWritingWordGoal,
  workspaceHistory,
  handleUndoWorkspaceText,
  isSidebarSettingsOpen,
  setIsSidebarSettingsOpen,
  isSkillBalloonExpanded,
  setIsSkillBalloonExpanded,
  voiceEngine,
  liveState,
  liveSessionRef,
  handleHomeChat,
  workspaceAudioUrl,
  workspaceAudioPlaying,
  selectedVoice,
  handleTogglePlayWorkspaceAudio,
  handleStopWorkspaceAudio,
  workspaceAudioCurrentTime,
  workspaceAudioDuration,
  handleSeekWorkspaceAudio,
  setWorkspaceAudioUrl,
  writingAttachedFiles,
  writingWidthMode,
  removeWritingFile,
  writingFileInputRef,
  handleWritingFileSelect,
  workspacePrompt,
  setWorkspacePrompt,
  handleGenerate,
  isGenerating,
  activeProjectId,
  playingSoundUrl,
  showUi,
  writingFont,
  writingFontSize,
  playMXKeySound,
  writingSounds,
  setWritingFont,
  setWritingFontSize,
  setWritingWidthMode,
  setWritingSounds,
  isProjectsDockOpen,
  setIsProjectsDockOpen,
  writingProjects,
  handleStartNewProject,
  handleSelectProject,
  handleDeleteProject,
  formatAudioTime,
}) => {
  return (
    <motion.div 
      key="workspace-writing"
      initial={{ opacity: 0, scale: 0.995 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.995 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "w-full flex-1 flex flex-col gap-0 min-h-0 transition-colors duration-500",
        writingTheme === 'charcoal' ? "bg-[#0c0d0f] text-zinc-100" :
        writingTheme === 'midnight' ? "bg-[#000000] text-zinc-100" :
        writingTheme === 'sepia' ? "bg-[#14110f] text-[#eddcd2]" :
        "bg-[#050906] text-emerald-100"
      )}
    >
      {/* Header Fixo Ultra-Premium */}
      <div className={cn(
        "sticky top-0 z-[50] w-full flex items-center justify-between px-3 py-2 md:px-5 md:py-2.5 border-b shrink-0 transition-colors duration-300",
        writingTheme === 'charcoal' ? "bg-[#08090b]/95 border-white/5" :
        writingTheme === 'midnight' ? "bg-black/95 border-white/[0.03]" :
        writingTheme === 'sepia' ? "bg-[#181412]/95 border-[#28211c]" :
        "bg-[#070e0a]/95 border-emerald-950/20"
      )}>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setWritingSubMode('text')}
            className={cn(
              "px-3 py-1.5 text-[9px] uppercase tracking-wider font-mono rounded-md transition-all font-bold",
              writingSubMode === 'text' 
                ? (writingTheme === 'sepia' ? "bg-[#28211c] text-amber-300" : writingTheme === 'forest' ? "bg-emerald-950/40 text-emerald-400" : "bg-white/10 text-white") 
                : "text-white/20 hover:text-white/40"
            )}
          >
            Estúdio Prosa
          </button>
          <button 
            onClick={() => setWritingSubMode('preview')}
            className={cn(
              "px-3 py-1.5 text-[9px] uppercase tracking-wider font-mono rounded-md transition-all font-bold",
              writingSubMode === 'preview' 
                ? (writingTheme === 'sepia' ? "bg-[#28211c] text-amber-300" : writingTheme === 'forest' ? "bg-emerald-950/40 text-emerald-400" : "bg-white/10 text-white") 
                : "text-white/20 hover:text-white/40"
            )}
          >
            Visualizador HTML
          </button>
          <div className="w-[1px] h-3 bg-white/10 mx-2 shrink-0" />
          
          <button 
            onClick={() => {
              if(window.confirm('Quer mesmo apagar todo o conteúdo atual? Esta ação é definitiva.')) {
                setWorkspaceText('');
              }
            }} 
            className="p-1.5 rounded-lg hover:bg-white/5 text-red-500/40 hover:text-red-500 transition-colors shrink-0" 
            title="Limpar Tela"
          >
            <Trash2 size={13} />
          </button>
          <button 
            onClick={() => {
              handleCopy();
              addNotification("Texto copiado para a área de transferência!", "success");
            }} 
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white transition-colors shrink-0" 
            title="Copiar Texto"
          >
            <Copy size={13} />
          </button>

          {/* CARREGAR ARQUIVO DE SKILL/TEXTO */}
          <button 
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.md,.json,.txt';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = (event) => {
                  const content = event.target?.result as string;
                  if (!content) return;
                  
                  setCustomSkill({
                    name: file.name,
                    content: content
                  });
                  setIsSkillBalloonVisible(true);
                  setShowWhiteboard(true);
                  setWhiteboardText(`📚 ESTUDADO SKILL: ${file.name.toUpperCase()}

🎯 DIRETRIZES DA SKILL CARREGADAS COM SUCESSO!
Use este quadro escolar para estudar e praticar com a IA.

📝 INSTRUÇÕES DE COMPORTAMENTO ATIVO:
${content.replace(/[\#\*]/g, '').trim().slice(0, 400)}...

💬 DICA DE ESTUDO:
Você pode pedir para a IA elaborar lições ou escrever dados diretamente aqui nesta lousa!`);
                  addNotification(`Skill "${file.name}" integrada! A Lousa de Explicação foi ativada ao lado para você estudar.`, "success");
                };
                reader.readAsText(file);
              };
              input.click();
            }}
            className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 transition-all shrink-0 flex items-center justify-center gap-1 group active:scale-95 cursor-pointer" 
            title="Carregar Arquivo de Skill (.md, .json, .txt) para ativação imediata"
          >
            <Plus size={13} className="group-hover:rotate-90 transition-transform duration-350" />
            <span className="text-[9px] font-mono font-bold tracking-wider hidden xs:inline-block">SKILL</span>
          </button>

          {customSkill && (
            <div className="flex items-center gap-2 px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/20 rounded-md text-[9px] font-mono text-emerald-300 shrink-0 select-none">
              <span className="flex h-1.5 w-1.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span 
                onClick={() => setIsSkillBalloonVisible(!isSkillBalloonVisible)}
                className="truncate max-w-[100px] sm:max-w-[150px] font-semibold cursor-pointer hover:text-emerald-100 transition-colors" 
                title="Clique para alternar visualização do Balão de Pensamento"
              >
                Artifício: {customSkill.name} {!isSkillBalloonVisible && <span className="opacity-60 text-[8px] font-bold tracking-wider">(Oculto)</span>}
              </span>
              
              <button
                onClick={() => setIsSkillBalloonVisible(!isSkillBalloonVisible)}
                className="p-0.5 rounded hover:bg-white/5 text-white/50 hover:text-white transition-all cursor-pointer inline-flex items-center justify-center shrink-0"
                title={isSkillBalloonVisible ? "Ocultar Balão" : "Mostrar Balão"}
              >
                {isSkillBalloonVisible ? <EyeOff size={10} /> : <Eye size={10} />}
              </button>

              <button 
                onClick={() => {
                  setCustomSkill(null);
                  addNotification("Diretrizes de Skill limpas.", "info");
                }}
                className="p-0.5 rounded hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-all cursor-pointer inline-flex items-center justify-center shrink-0"
                title="Desativar e Remover Skill"
              >
                <Trash2 size={10} />
              </button>
            </div>
          )}
          
          <div className="w-[1px] h-3 bg-white/10 mx-1 shrink-0" />

          <button 
            onClick={handleReadWorkspaceText} 
            className={cn(
              "p-1.5 rounded-lg transition-colors shrink-0 flex items-center justify-center gap-1.5 border border-transparent",
              isReadingWorkspace 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20" 
                : "hover:bg-white/5 text-white/30 hover:text-white"
            )} 
            title={isReadingWorkspace ? "Parar Leitura" : "Ouvir Texto com Voz Natural e Inteligente"}
          >
            {isReadingWorkspace ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            ) : (
              <Volume2 size={13} />
            )}
            <span className="text-[9px] font-mono font-bold hidden sm:inline">OUVIR NARRATIVA</span>
          </button>

          <button 
            onClick={handleDownloadWorkspaceTts} 
            disabled={isGeneratingWorkspaceMp3}
            className={cn(
              "p-1.5 rounded-lg transition-colors shrink-0 flex items-center justify-center gap-1.5 border border-transparent",
              isGeneratingWorkspaceMp3 
                ? "bg-amber-500/10 border-amber-500/20 text-amber-400" 
                : "hover:bg-white/5 text-white/30 hover:text-white"
            )} 
            title="Baixar Narrativa em Formato de Áudio MP3"
          >
            {isGeneratingWorkspaceMp3 ? (
              <Loader2 size={12} className="animate-spin text-amber-400" />
            ) : (
              <Download size={13} />
            )}
            <span className="text-[9px] font-mono font-bold hidden sm:inline">EXPORTAR MP3</span>
          </button>

          {/* Dropdown de Exportar Documento */}
          <div className="relative shrink-0">
            <button
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className={cn(
                "p-1.5 rounded-lg transition-all shrink-0 flex items-center justify-center gap-1.5 border cursor-pointer",
                isExportMenuOpen
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  : "border-transparent hover:bg-white/5 text-white/30 hover:text-white"
              )}
              title="Baixar Texto / Documento em vários formatos"
            >
              {isGeneratingDocument ? (
                <Loader2 size={12} className="animate-spin text-amber-400" />
              ) : (
                <FileText size={13} />
              )}
              <span className="text-[9px] font-mono font-bold hidden sm:inline">BAIXAR DOCUMENTO</span>
              <ChevronDown size={10} className={cn("transition-transform duration-200 opacity-60", isExportMenuOpen && "rotate-180")} />
            </button>

            {isExportMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-[60]" 
                  onClick={() => setIsExportMenuOpen(false)}
                />
                <div className={cn(
                  "absolute top-full right-0 mt-1.5 w-52 rounded-xl border p-1 shadow-2xl z-[70] flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-1 duration-150",
                  writingTheme === 'charcoal' ? "bg-[#111317] border-white/5 shadow-black/80 text-zinc-100" :
                  writingTheme === 'midnight' ? "bg-black border-white/[0.05] shadow-black/95 text-zinc-200" :
                  writingTheme === 'sepia' ? "bg-[#1a1513] border-[#2e2520] shadow-black/60 text-[#eedbd0]" :
                  "bg-[#07100b] border-emerald-950/60 shadow-black/80 text-emerald-100"
                )}>
                  <div className="px-2 py-1.5 text-[8px] font-mono font-bold uppercase tracking-wider opacity-45 border-b border-white/5 mb-1 select-none">
                    Formatos de Exportação
                  </div>
                  
                  <button
                    onClick={() => handleDownloadDocument('txt')}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10.5px] font-mono hover:bg-white/5 text-left transition-colors cursor-pointer w-full text-current"
                  >
                    <span>Texto Cru (.txt)</span>
                    <span className="text-[8px] opacity-40 px-1 py-0.5 rounded bg-white/5">Simples</span>
                  </button>

                  <button
                    onClick={() => handleDownloadDocument('md')}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10.5px] font-mono hover:bg-white/5 text-left transition-colors cursor-pointer w-full text-current"
                  >
                    <span>Markdown (.md)</span>
                    <span className="text-[8px] opacity-40 px-1 py-0.5 rounded bg-white/5">Rich</span>
                  </button>

                  <button
                    onClick={() => handleDownloadDocument('html')}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10.5px] font-mono hover:bg-white/5 text-left transition-colors cursor-pointer w-full text-current"
                  >
                    <span>Página Web (.html)</span>
                    <span className="text-[8px] text-amber-400 font-bold px-1 py-0.5 rounded bg-amber-500/10">Estilizado</span>
                  </button>

                  <button
                    onClick={() => handleDownloadDocument('docx')}
                    disabled={isGeneratingDocument !== null}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10.5px] font-mono hover:bg-white/5 text-left transition-colors cursor-pointer w-full text-current disabled:opacity-50"
                  >
                    <span>Documento Word (.docx)</span>
                    <span className="text-[8px] text-blue-400 font-bold px-1 py-0.5 rounded bg-blue-500/10">MS Word</span>
                  </button>

                  <button
                    onClick={() => handleDownloadDocument('pdf')}
                    disabled={isGeneratingDocument !== null}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10.5px] font-mono hover:bg-white/5 text-left transition-colors cursor-pointer w-full text-current disabled:opacity-50"
                  >
                    <span>Documento PDF (.pdf)</span>
                    <span className="text-[8px] text-red-400 font-bold px-1 py-0.5 rounded bg-red-500/10">Impressão</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Word counter and reading time details if text of interest */}
        {!writingFocusMode && writingSubMode === 'text' && (
          <div className="hidden md:flex items-center gap-4 text-[10px] font-mono text-white/40">
            <div className="flex items-center gap-1" title="Meta de Palavras">
              <Zap size={10} className="text-amber-400" />
              <span>{workspaceText.trim() === '' ? 0 : workspaceText.trim().split(/\s+/).length} / {writingWordGoal}p</span>
            </div>
            <div className="flex items-center gap-1" title="Tempo de Leitura">
              <BookOpen size={10} className="text-cyan-400" />
              <span>{Math.ceil((workspaceText.trim() === '' ? 0 : workspaceText.trim().split(/\s+/).length) / 200)} min</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {/* Dynamic metrics for small screens */}
          {writingSubMode === 'text' && (
            <div className="md:hidden flex items-center gap-2 text-[8px] font-mono opacity-40">
              <span>{workspaceText.trim() === '' ? 0 : workspaceText.trim().split(/\s+/).length}p</span>
            </div>
          )}

          {/* Desfazer (Ctrl+Z) Button */}
          {writingSubMode === 'text' && (
            <button
              onClick={handleUndoWorkspaceText}
              disabled={workspaceHistory.length === 0}
              className={cn(
                "p-1.5 rounded-lg transition-all border shrink-0 flex items-center justify-center gap-1.5 text-[10px] font-mono",
                workspaceHistory.length > 0
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 active:scale-95 cursor-pointer"
                  : "border-white/5 text-white/10 cursor-not-allowed opacity-55"
              )}
              title={workspaceHistory.length > 0 ? "Desfazer alteração (Ctrl+Z)" : "Nada para desfazer"}
            >
              <Undo size={13} className={workspaceHistory.length > 0 ? "text-amber-400 animate-pulse" : ""} />
              <span className="hidden sm:inline-block">Desfazer</span>
            </button>
          )}

          {/* Focus Mode selection */}
          <button
            onClick={() => setWritingFocusMode(!writingFocusMode)}
            className={cn(
              "p-1.5 rounded-lg transition-all border shrink-0",
              writingFocusMode 
                ? "bg-amber-500/10 border-amber-500/20 text-amber-400" 
                : "border-white/5 hover:border-white/10 text-white/30 hover:text-white"
            )}
            title={writingFocusMode ? "Desativar Foco Absoluto" : "Foco Absoluto (Ocultar Distrações)"}
          >
            {writingFocusMode ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>

          {/* Stylized sidebar launcher */}
          {writingSubMode === 'text' && (
            <button
              onClick={() => setIsSidebarSettingsOpen(!isSidebarSettingsOpen)}
              className={cn(
                "p-1.5 rounded-lg transition-all border shrink-0",
                isSidebarSettingsOpen 
                  ? "bg-her-accent/15 border-her-accent/30 text-her-accent" 
                  : "border-white/5 hover:border-white/10 text-white/30 hover:text-white"
              )}
              title="Ateliê de Customização"
            >
              <Sliders size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Corpo de Trabalho */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 relative overflow-hidden">
        {writingSubMode === 'text' ? (
          <div className="flex-1 flex flex-col min-h-0 w-full h-full relative transition-all duration-300">
            {/* Balão de Pensamento Cognitivo Flutuante */}
            <AnimatePresence>
              {customSkill && isSkillBalloonVisible && (
                <motion.div
                  key="custom-skill-thought-balloon"
                  initial={{ opacity: 0, scale: 0.9, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 15 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  className="absolute top-4 right-4 md:right-8 z-40 max-w-[280px] sm:max-w-[340px]"
                >
                  <div className={cn(
                    "relative rounded-3xl p-4 border backdrop-blur-md transition-all duration-300 select-none",
                    writingTheme === 'charcoal' ? "bg-[#111317]/95 border-white/5 text-zinc-100 shadow-[0_12px_36px_rgba(0,0,0,0.65)]" :
                    writingTheme === 'midnight' ? "bg-black/92 border-white/[0.04] text-zinc-200 shadow-[0_12px_36px_rgba(0,0,0,0.85)]" :
                    writingTheme === 'sepia' ? "bg-[#1b1613]/98 border-[#2e241e] text-[#eedbd0] shadow-[0_12px_36px_rgba(0,0,0,0.55)]" :
                    "bg-[#07100b]/98 border-emerald-950/60 text-emerald-100 shadow-[0_12px_36px_rgba(0,0,0,0.65)]"
                  )}>
                    <div className="absolute -bottom-2 right-12 flex flex-col items-center gap-1">
                      <div className={cn(
                        "w-3.5 h-3.5 rounded-full border transform -translate-y-0.5",
                        writingTheme === 'charcoal' ? "bg-[#111217] border-white/5" :
                        writingTheme === 'midnight' ? "bg-black border-white/[0.04]" :
                        writingTheme === 'sepia' ? "bg-[#1b1613] border-[#2e241e]" :
                        "bg-[#07100b] border-emerald-950/60"
                      )} />
                      <div className={cn(
                        "w-2 h-2 rounded-full border transform -translate-y-[1.5px] opacity-80",
                        writingTheme === 'charcoal' ? "bg-[#111217] border-white/5" :
                        writingTheme === 'midnight' ? "bg-black border-white/[0.04]" :
                        writingTheme === 'sepia' ? "bg-[#1b1613] border-[#2e241e]" :
                        "bg-[#07100b] border-emerald-950/60"
                      )} />
                    </div>

                    <div className="flex items-start justify-between gap-3 mb-2 pb-1.5 border-b border-white/5">
                      <div className="flex items-center gap-2">
                        <div className="w-6.5 h-6.5 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                          <Brain size={13} className="animate-pulse" />
                        </div>
                        <div className="flex flex-col text-left">
                          <span className={cn(
                            "text-[8px] font-mono font-bold tracking-widest uppercase",
                            writingTheme === 'forest' ? "text-emerald-400" : "text-amber-500"
                          )}>
                            Cognição Integrada
                          </span>
                          <span className="text-[11px] font-semibold leading-tight truncate max-w-[130px] sm:max-w-[180px]" title={customSkill.name}>
                            {customSkill.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setIsSkillBalloonExpanded(!isSkillBalloonExpanded)}
                          className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all text-[8px] font-mono uppercase tracking-wider cursor-pointer"
                          title={isSkillBalloonExpanded ? "Ocultar regras" : "Ver diretrizes"}
                        >
                          {isSkillBalloonExpanded ? "Fechar" : "Regras"}
                        </button>
                        <button
                          onClick={() => {
                            setIsSkillBalloonVisible(false);
                            addNotification("Balão de Pensamento minimizado. A Skill continua ativa no sistema!", "info");
                          }}
                          className="p-1 rounded-md hover:bg-white/5 text-white/40 hover:text-white transition-colors cursor-pointer"
                          title="Ocultar Balão (A Skill continuará ativa)"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    </div>

                    <div className="text-left">
                      <p className="text-[10px] leading-relaxed opacity-70">
                        Esta Skill está ativa de forma invisível. As solicitações enviadas ao assistente serão interpretadas de acordo com as diretrizes contidas neste arquivo.
                      </p>

                      <div className="mt-2.5 flex items-center justify-start">
                        <button
                          onClick={() => {
                            if (!customSkill) return;
                            
                            setWorkspaceText('');
                            setShowWhiteboard(true);
                            setWhiteboardText(`📚 ESTUDANDO SKILL COM IA: ${customSkill.name.toUpperCase()}

🎯 QUADRO ATIVADO COM SUCESSO!
A IA de chat recebeu os dados de sincronização. Ela escreverá as notas de estudo e exercícios aqui mesmo na lousa escolar usando os comandos especiais!

✏️ Exercícios e conteúdos gerados aparecerão abaixo...`);
                            
                            const prompt = `[DIRETRIZ DE SINCRONIZAÇÃO SUPREMA - LEITURA COMPATÍVEL]
Acabei de sincronizar a Skill personalizada "${customSkill.name}" através do meu Balão de Pensamento cognitivo.
A aba de escrita (workspace) foi LIMPA para que você comece a nela escrever do zero!

Por favor, leia atentamente as diretrizes, regras, planos e objetivos desta Skill descritos no balão e atue com base neles.
Escreva suas notas de aula, exercícios práticos, tabelas comparativas, resumos de estudo ou testes na Lousa usando as tags especiais [LOUSA] ... [/LOUSA] para eu estudar de forma dinâmica e visual nesta lousa estilizada!

Instruções imediatas obrigatórias para você (IA de Voz/Chat):
1. CONFIRME que compreendeu esta nova Skill, e faça um resumo ultra-rápido de no máximo uma frase.
2. Pergunte: "Compreendi os objetivos e regras da Skill '${customSkill.name}' e ativei a lousa de estudos ao lado. Quer que eu faça o plano e já coloque o primeiro conteúdo de estudo na lousa escolar?"
3. Se desejar passar notas, use a formatação [LOUSA] ... [/LOUSA] para desenhá-las na lousa ao lado de forma interativa!`;
                            
                            if (voiceEngine === 'gemini' && liveState.status === 'connected' && liveSessionRef.current) {
                              liveSessionRef.current.sendRealtimeInput({ text: prompt });
                              addNotification("Diretrizes de Skill integradas e lousa de escrita limpa para a IA!", "success");
                            } else {
                              handleHomeChat(prompt);
                              addNotification("Skill integrada - Lousa limpa para o assistente atuar!", "info");
                            }
                          }}
                          className="w-full py-1.5 px-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/15 hover:border-indigo-500/30 transition-all text-[9.5px] font-mono uppercase tracking-wider font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer"
                          title="Injetar e forçar o assistente a ler e reconhecer a Skill ativa imediatamente"
                        >
                          <Brain size={11} className="animate-pulse text-indigo-400" />
                          Sincronizar Cognição da IA
                        </button>
                      </div>

                      {isSkillBalloonExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2.5 pt-2 border-t border-white/5 max-h-[160px] overflow-y-auto no-scrollbar scroll-smooth"
                        >
                          <pre className="text-[9px] font-mono leading-relaxed whitespace-pre-wrap opacity-80 break-words max-w-full select-text selection:bg-emerald-500/30">
                            {customSkill.content}
                          </pre>
                        </motion.div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-white/5 text-[8.5px] font-mono text-zinc-500">
                      <span className="flex h-1.5 w-1.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                      </span>
                      <span>Conectado à Inteligência do Usuário</span>
                    </div>

                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!writingFocusMode && (
              <div className="w-full h-[1.5px] bg-white/[0.03] shrink-0">
                <motion.div 
                  className={cn(
                    "h-full transition-all duration-300",
                    writingTheme === 'sepia' ? "bg-amber-600" : writingTheme === 'forest' ? "bg-emerald-500" : "bg-her-accent"
                  )}
                  style={{
                    width: `${Math.min(Math.round(((workspaceText.trim() === '' ? 0 : workspaceText.trim().split(/\s+/).length) / writingWordGoal) * 100), 100)}%`
                  }}
                />
              </div>
            )}

            {workspaceAudioUrl && (
              <div className="mx-4 mt-3 mb-1 p-3 bg-white/[0.02] border border-white/[0.05] rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-7 h-7 rounded-xl flex items-center justify-center transition-colors shadow-inner",
                    workspaceAudioPlaying ? "bg-emerald-500/10 text-emerald-400" : "bg-white/[0.03] text-white/40"
                  )}>
                    {workspaceAudioPlaying ? (
                      <div className="flex items-end gap-[2px] h-3">
                        <span className="w-[2px] bg-emerald-400 animate-pulse h-2"></span>
                        <span className="w-[2px] bg-emerald-400 animate-pulse h-3"></span>
                        <span className="w-[2px] bg-emerald-400 animate-pulse h-3"></span>
                        <span className="w-[2px] bg-emerald-400 animate-pulse h-1.5"></span>
                        <span className="w-[2px] bg-emerald-400 animate-pulse h-2.5"></span>
                      </div>
                    ) : (
                      <VolumeX size={14} className="opacity-60 text-white/40" />
                    )}
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#ff4e00] font-bold">
                      {voiceEngine === 'elevenlabs' ? 'Narradora ElevenLabs' : 'Voz Inteligente Gemini'}
                    </span>
                    <span className="text-[10px] text-white/60 font-light truncate max-w-[150px] sm:max-w-[300px]">
                      Voz atual: <span className="font-medium text-white/80">{selectedVoice === 'Scarlet' ? 'Fenrir (Fallback)' : selectedVoice}</span>
                    </span>
                  </div>
                </div>

                <div className="flex-1 w-full max-w-xl flex items-center gap-3">
                  <button
                    onClick={handleTogglePlayWorkspaceAudio}
                    className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white transition-all hover:scale-105 active:scale-95 shrink-0"
                    title={workspaceAudioPlaying ? "Pausar Leitura" : "Retomar Leitura"}
                  >
                    {workspaceAudioPlaying ? <Pause size={14} /> : <Play size={14} className="translate-x-[0.5px]" />}
                  </button>

                  <button
                    onClick={handleStopWorkspaceAudio}
                    className="p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] text-red-400/70 hover:text-red-400 transition-all shrink-0"
                    title="Parar e Reiniciar"
                  >
                    <Square size={13} className="opacity-70 text-red-400" />
                  </button>

                  <div className="text-[10px] font-mono text-white/40 select-none shrink-0">
                    {formatAudioTime(workspaceAudioCurrentTime)}
                  </div>

                  <div className="flex-1 relative group py-1 flex items-center">
                    <input
                      type="range"
                      min={0}
                      max={workspaceAudioDuration || 100}
                      step={0.1}
                      value={workspaceAudioCurrentTime}
                      onChange={(e) => handleSeekWorkspaceAudio(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#ff4e00] hover:accent-[#ff4e00] focus:outline-none transition-all"
                    />
                  </div>

                  <div className="text-[10px] font-mono text-white/40 select-none shrink-0">
                    {formatAudioTime(workspaceAudioDuration)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadWorkspaceTts}
                    disabled={isGeneratingWorkspaceMp3}
                    className="px-3 py-1.5 rounded-xl bg-[#ff4e00]/15 hover:bg-[#ff4e00]/25 text-[#ff4e00] text-[10px] font-mono font-bold tracking-wider flex items-center gap-1.5 transition-all"
                    title="Baixar Narrativa de Áudio"
                  >
                    <Download size={11} />
                    <span>BAIXAR ÁUDIO</span>
                  </button>

                  <button
                    onClick={() => {
                      handleStopWorkspaceAudio();
                      if (workspaceAudioUrl) {
                        window.URL.revokeObjectURL(workspaceAudioUrl);
                        setWorkspaceAudioUrl(null);
                      }
                    }}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white transition-colors"
                    title="Fechar Player"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            )}

            <div className={cn(
              "w-full px-4 pt-4 pb-2 flex flex-col items-center shrink-0 z-40 transition-all duration-500",
              writingFocusMode ? "opacity-10 hover:opacity-100 focus-within:opacity-100" : "opacity-100"
            )}>
              {writingAttachedFiles.length > 0 && (
                <div className={cn(
                  "w-full flex flex-wrap gap-2 px-3 py-2 bg-black/40 border border-white/5 rounded-xl mb-2 backdrop-blur-md transition-all",
                  writingWidthMode === 'compact' ? "max-w-[650px]" :
                  writingWidthMode === 'classic' ? "max-w-[850px]" : "max-w-full"
                )}>
                  {writingAttachedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 text-[10px] text-zinc-300 border border-white/5 shadow-sm rounded-lg">
                      {file.type.startsWith('image/') ? (
                        <ImageIcon size={11} className="text-amber-500" />
                      ) : (
                        <Paperclip size={11} className="text-blue-400" />
                      )}
                      <span className="truncate max-w-[120px]">{file.name}</span>
                      <button onClick={() => removeWritingFile(idx)} className="hover:text-red-400 p-0.5 transition-colors">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className={cn(
                "w-full flex items-center bg-black/95 backdrop-blur-3xl border border-white/10 rounded-2xl p-1 shadow-2xl transition-all duration-300",
                writingWidthMode === 'compact' ? "max-w-[650px]" :
                writingWidthMode === 'classic' ? "max-w-[850px]" : "max-w-full"
              )}>
                <input 
                  type="file"
                  ref={writingFileInputRef}
                  onChange={handleWritingFileSelect}
                  multiple
                  accept="image/*,application/pdf,text/*"
                  className="hidden"
                />
                <button 
                  onClick={() => writingFileInputRef.current?.click()}
                  className="w-10 h-10 text-white/30 hover:text-white/60 hover:bg-white/5 transition-all rounded-xl flex items-center justify-center shrink-0 border border-transparent hover:border-white/5"
                  title="Anexar imagens ou documentos"
                >
                  <Paperclip size={14} />
                </button>
                <input 
                  type="text"
                  value={workspacePrompt}
                  onChange={(e) => setWorkspacePrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                  placeholder="Sussurrar comando com imagens anexadas ou texto para a IA..."
                  className="flex-1 bg-transparent px-2.5 py-2.5 focus:outline-none text-xs md:text-sm text-white/90 placeholder:text-white/20"
                />
                <button 
                  onClick={() => handleGenerate()}
                  disabled={isGenerating || (!workspacePrompt.trim() && writingAttachedFiles.length === 0)}
                  className={cn(
                    "w-9 h-9 flex items-center justify-center rounded-xl transition-all shrink-0",
                    (workspacePrompt.trim() || writingAttachedFiles.length > 0)
                      ? (writingTheme === 'sepia' ? "bg-amber-600 text-white" : writingTheme === 'forest' ? "bg-emerald-600 text-white" : "bg-her-accent text-white") 
                      : "text-white/10"
                  )}
                  title="Enviar comando de geração"
                >
                  {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar-editor p-4 md:p-8 flex justify-center w-full min-h-0 bg-transparent relative">
              <div className={cn(
                "w-full flex flex-col min-h-0 h-full transition-all duration-300",
                writingWidthMode === 'compact' ? "max-w-[650px]" :
                writingWidthMode === 'classic' ? "max-w-[850px]" : "max-w-full"
              )}>
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={activeProjectId || 'empty'}
                    initial={{ opacity: 0, scale: 0.98, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, y: -15 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-full flex flex-col"
                  >
                    <textarea 
                      value={workspaceText}
                      onChange={(e) => {
                        setWorkspaceText(e.target.value);
                        if (writingSounds) {
                          playMXKeySound();
                        }
                      }}
                      className={cn(
                        "w-full h-full bg-transparent focus:outline-none transition-all resize-none overflow-y-auto scroll-smooth custom-scrollbar-editor",
                        (playingSoundUrl && showUi) ? "pb-[160px] md:pb-40" : "pb-12 md:pb-16",
                        writingFont === 'sans' ? "font-sans leading-relaxed text-left tracking-wide" :
                        writingFont === 'mono' ? "font-mono leading-relaxed text-left text-[14px] text-emerald-400" :
                        "font-serif italic leading-loose text-left font-light"
                      )}
                      style={{ 
                        fontSize: `${writingFontSize}px`,
                        caretColor: writingTheme === 'sepia' ? '#d97706' : writingTheme === 'forest' ? '#10b981' : '#ff4e00'
                      }}
                      placeholder="Digite aqui sua obra... sinta as teclas... o silêncio conspira a seu favor."
                    />
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="absolute right-4 top-4 z-[45] flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsProjectsDockOpen(!isProjectsDockOpen)}
                    className={cn(
                      "px-3.5 py-2 rounded-2xl border text-xs font-mono font-bold flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-all backdrop-blur-md cursor-pointer",
                      isProjectsDockOpen
                        ? (writingTheme === 'sepia' ? "bg-amber-950/90 border-amber-600/50 text-amber-300" : writingTheme === 'forest' ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-400" : "bg-zinc-900/90 border-white/20 text-white")
                        : (writingTheme === 'sepia' ? "bg-amber-600/10 border-amber-600/20 text-amber-300/70 hover:text-amber-300" : writingTheme === 'forest' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400/70 hover:text-emerald-400" : "bg-white/5 border-white/10 text-white/70 hover:text-white")
                    )}
                    title="Alternar Área de Transferência de Projetos de Texto / Quadros"
                  >
                    <FileText size={14} className={cn("transition-transform", isProjectsDockOpen ? "rotate-12" : "")} />
                    <span>MÚLTIPLOS QUADROS</span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0",
                      writingTheme === 'sepia' ? "bg-amber-600/20 text-amber-300" : writingTheme === 'forest' ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white"
                    )}>
                      {writingProjects.length}
                    </span>
                  </button>
                </div>

                <AnimatePresence>
                  {isProjectsDockOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-[40]" 
                        onClick={() => setIsProjectsDockOpen(false)} 
                      />

                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          "w-80 max-h-[480px] rounded-2xl border p-4 shadow-2xl backdrop-blur-2xl flex flex-col gap-3 overflow-hidden select-none z-[45] mt-1 relative",
                          writingTheme === 'charcoal' ? "bg-[#101216]/95 border-white/10 shadow-black/80" :
                          writingTheme === 'midnight' ? "bg-black/95 border-white/[0.04] shadow-black" :
                          writingTheme === 'sepia' ? "bg-[#181412]/98 border-[#2e241e] text-[#eedbd0] shadow-black/70" :
                          "bg-[#060c08]/98 border-emerald-950/50 text-emerald-100 shadow-black/80"
                        )}
                      >
                        <div className="flex items-center justify-between border-b border-white/5 pb-2 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <Sparkles size={11} className={writingTheme === 'forest' ? "text-emerald-400" : "text-amber-500"} />
                            <span className="text-[9px] uppercase tracking-wider font-mono font-bold opacity-60">Histórico de Quadros</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleStartNewProject()}
                              className={cn(
                                "px-2 py-1 rounded-lg text-[9px] font-mono font-bold flex items-center gap-1 hover:scale-105 active:scale-95 transition-all border shrink-0 cursor-pointer",
                                writingTheme === 'sepia' ? "bg-amber-600/20 border-amber-600/30 text-amber-300" : writingTheme === 'forest' ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" : "bg-white/10 border-white/10 text-white"
                              )}
                              title="Iniciar um novo quadro em branco e reservar o atual"
                            >
                              <Plus size={10} />
                              <span>NOVO QUADRO</span>
                            </button>
                            <button
                              onClick={() => setIsProjectsDockOpen(false)}
                              className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer shrink-0"
                              title="Fechar Múltiplos Quadros"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-2 pr-0.5">
                          {writingProjects.length === 0 ? (
                            <div className="text-center py-8 text-[11px] opacity-40 font-mono">
                              Nenhum quadro guardado.
                            </div>
                          ) : (
                            writingProjects.map((proj) => {
                              const isActive = proj.id === activeProjectId;
                              const wordCount = proj.content.trim() ? proj.content.trim().split(/\s+/).length : 0;
                              const excerpt = proj.content ? proj.content.replace(/[\#\*\_]/g, '').slice(0, 75) + '...' : 'Sem conteúdo';
                              
                              return (
                                <motion.div
                                  key={proj.id}
                                  onClick={() => handleSelectProject(proj.id)}
                                  whileHover={{ scale: 1.01 }}
                                  className={cn(
                                    "p-3 rounded-xl border text-left transition-all cursor-pointer relative group flex flex-col gap-1.5",
                                    isActive
                                      ? (writingTheme === 'sepia' ? "bg-amber-950/40 border-amber-600/60 ring-1 ring-amber-600/30" : writingTheme === 'forest' ? "bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/30" : "bg-white/10 border-white/25 ring-1 ring-white/10")
                                      : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10"
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-1.5">
                                    <div className="flex flex-col min-w-0 flex-1">
                                      <span className={cn(
                                        "text-xs font-semibold truncate leading-snug",
                                        isActive 
                                          ? (writingTheme === 'sepia' ? "text-amber-300" : writingTheme === 'forest' ? "text-emerald-400" : "text-white") 
                                          : "text-white/70"
                                      )}>
                                        {proj.title || 'Rascunho Sem Título'}
                                      </span>
                                      <span className="text-[8px] opacity-35 font-mono">
                                        Criado em {new Date(proj.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {wordCount} palavras
                                      </span>
                                    </div>

                                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigator.clipboard.writeText(proj.content);
                                          addNotification("Conteúdo do quadro copiado!", "success");
                                        }}
                                        className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all cursor-pointer"
                                        title="Copiar texto para área de transferência"
                                      >
                                        <Copy size={10} />
                                      </button>
                                      <button
                                        onClick={(e) => handleDeleteProject(proj.id, e)}
                                        className="p-1 rounded hover:bg-red-500/10 text-red-400/40 hover:text-red-400 transition-all cursor-pointer"
                                        title="Eliminar este quadro permanentemente"
                                      >
                                        <Trash2 size={10} />
                                      </button>
                                    </div>
                                  </div>

                                  <p className="text-[9.5px] opacity-40 font-light truncate max-w-full">
                                    {excerpt}
                                  </p>

                                  {isActive && (
                                    <span className={cn(
                                      "absolute top-2.5 right-2.5 flex h-1.5 w-1.5",
                                      writingTheme === 'sepia' ? "text-amber-500" : writingTheme === 'forest' ? "text-emerald-400" : "text-white"
                                    )}>
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current"></span>
                                    </span>
                                  )}
                                </motion.div>
                              );
                            })
                          )}
                        </div>

                        <div className="border-t border-white/5 pt-2 text-[8px] font-mono opacity-30 leading-snug">
                          Sempre que quiser começar uma nova escrita do zero, use "+ NOVO QUADRO". Suas criações antigas continuarão seguras aqui.
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full h-full overflow-hidden flex flex-col p-4 md:p-6 bg-[#030303]/40 border border-white/5 rounded-xl m-2 md:m-4">
            <div className="flex items-center justify-between mb-3.5 px-1 pb-1 border-b border-white/[0.03]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                <span className="text-[10px] uppercase tracking-widest font-bold font-mono text-white/50">Prévia do Código HTML & Tailwind</span>
              </div>
              <span className="text-[9px] font-mono text-white/30 hidden sm:inline">Renderização dinâmica e ágil via IFrame</span>
            </div>
            <div className="flex-1 min-h-0 w-full rounded-lg overflow-hidden bg-white/5 text-black">
              <CodePreview code={workspaceText} />
            </div>
          </div>
        )}

        {/* Sidebar com Ferramentas & Assistentes Rápidos */}
        <AnimatePresence>
          {isSidebarSettingsOpen && writingSubMode === 'text' && (
            <motion.div 
              initial={{ opacity: 0, x: 280 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 280 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className={cn(
                "w-72 border-l shrink-0 flex flex-col h-full overflow-y-auto p-5 custom-scrollbar-preview z-40 relative",
                writingTheme === 'charcoal' ? "bg-[#0b0c0e] border-white/5" :
                writingTheme === 'midnight' ? "bg-[#050505] border-white/[0.03]" :
                writingTheme === 'sepia' ? "bg-[#161311] border-[#2c241e]" :
                "bg-[#040805] border-emerald-950/30"
              )}
            >
              <div className="flex items-center justify-between mb-6 shrink-0 pb-2 border-b border-white/5">
                <span className="text-[10px] uppercase tracking-widest font-bold font-mono text-white/40">Customização</span>
                <button 
                  onClick={() => setIsSidebarSettingsOpen(false)}
                  className="hover:bg-white/5 p-1 rounded text-white/30 hover:text-white transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Font switcher */}
              <div className="mb-5">
                <label className="text-[9px] uppercase font-mono text-white/30 tracking-wider mb-2 block">Família de Fonte</label>
                <div className="grid grid-cols-3 gap-1 bg-white/[0.02] border border-white/5 rounded-lg p-0.5">
                  {(['serif', 'sans', 'mono'] as const).map((font) => (
                    <button
                      key={font}
                      onClick={() => setWritingFont(font)}
                      className={cn(
                        "py-1 text-[9px] font-medium rounded transition-all text-center uppercase tracking-wider font-mono",
                        writingFont === font 
                          ? "bg-white/10 text-white font-bold" 
                          : "text-white/30 hover:text-white"
                      )}
                    >
                      {font}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font size */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[9px] uppercase font-mono text-white/30 tracking-wider">Escala do Texto</label>
                  <span className="text-[10px] font-mono text-white/50">{writingFontSize}px</span>
                </div>
                <div className="flex items-center gap-1 bg-white/[0.02] border border-white/5 rounded-lg p-0.5">
                  <button 
                    onClick={() => setWritingFontSize(prev => Math.max(14, prev - 1))}
                    className="flex-1 py-1 text-xs hover:bg-white/5 text-white/50 font-mono transition-colors"
                  >
                    A-
                  </button>
                  <button 
                    onClick={() => setWritingFontSize(18)}
                    className="px-2 py-1 text-[8px] hover:bg-white/5 text-white/30 transition-all font-mono"
                    title="Resetar"
                  >
                    <RotateCcw size={9} />
                  </button>
                  <button 
                    onClick={() => setWritingFontSize(prev => Math.min(28, prev + 1))}
                    className="flex-1 py-1 text-xs hover:bg-white/5 text-white/50 font-mono transition-colors"
                  >
                    A+
                  </button>
                </div>
              </div>

              {/* Writing Themes */}
              <div className="mb-5">
                <label className="text-[9px] uppercase font-mono text-white/30 tracking-wider mb-2 block">Paleta de Ambiente</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['charcoal', 'midnight', 'sepia', 'forest'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setWritingTheme(t)}
                      className={cn(
                        "py-2 px-1 text-[9px] uppercase tracking-wider font-mono rounded-lg border text-center transition-all",
                        writingTheme === t 
                          ? (t === 'sepia' ? "border-amber-600/50 bg-amber-650/15 text-amber-300 font-bold" : t === 'forest' ? "border-emerald-500/50 bg-emerald-650/15 text-emerald-300 font-bold" : "border-her-accent bg-her-accent/5 text-her-accent font-bold") 
                          : "border-white/5 text-white/30 hover:border-white/10 hover:text-white"
                      )}
                    >
                      {t === 'charcoal' ? 'Chumbo' : t === 'midnight' ? 'Onyx' : t === 'sepia' ? 'Sépia' : 'Floresta'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margin Width */}
              <div className="mb-5">
                <label className="text-[9px] uppercase font-mono text-white/30 tracking-wider mb-2 block">Foco da Margem</label>
                <div className="grid grid-cols-3 gap-1 bg-white/[0.02] border border-white/5 rounded-lg p-0.5">
                  {(['compact', 'classic', 'wide'] as const).map((wm) => (
                    <button
                      key={wm}
                      onClick={() => setWritingWidthMode(wm)}
                      className={cn(
                        "py-1.5 text-[9px] font-medium rounded transition-all text-center uppercase tracking-wider font-mono",
                        writingWidthMode === wm 
                          ? "bg-white/10 text-white font-bold" 
                          : "text-white/30 hover:text-white"
                      )}
                    >
                      {wm === 'compact' ? 'Fata' : wm === 'classic' ? 'Padrão' : 'Ampla'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sound typing simulation */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[9px] uppercase font-mono text-white/30 tracking-wider">Música das Teclas</label>
                  <span className={cn(
                    "text-[8px] px-1 py-0.5 font-mono uppercase tracking-widest rounded font-bold",
                    writingSounds ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-white/20"
                  )}>
                    {writingSounds ? 'Sons On' : 'Sons Off'}
                  </span>
                </div>
                <p className="text-[8px] text-white/35 font-mono leading-relaxed mb-2">
                  Cliques de interruptores mecânicos virtuais gerados em tempo real na saída de áudio para amplificar foco.
                </p>
                <button
                  onClick={() => {
                    setWritingSounds(!writingSounds);
                    if(!writingSounds) setTimeout(playMXKeySound, 100);
                  }}
                  className={cn(
                    "w-full py-1.5 rounded-lg text-[9px] uppercase font-bold tracking-widest transition-all",
                    writingSounds 
                      ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10" 
                      : "bg-white/5 hover:bg-white/10 text-white border border-white/5"
                  )}
                >
                  {writingSounds ? 'Silenciar' : 'Gerar Cliques'}
                </button>
              </div>

              {/* Daily word goal */}
              <div className="mb-5">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] uppercase font-mono text-white/30 tracking-wider">Meta de Palavras</label>
                  <span className="text-[10px] font-mono text-white/50">{writingWordGoal}p</span>
                </div>
                <input 
                  type="range" 
                  min="100" 
                  max="1500" 
                  step="50"
                  value={writingWordGoal}
                  onChange={(e) => setWritingWordGoal(Number(e.target.value))}
                  className="w-full mt-2 accent-her-accent"
                />
              </div>

              {/* Predefined prompts */}
              <div className="mt-4 pt-5 border-t border-white/5">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Sparkles size={11} className="text-her-accent" />
                  <span className="text-[10px] font-mono text-white/40 tracking-wider uppercase font-bold">Assistentes de Texto</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    { label: 'Refinar Prosa', prompt: 'Melhore a fluidez, ritmo e elegância deste texto, tornando-o impecável:' },
                    { label: 'Expandir Ideia', prompt: 'Desenvolva de forma profunda, imersiva e detalhada esta passagem:' },
                    { label: 'Reescrever Lírico', prompt: 'Reescreva a seguinte passagem usando uma linguagem highly poética e evocativa:' },
                    { label: 'Corrigir Ortografia', prompt: 'Corrija erros ortográficos de coesão e pontuação sem alterar as ideias:' },
                    { label: 'Gerar Títulos', prompt: 'Crie 5 sugestões de títulos incríveis e artísticos para o seguinte material:' }
                  ].map((assist, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setWorkspacePrompt(`${assist.prompt}\n\nGera com base nesse conteúdo: "${workspaceText ? workspaceText.slice(0, 800) : ''}"`);
                        addNotification(`Instrução "${assist.label}" preenchida! Clique no botão Enviar de IA.`, "info");
                      }}
                      className="text-left p-2 rounded-lg bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all group"
                    >
                      <div className="text-[9px] font-bold text-white/70 group-hover:text-amber-400 transition-colors font-mono">{assist.label}</div>
                      <div className="text-[7.5px] text-white/30 font-mono truncate mt-0.5">{assist.prompt}</div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
