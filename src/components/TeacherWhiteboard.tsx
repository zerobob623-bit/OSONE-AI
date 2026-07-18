import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Eraser, 
  Copy, 
  Trash2, 
  Check, 
  Sparkles, 
  Layers, 
  Palette, 
  ArrowRight,
  Maximize2,
  Minimize2,
  PenTool,
  RotateCcw
} from 'lucide-react';

interface TeacherWhiteboardProps {
  text: string;
  onChangeText: (text: string) => void;
  isWriting?: boolean;
  onClear?: () => void;
  speakerName?: string | null;
}

export const TeacherWhiteboard: React.FC<TeacherWhiteboardProps> = ({
  text,
  onChangeText,
  isWriting = false,
  onClear,
  speakerName
}) => {
  const [boardColor, setBoardColor] = useState<'green' | 'black' | 'white'>('green');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeChalkColor, setActiveChalkColor] = useState<string>('white');
  const [notification, setNotification] = useState<string | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Play custom synthesized chalk scratch or marker drawing sound
  const playChalkSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const duration = 0.04 + Math.random() * 0.04; // 40-80ms friction sound
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      
      // Make friction-like raw noise
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.015 * (1 - i / bufferSize);
      }
      
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      // High-mids resonance for squeaky chalk, or low bandpass for marker
      if (boardColor === 'white') {
        filter.frequency.value = 1100 + Math.random() * 300; // soft damp marker
        filter.Q.value = 1.5;
      } else {
        filter.frequency.value = 1900 + Math.random() * 500; // high frequency chalk scratch
        filter.Q.value = 3.5;
      }
      
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.35, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration - 0.005);
      
      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      noise.start();
    } catch (e) {
      // Ignore audio error if context blocked
    }
  };

  // Play eraser sound
  const playEraserSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const duration = 0.18; // longer swipe
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      
      // Low rumble noise for felt eraser friction
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.02 * Math.sin(i * 0.01) * (1 - i / bufferSize);
      }
      
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 350; // low rub noise
      
      noise.connect(filter);
      filter.connect(ctx.destination);
      noise.start();
    } catch (e) {}
  };

  // Trigger sound when text changes (simulates drawing/writing feedback)
  useEffect(() => {
    if (text) {
      playChalkSound();
    }
  }, [text]);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    triggerNotification("Conteúdo da lousa copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const triggerNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleErase = () => {
    playEraserSound();
    if (onClear) {
      onClear();
    } else {
      onChangeText('');
    }
    triggerNotification("Lousa limpa!");
  };

  // Chalk/Marker colors based on Board background
  const chalkColors = boardColor === 'white' 
    ? [
        { id: 'black', hex: '#1c1917', name: 'Preto' },
        { id: 'blue', hex: '#1d4ed8', name: 'Azul' },
        { id: 'red', hex: '#b91c1c', name: 'Vermelho' },
        { id: 'green', hex: '#15803d', name: 'Verde' },
      ]
    : [
        { id: 'white', hex: '#fbfbfb', name: 'Branco' },
        { id: 'yellow', hex: '#fef08a', name: 'Amarelo' },
        { id: 'cyan', hex: '#67e8f9', name: 'Ciano' },
        { id: 'rose', hex: '#fda4af', name: 'Rosa' },
      ];

  // Map active color to CSS text styles
  const getTextColorStyle = () => {
    if (boardColor === 'white') {
      if (activeChalkColor === 'blue') return 'text-blue-700 font-medium drop-shadow-[0_1px_1px_rgba(0,0,0,0.05)]';
      if (activeChalkColor === 'red') return 'text-red-600 font-medium drop-shadow-[0_1px_1px_rgba(0,0,0,0.05)]';
      if (activeChalkColor === 'green') return 'text-emerald-700 font-medium drop-shadow-[0_1px_1px_rgba(0,0,0,0.05)]';
      return 'text-stone-800 font-medium drop-shadow-[0_1px_1px_rgba(0,0,0,0.05)]';
    } else {
      if (activeChalkColor === 'yellow') return 'text-yellow-100/90 drop-shadow-[0_0_2px_rgba(234,179,8,0.5)]';
      if (activeChalkColor === 'cyan') return 'text-cyan-100/90 drop-shadow-[0_0_2px_rgba(6,182,212,0.5)]';
      if (activeChalkColor === 'rose') return 'text-rose-100/90 drop-shadow-[0_0_2px_rgba(244,63,94,0.5)]';
      return 'text-neutral-50/95 drop-shadow-[0_0_2px_rgba(255,255,255,0.4)]';
    }
  };

  return (
    <div className={`flex flex-col h-full rounded-2xl border transition-all duration-300 relative ${
      isFullscreen 
        ? 'fixed inset-4 z-[999] bg-stone-950/95 shadow-2xl overflow-hidden flex flex-col' 
        : 'w-full h-[400px] bg-stone-900/40 border-white/5 shadow-xl'
    }`}>
      {/* Inject Chalk Font dynamically to make it beautiful */}
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Architects+Daughter&family=Caveat:wght@400;600&family=Delius&display=swap');
        
        .chalk-font {
          font-family: 'Architects Daughter', 'Caveat', cursive, sans-serif;
          letter-spacing: 0.05em;
          line-height: 1.6;
        }

        .board-green {
          background-color: #0b2d1d;
          background-image: 
            radial-gradient(circle at 50% 50%, #0d3824 0%, #071f14 100%),
            repeating-linear-gradient(45deg, rgba(255,255,255,0.01) 0px, rgba(255,255,255,0.01) 1px, transparent 1px, transparent 10px);
          box-shadow: inset 0 0 40px rgba(0,0,0,0.8);
        }

        .board-black {
          background-color: #121213;
          background-image: 
            radial-gradient(circle at 50% 40%, #1e1e20 0%, #0c0c0d 100%),
            repeating-linear-gradient(135deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 8px);
          box-shadow: inset 0 0 50px rgba(0,0,0,0.9);
        }

        .board-white {
          background-color: #fafaf7;
          background-image: 
            radial-gradient(circle at 50% 90%, #f4f4ec 0%, #fefefc 100%),
            linear-gradient(to right, rgba(0,0,100,0.01) 1px, transparent 1px);
          background-size: 20px 20px;
          box-shadow: inset 0 0 15px rgba(0,0,0,0.05);
        }

        /* Chalk textures simulation */
        .chalk-written {
          filter: contrast(1.1) brightness(1.05);
        }
      `}} />

      {/* Board Wooden or Aluminum Frame Header */}
      <div className={`p-4 flex items-center justify-between border-b shrink-0 select-none ${
        boardColor === 'white' 
          ? 'bg-zinc-100 border-zinc-300 text-zinc-700' 
          : 'bg-amber-950/40 border-amber-900/30 text-amber-100/90'
      } rounded-t-2xl`}>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full flex items-center justify-center ${
            isWriting ? 'bg-amber-500 animate-pulse' : 'bg-green-500/80'
          }`}>
            {isWriting && <span className="absolute w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
          </div>
          <span className="text-xs font-bold tracking-widest uppercase font-mono flex items-center gap-1.5">
            📝 Lousa de Explicação
            {speakerName ? (
              <span className="opacity-70 font-normal">({speakerName})</span>
            ) : (
              <span className="opacity-50 font-normal">(Professores)</span>
            )}
          </span>
        </div>

        {/* Board Operations and Frame Adjustments */}
        <div className="flex items-center gap-2">
          {/* Quick Board Color Swappers */}
          <div className="flex items-center bg-black/10 rounded-lg p-1 gap-1 border border-white/5 mr-2">
            <button 
              onClick={() => { setBoardColor('green'); setActiveChalkColor('white'); }}
              className={`w-5 h-5 rounded bg-[#0b2d1d] border ${boardColor === 'green' ? 'border-[#b45309] scale-110 shadow-sm' : 'border-transparent opacity-60 hover:opacity-105'}`}
              title="Quadro Verde de Giz"
            />
            <button 
              onClick={() => { setBoardColor('black'); setActiveChalkColor('white'); }}
              className={`w-5 h-5 rounded bg-[#121213] border ${boardColor === 'black' ? 'border-[#b45309] scale-110 shadow-sm' : 'border-transparent opacity-60 hover:opacity-105'}`}
              title="Quadro Negro de Giz"
            />
            <button 
              onClick={() => { setBoardColor('white'); setActiveChalkColor('black'); }}
              className={`w-5 h-5 rounded bg-[#fafaf7] border ${boardColor === 'white' ? 'border-zinc-400 scale-110 shadow-sm' : 'border-transparent opacity-60 hover:opacity-105'}`}
              title="Quadro Branco de Marcador"
            />
          </div>

          <button 
            onClick={() => setIsEditing(!isEditing)}
            className={`p-1.5 rounded-lg hover:bg-black/10 transition-colors flex items-center gap-1 text-[10px] font-mono uppercase ${
              isEditing ? 'bg-black/20 text-her-accent font-bold' : ''
            }`}
            title="Clique para editar manualmente ou anotar"
          >
            <PenTool size={13} />
            <span className="hidden sm:inline">Escrever</span>
          </button>

          <button 
            onClick={handleCopy}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
            title="Copiar lição"
          >
            {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
          </button>

          <button 
            onClick={handleErase}
            className="p-1.5 rounded-lg hover:bg-black/10 hover:text-red-400 transition-colors text-[#b45309]/80"
            title="Limpar quadro"
          >
            <Eraser size={14} />
          </button>

          <button 
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
            title={isFullscreen ? "Minimizar" : "Expandir lousa"}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Main Board Surface */}
      <div className={`flex-1 relative overflow-auto font-normal p-6 outline-none flex flex-col transition-all duration-300 ${
        boardColor === 'green' ? 'board-green text-amber-50/90' :
        boardColor === 'black' ? 'board-black text-neutral-100' :
        'board-white text-stone-800'
      }`}>
        <AnimatePresence>
          {isWriting && (
            <motion.div 
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 0.8, y: 0 }}
              exit={{ opacity: 0 }}
              className={`absolute top-3 right-4 p-1 px-2.5 rounded-full border text-[9px] font-mono tracking-widest uppercase flex items-center gap-1.5 shadow-md ${
                boardColor === 'white' 
                  ? 'bg-zinc-100 border-zinc-200 text-zinc-600' 
                  : 'bg-black/40 border-white/5 text-amber-100'
              }`}
            >
              <PenTool size={10} className="animate-bounce" />
              <span>{speakerName || 'Co-docente'} escrevendo...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => onChangeText(e.target.value)}
            placeholder="A lousa está pronta. Escreva aqui para deixar anotações de aula..."
            className={`w-full h-full bg-transparent resize-none focus:outline-none placeholder-white/15 border-0 p-0 chalk-font md:text-xl text-base ${getTextColorStyle()}`}
            autoFocus
          />
        ) : (
          <div 
            onClick={() => setIsEditing(true)}
            className={`w-full h-full cursor-text whitespace-pre-wrap chalk-font md:text-xl text-base overflow-y-auto ${getTextColorStyle()} chalk-written`}
          >
            {text ? text : (
              <div className="h-full flex flex-col items-center justify-center opacity-25 text-center text-sm md:text-base font-mono py-8 select-none">
                <Sparkles size={28} className="mb-2 text-current" />
                <p>A lousa escolar está vazia.</p>
                <p className="text-xs mt-1">Os professores escreverão dicas, traduções ou vocabulários aqui durante as aulas de Duo Mode.</p>
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                  className="mt-4 px-4 py-1.5 rounded-lg border border-current text-xs hover:bg-white/5 active:scale-95 transition-all"
                >
                  Pegar Giz/Canetinha
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Classroom Marker Tray Details at bottom */}
      <div className={`p-2.5 shrink-0 select-none flex items-center justify-between border-t ${
        boardColor === 'white' 
          ? 'bg-zinc-200/80 border-zinc-300 text-zinc-600' 
          : 'bg-[#18110a] border-amber-950/20 text-stone-400'
      } rounded-b-2xl`}>
        {/* Dynamic Chalk Sticks */}
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono uppercase tracking-wider opacity-60">Escolher Giz:</span>
          <div className="flex items-center gap-1.5">
            {chalkColors.map((color) => (
              <button
                key={color.id}
                onClick={() => {
                  setActiveChalkColor(color.id);
                  playChalkSound();
                }}
                className={`flex flex-col items-center justify-center group h-5 transition-transform ${
                  activeChalkColor === color.id ? '-translate-y-1 scale-110' : 'hover:-translate-y-0.5'
                }`}
                title={`Giz ${color.name}`}
              >
                {/* Chalk 3D Stick representation */}
                <div 
                  style={{ backgroundColor: color.hex }}
                  className={`w-2.5 h-6 rounded-t border shadow-sm ${
                    activeChalkColor === color.id 
                      ? 'border-orange-500/80 scale-x-125' 
                      : 'border-black/20'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Micro notifications overlay inside tray */}
        <AnimatePresence>
          {notification && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="text-[9px] font-mono px-3 py-1 bg-black/40 text-green-300 border border-green-500/20 rounded shadow-md"
            >
              {notification}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="text-[8px] font-mono uppercase tracking-widest opacity-40">
          OSONE Classroom Lousa v4.0
        </div>
      </div>
    </div>
  );
};
