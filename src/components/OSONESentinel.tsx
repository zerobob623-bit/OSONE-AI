import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Eye, 
  EyeOff, 
  Activity, 
  Volume2, 
  Trash2, 
  Sparkles, 
  Clock, 
  ChevronRight, 
  Play, 
  X,
  RefreshCw,
  Monitor,
  Info
} from 'lucide-react';

interface SentinelLog {
  id: string;
  timestamp: string;
  image: string;
  comment: string;
}

interface OSONESentinelProps {
  isActive: boolean;
  onToggleActive: (val: boolean) => void;
  interval: number;
  onIntervalChange: (secs: number) => void;
  logs: SentinelLog[];
  onClearLogs: () => void;
  isProcessing: boolean;
  onTriggerManual: () => Promise<void>;
  lastImage: string | null;
  className?: string;
  onSpeakText?: (text: string) => void;
  isScreenSharing: boolean;
  onStartScreenSharing?: () => Promise<void>;
}

export const OSONESentinel: React.FC<OSONESentinelProps> = ({
  isActive,
  onToggleActive,
  interval,
  onIntervalChange,
  logs,
  onClearLogs,
  isProcessing,
  onTriggerManual,
  lastImage,
  className = "",
  onSpeakText,
  isScreenSharing,
  onStartScreenSharing
}) => {
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(() => {
    return localStorage.getItem('osone_sentinel_autospeak') === 'true';
  });

  const handleAutoSpeakToggle = (val: boolean) => {
    setAutoSpeak(val);
    localStorage.setItem('osone_sentinel_autospeak', String(val));
  };

  const selectedLog = logs.find(log => log.id === selectedLogId);

  return (
    <div className={`flex flex-col h-full bg-[#030303]/45 border border-white/[0.04] backdrop-blur-2xl rounded-3xl overflow-hidden relative ${className}`}>
      
      {/* Radiant Sentinel Ambient Glow */}
      <div className={`absolute top-0 right-1/4 w-32 h-32 rounded-full blur-3xl pointer-events-none transition-colors duration-1000 ${
        isActive ? 'bg-cyan-500/10' : 'bg-amber-500/5'
      }`} />

      {/* Cyber Header */}
      <div className="p-5 border-b border-white/[0.05] flex items-center justify-between shrink-0 bg-black/10">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all duration-500 ${
            isActive && isProcessing 
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
              : isActive 
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.1)]' 
                : 'bg-zinc-900 border-white/5 text-zinc-500'
          }`}>
            <Eye size={18} className={isActive && isProcessing ? "animate-pulse" : ""} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-100 font-sans">Olho Sentinela</h2>
              <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-cyan-400 animate-ping' : 'bg-zinc-600'}`} />
            </div>
            <p className="text-[10px] text-zinc-400 font-mono tracking-wide mt-0.5">OSONE G5 Autonomous Perceptions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <button
              onClick={() => {
                if(confirm("Deseja deletar todo o histórico de insights do Sentinel?")) {
                  onClearLogs();
                }
              }}
              className="p-1.5 rounded-lg bg-white/[0.02] border border-white/[0.05] text-zinc-500 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all"
              title="Limpar Histórico"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Main Core Viewport Scroll */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar min-h-0">
        
        {/* Core Sentinel State Panel */}
        <div className="bg-white/[0.01] border border-white/[0.03] rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Controle Neural</span>
              <h3 className="text-xs font-semibold text-zinc-200 mt-0.5">Visão Perceptiva em Tempo Real</h3>
            </div>
            <button
              onClick={() => onToggleActive(!isActive)}
              className={`px-3 py-1.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer ${
                isActive 
                  ? 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]' 
                  : 'bg-zinc-900 border-white/5 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              {isActive ? 'Ativo 📡' : 'Desativado'}
            </button>
          </div>

          <p className="text-[11px] text-zinc-400/80 leading-normal font-sans">
            Com as permissões adequadas, o OSONE captura prints discretos da tela a cada intervalo definido para analisar suas atividades de forma autônoma e proferir reflexões e conselhos no momento perfeito.
          </p>

          <div className="h-px bg-white/[0.05]" />

          {/* Configuration Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <Clock size={10} /> Frequência de Recortes
              </span>
              <div className="flex items-center gap-1 bg-black/20 border border-white/[0.04] p-1 rounded-xl">
                {[15, 30, 60].map((secs) => (
                  <button
                    key={secs}
                    onClick={() => onIntervalChange(secs)}
                    disabled={!isActive}
                    className={`flex-1 text-center text-[10px] font-mono py-1 rounded-lg transition-all ${
                      interval === secs 
                        ? 'bg-cyan-500/15 text-cyan-400 font-bold border border-cyan-500/20' 
                        : 'text-zinc-500 hover:text-zinc-300 disabled:opacity-40 disabled:hover:text-zinc-500'
                    }`}
                  >
                    {secs}s
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <Volume2 size={10} /> Sintetizador de Voz
              </span>
              <button
                onClick={() => handleAutoSpeakToggle(!autoSpeak)}
                disabled={!isActive}
                className={`w-full text-center py-2 px-3 border rounded-xl text-[10px] font-mono transition-all flex items-center justify-center gap-1.5 ${
                  autoSpeak 
                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 font-bold' 
                    : 'bg-black/20 border-white/[0.04] text-zinc-500 hover:text-zinc-300 disabled:opacity-40'
                }`}
              >
                <Volume2 size={11} className={autoSpeak ? "animate-pulse" : ""} />
                {autoSpeak ? "Falar Insights: SIM" : "Falar Insights: NÃO"}
              </button>
            </div>
          </div>

          {/* Frame Source Status Info */}
          <div className="flex items-center gap-2 px-3 py-2 bg-black/15 border border-white/[0.03] rounded-xl text-[10px] font-mono text-zinc-500 select-none">
            {isScreenSharing ? (
              <>
                <Monitor size={12} className="text-cyan-400 animate-pulse animate-duration-1000" />
                <span>Capturando: <strong className="text-cyan-400">TELA EXTERNA ATIVA</strong></span>
              </>
            ) : (
              <>
                <Activity size={12} className="text-purple-400" />
                <span>Fonte: <strong className="text-purple-400">WORKSPACE OSONE (DOM)</strong></span>
              </>
            )}
            {onStartScreenSharing && !isScreenSharing && (
              <button
                onClick={onStartScreenSharing}
                className="ml-auto text-[9px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
              >
                Conectar Monitor Externo
              </button>
            )}
          </div>
        </div>

        {/* Manual Trigger Section */}
        <div className="flex gap-3">
          <button
            onClick={onTriggerManual}
            disabled={isProcessing}
            className={`flex-1 py-3 px-4 rounded-2xl font-bold uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2 border shadow-lg ${
              isProcessing
                ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed'
                : 'bg-cyan-500 hover:bg-cyan-400 text-black border-cyan-300 active:scale-98 cursor-pointer'
            }`}
          >
            {isProcessing ? (
              <>
                <RefreshCw size={13} className="animate-spin text-zinc-500" />
                Analisando Tela...
              </>
            ) : (
              <>
                <Sparkles size={13} />
                Capturar e Analisar Agora 📸
              </>
            )}
          </button>
        </div>

        {/* Dynamic Micro-Viewport Preview */}
        {lastImage && (
          <div className="space-y-2">
            <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest block font-bold">Último Print Registrado Coletado</span>
            <div className="relative group rounded-2xl border border-white/[0.08] overflow-hidden bg-black aspect-video flex items-center justify-center shadow-2xl">
              <img 
                src={lastImage} 
                alt="OSONE Sentinel Preview" 
                className="w-full h-full object-cover opacity-60 group-hover:opacity-85 transition-opacity"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/10 px-2 py-1 rounded-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                <span className="text-[8px] font-mono text-zinc-300 uppercase tracking-widest">Filtros OSONE HUD</span>
              </div>
            </div>
          </div>
        )}

        {/* Feed of Insights */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest block font-bold">Histórico de Visualizações ({logs.length})</span>
            {logs.length > 0 && <span className="text-[8px] font-mono text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded uppercase">Tempo Real</span>}
          </div>

          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {logs.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border border-dashed border-white/5 bg-black/10 flex flex-col items-center justify-center gap-2">
                  <Activity size={24} className="text-zinc-700 animate-pulse" />
                  <p className="text-[10px] text-zinc-500 italic">O Olho Sentinela ainda não registrou alterações relevantes para analisar.</p>
                </div>
              ) : (
                logs.map((log) => (
                  <motion.div
                    key={log.id}
                    layoutId={`sentinel-log-${log.id}`}
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group bg-white/[0.02] hover:bg-white/[0.04] p-4 rounded-2xl border border-white/[0.04] hover:border-white/[0.08] transition-all cursor-pointer relative"
                    onClick={() => setSelectedLogId(log.id)}
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="text-[9px] font-mono text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md">
                        {log.timestamp}
                      </span>
                      {onSpeakText && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSpeakText(log.comment);
                          }}
                          className="p-1 rounded-lg bg-zinc-900 border border-white/5 text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                          title="Falar este insight alto"
                        >
                          <Volume2 size={11} />
                        </button>
                      )}
                    </div>
                    
                    <p className="text-[11px] text-zinc-300 leading-relaxed line-clamp-3 font-sans mt-1">
                      {log.comment}
                    </p>

                    <div className="mt-2.5 pt-2 border-t border-white/[0.03] flex items-center justify-between text-[8px] font-mono text-zinc-500 uppercase tracking-wider group-hover:text-zinc-300 transition-colors">
                      <span>Clique para ver ampliado</span>
                      <ChevronRight size={10} className="translate-x-0 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Expanded Modal/Dialog View */}
      <AnimatePresence>
        {selectedLog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[90] flex items-center justify-center p-4 md:p-6"
            onClick={() => setSelectedLogId(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#080808] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col md:flex-row relative shadow-[0_30px_70px_rgba(0,0,0,0.9)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedLogId(null)}
                className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>

              {/* Print Attachment Area */}
              <div className="w-full md:w-1/2 h-64 md:h-auto relative bg-zinc-950 flex items-center justify-center border-b md:border-b-0 md:border-r border-white/10">
                <img 
                  src={selectedLog.image} 
                  alt="Sentinel Captured Frame" 
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-4 left-4 bg-black/75 backdrop-blur-md border border-white/10 rounded-xl px-2.5 py-1 text-[9px] font-mono text-zinc-300 flex items-center gap-1.5 uppercase">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  Insight Visual Registrado
                </div>
              </div>

              {/* Text suggestions block */}
              <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col justify-between overflow-y-auto">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-md uppercase">
                      Insight {selectedLog.timestamp}
                    </span>
                    <span className="text-[9px] font-mono text-zinc-500">ID: {selectedLog.id}</span>
                  </div>

                  <h3 className="text-base font-bold text-zinc-100 font-sans tracking-tight">Reflexão Visual OSONE</h3>
                  
                  <div className="h-px bg-white/10" />

                  <p className="text-xs md:text-sm text-zinc-300 leading-relaxed font-normal p-2 whitespace-pre-wrap select-text selection:bg-cyan-500 selection:text-black">
                    {selectedLog.comment}
                  </p>
                </div>

                <div className="mt-8 pt-4 border-t border-white/[0.05] flex gap-3">
                  {onSpeakText && (
                    <button
                      onClick={() => onSpeakText(selectedLog.comment)}
                      className="flex-1 py-2.5 px-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold uppercase tracking-widest text-[9px] rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Volume2 size={13} />
                      Repetir em Voz Alta
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedLogId(null)}
                    className="py-2.5 px-4 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-zinc-300 font-bold uppercase tracking-widest text-[9px] rounded-xl transition-all cursor-pointer"
                  >
                    Fechar Detalhes
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
