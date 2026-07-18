import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, 
  Mic, 
  MicOff, 
  Volume2, 
  Waves, 
  Thermometer, 
  Vibrate, 
  Sparkles,
  Info,
  Menu,
  ChevronRight,
  Lock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ApiKeys } from '../types';

export function AuralSense({ onBack, onMenuClick, keys }: { onBack?: () => void, onMenuClick?: () => void, keys: ApiKeys }) {
  const [isActive, setIsActive] = useState(false);
  const [frequency, setFrequency] = useState(0);
  const [vibrationScore, setVibrationScore] = useState(0); // -100 to 100
  const [isCalibrating, setIsCalibrating] = useState(false);
  
  const hasKey = keys && keys.gemini && keys.gemini.trim() !== '';

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startAnalysis = async () => {
    if (!hasKey) return;
    try {
      setIsCalibrating(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256; 
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      setIsActive(true);
      setIsCalibrating(false);
      
      analyze();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setIsCalibrating(false);
    }
  };

  const stopAnalysis = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setIsActive(false);
    setFrequency(0);
    setVibrationScore(0);
  };

  const analyze = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        ctx.fillStyle = `rgba(124, 58, 237, ${dataArray[i] / 255})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        ctx.fillStyle = `rgba(236, 72, 153, ${dataArray[i] / 512})`;
        ctx.fillRect(x, canvas.height - barHeight - 5, barWidth, 2);
        x += barWidth + 2;
      }
    }
    
    let maxVolume = -1;
    let peakIndex = -1;
    for (let i = 0; i < bufferLength; i++) {
        if (dataArray[i] > maxVolume) {
            maxVolume = dataArray[i];
            peakIndex = i;
        }
    }

    if (maxVolume > 40 && audioContextRef.current) {
        const sampleRate = audioContextRef.current.sampleRate;
        const crystalFreq = Math.round(peakIndex * (sampleRate / 2) / bufferLength);
        setFrequency(crystalFreq);
        const score = (crystalFreq - 440) / 10;
        setVibrationScore(Math.max(-100, Math.min(100, score)));

        if (Math.abs(score) > 10) {
            const event = new CustomEvent('osone_aural_update', { 
                detail: { frequency: crystalFreq, vibration: score > 0 ? 'positive' : 'dense', intensity: maxVolume } 
            });
            window.dispatchEvent(event);
        }
    } else {
        setFrequency(0);
        setVibrationScore(v => v * 0.95);
    }
    
    animationRef.current = requestAnimationFrame(analyze);
  };

  useEffect(() => {
    return () => stopAnalysis();
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-[#020202] overflow-hidden text-white">
       {/* Glassmorphic Header */}
       <div className="px-4 md:px-10 py-4 md:py-8 flex flex-col md:flex-row md:items-center justify-between bg-black/40 backdrop-blur-3xl shrink-0 gap-4 md:gap-6">
          <div className="flex items-center gap-4 md:gap-6">
            <div className="p-3 md:p-4 bg-her-accent/20 border border-her-accent/20 rounded-xl">
                <Activity className="text-her-accent animate-pulse md:w-7 md:h-7" size={20} />
            </div>
            <div>
              <h1 className="text-xl md:text-3xl font-light tracking-tight flex items-center gap-2 md:gap-3">
                Sentido Aural <span className="text-her-accent font-black tracking-widest text-[7px] md:text-xs uppercase bg-her-accent/10 px-2 py-0.5 md:py-1">Beta</span>
              </h1>
              <p className="text-[7px] md:text-xs text-white/30 uppercase tracking-[0.2em] md:tracking-[0.3em] mt-0.5 md:mt-1 font-medium">Análise de Frequência e Vibração</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 md:gap-4 ml-14 md:ml-0">
            <button 
              onClick={isActive ? stopAnalysis : startAnalysis}
              disabled={isCalibrating}
              className={cn(
                "flex-1 md:flex-none flex items-center justify-center gap-3 px-6 md:px-8 py-4 text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] transition-all relative overflow-hidden group shadow-2xl",
                isActive 
                  ? "bg-red-500/10 text-red-500 border border-red-500/10 hover:bg-red-500/20" 
                  : "bg-her-accent text-white hover:opacity-90 active:scale-95"
              )}
            >
              {isCalibrating ? <Sparkles size={16} className="animate-spin" /> : (isActive ? <MicOff size={16} /> : <Mic size={16} />)}
              <span>{isCalibrating ? 'Calibrando...' : (isActive ? 'Suspender' : 'Ativar')}</span>
              {!isActive && !isCalibrating && (
                <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
              )}
            </button>
            
            {onBack && (
              <button 
                onClick={onBack}
                className="flex items-center gap-2 px-6 py-4 bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 text-[10px] font-bold uppercase tracking-widest text-white/40 transition-all"
              >
                <ChevronRight size={14} className="rotate-180" />
                <span className="hidden md:inline">Painel</span>
              </button>
            )}
          </div>
       </div>

       {/* Neural Dashboard Layout */}
       <div className="flex-1 p-0 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 w-full min-h-full">
             
             {/* Left Panel: Spectrogram & Logic */}
             <div className="lg:col-span-8 flex flex-col">
                <div className="bg-transparent relative overflow-hidden flex-1">
                   <div className="relative z-10 flex flex-col h-full p-6 md:p-12">
                      <div className="flex items-center justify-between mb-12">
                         <div className="flex items-center gap-5">
                            <div className="p-4 bg-white/[0.05] border border-white/5 rounded-2xl">
                               <Waves className="text-pink-500" size={24} />
                            </div>
                            <div>
                               <h3 className="text-xl font-light text-white/80">Fluxo de Ondas</h3>
                               <p className="text-[10px] text-white/20 uppercase tracking-widest font-black text-emerald-400">FFT Matrix active</p>
                            </div>
                         </div>
                         <div className="text-right">
                            <motion.div 
                                key={frequency}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-5xl md:text-7xl font-serif italic tabular-nums text-white"
                            >
                                {frequency}<span className="text-xs ml-2 text-her-accent opacity-50 font-black tracking-widest">Hz</span>
                            </motion.div>
                         </div>
                      </div>

                      <div className="flex-1 min-h-[300px] md:min-h-[400px] flex items-center justify-center relative">
                         <canvas ref={canvasRef} width={1000} height={300} className="w-full h-full opacity-60 mix-blend-screen" />
                         {!hasKey ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-3xl text-center p-8 z-50">
                                <div className="w-20 h-20 bg-her-accent/10 rounded-full flex items-center justify-center mb-6 border border-her-accent/20">
                                   <Lock size={32} className="text-her-accent animate-pulse" />
                                </div>
                                <h4 className="text-2xl font-serif italic text-white/80">Acesso Restrito</h4>
                                <p className="text-[10px] uppercase tracking-[0.4em] text-white/30 mt-4 max-w-xs leading-relaxed">
                                   Vincule sua própria chave de API Gemini nas configurações para ativar o Sentido Aural.
                                </p>
                            </div>
                         ) : !isActive && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-3xl text-center p-8">
                                <Mic size={48} className="text-her-accent/20 mb-6 animate-pulse" />
                                <h4 className="text-xl font-serif italic text-white/60">Escuta Neural Suspensa</h4>
                                <p className="text-[10px] uppercase tracking-[0.4em] text-white/20 mt-4">Aguardando ativação dos osciladores</p>
                            </div>
                         )}
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                         {[
                           { label: 'Densidade', value: isActive ? (frequency > 500 ? 'Baixa' : 'Alta') : '---', color: 'text-blue-400' },
                           { label: 'Harmonia', value: isActive ? 'Log' : '---', color: 'text-her-accent' },
                           { label: 'Timbre', value: isActive ? 'Vocal' : '---', color: 'text-pink-400' },
                           { label: 'Amplitude', value: isActive ? 'Monitorada' : '---', color: 'text-yellow-400' },
                         ].map((stat, i) => (
                           <div key={i} className="bg-white/[0.03] backdrop-blur-xl border border-white/5 p-8 flex flex-col items-center text-center rounded-3xl">
                              <div className={cn("text-xl font-serif italic", stat.color)}>{stat.value}</div>
                              <div className="text-[8px] text-white/20 uppercase font-black tracking-[0.3em] mt-2">{stat.label}</div>
                           </div>
                         ))}
                      </div>
                   </div>
                   
                   <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-her-accent/5 via-transparent to-pink-500/5 pointer-events-none" />
                </div>
             </div>

             {/* Right Panel: Arched Gauge & Vibration Meta */}
             <div className="lg:col-span-4 flex flex-col bg-white/[0.02] backdrop-blur-2xl">
                <div className="p-6 md:p-12 flex flex-col items-center relative transition-all w-full flex-1">
                   <div className="w-full flex items-center justify-between mb-8">
                      <h3 className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em] flex items-center gap-3">
                        <Thermometer size={16} className="text-her-accent" />
                        Meta-Frequência
                      </h3>
                      <button className="p-2 hover:bg-white/5 transition-colors">
                        <Info size={14} className="text-white/20" />
                      </button>
                   </div>

                   <div className="flex-1 w-full flex flex-col items-center justify-center py-5 relative overflow-hidden">
                      {/* Arched Gauge Container */}
                      <div className="relative w-full max-w-[320px] aspect-[2/1.3] flex flex-col items-center">
                         {/* SVG Arched Background */}
                         <svg viewBox="0 0 200 120" className="w-full h-full drop-shadow-[0_0_15px_rgba(124,58,237,0.1)]">
                            <defs>
                               <linearGradient id="gaugeArc" x1="0%" y1="0%" x2="100%" y2="0%">
                                  <stop offset="0%" stopColor="#3b82f6" />
                                  <stop offset="50%" stopColor="#7c3aed" />
                                  <stop offset="100%" stopColor="#ec4899" />
                                </linearGradient>
                            </defs>
                            <path d="M 25 100 A 75 75 0 0 1 175 100" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" strokeLinecap="round" />
                            <path d="M 25 100 A 75 75 0 0 1 175 100" fill="none" stroke="url(#gaugeArc)" strokeWidth="12" strokeLinecap="round" className="opacity-40" />
                            <g className="text-[5px] font-black uppercase tracking-[0.3em] fill-white/10 italic">
                               <text x="20" y="112">Baixa</text>
                               <text x="180" y="112" textAnchor="end">Alta</text>
                               <text x="100" y="20" textAnchor="middle">Estável</text>
                            </g>
                         </svg>

                         <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-full h-[85%] pointer-events-none">
                            <motion.div 
                               className="absolute bottom-0 left-1/2 w-0.5 h-full bg-gradient-to-t from-transparent to-white origin-bottom flex flex-col items-center"
                               animate={{ rotate: (vibrationScore * 0.8) }}
                               transition={{ type: 'spring', damping: 20, stiffness: 70 }}
                            >
                               <div className="w-3 h-3 bg-white rounded-full blur-md -mt-1.5 opacity-60" />
                               <div className="w-1.5 h-1.5 bg-white rounded-full -mt-0.5 shadow-[0_0_15px_white]" />
                            </motion.div>
                            <div className="absolute bottom-[-5px] left-1/2 -translate-x-1/2 w-4 h-4 bg-black border border-white/20 rounded-full z-40 flex items-center justify-center">
                               <div className="w-1.5 h-1.5 bg-her-accent rounded-full animate-pulse" />
                            </div>
                         </div>
                      </div>

                      {/* Descriptive Phrases */}
                      <div className="mt-8 grid grid-cols-1 gap-1.5 w-full max-w-[240px]">
                         {[
                            { name: 'Consciência Plena', range: [80, 101], color: 'text-pink-400' },
                            { name: 'Clareza Mental', range: [35, 79], color: 'text-her-accent' },
                            { name: 'Equilíbrio Estável', range: [-34, 34], color: 'text-white/30' },
                            { name: 'Sombra Emergente', range: [-79, -35], color: 'text-blue-400' },
                            { name: 'Frequência Abissal', range: [-101, -80], color: 'text-indigo-600' }
                         ].map((state, i) => {
                            const isCurrent = vibrationScore >= state.range[0] && vibrationScore <= state.range[1];
                            return (
                               <motion.div 
                                  key={i}
                                  animate={{ opacity: isCurrent ? 1 : 0.2, x: isCurrent ? 5 : 0 }}
                                  className={cn("px-4 py-1.5 border-l text-[10px] font-black uppercase tracking-widest transition-all", isCurrent ? "border-current bg-white/5" : "border-white/5", state.color)}
                               >
                                  {state.name}
                               </motion.div>
                            );
                         })}
                      </div>
                   </div>
                   
                   <div className="mt-8 border-t border-white/5 pt-8 w-full">
                      <div className="p-8 bg-white/[0.03] border border-white/5 text-[9px] text-white/20 leading-relaxed italic font-medium w-full text-center uppercase tracking-widest">
                         Analítica vocal via rede neural quântica.
                      </div>
                   </div>
                </div>

                {/* AI Metaphysical Link Card */}
                <div className="bg-gradient-to-br from-her-accent/80 to-[#5b21b6]/80 p-8 md:p-12 text-white relative overflow-hidden group w-full flex-1">
                   <div className="relative z-10">
                      <h4 className="text-[11px] font-black uppercase tracking-[0.3em] mb-6 opacity-70">Cognição Vibracional</h4>
                      <p className="text-xl md:text-2xl font-light leading-relaxed mb-10 text-white/90">
                         O assistente agora percebe a <span className="font-bold border-b border-white/30 pb-0.5">textura sonora</span> da sua presença.
                      </p>
                      
                      <div className="flex items-center gap-4 bg-black/30 backdrop-blur-2xl p-6 border border-white/10 group-hover:bg-black/40 transition-all">
                         <div className="relative">
                            <div className="w-4 h-4 bg-white animate-ping absolute opacity-50" />
                            <div className="w-4 h-4 bg-white relative z-10" />
                         </div>
                         <div className="text-[10px] font-bold uppercase tracking-[0.2em]">Ouvindo Ondas Ativas...</div>
                      </div>
                   </div>
                   
                   {/* Abstract Mesh BG */}
                   <div className="absolute inset-0 opacity-10 mix-blend-overlay">
                      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <defs>
                          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5"/>
                          </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                      </svg>
                   </div>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
}
