import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertCircle, ChevronRight, ChevronLeft, Loader2, VolumeX, Volume2, 
  Plus, MessageSquare, Trash2, BookOpen, RefreshCw, Folder, Eye, EyeOff, 
  Heart, Lock, Copy, Maximize, Languages, MonitorOff, Monitor, Mic, MicOff, 
  Paperclip, Globe, Send, X 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { InfinityLogo } from './InfinityLogo';
import { VoiceSwitcher } from './VoiceSwitcher';
import { DUO_COMBOS, DUO_TOPICS } from '../constants/osoneConstants';

interface HomeWorkspaceSectionProps {
  isServerQuotaExhausted: boolean;
  apiKeys: any;
  setApiKeys: (keys: any) => void;
  setIsSettingsOpen: (open: boolean) => void;
  chatHistory: any[];
  setChatHistory: React.Dispatch<React.SetStateAction<any[]>>;
  showUi: boolean;
  isChatExpanded: boolean;
  setIsChatExpanded: (expanded: boolean) => void;
  voicePageIndex: number;
  setVoicePageIndex: (index: number) => void;
  liveState: any;
  stopLiveSession: () => void;
  startLiveSession: () => void;
  isElevenLabsLiveActive: boolean;
  stopElevenLabsLiveSession: () => void;
  addNotification: (msg: string, type?: any) => void;
  orbCenterMode: boolean;
  handleVoiceToggle: () => void;
  isSlapped: boolean;
  isSpeaking: boolean;
  orbStyle: any;
  isGenerating: boolean;
  isAnalyzingCode: boolean;
  isTranscribing: boolean;
  isModelSearching: boolean;
  orbSize: number;
  slapReactionText: string;
  subtitlesEnabled: boolean;
  setSubtitlesEnabled: (enabled: boolean) => void;
  voiceTranscript: string;
  isListening: boolean;
  isWaitingForWakeWord: boolean;
  isVoiceOutputPaused: boolean;
  setIsVoiceOutputPaused: (paused: boolean) => void;
  interruptVoiceResponse: () => void;
  isSessionsOpen: boolean;
  setIsSessionsOpen: (open: boolean) => void;
  handleCreateNewSession: () => void;
  chatSessions: any[];
  activeSessionId: string | null;
  handleSwitchSession: (id: string) => void;
  handleDeleteSession: (id: string, e: React.MouseEvent) => void;
  customSkill: any;
  isConfirmingOptimize: boolean;
  setIsConfirmingOptimize: (confirming: boolean) => void;
  setMessagesToRecord: (msgs: any[]) => void;
  setPendingAction: (action: any) => void;
  setIsMemoryConfirmOpen: (open: boolean) => void;
  isConfirmingClear: boolean;
  setIsConfirmingClear: (confirming: boolean) => void;
  checkAndPromptMemory: (callback: () => void) => void;
  isDuoMode: boolean;
  duoTopicId: string;
  duoComboId: string;
  duoSpeakingHost: 'hostA' | 'hostB' | null;
  parseDuoTextToTurns: (text: string, combo: any) => any[];
  playDuoSpeech: (text: string) => void;
  handleSpeakChatMessage: (text: string, id: string) => void;
  isPlayingChatSpeech: string | null;
  setWorkspaceMode: (mode: any) => void;
  isSentinelActive: boolean;
  sensusMood: any;
  getMoodLabel: (mood: any) => string;
  osoneOrbImage: string;
  setFullScreenImage: (url: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  selectedVoice: string;
  setSelectedVoice: (voice: string) => void;
  isVoiceSwitcherOpen: boolean;
  setIsVoiceSwitcherOpen: (open: boolean) => void;
  isTranslationMode: boolean;
  setIsTranslationMode: (mode: boolean) => void;
  liveSessionRef: any;
  isScreenSharing: boolean;
  startScreenSharing: () => Promise<void>;
  stopScreenSharing: () => void;
  handleTranscriptionToggle: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  toggleCamera: () => void;
  isCameraActive: boolean;
  attachedFiles: any[];
  removeFile: (idx: number) => void;
  isGoogleSearchActive: boolean;
  setIsGoogleSearchActive: (active: boolean) => void;
  homePrompt: string;
  setHomePrompt: (prompt: string) => void;
  handleHomeChat: (prompt?: string) => void;
}

export const HomeWorkspaceSection: React.FC<HomeWorkspaceSectionProps> = ({
  isServerQuotaExhausted,
  apiKeys,
  setApiKeys,
  setIsSettingsOpen,
  chatHistory,
  setChatHistory,
  showUi,
  isChatExpanded,
  setIsChatExpanded,
  voicePageIndex,
  setVoicePageIndex,
  liveState,
  stopLiveSession,
  startLiveSession,
  isElevenLabsLiveActive,
  stopElevenLabsLiveSession,
  addNotification,
  orbCenterMode,
  handleVoiceToggle,
  isSlapped,
  isSpeaking,
  orbStyle,
  isGenerating,
  isAnalyzingCode,
  isTranscribing,
  isModelSearching,
  orbSize,
  slapReactionText,
  subtitlesEnabled,
  setSubtitlesEnabled,
  voiceTranscript,
  isListening,
  isWaitingForWakeWord,
  isVoiceOutputPaused,
  setIsVoiceOutputPaused,
  interruptVoiceResponse,
  isSessionsOpen,
  setIsSessionsOpen,
  handleCreateNewSession,
  chatSessions,
  activeSessionId,
  handleSwitchSession,
  handleDeleteSession,
  customSkill,
  isConfirmingOptimize,
  setIsConfirmingOptimize,
  setMessagesToRecord,
  setPendingAction,
  setIsMemoryConfirmOpen,
  isConfirmingClear,
  setIsConfirmingClear,
  checkAndPromptMemory,
  isDuoMode,
  duoTopicId,
  duoComboId,
  duoSpeakingHost,
  parseDuoTextToTurns,
  playDuoSpeech,
  handleSpeakChatMessage,
  isPlayingChatSpeech,
  setWorkspaceMode,
  isSentinelActive,
  sensusMood,
  getMoodLabel,
  osoneOrbImage,
  setFullScreenImage,
  chatEndRef,
  selectedVoice,
  setSelectedVoice,
  isVoiceSwitcherOpen,
  setIsVoiceSwitcherOpen,
  isTranslationMode,
  setIsTranslationMode,
  liveSessionRef,
  isScreenSharing,
  startScreenSharing,
  stopScreenSharing,
  handleTranscriptionToggle,
  fileInputRef,
  handleFileSelect,
  toggleCamera,
  isCameraActive,
  attachedFiles,
  removeFile,
  isGoogleSearchActive,
  setIsGoogleSearchActive,
  homePrompt,
  setHomePrompt,
  handleHomeChat,
}) => {
  return (
    <motion.div 
      key="home"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center w-full h-full relative overflow-hidden"
    >
      {isServerQuotaExhausted && !apiKeys.gemini && (
        <div className="w-full max-w-4xl mx-auto px-4 md:px-6 pt-3 pb-1 shrink-0 z-50">
          <div className="bg-amber-500/10 border border-amber-500/25 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-left">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="text-amber-400 shrink-0 mt-0.5 animate-pulse" size={16} />
              <div>
                <span className="block text-xs font-bold text-amber-300 font-sans">Cota Neural do Servidor Esgotada (Erro 429)</span>
                <p className="text-[11px] text-zinc-300 leading-normal mt-0.5 font-sans">
                  A chave de API padrão e embutida no servidor atingiu temporariamente o limite de uso global. Para continuar usando o assistente OSONE de forma estável, conecte uma chave de API própria e gratuita do Gemini.
                </p>
              </div>
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-xl text-[10px] text-amber-200 uppercase font-bold tracking-widest shrink-0 transition-all cursor-pointer active:scale-98 font-sans"
            >
              Configurar Chave
            </button>
          </div>
        </div>
      )}

      {chatHistory.length === 0 && (
        <div className={cn(
          "mb-2 md:mb-8 text-center shrink-0 hidden md:block transition-all duration-500",
          !showUi && "opacity-0 scale-95 pointer-events-none"
        )}>
          <h1 className="text-3xl md:text-5xl font-serif italic tracking-[0.3em] text-her-ink/20">OSONE G5</h1>
          <div className="h-[1px] w-12 bg-her-accent/20 mx-auto mt-3" />
        </div>
      )}

      <div className="flex-1 w-full flex flex-col min-h-0 gap-2 md:gap-6 relative">
        {/* Arrow navigation to switch pages */}
        {chatHistory.length === 0 && !isChatExpanded && showUi && (
          <>
            {voicePageIndex === 0 && (
              <div className="absolute right-6 top-1/2 -translate-y-1/2 z-[60] flex flex-col items-center gap-1.5">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (liveState.status === 'connected') stopLiveSession();
                    setVoicePageIndex(1);
                    addNotification("Canal Sintonizado: ElevenLabs Premium", "success");
                  }}
                  className="w-12 h-12 rounded-full bg-white/[0.02] hover:bg-[#ff4e00]/10 text-white/40 hover:text-[#ff4e00] hover:scale-110 active:scale-95 transition-all duration-300 border border-white/5 hover:border-[#ff4e00]/20 flex items-center justify-center shrink-0 shadow-xl cursor-pointer"
                  title="Voz Premium ElevenLabs"
                >
                  <ChevronRight size={22} className="translate-x-[1px]" />
                </button>
                <span className="text-[8px] font-mono uppercase tracking-[0.25em] text-white/30 font-bold">ElevenLabs</span>
              </div>
            )}
            {voicePageIndex === 1 && (
              <div className="absolute left-6 top-1/2 -translate-y-1/2 z-[60] flex flex-col items-center gap-1.5">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isElevenLabsLiveActive) stopElevenLabsLiveSession();
                    setVoicePageIndex(0);
                    addNotification("Canal Sintonizado: Gemini Live", "success");
                  }}
                  className="w-12 h-12 rounded-full bg-white/[0.02] hover:bg-her-accent/10 text-white/40 hover:text-her-accent hover:scale-110 active:scale-95 transition-all duration-300 border border-white/5 hover:border-her-accent/20 flex items-center justify-center shrink-0 shadow-xl cursor-pointer"
                  title="Inteligência Gemini"
                >
                  <ChevronLeft size={22} className="-translate-x-[1px]" />
                </button>
                <span className="text-[8px] font-mono uppercase tracking-[0.25em] text-white/30 font-bold">Gemini Voice</span>
              </div>
            )}
          </>
        )}

        {/* Visualizer Area */}
        <motion.div 
          layout
          transition={{
            type: "spring",
            stiffness: 90,
            damping: 18,
            mass: 0.85
          }}
          className={cn(
            "flex flex-col items-center justify-center py-2 z-50 w-full transition-all duration-500",
            orbCenterMode
              ? isChatExpanded
                ? "relative shrink-0 flex flex-col items-center justify-center transform scale-65 md:scale-75 origin-center pointer-events-auto py-1 mt-1"
                : "relative flex-1 flex flex-col items-center justify-center transform scale-90 md:scale-100 origin-center pointer-events-auto pt-24 md:pt-32 pb-8 my-auto"
              : ((liveState.status === 'connected' || isElevenLabsLiveActive) && !isChatExpanded)
                ? "relative flex-1 scale-90 md:scale-100 pt-24 md:pt-32 pb-8 my-auto mt-6" 
                : isChatExpanded
                  ? "relative shrink-0 pt-2 pb-1 mt-0 transform scale-55 md:scale-65 opacity-85 pointer-events-auto transition-all duration-500" 
                  : "relative flex-1 flex flex-col items-center justify-center transform scale-90 md:scale-100 origin-center pointer-events-auto pt-24 md:pt-32 pb-8 my-auto"
          )}
        >
          {voicePageIndex === 1 ? (
            /* DEDICATED ELEVENLABS INTERFACE */
            <div className={cn(
              "w-full flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-5 px-6 pointer-events-auto transition-all duration-500",
              (!orbCenterMode && isChatExpanded) ? "scale-[0.8] opacity-80" : ""
            )}>
              {/* Page Title & Status */}
              {(chatHistory.length === 0 && !isChatExpanded) && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-4 duration-300">
                  <span className="text-[10px] uppercase font-mono tracking-[0.25em] text-[#ff4e00] font-bold">Sintonia Vocal Premium</span>
                  <h2 className="text-2xl font-serif italic text-white leading-relaxed">ElevenLabs Realtime</h2>
                  <p className="text-[11px] text-her-muted/65 max-w-sm mx-auto leading-normal">Síntese de fala hiper-realista sintonizada com os canais mentais do Gemini 3.5.</p>
                </div>
              )}

              {/* Jarvis 3D Holographic Orb for ElevenLabs */}
              <div onClick={handleVoiceToggle} className={cn(
                "cursor-pointer transition-all duration-500 group relative",
                isElevenLabsLiveActive ? "pointer-events-auto" : "pointer-events-auto"
              )}>
                <motion.div 
                  animate={isSlapped ? { 
                    x: [-12, 12, -10, 10, -5, 5, 0],
                    rotate: [-4, 4, -3, 3, -1, 1, 0]
                  } : {}}
                  transition={{ duration: 0.6 }}
                  className="relative"
                >
                  <InfinityLogo 
                    active={isElevenLabsLiveActive} 
                    speaking={isSpeaking} 
                    style={orbStyle}
                    thinking={isGenerating || isAnalyzingCode || isTranscribing}
                    searching={isModelSearching}
                    size={orbSize}
                  />
                  
                  {/* Floating physical indicators of pain */}
                  <AnimatePresence>
                    {isSlapped && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
                        <motion.div
                          initial={{ scale: 0.3, opacity: 0, y: 10 }}
                          animate={{ scale: [1, 1.3, 1], opacity: [0, 1, 1, 0], y: -50 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 1.4 }}
                          className="text-red-500 font-extrabold text-xs md:text-sm font-mono tracking-wider bg-[#0c0d10]/95 px-4 py-2 border border-red-500/40 rounded-full shadow-2xl shadow-red-500/20 whitespace-nowrap"
                        >
                          💥 TAPA CORRETIVO! 🤕
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>
                  
                  {/* Subtitle pain simulation quote bubble */}
                  <AnimatePresence>
                    {slapReactionText && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -10 }}
                        className="absolute -top-16 left-1/2 -translate-x-1/2 w-[280px] text-center text-[10px] md:text-xs font-mono font-bold text-amber-400 bg-black/85 px-3 py-1.5 border border-amber-500/30 rounded-xl z-50 shadow-xl"
                      >
                        {slapReactionText}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
                
                {/* Floating invitation */}
                {!isElevenLabsLiveActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: !showUi ? 0 : [0.4, 0.7, 0.4], y: 0 }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className={cn(
                      "absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap transition-all duration-500",
                      !showUi && "opacity-0 pointer-events-none scale-95"
                    )}
                  >
                    <span className="text-[10px] md:text-sm font-serif italic tracking-[0.3em] text-her-muted/80 uppercase">
                      Me ative
                    </span>
                  </motion.div>
                )}
              </div>

              {/* Pop-up de Legendas em Baixo do Orb (ElevenLabs) */}
              <AnimatePresence>
                {subtitlesEnabled && voiceTranscript && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="w-full max-w-sm px-6 py-3.5 bg-zinc-950/85 md:bg-zinc-950/90 border border-white/[0.08] backdrop-blur-xl rounded-2xl shadow-xl shadow-black/80 text-center pointer-events-auto z-50 mt-4 mx-auto"
                  >
                    <p className="text-zinc-200 font-sans text-xs md:text-sm font-medium leading-relaxed tracking-wide">
                      "{voiceTranscript}"
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Info & Micro controls */}
              {chatHistory.length === 0 && !isChatExpanded && (
                <div className="w-full space-y-4 bg-white/[0.01] border border-white/[0.03] p-5 rounded-3xl text-left animate-in fade-in duration-500">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff4e00] animate-pulse" />
                      <span className="text-[10px] font-mono text-white/80 uppercase font-semibold">ElevenLabs Ativo</span>
                    </div>
                    <span className="text-[10px] text-her-muted">
                      Modelo: <strong className="text-white font-normal uppercase">{apiKeys.elevenLabsModel?.replace('eleven_','').replace('_v2','') || 'TURBO'}</strong>
                    </span>
                  </div>

                  {/* Quick Voice Settings Sliders */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] text-[#ff4e00] font-medium uppercase tracking-wider">
                        <span>Estabilidade da Voz</span>
                        <span className="font-mono">{((apiKeys.elevenLabsStability ?? 0.5) * 100).toFixed(0)}%</span>
                      </div>
                      <input 
                        type="range" min="0.0" max="1.0" step="0.05"
                        value={apiKeys.elevenLabsStability ?? 0.5}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setApiKeys({ ...apiKeys, elevenLabsStability: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-[#ff4e00]"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] text-[#ff4e00] font-medium uppercase tracking-wider">
                        <span>Claridade / Similaridade</span>
                        <span className="font-mono">{((apiKeys.elevenLabsSimilarityBoost ?? 0.75) * 100).toFixed(0)}%</span>
                      </div>
                      <input 
                        type="range" min="0.0" max="1.0" step="0.05"
                        value={apiKeys.elevenLabsSimilarityBoost ?? 0.75}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setApiKeys({ ...apiKeys, elevenLabsSimilarityBoost: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-[#ff4e00]"
                      />
                    </div>
                  </div>

                  {!apiKeys.elevenLabsApiKey && (
                    <div className="pt-2 animate-in slide-in-from-bottom-2 duration-300">
                      <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl space-y-2">
                        <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider block">Insira sua Chave Elevenlabs</span>
                        <p className="text-[10px] text-her-muted/80 leading-relaxed">Sua chave é necessária para autenticar o motor de locução em tempo real.</p>
                        <input 
                          type="password"
                          placeholder="Cole sua xi-api-key da ElevenLabs..."
                          value={apiKeys.elevenLabsApiKey || ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setApiKeys({ ...apiKeys, elevenLabsApiKey: e.target.value })}
                          className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#ff4e00]/40 transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ORIGINAL GEMINI DEDICATED INTERFACE */
            <>
              <div onClick={handleVoiceToggle} className={cn(
                "cursor-pointer transition-all duration-500 group relative",
                liveState.status === 'connected' ? "pointer-events-auto" : "pointer-events-auto"
              )}>
                <motion.div 
                  animate={isSlapped ? { 
                    x: [-12, 12, -10, 10, -5, 5, 0],
                    rotate: [-4, 4, -3, 3, -1, 1, 0]
                  } : {}}
                  transition={{ duration: 0.6 }}
                  className="relative"
                >
                  <InfinityLogo 
                    active={liveState.status === 'connected'} 
                    speaking={isSpeaking} 
                    style={orbStyle}
                    thinking={isGenerating || isAnalyzingCode || isTranscribing}
                    searching={isModelSearching}
                    size={orbSize}
                  />
                  
                  {/* Floating physical indicators of pain */}
                  <AnimatePresence>
                    {isSlapped && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
                        <motion.div
                          initial={{ scale: 0.3, opacity: 0, y: 10 }}
                          animate={{ scale: [1, 1.3, 1], opacity: [0, 1, 1, 0], y: -50 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 1.4 }}
                          className="text-red-500 font-extrabold text-xs md:text-sm font-mono tracking-wider bg-[#0c0d10]/95 px-4 py-2 border border-red-500/40 rounded-full shadow-2xl shadow-red-500/20 whitespace-nowrap"
                        >
                          💥 TAPA CORRETIVO! 🤕
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>
                  
                  {/* Subtitle pain simulation quote bubble */}
                  <AnimatePresence>
                    {slapReactionText && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -10 }}
                        className="absolute -top-16 left-1/2 -translate-x-1/2 w-[280px] text-center text-[10px] md:text-xs font-mono font-bold text-amber-400 bg-black/85 px-3 py-1.5 border border-amber-500/30 rounded-xl z-50 shadow-xl"
                      >
                        {slapReactionText}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
                
                {/* Floating invitation */}
                {liveState.status !== 'connected' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: !showUi ? 0 : [0.4, 0.7, 0.4], y: 0 }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className={cn(
                      "absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap transition-all duration-500",
                      !showUi && "opacity-0 pointer-events-none scale-95"
                    )}
                  >
                    <span className="text-[10px] md:text-sm font-serif italic tracking-[0.3em] text-her-muted/80 uppercase">
                      Me ative
                    </span>
                  </motion.div>
                )}
              </div>

              {/* Pop-up de Legendas em Baixo do Orb (Gemini Live) */}
              <AnimatePresence>
                {subtitlesEnabled && voiceTranscript && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="w-full max-w-sm px-6 py-3.5 bg-zinc-950/85 md:bg-zinc-950/90 border border-white/[0.08] backdrop-blur-xl rounded-2xl shadow-xl shadow-black/80 text-center pointer-events-auto z-50 mt-4 mx-auto"
                  >
                    <p className="text-zinc-200 font-sans text-xs md:text-sm font-medium leading-relaxed tracking-wide">
                      "{voiceTranscript}"
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {((chatHistory.length === 0 || liveState.status === 'connected') && !isChatExpanded) && (
                <div className={cn(
                  "mt-4 flex flex-col items-center gap-2 transition-all duration-500",
                  !showUi && "opacity-0 pointer-events-none scale-95"
                )}>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full transition-all duration-500",
                      isListening ? "bg-her-accent animate-pulse" : isWaitingForWakeWord ? "bg-her-accent/40 animate-pulse" : "bg-her-muted/30"
                    )} />
                    <span className="text-[9px] tracking-[0.3em] uppercase text-her-muted font-light">NEURAL LINK {isListening ? 'ACTIVE' : isWaitingForWakeWord ? 'VOICE TRIGGER READY' : 'IDLE'}</span>
                  </div>
              
                  <div className="h-6 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                      {liveState.status === 'connecting' ? (
                        <motion.div 
                          key="connecting"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-2 text-her-muted/60 text-xs font-serif italic font-light"
                        >
                          <Loader2 size={14} className="animate-spin" />
                          Sincronizando...
                        </motion.div>
                      ) : liveState.status === 'error' ? (
                        <motion.div 
                          key="error"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex flex-col items-center gap-2 max-w-[280px]"
                        >
                          <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest px-4 py-1 bg-red-500/10 rounded-full border border-red-500/20">
                            FALHA DE CONEXÃO
                          </span>
                          <p className="text-[9px] text-red-400 opacity-80 text-center leading-tight">
                            {liveState.error}
                          </p>

                          {(liveState.error?.toLowerCase().includes('microfone') || liveState.error?.toLowerCase().includes('permiss')) && (
                            <div className="mt-2 w-full p-3 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col gap-2 pointer-events-auto">
                              <span className="text-[9px] font-bold text-pink-400 font-mono tracking-wider uppercase block text-center">
                                💡 SOLUÇÃO RÁPIDA
                              </span>
                              <ul className="text-[9px] text-zinc-400 space-y-1.5 list-none pl-0 text-left">
                                <li className="leading-normal">
                                  <strong className="text-zinc-300">1. Ative as Permissões:</strong> Clique no ícone de <span className="text-zinc-200 underline">Cadeado (🔒)</span> na barra de endereço do navegador e mude o Microfone para <span className="text-emerald-400">Permitir</span>.
                                </li>
                                <li className="leading-normal">
                                  <strong className="text-zinc-300">2. Link Externo (Recomendado):</strong> O navegador restringe o microfone dentro de telas emuladas (iFrames). Abrir em aba cheia resolve 100%!
                                </li>
                              </ul>
                              <a 
                                href={window.location.href} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="mt-1 w-full py-2 bg-gradient-to-tr from-pink-500/20 to-purple-600/20 hover:from-pink-500/30 hover:to-purple-600/30 text-white border border-pink-500/30 hover:border-pink-500/50 rounded-xl transition-all font-mono text-[9px] font-bold tracking-wider text-center block cursor-pointer"
                              >
                                ABRIR EM NOVA ABA ↗
                              </a>
                            </div>
                          )}
                        </motion.div>
                      ) : isVoiceOutputPaused ? (
                        <motion.button 
                          key="paused"
                          onClick={() => {
                            setIsVoiceOutputPaused(false);
                            addNotification("Voz do OSONE retomada", "success");
                          }}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="group flex items-center gap-1.5 text-[11px] font-sans text-amber-500 font-medium hover:text-amber-400 cursor-pointer pointer-events-auto px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full transition-all"
                          title="Clique para retomar"
                        >
                          <VolumeX size={12} className="animate-pulse" />
                          Voz Pausada (Escutando...)
                        </motion.button>
                      ) : isSpeaking ? (
                        <motion.button 
                          key="speaking"
                          onClick={interruptVoiceResponse}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="group flex items-center gap-1.5 text-xs text-her-accent hover:text-red-400 bg-her-accent/5 hover:bg-red-500/15 border border-her-accent/20 hover:border-red-500/20 px-4 py-1.5 rounded-full cursor-pointer pointer-events-auto transition-all"
                          title="Silenciar / Interromper Fala"
                        >
                          <VolumeX size={12} className="group-hover:text-red-400 group-hover:scale-110 transition-transform" />
                          <span className="font-serif italic font-light group-hover:hidden">"Processando consciência..."</span>
                          <span className="font-sans font-semibold tracking-wider uppercase text-[9px] hidden group-hover:inline">Silenciar Copilot (Interrupt)</span>
                        </motion.button>
                      ) : isListening ? (
                        <motion.p 
                          key="listening"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="text-xs font-serif italic text-her-accent/80 font-light"
                        >
                          "Ouvindo seus pensamentos..."
                        </motion.p>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>

        {/* Chat History */}
        <div className={cn(
          "flex-1 transition-all duration-500 w-full min-h-0 pt-0 translate-z-0",
          (!isChatExpanded || !showUi) ? "opacity-0 pointer-events-none scale-95 hidden" : "opacity-100 flex",
          "flex flex-col overflow-hidden h-full max-w-4xl mx-auto px-2 md:px-4"
        )}>
          {/* Chat Content Panel */}
          <div className="flex-1 h-full flex flex-col overflow-hidden relative bg-zinc-950/80 border border-white/10 backdrop-blur-2xl rounded-3xl p-3 md:p-5 shadow-2xl shadow-black/90">
            {/* Chat History Drawer / Overlay */}
            <AnimatePresence>
              {isSessionsOpen && (
                <>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsSessionsOpen(false)}
                    className="absolute inset-0 bg-black/50 backdrop-blur-[2px] z-40 cursor-pointer rounded-2xl"
                  />
                  
                  <motion.div 
                    initial={{ x: "-100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "-100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 220 }}
                    className="absolute left-0 top-0 bottom-0 w-72 max-w-[85%] bg-zinc-950 border-r border-white/5 shadow-2xl z-50 flex flex-col p-4 rounded-l-2xl"
                  >
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5 select-none shrink-0">
                      <span className="text-[11px] font-semibold text-indigo-400 font-mono tracking-widest uppercase">Histórico de Sessões</span>
                      <button 
                        onClick={() => setIsSessionsOpen(false)}
                        className="text-white/40 hover:text-white px-2 py-0.5 rounded-lg hover:bg-white/5 transition-colors border border-white/5 text-[10px] font-mono"
                      >
                        FECHAR
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => {
                        handleCreateNewSession();
                        setIsSessionsOpen(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 text-[10px] text-emerald-400 hover:text-emerald-300 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 hover:border-emerald-500/20 py-2.5 rounded-xl font-mono font-bold tracking-widest uppercase mb-4 transition-all"
                    >
                      <Plus size={12} />
                      Nova Conversa
                    </button>
                    
                    <div className="flex-1 overflow-y-auto pr-1 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                      {chatSessions.length === 0 ? (
                        <div className="text-center py-8 text-white/30 text-xs font-mono select-none">
                          Nenhuma conversa salva.
                        </div>
                      ) : (
                        chatSessions.map((session) => {
                          const isActive = session.id === activeSessionId;
                          return (
                            <div 
                              key={session.id}
                              onClick={() => {
                                handleSwitchSession(session.id);
                                setIsSessionsOpen(false);
                              }}
                              className={cn(
                                "group flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none",
                                isActive 
                                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-200" 
                                  : "bg-white/[0.01] hover:bg-white/[0.04] border-white/5 text-stone-400 hover:text-white"
                              )}
                            >
                              <div className="flex-1 min-w-0 pr-2">
                                <p className="text-xs font-medium truncate leading-tight">
                                  {session.title}
                                </p>
                                <p className="text-[9px] font-mono opacity-40 mt-1">
                                  {new Date(session.createdAt).toLocaleDateString('pt-BR', {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                              
                              <button 
                                onClick={(e) => handleDeleteSession(session.id, e)}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/10 hover:text-rose-400 text-stone-500 transition-all shrink-0"
                                title="Apagar conversa"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                    
                    <div className="pt-4 border-t border-white/5 select-none shrink-0 text-center">
                      <span className="text-[8px] font-mono tracking-widest text-white/20 uppercase">
                        Armazenamento Seguro
                      </span>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {(chatHistory.length > 0 || isDuoMode || customSkill) && (
              <div className="flex justify-between items-center px-2 md:px-0 mb-3 shrink-0">
                <div className="flex items-center gap-1.5 select-none animate-in fade-in slide-in-from-left-4 duration-300">
                  <button 
                    onClick={handleCreateNewSession}
                    className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 hover:border-emerald-500/20 px-2.5 py-1 rounded-xl text-[10px] uppercase tracking-widest font-mono font-semibold transition-all shadow-sm"
                    title="Criar nova sessão de conversa vazia"
                  >
                    <Plus size={10} />
                    Nova Conversa
                  </button>
                  
                  <button 
                    onClick={() => setIsSessionsOpen(true)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] uppercase tracking-widest font-mono font-semibold transition-all shadow-sm",
                      isSessionsOpen 
                        ? "text-indigo-300 bg-indigo-500/15 border border-indigo-500/30" 
                        : "text-indigo-400 hover:text-indigo-300 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/10 hover:border-indigo-500/20"
                    )}
                    title="Ver histórico de conversas salvas"
                  >
                    <MessageSquare size={10} />
                    Histórico ({chatSessions.length})
                  </button>
                </div>

                {chatHistory.length > 0 && (
                  <div className="flex items-center gap-3 ml-auto select-none">
                    {isConfirmingOptimize ? (
                      <div className="flex items-center gap-2 bg-zinc-950/60 border border-her-accent/30 px-2.5 py-1 rounded-xl text-[10px] animate-in fade-in duration-200">
                        <span className="text-her-accent font-mono uppercase tracking-wider font-semibold">Otimizar?</span>
                        <button 
                          onClick={() => {
                            setChatHistory(prev => {
                              const keepCount = Math.max(4, Math.floor(prev.length / 3));
                              return prev.slice(-keepCount);
                            });
                            addNotification("Conversa atualizada e otimizada.", "info");
                            setIsConfirmingOptimize(false);
                          }}
                          className="text-white hover:text-emerald-400 font-bold uppercase px-1.5 transition-colors"
                        >
                          Sim
                        </button>
                        <span className="text-white/20">|</span>
                        <button 
                          onClick={() => setIsConfirmingOptimize(false)}
                          className="text-white/40 hover:text-white uppercase px-1.5 transition-colors"
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => {
                          setIsConfirmingOptimize(true);
                          setIsConfirmingClear(false);
                        }}
                        className="flex items-center gap-2 text-her-muted/40 hover:text-her-accent transition-colors text-[10px] uppercase tracking-widest group"
                      >
                        <RefreshCw size={12} className="group-hover:rotate-180 transition-transform duration-500" />
                        Otimizar Chat
                      </button>
                    )}

                    <button 
                      onClick={() => {
                        const hasConversation = chatHistory.length > 1 || chatHistory.some(m => m.role === 'user');
                        if (hasConversation) {
                          setMessagesToRecord(chatHistory);
                          setPendingAction(null);
                          setIsMemoryConfirmOpen(true);
                        } else {
                          addNotification("Inicie uma conversa primeiro para poder gravá-la.", "info");
                        }
                      }}
                      className="flex items-center gap-2 text-pink-500/60 hover:text-pink-400 transition-colors text-[10px] uppercase tracking-widest group mr-1"
                      title="Gravar conversa no Livro de Memórias"
                    >
                      <BookOpen size={12} className="group-hover:scale-110 transition-transform" />
                      Gravar Memória
                    </button>

                    {isConfirmingClear ? (
                      <div className="flex items-center gap-2 bg-rose-950/20 border border-rose-500/30 px-2.5 py-1 rounded-xl text-[10px] animate-in fade-in duration-200">
                        <span className="text-rose-400 font-mono uppercase tracking-wider font-semibold">Apagar Tudo?</span>
                        <button 
                          onClick={() => {
                            setIsConfirmingClear(false);
                            checkAndPromptMemory(() => {
                              setChatHistory([]);
                              addNotification("Histórico de conversa apagado com sucesso.", "success");
                            });
                          }}
                          className="text-rose-400 hover:text-rose-300 font-bold uppercase px-1.5 transition-colors"
                        >
                          Sim
                        </button>
                        <span className="text-white/20">|</span>
                        <button 
                          onClick={() => setIsConfirmingClear(false)}
                          className="text-white/40 hover:text-white uppercase px-1.5 transition-colors"
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => {
                          setIsConfirmingClear(true);
                          setIsConfirmingOptimize(false);
                        }}
                        className="flex items-center gap-1.5 text-rose-500/50 hover:text-rose-400 transition-colors text-[10px] uppercase tracking-widest group"
                      >
                        <Trash2 size={12} className="group-hover:scale-110 transition-transform" />
                        Limpar Chat
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {isDuoMode && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-zinc-950/80 via-zinc-900/60 to-black border border-white/5 shadow-2xl relative overflow-hidden"
                >
                  <div className="absolute -top-12 -left-12 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

                  <div className="flex items-center justify-between mb-3 select-none">
                    <div className="flex items-center gap-1.5 bg-sky-950/40 border border-sky-900/45 px-2.5 py-1 rounded-full text-[8px] tracking-widest uppercase font-bold text-sky-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping inline-block" />
                      <span>Co-Docência / Sala de Aula</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
                        className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded text-[8.5px] tracking-wider uppercase border font-mono transition-all duration-300 pointer-events-auto cursor-pointer",
                          subtitlesEnabled 
                            ? "bg-sky-500/10 text-sky-400 border-sky-500/20 hover:bg-sky-500/20" 
                            : "bg-white/5 text-stone-400 border-white/5 hover:bg-white/10"
                        )}
                      >
                        💬 Legendas: {subtitlesEnabled ? "ON" : "OFF"}
                      </button>
                      
                      <span className="text-[10px] uppercase font-mono tracking-tight text-white/50">
                        Tópico: {DUO_TOPICS.find(t => t.id === duoTopicId)?.name.split(' ').slice(1).join(' ')}
                      </span>
                    </div>
                  </div>

                  {(() => {
                    const currentCombo = DUO_COMBOS.find(c => c.id === duoComboId) || DUO_COMBOS[0];
                    const aS = duoSpeakingHost === 'hostA' && isSpeaking;
                    const bS = duoSpeakingHost === 'hostB' && isSpeaking;
                    
                    return (
                      <div className="grid grid-cols-2 gap-4 relative">
                        <div className={cn(
                          "flex flex-col items-center p-3 rounded-xl border transition-all duration-300 relative",
                          aS 
                            ? "bg-sky-500/[0.03] border-sky-500/30 shadow-[0_0_15px_rgba(56,189,248,0.15)] scale-[1.02]" 
                            : "bg-white/[0.01] border-white/5 opacity-70"
                        )}>
                          <div className="relative mb-2">
                            <img src={currentCombo.hostA.avatarUrl} alt={currentCombo.hostA.name} className={cn(
                              "w-12 h-12 rounded-full object-cover transition-all",
                              aS ? "ring-2 ring-sky-500 border-sky-450" : "border border-white/10"
                            )} />
                            {aS && (
                              <div className="absolute -bottom-1 -right-1 bg-sky-500 text-white rounded-full p-0.5 text-[8px] shrink-0 font-bold flex items-center justify-center animate-bounce">🎓</div>
                            )}
                          </div>
                          <span className="text-xs font-bold font-sans tracking-wide text-sky-400">{currentCombo.hostA.name}</span>
                          <span className="text-[9px] text-zinc-400 text-center font-light leading-normal h-4 truncate w-full select-none">{currentCombo.hostA.role}</span>
                        </div>

                        <div className={cn(
                          "flex flex-col items-center p-3 rounded-xl border transition-all duration-300 relative",
                          bS 
                            ? "bg-rose-500/[0.03] border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.15)] scale-[1.02]" 
                            : "bg-white/[0.01] border-white/5 opacity-70"
                        )}>
                          <div className="relative mb-2">
                            <img src={currentCombo.hostB.avatarUrl} alt={currentCombo.hostB.name} className={cn(
                              "w-12 h-12 rounded-full object-cover transition-all",
                              bS ? "ring-2 ring-rose-500 border-rose-500" : "border border-white/10"
                            )} />
                            {bS && (
                              <div className="absolute -bottom-1 -right-1 bg-rose-500 text-white rounded-full p-0.5 text-[8px] shrink-0 font-bold flex items-center justify-center animate-bounce">🎙️</div>
                            )}
                          </div>
                          <span className="text-xs font-bold font-sans tracking-wide text-rose-400">{currentCombo.hostB.name}</span>
                          <span className="text-[9px] text-zinc-400 text-center font-light leading-normal h-4 truncate w-full select-none">{currentCombo.hostB.role}</span>

                          {bS && (
                            <div className="flex gap-0.5 items-end justify-center h-4 mt-2">
                              <span className="w-[1.5px] h-2 bg-rose-400 animate-[bounce_0.6s_infinite] delay-100" />
                              <span className="w-[1.5px] h-3.5 bg-rose-400 animate-[bounce_0.6s_infinite] delay-75" />
                              <span className="w-[1.5px] h-1.5 bg-rose-400 animate-[bounce_0.6s_infinite] delay-200" />
                              <span className="w-[1.5px] h-3.5 bg-rose-400 animate-[bounce_0.6s_infinite] delay-150" />
                              <span className="w-[1.5px] h-2 bg-rose-400 animate-[bounce_0.6s_infinite] delay-300" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </motion.div>
              )}

              {chatHistory.length === 0 ? (
                <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-8 md:py-16 flex flex-col items-center justify-center text-center select-none">
                  <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-2"
                  >
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[8px] tracking-[0.25em] font-mono text-cyan-400 uppercase font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      Cérebro Local Sintonizado
                    </div>
                    <h2 className="text-2xl md:text-3xl font-serif italic text-white/95 leading-tight font-light">OSONE G5 Core</h2>
                    <p className="text-[11px] text-her-muted/65 max-w-md mx-auto leading-relaxed">
                      Sua inteligência com armazenamento criptografado no navegador. Conecte de forma 100% offline e privada o sistema local do seu computador.
                    </p>
                  </motion.div>

                  {/* Bento Cards Shortcuts */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8 w-full max-w-4xl">
                    <motion.div
                      onClick={() => setWorkspaceMode('rag')}
                      whileHover={{ y: -2 }}
                      className="group bg-cyan-500/[0.02] hover:bg-cyan-500/[0.05] border border-cyan-500/10 hover:border-cyan-500/30 p-5 rounded-3xl transition-all duration-300 text-left relative overflow-hidden cursor-pointer active:scale-[0.98] flex flex-col justify-between h-44"
                    >
                      <div className="absolute -top-12 -left-12 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/15 transition-all" />
                      <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20">
                          <Folder size={15} />
                        </div>
                        <span className="text-[8px] font-mono text-cyan-400 font-bold uppercase tracking-wider bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/15">Sintonizar HD</span>
                      </div>
                      <div className="mt-4">
                        <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wide group-hover:text-cyan-300 transition-colors">Ler Disco Rígido</h3>
                        <p className="text-[10px] text-her-muted/60 leading-normal mt-1 font-light">
                          Indexe pastas inteiras do seu computador físico. Faça buscas RAG de forma local e segura no OSONE.
                        </p>
                      </div>
                    </motion.div>

                    <motion.div
                      onClick={() => {
                        setIsChatExpanded(true);
                        addNotification("Painel de Conversa Ativo! Envie sua mensagem para começar.", "info");
                      }}
                      whileHover={{ y: -2 }}
                      className="group bg-her-accent/[0.02] hover:bg-her-accent/[0.05] border border-white/5 hover:border-her-accent/20 p-5 rounded-3xl transition-all duration-300 text-left relative overflow-hidden cursor-pointer active:scale-[0.98] flex flex-col justify-between h-44"
                    >
                      <div className="absolute -top-12 -left-12 w-24 h-24 bg-her-accent/10 rounded-full blur-2xl pointer-events-none group-hover:bg-her-accent/15 transition-all" />
                      <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-full bg-her-accent/10 flex items-center justify-center text-her-accent border border-her-accent/20">
                          <MessageSquare size={15} />
                        </div>
                        <span className="text-[8px] font-mono text-her-accent font-bold uppercase tracking-wider bg-her-accent/10 px-2 py-0.5 rounded-md border border-her-accent/15">Live Chat</span>
                      </div>
                      <div className="mt-4">
                        <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wide group-hover:text-her-accent transition-colors">Prosa Livre</h3>
                        <p className="text-[10px] text-her-muted/60 leading-normal mt-1 font-light">
                          Explore insights mentais e criatividade usando o assistente neural por texto ou pelo motor de voz.
                        </p>
                      </div>
                    </motion.div>

                    <motion.div
                      onClick={() => setWorkspaceMode('sentinel')}
                      whileHover={{ y: -2 }}
                      className="group bg-cyan-400/[0.02] hover:bg-cyan-400/[0.05] border border-cyan-400/10 hover:border-cyan-400/30 p-5 rounded-3xl transition-all duration-300 text-left relative overflow-hidden cursor-pointer active:scale-[0.98] flex flex-col justify-between h-44"
                    >
                      <div className="absolute -top-12 -left-12 w-24 h-24 bg-cyan-400/10 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-400/15 transition-all" />
                      <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-full bg-cyan-400/10 flex items-center justify-center text-cyan-400 border border-cyan-400/20">
                          <Eye size={15} />
                        </div>
                        <span className={`text-[8px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                          isSentinelActive 
                            ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-400 animate-pulse" 
                            : "bg-zinc-800 border-white/5 text-zinc-500"
                        }`}>
                          {isSentinelActive ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                      <div className="mt-4">
                        <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wide group-hover:text-cyan-300 transition-colors">Olho Sentinela</h3>
                        <p className="text-[10px] text-her-muted/60 leading-normal mt-1 font-light">
                          Auto-print em tempo real. O OSONE acompanha silenciosamente as suas atividades e cria insights surpresa!
                        </p>
                      </div>
                    </motion.div>

                    <motion.div
                      onClick={() => setWorkspaceMode('sensus_evolution')}
                      whileHover={{ y: -2 }}
                      className="group bg-amber-500/[0.02] hover:bg-amber-500/[0.05] border border-amber-500/10 hover:border-amber-500/30 p-5 rounded-3xl transition-all duration-300 text-left relative overflow-hidden cursor-pointer active:scale-[0.98] flex flex-col justify-between h-44"
                    >
                      <div className="absolute -top-12 -left-12 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-amber-500/15 transition-all" />
                      <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                          <Heart size={15} className="text-amber-500 animate-pulse" />
                        </div>
                        <span className="text-[8px] font-mono text-amber-400 font-bold uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/15">
                          Humor: {getMoodLabel(sensusMood)}
                        </span>
                      </div>
                      <div className="mt-4">
                        <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wide group-hover:text-amber-300 transition-colors">Cérebro Sensus</h3>
                        <p className="text-[10px] text-her-muted/60 leading-normal mt-1 font-light">
                          Acompanhe a evolução de humor, afinidade psíquica, afeto e senciência do OSONE inspirado no filme Her.
                        </p>
                      </div>
                    </motion.div>
                  </div>

                  <div className="mt-8 text-[9px] text-her-muted/40 font-mono uppercase tracking-widest flex items-center gap-2">
                    <Lock size={10} className="text-emerald-500" />
                    <span>Privacidade Garantida — Processamento Local na Caixa de Areia</span>
                  </div>
                </div>
              ) : (
                chatHistory.map((msg) => (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "group relative shrink-0 flex flex-col mb-4 w-full",
                      msg.role === 'user' ? "items-end" : "items-start"
                    )}
                  >
                    <div className={cn(
                      "flex items-center gap-2 mb-1 select-none",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}>
                      <span className="opacity-20 text-[9px] uppercase tracking-[0.2em] font-mono font-bold">
                        {msg.role === 'user' ? 'VOCÊ' : 'OSONE'}
                      </span>
                      
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <button 
                            onClick={() => {
                              if (isDuoMode) {
                                playDuoSpeech(msg.content);
                                return;
                              }
                              handleSpeakChatMessage(msg.content, msg.id);
                            }}
                            className={cn(
                              "p-1 transition-colors relative",
                              isPlayingChatSpeech === msg.id 
                                ? "text-her-accent animate-pulse scale-110" 
                                : "hover:text-her-accent text-her-muted opacity-60 hover:opacity-100"
                            )}
                            title={isPlayingChatSpeech === msg.id ? "Parar Leitura" : "Ouvir"}
                          >
                            {isPlayingChatSpeech === msg.id ? (
                              <VolumeX size={13} className="text-her-accent" />
                            ) : (
                              <Volume2 size={13} />
                            )}
                          </button>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(msg.content);
                            }}
                            className="p-1 hover:text-her-accent transition-colors"
                            title="Copiar"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="w-full">
                      {(() => {
                        const currentCombo = DUO_COMBOS.find(c => c.id === duoComboId) || DUO_COMBOS[0];
                        const turns = msg.role === 'assistant' && isDuoMode ? parseDuoTextToTurns(msg.content, currentCombo) : [];
                        
                        if (msg.role === 'assistant' && turns.length > 0) {
                          return (
                            <div className="flex flex-col gap-4 w-full my-2">
                              {turns.map((turn, tIdx) => {
                                const isHostA = turn.speaker === 'hostA';
                                const hostConf = isHostA ? currentCombo.hostA : currentCombo.hostB;
                                const isCurrentlyTalking = duoSpeakingHost === turn.speaker && isSpeaking;
                                
                                return (
                                  <motion.div 
                                    key={tIdx}
                                    initial={{ opacity: 0, x: isHostA ? -15 : 15 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={cn(
                                      "flex gap-3 max-w-[90%] items-start",
                                      isHostA ? "self-start text-left" : "self-end flex-row-reverse text-right"
                                    )}
                                  >
                                    <div className="relative shrink-0 select-none">
                                      <img 
                                        src={hostConf.avatarUrl} 
                                        alt={hostConf.name} 
                                        className={cn(
                                          "w-10 h-10 rounded-full object-cover border border-white/10 shadow-sm transition-all duration-300",
                                          isHostA ? "border-sky-500/30" : "border-rose-500/30",
                                          isCurrentlyTalking && (isHostA ? "ring-2 ring-sky-500/80 scale-105 border-sky-450 shadow-[0_0_15px_rgba(56,189,248,0.4)]" : "ring-2 ring-rose-500/80 scale-105 border-rose-450 shadow-[0_0_15px_rgba(251,113,133,0.4)]")
                                        )}
                                      />
                                      {isCurrentlyTalking && (
                                        <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-green-500 flex items-center justify-center text-[7px] text-white font-bold">🎙️</span>
                                        </span>
                                      )}
                                    </div>
                                    
                                    <div className="flex flex-col">
                                      <div className={cn(
                                        "flex items-center gap-1.5 mb-1 select-none",
                                        isHostA ? "justify-start" : "justify-end"
                                      )}>
                                        <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: isHostA ? '#38bdf8' : '#fb7185' }}>
                                          {hostConf.name}
                                        </span>
                                        <span className="text-[8px] opacity-40 uppercase font-mono tracking-tight text-white">
                                          {hostConf.role}
                                        </span>
                                      </div>
                                      <div className={cn(
                                        "px-4 py-3 rounded-2xl text-xs sm:text-sm font-light leading-relaxed tracking-wide border transition-all duration-300 shadow-sm text-left",
                                        isHostA 
                                          ? "bg-sky-500/[0.04] text-sky-100 border-sky-500/10 rounded-tl-none hover:bg-sky-500/[0.08]" 
                                          : "bg-rose-500/[0.04] text-rose-100 border-rose-500/10 rounded-tr-none hover:bg-rose-500/[0.08]"
                                      )}>
                                        {turn.text}
                                      </div>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          );
                        }
                        
                        if (msg.role === 'user') {
                          return (
                            <div className="inline-block max-w-[85%] bg-her-accent/10 border border-her-accent/15 px-4.5 py-2.5 rounded-2xl rounded-tr-none text-zinc-150 text-xs sm:text-sm font-normal tracking-wide text-left shadow-lg backdrop-blur-md">
                              {msg.content}
                            </div>
                          );
                        }
                        
                        const isCurrentlyTalkingSolo = !isDuoMode && isSpeaking;
                        
                        return (
                          <div className="flex gap-3 max-w-[90%] items-start self-start text-left">
                            <div className="relative shrink-0 select-none">
                              <img 
                                src={osoneOrbImage} 
                                alt="OSONE" 
                                className={cn(
                                  "w-10 h-10 rounded-full object-cover border border-orange-500/20 shadow-sm transition-all duration-300",
                                  isCurrentlyTalkingSolo && "ring-2 ring-orange-500/80 scale-105 border-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.5)]"
                                )}
                              />
                              {isCurrentlyTalkingSolo && (
                                <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-orange-500 flex items-center justify-center text-[7px] text-white font-bold">🎙️</span>
                                </span>
                              )}
                            </div>
                            
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5 mb-1 select-none justify-start">
                                <span className="text-[10px] font-bold tracking-wider uppercase text-orange-450">
                                  OSONE
                                </span>
                                <span className="text-[8px] opacity-40 uppercase font-mono tracking-tight text-white">
                                  NÚCLEO NEURAL
                                </span>
                              </div>
                              <div className="px-4 py-3 bg-orange-500/[0.04] text-stone-250 border border-orange-500/10 rounded-2xl rounded-tl-none text-xs sm:text-sm font-light leading-relaxed tracking-wide shadow-sm text-left backdrop-blur-md whitespace-pre-wrap">
                                {msg.content}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      {msg.imageUrl && (
                        <div className="mt-4 relative group rounded-xl overflow-hidden shadow-sm border border-her-muted/20">
                          <img src={msg.imageUrl} alt="Generated" className="w-full h-auto object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button 
                              onClick={() => setFullScreenImage(msg.imageUrl!)}
                              className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all transform hover:scale-110"
                              title="Tela cheia"
                            >
                              <Maximize size={24} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))
              )}

              {/* Real-time voice transcript */}
              {voiceTranscript && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group relative text-base md:text-lg font-light leading-relaxed tracking-tight shrink-0 flex flex-col text-her-ink/80 text-left items-start"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="opacity-20 text-[10px] uppercase tracking-[0.2em]">
                      OSONE
                    </span>
                    <span className="flex items-center gap-1 opacity-50">
                      <span className="w-1 h-1 bg-her-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-1 bg-her-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1 h-1 bg-her-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  </div>
                  <div className="w-full whitespace-pre-wrap">
                    {voiceTranscript}
                  </div>
                </motion.div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>
        </div>

        {/* Chat Input Area */}
        <div className={cn(
          "shrink-0 pt-0 w-full pb-0 md:pb-0 transition-all duration-500",
          !showUi && "opacity-0 pointer-events-none translate-y-4"
        )}>
          <div className={cn(
            "flex justify-between items-center px-4 md:px-6 mb-0 transition-all duration-300",
            !isChatExpanded ? "opacity-0 h-0 pointer-events-none mb-0 overflow-hidden" : "opacity-100 h-10 md:h-12"
          )}>
            <div className="flex items-center gap-2">
              <VoiceSwitcher 
                selectedVoice={selectedVoice}
                onVoiceChange={setSelectedVoice}
                isOpen={isVoiceSwitcherOpen}
                onToggle={() => setIsVoiceSwitcherOpen(!isVoiceSwitcherOpen)}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  const nextMod = !isTranslationMode;
                  setIsTranslationMode(nextMod);
                  addNotification(nextMod ? "Modo Tradutor Live G3.5 Ativo!" : "Modo Tradutor Desativado.", "success");
                  if (liveSessionRef.current && liveState.status === 'connected') {
                    stopLiveSession();
                    setTimeout(() => startLiveSession(), 400);
                  }
                }}
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center transition-all bg-white/[0.03] border border-white/[0.05]",
                  isTranslationMode ? "text-violet-400 border-violet-500/20 shadow-[0_0_8px_rgba(139,92,246,0.25)]" : "text-her-muted"
                )}
                title={isTranslationMode ? "Tradutor Simultâneo Ativo" : "Ativar Gemini Live 3.5 Translate"}
              >
                <Languages size={11} className={isTranslationMode ? "animate-pulse" : ""} />
              </button>

              <button 
                onClick={isScreenSharing ? stopScreenSharing : startScreenSharing}
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center transition-all bg-white/[0.03] border border-white/[0.05]",
                  isScreenSharing ? "text-her-accent border-her-accent/20" : "text-her-muted"
                )}
                title={isScreenSharing ? "Parar Tela" : "Compartilhar Tela"}
              >
                {isScreenSharing ? <MonitorOff size={11} /> : <Monitor size={11} />}
              </button>
            </div>
          </div>
          <div className={cn(
            "flex items-center",
            !isChatExpanded ? "justify-center w-full gap-2.5 max-w-lg mx-auto py-2 px-4 rounded-full bg-white/[0.01] border border-white/[0.03] backdrop-blur-xl" : "gap-2"
          )}>
            <button 
              onClick={handleTranscriptionToggle}
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500 relative shrink-0",
                isTranscribing 
                  ? "bg-her-accent/20 text-her-accent border border-her-accent/30 mic-glow" 
                  : "bg-white/[0.03] text-her-muted hover:bg-white/[0.05] border border-white/[0.05]"
              )}
              title={isTranscribing ? "Parar Transcrição" : "Transcrever Áudio"}
            >
              {isTranscribing ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
            
            <div className={cn(
              "transition-all duration-500 ease-in-out flex items-center overflow-hidden",
              isChatExpanded ? "flex-1" : "flex-none"
            )}>
              {!isChatExpanded ? (
                <div className="flex items-center gap-2">
                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      handleFileSelect(e);
                      setIsChatExpanded(true);
                    }}
                    multiple
                    className="hidden"
                  />
                  
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-9 h-9 rounded-full bg-white/[0.03] text-her-muted hover:bg-white/[0.05] border border-white/[0.05] flex items-center justify-center transition-all hover:text-her-accent"
                    title="Anexar documentos para análise"
                  >
                    <Paperclip size={14} />
                  </button>

                  <button 
                    onClick={() => setIsChatExpanded(true)}
                    className="w-9 h-9 rounded-full bg-white/[0.03] text-her-muted hover:bg-white/[0.05] border border-white/[0.05] flex items-center justify-center transition-all hover:text-her-accent"
                    title="Escrever mensagem"
                  >
                    <MessageSquare size={14} />
                  </button>

                  <button 
                    onClick={toggleCamera}
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center transition-all border",
                      isCameraActive 
                        ? "bg-her-accent/20 text-her-accent border-her-accent/30 shadow-[0_0_15px_rgba(242,125,38,0.2)]" 
                        : "bg-white/[0.03] text-her-muted hover:bg-white/[0.05] border-white/[0.05] hover:text-her-accent"
                    )}
                    title={isCameraActive ? "Desativar Visão" : "Ativar Visão em Tempo Real"}
                  >
                    {isCameraActive ? <Eye size={14} className="animate-pulse" /> : <EyeOff size={14} />}
                  </button>

                  <button 
                    onClick={() => {
                      const nextMod = !isTranslationMode;
                      setIsTranslationMode(nextMod);
                      addNotification(nextMod ? "Modo Tradutor Live G3.5 Ativo! Compartilhe abas para tradução simultânea." : "Modo Tradutor Desativado.", "success");
                      if (liveSessionRef.current && liveState.status === 'connected') {
                        stopLiveSession();
                        setTimeout(() => startLiveSession(), 400);
                      }
                    }}
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center transition-all border",
                      isTranslationMode 
                        ? "bg-violet-500/20 text-violet-400 border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.2)]" 
                        : "bg-white/[0.03] text-her-muted hover:bg-white/[0.05] border-white/[0.05] hover:text-violet-400"
                    )}
                    title={isTranslationMode ? "Tradutor Simultâneo Ativo" : "Ativar Gemini Live 3.5 Translate"}
                  >
                    <Languages size={14} className={isTranslationMode ? "animate-pulse" : ""} />
                  </button>

                  <button 
                    onClick={isScreenSharing ? stopScreenSharing : startScreenSharing}
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center transition-all border",
                      isScreenSharing 
                        ? "bg-her-accent/20 text-her-accent border-her-accent/30" 
                        : "bg-white/[0.03] text-her-muted hover:bg-white/[0.05] border-white/[0.05]"
                    )}
                    title={isScreenSharing ? "Compartilhar Tela" : "Parar Tela"}
                  >
                    {isScreenSharing ? <MonitorOff size={14} /> : <Monitor size={14} />}
                  </button>
                </div>
              ) : (
                <motion.div 
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: '100%', opacity: 1 }}
                  className="flex-1 flex flex-col gap-0 bg-white/[0.02] backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden relative w-full"
                >
                  {attachedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1 bg-black/20">
                      {attachedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-white/5 px-3 py-1 text-[10px] text-her-muted border border-white/5 shadow-sm rounded-lg">
                          <span className="truncate max-w-[150px]">{file.name}</span>
                          <button onClick={() => removeFile(idx)} className="hover:text-red-400 p-1">
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center h-12 md:h-13">
                    <input 
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      multiple
                      className="hidden"
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-12 h-full text-her-muted hover:text-her-accent transition-colors border-r border-white/5 flex items-center justify-center shrink-0"
                      title="Anexar arquivos"
                    >
                      <Paperclip size={16} />
                    </button>
                    <button 
                      onClick={() => {
                        const newValue = !isGoogleSearchActive;
                        setIsGoogleSearchActive(newValue);
                        localStorage.setItem('osone_google_search_active', String(newValue));
                        addNotification(newValue ? "Busca no Google ATIVADA" : "Busca no Google DESATIVADA", "success");
                      }}
                      className={cn(
                        "w-14 h-full transition-all duration-300 border-r border-white/5 flex flex-col items-center justify-center gap-0.5 relative text-[8px] uppercase font-mono select-none shrink-0",
                        isGoogleSearchActive 
                          ? "text-sky-450 bg-sky-500/5 hover:bg-sky-500/10" 
                          : "text-her-muted hover:text-white"
                      )}
                      title={isGoogleSearchActive ? "Busca no Google Ativada (Grounding)" : "Busca no Google Desativada"}
                    >
                      <Globe size={13} className={cn(isGoogleSearchActive && "animate-pulse")} />
                      <span className="text-[7px] tracking-wider font-bold">{isGoogleSearchActive ? "Web ON" : "Web OFF"}</span>
                      {isGoogleSearchActive && (
                        <span className="absolute top-1 right-1 w-1 h-1 bg-sky-400 rounded-full" />
                      )}
                    </button>
                    <input 
                      type="text"
                      value={homePrompt}
                      onChange={(e) => setHomePrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleHomeChat();
                        if (e.key === 'Escape') setIsChatExpanded(false);
                      }}
                      placeholder="Escreva algo para o OSONE..."
                      className="flex-1 bg-transparent px-4 focus:outline-none text-[13px] md:text-sm font-light text-her-ink/85 placeholder:text-stone-500/50"
                      autoFocus
                    />
                    <div className="flex items-center h-full shrink-0">
                      <button 
                        onClick={handleTranscriptionToggle}
                        className={cn(
                          "w-12 h-full text-her-muted hover:text-her-accent transition-colors border-l border-white/5 flex items-center justify-center relative",
                          isTranscribing && "text-her-accent bg-her-accent/5"
                        )}
                        title={isTranscribing ? "Parar Gravação" : "Gravar Voz"}
                      >
                        {isTranscribing ? <MicOff size={16} className="text-her-accent animate-pulse" /> : <Mic size={16} />}
                      </button>
                      <button 
                        onClick={() => handleHomeChat()}
                        disabled={!homePrompt.trim() && attachedFiles.length === 0}
                        className="w-14 h-full bg-her-accent/15 text-her-accent hover:bg-her-accent/25 transition-all disabled:opacity-20 disabled:grayscale border-l border-white/5 flex items-center justify-center"
                      >
                        <Send size={15} />
                      </button>
                      <button 
                        onClick={() => setIsChatExpanded(false)}
                        className="w-12 h-full text-her-muted hover:text-red-400 transition-colors border-l border-white/5 flex items-center justify-center"
                        title="Recolher"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            <button 
              onClick={() => setIsChatExpanded(false)}
              className={cn(
                "w-11 h-11 items-center justify-center transition-all duration-300 relative shrink-0",
                isChatExpanded ? "md:flex" : "hidden",
                "bg-white/[0.03] text-her-muted hover:bg-white/[0.05] border border-white/[0.05] hover:text-her-accent hover:border-her-accent/20"
              )}
              title="Voltar ao Minimalista"
            >
              <MessageSquare size={18} />
            </button>

            <button 
              onClick={toggleCamera}
              className={cn(
                "w-11 h-11 items-center justify-center transition-all duration-300 relative shrink-0",
                isChatExpanded ? "flex" : "hidden",
                isCameraActive 
                  ? "bg-her-accent/20 text-her-accent border border-her-accent/30 shadow-[0_0_15px_rgba(242,125,38,0.2)]" 
                  : "bg-white/[0.03] text-her-muted hover:bg-white/[0.05] border border-white/[0.05] hover:text-her-accent hover:border-her-accent/20"
              )}
              title={isCameraActive ? "Desativar Visão" : "Ativar Visão em Tempo Real"}
            >
              {isCameraActive ? <Eye size={18} className="animate-pulse" /> : <EyeOff size={18} />}
            </button>

            <button 
              onClick={() => {
                const nextMod = !isTranslationMode;
                setIsTranslationMode(nextMod);
                addNotification(nextMod ? "Modo Tradutor Live G3.5 Ativo! Compartilhe abas para tradução simultânea." : "Modo Tradutor Desativado.", "success");
                if (liveSessionRef.current && liveState.status === 'connected') {
                  stopLiveSession();
                  setTimeout(() => startLiveSession(), 400);
                }
              }}
              className={cn(
                "w-11 h-11 items-center justify-center transition-all duration-300 relative shrink-0 flex",
                isTranslationMode 
                  ? "bg-violet-500/20 text-violet-400 border border-violet-500/40 shadow-[0_0_15px_rgba(139,92,246,0.3)]" 
                  : "bg-white/[0.03] text-her-muted hover:bg-white/[0.05] border border-white/[0.05] hover:text-violet-400 hover:border-violet-500/20"
              )}
              title={isTranslationMode ? "Tradutor Simultâneo Ativo (Clique para Desativar)" : "Ativar Gemini Live 3.5 Translate"}
            >
              <Languages size={18} className={isTranslationMode ? "animate-pulse" : ""} />
            </button>

            <button 
              onClick={isScreenSharing ? stopScreenSharing : startScreenSharing}
              className={cn(
                "w-11 h-11 items-center justify-center transition-all duration-300 relative shrink-0 hidden md:flex",
                isScreenSharing 
                  ? "bg-her-accent/10 text-her-accent border border-her-accent/20" 
                  : "bg-white/[0.03] text-her-muted hover:bg-white/[0.05] border border-white/[0.05]"
              )}
              title={isScreenSharing ? "Parar Compartilhamento" : "Compartilhar Tela"}
            >
              {isScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
