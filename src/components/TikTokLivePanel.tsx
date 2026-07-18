import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Radio, 
  Heart, 
  Eye, 
  Zap, 
  Video, 
  Volume2, 
  VolumeX, 
  ChevronLeft, 
  Trash2, 
  Settings, 
  MessageSquare, 
  Award,
  Sparkles,
  HelpCircle,
  FileText
} from 'lucide-react';
import { cn } from '../lib/utils';

interface TikTokLog {
  id: string;
  type: 'chat' | 'gift' | 'like' | 'member' | 'system' | 'error';
  user: string;
  message: string;
  timestamp: number;
}

interface TikTokLivePanelProps {
  onBack: () => void;
  tiktokState: {
    status: 'connected' | 'disconnected' | 'connecting';
    username: string;
    isAutoRespondActive: boolean;
    viewerCount: number;
    likeCount: number;
    sessionId: string;
    targetIdc: string;
    logs: TikTokLog[];
  };
  tiktokUser: string;
  setTiktokUser: (user: string) => void;
  tiktokSessionId: string;
  setTiktokSessionId: (id: string) => void;
  tiktokTargetIdc: string;
  setTiktokTargetIdc: (idc: string) => void;
  tiktokLoading: boolean;
  onConnect: (simulate?: boolean) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onToggleAutoRespond: (active: boolean) => Promise<void>;
  onClearLogs: () => Promise<void>;
  onAddNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  
  // TTS Narrator Controls
  isLiveNarratorActive: boolean;
  setIsLiveNarratorActive: (active: boolean) => void;
  liveNarratorVoice: string;
  setLiveNarratorVoice: (voice: string) => void;
}

export const TikTokLivePanel = ({
  onBack,
  tiktokState,
  tiktokUser,
  setTiktokUser,
  tiktokSessionId,
  setTiktokSessionId,
  tiktokTargetIdc,
  setTiktokTargetIdc,
  tiktokLoading,
  onConnect,
  onDisconnect,
  onToggleAutoRespond,
  onClearLogs,
  onAddNotification,
  isLiveNarratorActive,
  setIsLiveNarratorActive,
  liveNarratorVoice,
  setLiveNarratorVoice
}: TikTokLivePanelProps) => {
  const [localUser, setLocalUser] = useState(tiktokUser);
  const [localSessionId, setLocalSessionId] = useState(tiktokSessionId);
  const [localTargetIdc, setLocalTargetIdc] = useState(tiktokTargetIdc);
  const [showAdvanceOpts, setShowAdvanceOpts] = useState(false);
  const [availableSpeechVoices, setAvailableSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const terminalLogsEndRef = useRef<HTMLDivElement>(null);

  // Sync parent values if they update elsewhere
  useEffect(() => {
    setLocalUser(tiktokUser);
  }, [tiktokUser]);

  useEffect(() => {
    setLocalSessionId(tiktokSessionId);
  }, [tiktokSessionId]);

  useEffect(() => {
    setLocalTargetIdc(tiktokTargetIdc);
  }, [tiktokTargetIdc]);

  // Keep terminal logs scrolled to top (newest first is unshifted, but if it is layout, we display unshifted order)
  useEffect(() => {
    // We display logs newest first, so the scroll should generally stay on top. No force scrolling needed.
  }, [tiktokState.logs]);

  // Retrieve browser voices for TTS
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        setAvailableSpeechVoices(window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('pt') || v.lang.startsWith('en')));
      }
    };
    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const handleConnectClick = async (simulate = false) => {
    setTiktokUser(localUser);
    setTiktokSessionId(localSessionId);
    setTiktokTargetIdc(localTargetIdc);
    
    // Defer to parent connect trigger
    // Since direct assignment state updates could be asynchronous, we pass them down
    try {
      if (simulate) {
        await onConnect(true);
      } else {
        await onConnect(false);
      }
    } catch (e) {
      // Handled by parent
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col gap-0 min-h-0 select-none bg-her-bg">
      {/* Header section with back navigation */}
      <div className="flex items-center justify-between shrink-0 p-6 border-b border-white/10 w-full bg-black/5">
        <div className="flex items-center gap-4">
          <button 
            type="button"
            onClick={onBack}
            className="p-3 bg-white/[0.03] hover:bg-white/[0.05] active:bg-white/[0.08] transition-all text-her-muted border border-white/[0.05] rounded-xl cursor-pointer"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-rose-500/10 text-rose-500 rounded-lg">
                <Radio size={16} className={cn(tiktokState.status === 'connected' && "animate-pulse")} />
              </span>
              <h2 className="text-xl font-serif italic font-light text-white">Co-piloto TikTok Live G5</h2>
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Integração cognitiva de webcast. Leia e narre interações em tempo real direto dos servidores Webcast da ByteDance.
            </p>
          </div>
        </div>

        {/* Live Status indicator */}
        <div className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.05] px-4 py-2 rounded-xl">
          <span className="w-2.5 h-2.5 rounded-full relative">
            <span className={cn(
              "absolute inset-0 rounded-full",
              tiktokState.status === 'connected' ? "bg-emerald-400 animate-ping" : 
              tiktokState.status === 'connecting' ? "bg-amber-400 animate-ping" : "bg-neutral-600"
            )} />
            <span className={cn(
              "absolute inset-0.5 rounded-full",
              tiktokState.status === 'connected' ? "bg-emerald-500" : 
              tiktokState.status === 'connecting' ? "bg-amber-500" : "bg-neutral-500"
            )} />
          </span>
          <span className="text-[10px] font-mono font-bold tracking-widest text-zinc-400 uppercase">
            {tiktokState.status === 'connected' ? `LIVE ATIVA (@${tiktokState.username})` : 
             tiktokState.status === 'connecting' ? "CONECTANDO..." : "DESCONECTADO"}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-7xl mx-auto">
          
          {/* Side Panels - Configuration and Cognitive controls (lg:col-span-4) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* 1. Connection Card */}
            <div className="bg-white/[0.01] border border-white/[0.04] p-5 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/[0.03] pb-3 select-none">
                <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-mono font-bold">CONEXÃO TRANSMISSÃO</span>
                <span className="text-[8px] bg-rose-500/15 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter">Webcast</span>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[8.5px] text-zinc-400 font-mono tracking-wider uppercase font-bold">NOME DO USUÁRIO (@ CANAL)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-xs">@</span>
                    <input 
                      type="text"
                      value={localUser}
                      onChange={(e) => setLocalUser(e.target.value.replace(/^@/, ''))}
                      placeholder="seu_canal_tiktok"
                      disabled={tiktokState.status !== 'disconnected'}
                      className="w-full bg-white/[0.02] border border-white/[0.05] rounded-xl pl-8 pr-3.5 py-3 focus:outline-none focus:border-rose-500/20 text-xs text-white"
                    />
                  </div>
                </div>

                {/* Advanced Fields Toggle */}
                <button
                  type="button"
                  onClick={() => setShowAdvanceOpts(!showAdvanceOpts)}
                  className="w-full text-center text-[9px] font-mono tracking-wider text-rose-400/80 hover:text-rose-400 hover:underline flex items-center justify-center gap-1 uppercase"
                >
                  <Settings size={10} />
                  {showAdvanceOpts ? "Ocultar Ajustes Anti-Bloqueio ▲" : "Exibir Ajustes Anti-Bloqueio ▼"}
                </button>

                {showAdvanceOpts && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-4 pt-1"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[8px] font-mono tracking-wider uppercase font-bold">
                        <span className="text-zinc-400">SESSION ID COOKIE</span>
                        <span className="text-zinc-500 select-none lowercase italic text-[7.5px] normal-case">evita sombra e block</span>
                      </div>
                      <input 
                        type="password"
                        value={localSessionId}
                        onChange={(e) => setLocalSessionId(e.target.value)}
                        placeholder="Insira o sessionid do seu navegador"
                        disabled={tiktokState.status !== 'disconnected'}
                        className="w-full bg-white/[0.02] border border-white/[0.05] rounded-xl px-3.5 py-3 focus:outline-none focus:border-rose-500/20 text-xs text-zinc-300 font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[8px] font-mono tracking-wider uppercase font-bold">
                        <span className="text-zinc-400">TARGET IDC REGION</span>
                        <span className="text-zinc-500 select-none lowercase italic text-[7.5px] normal-case">ex: row, alisg, useast2a</span>
                      </div>
                      <input 
                        type="text"
                        value={localTargetIdc}
                        onChange={(e) => setLocalTargetIdc(e.target.value)}
                        placeholder="row"
                        disabled={tiktokState.status !== 'disconnected'}
                        className="w-full bg-white/[0.02] border border-white/[0.05] rounded-xl px-3.5 py-3 focus:outline-none focus:border-rose-500/20 text-xs text-zinc-300 font-mono placeholder:text-zinc-700"
                      />
                    </div>
                  </motion.div>
                )}

                <div className="space-y-2.5 pt-2">
                  {tiktokState.status === 'disconnected' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleConnectClick(false)}
                        disabled={tiktokLoading || !localUser.trim()}
                        className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-[10px] font-bold uppercase tracking-widest transition-all rounded-xl cursor-pointer disabled:opacity-40 shadow-lg shadow-rose-950/20"
                      >
                        {tiktokLoading ? "Rastreando Webcast..." : "Conectar Canal de Live"}
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => handleConnectClick(true)}
                        disabled={tiktokLoading}
                        className="w-full py-3.5 bg-white/[0.02] hover:bg-white/[0.05] active:bg-white/[0.08] border border-white/[0.04] text-zinc-300 text-[10px] font-bold uppercase tracking-widest transition-all rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Zap size={11} className="text-amber-400 animate-bounce" />
                        Ativar Simulador Virtual
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={onDisconnect}
                      disabled={tiktokLoading}
                      className="w-full py-3.5 bg-[#141414] hover:bg-zinc-800 active:bg-black text-rose-400 border border-zinc-800 text-[10px] font-bold uppercase tracking-widest transition-all rounded-xl cursor-pointer"
                    >
                      {tiktokLoading ? "Liberando Canal..." : "Desconectar Sockets"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 2. REAL-TIME COGNITIVE NARRATOR (New section addressing prompt requirements) */}
            <div className="bg-white/[0.01] border border-white/[0.04] p-5 rounded-2xl space-y-4 shadow-xl text-left">
              <div className="flex items-center justify-between border-b border-white/[0.03] pb-3 select-none">
                <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-mono font-bold">NARRADOR DE LIVE EM TEMPO REAL</span>
                <span className="text-[8px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/15 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Leitor Sônico</span>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 bg-black/40 rounded-xl border border-white/[0.02]">
                  <div className="text-left flex-1 pr-4">
                    <span className="block text-[10px] font-bold text-zinc-200 uppercase leading-none">Narração Vocal Ativa</span>
                    <span className="text-[8.5px] text-zinc-500 select-none block mt-1.5 leading-normal">
                      OSONE lerá em som alto novos chats e presentes em português conforme ocorrem na live!
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const mode = !isLiveNarratorActive;
                      setIsLiveNarratorActive(mode);
                      onAddNotification(mode ? "Leitor de chat em voz alta ATIVADO!" : "Leitor de chat em voz alta desativado.", "info");
                    }}
                    className={cn(
                      "px-3 py-2 text-[9px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer border shrink-0",
                      isLiveNarratorActive
                        ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]"
                        : "bg-white/[0.02] text-zinc-500 border-white/5"
                    )}
                  >
                    {isLiveNarratorActive ? "ATIVAR VOZ" : "VOZ DESATIVADA"}
                  </button>
                </div>

                {isLiveNarratorActive && (
                  <div className="space-y-1.5">
                    <label className="block text-[8.5px] text-zinc-400 font-mono tracking-wider uppercase font-bold">Voz de Narração</label>
                    <select
                      value={liveNarratorVoice}
                      onChange={(e) => setLiveNarratorVoice(e.target.value)}
                      className="w-full bg-[#080808] border border-white/[0.05] rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-cyan-500/20 font-sans cursor-pointer"
                    >
                      <option value="default">Voz Português Padrão do Sistema</option>
                      {availableSpeechVoices.map(vo => (
                        <option key={vo.name} value={vo.name}>{vo.name} ({vo.lang})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Co-pilot Cognitive (Auto-Respond AI) */}
            <div className="bg-white/[0.01] border border-white/[0.04] p-5 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/[0.03] pb-3 select-none">
                <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-mono font-bold">SÍNTESE DE RESPOSTAS IA</span>
                <span className="text-[8px] bg-amber-500/10 text-amber-300 border border-amber-500/15 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Automático</span>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 bg-black/40 rounded-xl border border-white/[0.02]">
                  <div className="text-left flex-1 pr-4">
                    <span className="block text-[10px] font-bold text-zinc-200 uppercase leading-none">Auto-responder Gemini</span>
                    <span className="text-[8.5px] text-zinc-500 select-none block mt-1.5 leading-normal">
                      OSONE criará retornos ultra curtos na CPU central para cada comentário do chat!
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleAutoRespond(!tiktokState.isAutoRespondActive)}
                    className={cn(
                      "px-3 py-2 text-[9px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer border shrink-0",
                      tiktokState.isAutoRespondActive
                        ? "bg-rose-500/15 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]"
                        : "bg-white/[0.02] text-zinc-500 border-white/5"
                    )}
                  >
                    {tiktokState.isAutoRespondActive ? "ATIVO" : "INATIVO"}
                  </button>
                </div>

                <div className="bg-zinc-950/40 p-3.5 rounded-xl border border-white/[0.02] space-y-2 text-left">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-[8.5px] font-mono tracking-widest uppercase font-bold">
                    <Sparkles size={11} className="text-rose-400" />
                    <span>Consciência Integrada</span>
                  </div>
                  <p className="text-[9px] leading-relaxed text-zinc-400">
                    Ao manter a live conectada, a IA OSONE G5 se encarrega de ler e formular piadas, interações e respostas. Na aba do chat principal, você poderá consultar as métricas de retenção e as últimas interações recolhidas da webcast!
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* Main Terminal Area (lg:col-span-8) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Live Stats Row */}
            {tiktokState.status === 'connected' && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-3 gap-4"
              >
                <div className="bg-[#0b0c10]/40 border border-sky-500/20 p-4 rounded-xl flex items-center justify-between shadow-lg">
                  <div className="text-left">
                    <span className="block text-[8px] uppercase tracking-wider text-sky-400 font-mono">Espectadores</span>
                    <span className="block text-xl font-mono font-bold text-white mt-1">{tiktokState.viewerCount || 0}</span>
                  </div>
                  <Eye className="text-sky-400" size={20} />
                </div>

                <div className="bg-[#0b0c10]/40 border border-rose-500/20 p-4 rounded-xl flex items-center justify-between shadow-lg">
                  <div className="text-left">
                    <span className="block text-[8px] uppercase tracking-wider text-rose-400 font-mono">Curtidas</span>
                    <span className="block text-xl font-mono font-bold text-white mt-1">{tiktokState.likeCount || 0}</span>
                  </div>
                  <Heart className="text-rose-500 fill-rose-500/20" size={18} />
                </div>

                <div className="bg-[#0b0c10]/40 border border-emerald-500/20 p-4 rounded-xl flex items-center justify-between shadow-lg">
                  <div className="text-left">
                    <span className="block text-[8px] uppercase tracking-wider text-emerald-400 font-mono">Eficácia Sockets</span>
                    <span className="block text-xl font-mono font-bold text-white mt-1">100%</span>
                  </div>
                  <Zap className="text-emerald-400" size={18} />
                </div>
              </motion.div>
            )}

            {/* Event Console Logs Panel */}
            <div className="flex flex-col h-[560px] bg-[#030303] border border-white/[0.04] rounded-2xl overflow-hidden shadow-2xl relative">
              <div className="flex items-center justify-between px-5 py-4 bg-black/40 border-b border-white/[0.04] shrink-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-2 w-2 relative">
                    <span className={cn(
                      "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                      tiktokState.status === 'connected' ? "bg-emerald-400" : "bg-neutral-600"
                    )}></span>
                    <span className={cn(
                      "relative inline-flex rounded-full h-2 w-2",
                      tiktokState.status === 'connected' ? "bg-emerald-500" : "bg-neutral-500"
                    )}></span>
                  </span>
                  <span className="text-[10px] font-mono tracking-widest text-zinc-300 font-bold uppercase">
                    Terminal TikTok Live Webcast
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onClearLogs}
                  className="px-3.5 py-1.5 text-[9px] font-mono border border-white/5 bg-white/[0.01] hover:bg-white/[0.04] active:bg-white/[0.08] rounded-lg transition-all text-zinc-400 cursor-pointer uppercase tracking-wider hover:text-white"
                >
                  Limpar Terminal
                </button>
              </div>

              {/* Logs display scrolling client */}
              <div className="flex-1 overflow-y-auto p-5 space-y-2.5 font-mono text-[10.5px] bg-[#010101] custom-scrollbar selection:bg-rose-500/20">
                {tiktokState.logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-zinc-600 gap-3 select-none">
                    <div className="p-4 bg-white/[0.01] border border-white/[0.04] rounded-full">
                      <Radio size={24} className="text-zinc-600 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <span className="block text-[9.5px] uppercase tracking-widest font-bold text-zinc-500">Nenhuma atividade interceptada</span>
                      <span className="block text-[8.5px] opacity-60 font-sans max-w-sm leading-relaxed">
                        Inicie uma live pública no TikTok e insira seu username no formulário para interceptar os fluxos de sockets ou ative o Simulador para testar.
                      </span>
                    </div>
                  </div>
                ) : (
                  tiktokState.logs.map((log: any) => {
                    let colorClasses = "bg-white/[0.01] border-white/5 text-zinc-400";
                    let label = "INFO";
                    
                    if (log.type === "chat") {
                      colorClasses = "bg-sky-500/[0.02] border-sky-500/10 text-sky-200 border-l-2 border-l-sky-500/40";
                      label = "CHAT";
                    } else if (log.type === "gift") {
                      colorClasses = "bg-pink-500/[0.03] border-pink-500/15 text-pink-300 font-bold border-l-2 border-l-pink-500/40";
                      label = "PRESENTE";
                    } else if (log.type === "like") {
                      colorClasses = "bg-emerald-500/[0.01] border-emerald-500/10 text-emerald-300 border-l-2 border-l-emerald-500/20";
                      label = "CURTIDA";
                    } else if (log.type === "member") {
                      colorClasses = "bg-purple-500/[0.01] border-purple-500/10 text-purple-300 border-l-2 border-l-purple-500/20";
                      label = "ENTROU";
                    } else if (log.type === "error") {
                      colorClasses = "bg-red-500/[0.03] border-red-500/15 text-red-400 font-bold border-l-2 border-l-red-500/40";
                      label = "ERRO";
                    } else if (log.type === "system") {
                      colorClasses = "bg-amber-500/[0.02] border-amber-500/10 text-amber-300 border-l-2 border-l-amber-500/40";
                      label = "SISTEMA";
                    }

                    const dateStr = new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour12: false });

                    return (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={log.id} 
                        className={cn("p-3 rounded-xl border text-left leading-relaxed shadow-sm transition-colors", colorClasses)}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1.5 shrink-0 select-none opacity-60 border-b border-white/[0.02] pb-1">
                          <span className="text-[8px] uppercase tracking-wider font-bold">{label} • {dateStr}</span>
                          <span className="text-[9px] font-bold">@{log.user}</span>
                        </div>
                        <p className="whitespace-pre-wrap mt-1 leading-normal text-[10.5px] select-text">{log.message}</p>
                      </motion.div>
                    );
                  })
                )}
                <div ref={terminalLogsEndRef} />
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};
