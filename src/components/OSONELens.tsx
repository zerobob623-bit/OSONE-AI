import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, Search, Globe, Sliders, X, Sparkles, Lock, 
  RefreshCw, Volume2, HelpCircle, Maximize2, CheckCircle, 
  Eye, CornerRightDown, ExternalLink, Tag, Info, List, Compass
} from 'lucide-react';
import { cn } from '../lib/utils';

interface LensResult {
  name: string;
  category: string;
  confidence: number;
  description: string;
  tags: string[];
  details: {
    marcaOuOrigem: string;
    caracteristicaPrincipal: string;
    curiosidadeOuUso: string;
  };
  suggestions: string[];
  citations?: { title: string; uri: string }[];
}

// Built-in high-quality sample images with beautiful items for instant testing
const SAMPLE_IMAGES = [
  {
    id: 'sample-watch',
    title: 'Relógio Suíço Clássico',
    description: 'Relógio analógico vintage premium',
    url: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&q=80&w=600',
    defaultBox: { x: 20, y: 15, width: 60, height: 60 }
  },
  {
    id: 'sample-plant',
    title: 'Costela-de-Adão raridade',
    description: 'Planta tropical decorativa Monstera',
    url: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&q=80&w=600',
    defaultBox: { x: 10, y: 5, width: 80, height: 85 }
  },
  {
    id: 'sample-cat',
    title: 'Siamês com Olhos Azuis',
    description: 'Filhote siamês de alta linhagem',
    url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&q=80&w=600',
    defaultBox: { x: 30, y: 25, width: 50, height: 50 }
  },
  {
    id: 'sample-burger',
    title: 'Hambúrguer Gourmet',
    description: 'Hambúrguer artesanal premium fusion',
    url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=600',
    defaultBox: { x: 5, y: 10, width: 90, height: 80 }
  },
  {
    id: 'sample-camera',
    title: 'Câmera Analógica Retro',
    description: 'Câmera clássica vintage de rolo 35mm',
    url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&q=80&w=600',
    defaultBox: { x: 15, y: 15, width: 70, height: 70 }
  }
];

export const OSONELens = ({ onClose, onAddNotification }: { 
  onClose: () => void;
  onAddNotification: (text: string, type?: any) => void;
}) => {
  const [activeImage, setActiveImage] = useState<string>(SAMPLE_IMAGES[0].url);
  const [cropBox, setCropBox] = useState({ x: 20, y: 15, width: 60, height: 60 });
  const [isInternetSearch, setIsInternetSearch] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [result, setResult] = useState<LensResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [dragMode, setDragMode] = useState<'none' | 'move' | 'resize'>('none');
  const [activeTab, setActiveTab] = useState<'info' | 'details' | 'web'>('info');

  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Client-side visual cropping helper
  const cropImage = (
    imageElement: HTMLImageElement,
    box: { x: number; y: number; width: number; height: number }
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Não foi possível carregar o canvas 2D"));
        return;
      }

      const naturalW = imageElement.naturalWidth;
      const naturalH = imageElement.naturalHeight;
      const cropX = (box.x / 100) * naturalW;
      const cropY = (box.y / 100) * naturalH;
      const cropW = (box.width / 100) * naturalW;
      const cropH = (box.height / 100) * naturalH;

      canvas.width = cropW;
      canvas.height = cropH;

      // Handle crossOrigin gracefully
      try {
        ctx.drawImage(
          imageElement,
          cropX, cropY, cropW, cropH,
          0, 0, cropW, cropH
        );
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch (err: any) {
        console.warn("Falha no crop local (geralmente CORS com imagens do servidor de preview). Enviando imagem completa.", err);
        // Fallback: draw full image if crop throws SecurityError due to stained canvas, or reject
        try {
          canvas.width = naturalW;
          canvas.height = naturalH;
          ctx.drawImage(imageElement, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } catch (innerErr) {
          reject(innerErr);
        }
      }
    });
  };

  // Click anywhere on image to center focus brackets (Click-to-Focus)
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;

    const size = cropBox.width; // keep size
    const halfSize = size / 2;
    let newX = clickX - halfSize;
    let newY = clickY - halfSize;

    // Clamp inside limits
    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;
    if (newX + size > 100) newX = 100 - size;
    if (newY + size > 100) newY = 100 - size;

    setCropBox({
      x: Math.round(newX),
      y: Math.round(newY),
      width: size,
      height: size
    });

    onAddNotification("Alvo da pesquisa aérea reajustado com foco de sintonia!", "info");
  };

  // Upload an image file from the disk
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onAddNotification("Arquivo inválido. Por favor envie apenas imagens.", "rose");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result && typeof event.target.result === 'string') {
        setActiveImage(event.target.result);
        setCropBox({ x: 10, y: 10, width: 80, height: 80 });
        setResult(null);
        setErrorMessage(null);
        onAddNotification("Sua imagem local foi importada com sucesso!", "success");
      }
    };
    reader.readAsDataURL(file);
  };

  // Speak response results utilizing high quality server /api/tts voice synthesis
  const readResultAloud = async () => {
    if (!result) return;
    if (isPlayingAudio) {
      if (audioBufferSourceRef.current) {
        try { cursorPlayStop(); } catch(e) {}
      }
      setIsPlayingAudio(false);
      return;
    }

    setIsPlayingAudio(true);
    try {
      const explainText = `Sintonizando objeto identificado. ${result.name}. Categoria: ${result.category}. Confiança estimada de ${result.confidence} por cento. Descrição: ${result.description}. Característica marcante: ${result.details.caracteristicaPrincipal}.`;
      
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: explainText,
          engine: 'premium',
          voice: 'Kore'
        })
      });

      if (!response.ok) {
        throw new Error("Erro de servidor ao gerar voz");
      }

      const audioBlob = await response.blob();
      const arrayBuffer = await audioBlob.arrayBuffer();

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;

      audioCtx.decodeAudioData(arrayBuffer, (buffer) => {
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        audioBufferSourceRef.current = source;

        source.onended = () => {
          setIsPlayingAudio(false);
        };

        source.start(0);
      }, (err) => {
        console.error("Erro decodeAudio", err);
        setIsPlayingAudio(false);
      });

    } catch (err: any) {
      console.error(err);
      onAddNotification("Não foi possível carregar o assistente de voz.", "rose");
      setIsPlayingAudio(false);
    }
  };

  const cursorPlayStop = () => {
    if (audioBufferSourceRef.current) {
      try { audioBufferSourceRef.current.stop(); } catch(e){}
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch(e){}
    }
  };

  // Perform Gemini Lens inquiry on the cropped region
  const executeSearch = async () => {
    if (!imageRef.current) return;
    setIsAnalyzing(true);
    setResult(null);
    setErrorMessage(null);
    cursorPlayStop();
    setIsPlayingAudio(false);

    try {
      // Crop first
      const croppedBase64 = await cropImage(imageRef.current, cropBox);

      const response = await fetch('/api/lens/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: croppedBase64,
          internetSearch: isInternetSearch
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({ error: "Erro de processamento indeterminado." }));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      const dataResult = await response.json();
      setResult(dataResult);
      setActiveTab('info');
      onAddNotification(`Lente OSONE detectou: "${dataResult.name}"!`, "success");

    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Houve uma instabilidade temporária na rede visual do Gemini.");
      onAddNotification("Falha no diagnóstico visual.", "rose");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Clean-up audios when unmounted
  useEffect(() => {
    return () => {
      cursorPlayStop();
    };
  }, []);

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 bg-transparent text-white font-sans overflow-hidden">
      {/* Tab Header bar */}
      <div className="flex items-center justify-between shrink-0 p-6 border-b border-white/[0.06] w-full select-none">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="p-3 rounded-full bg-white/[0.03] hover:bg-white/[0.07] transition-all text-her-muted border border-white/[0.05]"
          >
            <Maximize2 size={16} className="rotate-45" />
          </button>
          <div className="text-left">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[7px] tracking-[0.25em] font-mono text-cyan-400 uppercase font-bold mb-1">
              <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
              Sintonizador Avançado
            </div>
            <h2 className="text-lg font-serif italic text-white/95 leading-none">Lente G5 • Visual Lens</h2>
          </div>
        </div>

        {/* Search Mode Toggle */}
        <div className="flex bg-zinc-950/80 border border-white/[0.05] p-1 rounded-2xl">
          <button
            onClick={() => setIsInternetSearch(false)}
            className={cn(
              "px-4 py-2 rounded-xl text-[10px] font-mono tracking-wider uppercase transition-all flex items-center gap-2",
              !isInternetSearch 
                ? "bg-zinc-800 text-amber-400 border border-amber-500/10 font-bold" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Lock size={12} className={!isInternetSearch ? "text-amber-400" : ""} />
            Sem Internet (Offline)
          </button>
          <button
            onClick={() => setIsInternetSearch(true)}
            className={cn(
              "px-4 py-2 rounded-xl text-[10px] font-mono tracking-wider uppercase transition-all flex items-center gap-2",
              isInternetSearch 
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 font-bold" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Globe size={12} className={isInternetSearch ? "text-cyan-400" : ""} />
            Buscar na Web (Online)
          </button>
        </div>
      </div>

      {/* Grid container */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 w-full">
        {/* Left Column (8 cols): Visual Stage, drag options, samples */}
        <div className="lg:col-span-7 flex flex-col min-h-0 border-r border-white/5 p-6 space-y-6 overflow-y-auto custom-scrollbar">
          
          {/* Main Visual Stage Box */}
          <div className="relative aspect-video rounded-3xl bg-zinc-950 border border-white/[0.05] shadow-2xl overflow-hidden group flex items-center justify-center select-none">
            {/* Background pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none opacity-40" />

            <div 
              onClick={handleImageClick}
              className="relative max-w-full max-h-full cursor-crosshair overflow-hidden"
              style={{ display: 'inline-block' }}
            >
              <img 
                ref={imageRef}
                src={activeImage} 
                alt="Escaneamento de Foco" 
                className="max-h-[380px] object-contain block transition-all"
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
              />

              {/* Subdued overlay outside Crop Box */}
              <div className="absolute inset-0 bg-black/40 pointer-events-none" />

              {/* Interactive Target Frame Box (Styling inspired by authentic Google Lens brackets) */}
              <div 
                className="absolute border border-white/30 bg-transparent shadow-[0_0_50px_rgba(6,182,212,0.15)] transition-all pointer-events-none duration-150"
                style={{
                  left: `${cropBox.x}%`,
                  top: `${cropBox.y}%`,
                  width: `${cropBox.width}%`,
                  height: `${cropBox.height}%`,
                }}
              >
                {/* 4 Professional Retro Bracket corners */}
                <div className="absolute top-[-2px] left-[-2px] w-6 h-6 border-t-[4px] border-l-[4px] border-cyan-400 rounded-tl-lg shadow-[0_0_10px_rgba(34,211,238,0.4)]" />
                <div className="absolute top-[-2px] right-[-2px] w-6 h-6 border-t-[4px] border-r-[4px] border-cyan-400 rounded-tr-lg shadow-[0_0_10px_rgba(34,211,238,0.4)]" />
                <div className="absolute bottom-[-2px] left-[-2px] w-6 h-6 border-b-[4px] border-l-[4px] border-cyan-400 rounded-bl-lg shadow-[0_0_10px_rgba(34,211,238,0.4)]" />
                <div className="absolute bottom-[-2px] right-[-2px] w-6 h-6 border-b-[4px] border-r-[4px] border-cyan-400 rounded-br-lg shadow-[0_0_10px_rgba(34,211,238,0.4)]" />
                
                {/* Target focus reticle with pulsing center dot */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center opacity-30">
                  <div className="w-10 h-10 border border-cyan-400/30 rounded-full flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                  </div>
                </div>

                {/* Vertical Flying Scanning Line (Animate when loading) */}
                {isAnalyzing && (
                  <motion.div 
                    animate={{ y: ['-5%', '105%'] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_rgba(6,182,212,0.8)] pointer-events-none"
                  />
                )}
              </div>
            </div>

            {/* Click-to-focus guidance note overlay */}
            <div className="absolute bottom-4 left-4 right-4 text-center pointer-events-none group-hover:opacity-100 opacity-60 transition-opacity">
              <span className="inline-flex bg-zinc-950/85 backdrop-blur-md px-3 py-1 rounded-full text-[9px] font-mono text-zinc-400 border border-white/[0.05] tracking-wider uppercase">
                🎯 Dica: Toque/Clique em qualquer lugar da imagem para focar
              </span>
            </div>
          </div>

          {/* Precision Controls Bracket Sliders */}
          <div className="bg-white/[0.01] border border-white/[0.04] p-5 rounded-3xl space-y-4">
            <div className="flex justify-between items-center text-xs font-mono tracking-wider text-zinc-400">
              <div className="flex items-center gap-2">
                <Sliders size={14} className="text-cyan-400" />
                <span>AJUSTAR RETÍCULO DE VARREDURA</span>
              </div>
              <span className="text-[10px] text-cyan-400/70">Coordenadas: {cropBox.x}x, {cropBox.y}y • {cropBox.width}%</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Slider X */}
              <div className="space-y-1 text-left">
                <div className="flex justify-between text-[10px] text-zinc-500 uppercase tracking-widest">
                  <span>Posição X (%)</span>
                  <span className="text-zinc-300">{cropBox.x}</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max={100 - cropBox.width}
                  value={cropBox.x}
                  onChange={(e) => setCropBox(prev => ({ ...prev, x: parseInt(e.target.value) }))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-ew-resize accent-cyan-400"
                />
              </div>

              {/* Slider Y */}
              <div className="space-y-1 text-left">
                <div className="flex justify-between text-[10px] text-zinc-500 uppercase tracking-widest">
                  <span>Posição Y (%)</span>
                  <span className="text-zinc-300">{cropBox.y}</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max={100 - cropBox.height}
                  value={cropBox.y}
                  onChange={(e) => setCropBox(prev => ({ ...prev, y: parseInt(e.target.value) }))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-ns-resize accent-cyan-400"
                />
              </div>

              {/* Slider Box Size */}
              <div className="space-y-1 text-left">
                <div className="flex justify-between text-[10px] text-zinc-500 uppercase tracking-widest">
                  <span>Tamanho do Alvo</span>
                  <span className="text-zinc-300">{cropBox.width}%</span>
                </div>
                <input 
                  type="range" 
                  min="15" 
                  max="90"
                  value={cropBox.width}
                  onChange={(e) => {
                    const newSize = parseInt(e.target.value);
                    setCropBox(prev => {
                      let nextX = prev.x;
                      let nextY = prev.y;
                      if (nextX + newSize > 100) nextX = 100 - newSize;
                      if (nextY + newSize > 100) nextY = 100 - newSize;
                      return { x: nextX, y: nextY, width: newSize, height: newSize };
                    });
                  }}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-ew-resize accent-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* Quick Upload or Sample Selection */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 w-full">
            {/* Box Upload */}
            <div className="md:col-span-4 flex flex-col justify-center">
              <input 
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-[100px] border border-dashed border-white/10 hover:border-cyan-500/40 bg-white/[0.01] hover:bg-cyan-500/[0.02] active:scale-[0.98] rounded-2xl flex flex-col items-center justify-center gap-2 transition-all p-4 text-center cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                  <Upload size={14} />
                </div>
                <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-zinc-300">Carregar Imagem</span>
              </button>
            </div>

            {/* Quick samples selection */}
            <div className="md:col-span-8 space-y-2">
              <div className="text-[9px] uppercase tracking-widest text-zinc-500 text-left font-mono">Imagens de Exemplo (Instante)</div>
              <div className="flex gap-2 overflow-x-auto pb-1 max-w-full custom-scrollbar">
                {SAMPLE_IMAGES.map((sample) => (
                  <button
                    key={sample.id}
                    onClick={() => {
                      setActiveImage(sample.url);
                      setCropBox(sample.defaultBox);
                      setResult(null);
                      setErrorMessage(null);
                      onAddNotification(`Carregado: ${sample.title}`, "info");
                    }}
                    className={cn(
                      "shrink-0 group relative w-[76px] h-[76px] border rounded-2xl overflow-hidden transition-all duration-300",
                      activeImage === sample.url 
                        ? "border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400/50" 
                        : "border-white/10 opacity-70 hover:opacity-100 hover:border-white/30"
                    )}
                    title={sample.title}
                  >
                    <img 
                      src={sample.url} 
                      alt={sample.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/70 p-1 text-[7px] text-center truncate font-medium border-t border-white/5 uppercase">
                      {sample.title.split(' ')[0]}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Trigger Search button */}
          <div className="pt-2">
            <button
              onClick={executeSearch}
              disabled={isAnalyzing}
              className={cn(
                "w-full py-4 rounded-2xl font-mono text-xs uppercase tracking-[0.2em] transition-all relative overflow-hidden font-bold flex items-center justify-center gap-2",
                isAnalyzing 
                  ? "bg-zinc-800 text-cyan-400 border border-cyan-500/20 cursor-wait" 
                  : "bg-cyan-500 text-black hover:bg-cyan-400 active:scale-[0.99] shadow-lg shadow-cyan-500/20"
              )}
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw size={14} className="animate-spin text-cyan-400" />
                  Sintonizando Canais Mentais e Analisando...
                </>
              ) : (
                <>
                  <Search size={14} />
                  Executar Varredura da Lente OSONE
                </>
              )}
            </button>
          </div>

        </div>

        {/* Right Column (5 cols): Intelligence Output Results */}
        <div className="lg:col-span-5 flex flex-col min-h-0 bg-zinc-950/20 p-6 overflow-y-auto custom-scrollbar">
          
          <AnimatePresence mode="wait">
            {/* 1. Analyzes in action */}
            {isAnalyzing && (
              <motion.div 
                key="loading-stage"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="flex-1 flex flex-col items-center justify-center py-16 text-center space-y-6"
              >
                <div className="relative">
                  {/* Triple rotating Sci-fi scanners */}
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-cyan-400/20 animate-[spin_10s_linear_infinite]" />
                  <div className="absolute inset-1.5 rounded-full border border-dashed border-purple-500/30 animate-[spin_6s_linear_infinite_reverse]" />
                  <div className="absolute inset-4 rounded-full bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center">
                    <Sparkles size={24} className="text-cyan-400 animate-pulse" />
                  </div>
                </div>

                <div className="space-y-2 max-w-sm">
                  <h3 className="text-sm font-mono tracking-widest text-cyan-400 font-bold uppercase animate-pulse">Iniciando Varredura</h3>
                  <p className="text-[11px] text-zinc-400 leading-relaxed font-light">
                    Cortando a coordenada visual focada, enviando matrizes de pixel ao processador Gemini 3.5 e sintonizando {isInternetSearch ? "motores de busca Google em tempo real" : "redes neurais locais"}.
                  </p>
                </div>
              </motion.div>
            )}

            {/* 2. Error case placeholder */}
            {errorMessage && !isAnalyzing && (
              <motion.div 
                key="error-stage"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 flex flex-col items-center justify-center py-12 text-center p-6 bg-rose-500/[0.02] border border-rose-500/10 rounded-3xl"
              >
                <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-400 mb-4">
                  <X size={20} />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-rose-400 font-mono mb-2">Falha no Processamento Visual</h3>
                <p className="text-xs text-zinc-400 leading-relaxed font-light max-w-xs">{errorMessage}</p>
                <button 
                  onClick={executeSearch}
                  className="mt-6 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 transition-colors text-xs font-mono uppercase tracking-wider rounded-xl border border-white/5"
                >
                  Tentar Novamente
                </button>
              </motion.div>
            )}

            {/* 3. Empty Initial State Guidance */}
            {!result && !isAnalyzing && !errorMessage && (
              <motion.div 
                key="empty-stage"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col py-10 text-left space-y-6"
              >
                <div className="bg-gradient-to-br from-cyan-500/[0.04] to-transparent border border-cyan-500/10 p-6 rounded-3xl space-y-4">
                  <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-300 border border-cyan-500/20">
                    <Info size={16} />
                  </div>
                  <h3 className="text-base font-serif italic text-white font-light">Como funciona a Lente OSONE sintonizadora?</h3>
                  
                  <div className="space-y-4 text-xs text-zinc-400 leading-relaxed font-light">
                    <div className="flex gap-3">
                      <div className="mt-0.5 w-4 h-4 shrink-0 rounded-full bg-zinc-900 border border-white/10 text-[9px] flex items-center justify-center font-mono font-bold text-cyan-400">1</div>
                      <p>
                        <strong>Posicione o retículo:</strong> Ajuste a área de busca arrastando ou clicando em qualquer item específico da imagem que você quer inspecionar.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <div className="mt-0.5 w-4 h-4 shrink-0 rounded-full bg-zinc-900 border border-white/10 text-[9px] flex items-center justify-center font-mono font-bold text-cyan-400">2</div>
                      <p>
                        <strong>Selecione o canal:</strong> Escolha usar <strong>Com Internet</strong> para buscar correspondências na web ao vivo ou <strong>Sem Internet</strong> para receber uma análise profunda e exclusiva baseada no conhecimento interno do Gemini.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <div className="mt-0.5 w-4 h-4 shrink-0 rounded-full bg-zinc-900 border border-white/10 text-[9px] flex items-center justify-center font-mono font-bold text-cyan-400">3</div>
                      <p>
                        <strong>Varredura total:</strong> Clique no botão azul de varredura para recortar os pixels e ver a inteligência extrair marcas, espécies, descrições, tags e sites úteis!
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white/[0.01] border border-white/[0.03] p-5 rounded-3xl flex items-center gap-4 text-left">
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20 shrink-0">
                    <Volume2 size={14} />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-mono tracking-wider text-zinc-300 uppercase font-bold">Assistente Falante Integrada</h4>
                    <p className="text-[10px] text-zinc-400 font-light mt-0.5">Após a colheita dos resultados, a Lente pode pronunciar por voz premium todas as conclusões visuais para sua classe neural.</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 4. Complete successful result display */}
            {result && !isAnalyzing && !errorMessage && (
              <motion.div 
                key="result-stage"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 flex flex-col text-left space-y-6"
              >
                {/* Result header Card */}
                <div className="bg-gradient-to-b from-cyan-500/[0.05] to-zinc-950 border border-cyan-500/10 p-6 rounded-3xl relative overflow-hidden shadow-xl">
                  {/* Corner accents */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-400/10 rounded-full blur-2xl pointer-events-none" />

                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 text-[9px] font-bold text-cyan-400 rounded-full uppercase tracking-widest">
                      {result.category}
                    </span>
                    
                    {/* Read Aloud Trigger */}
                    <button 
                      onClick={readResultAloud}
                      className={cn(
                        "p-2 rounded-full border transition-all flex items-center justify-center cursor-pointer",
                        isPlayingAudio 
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse" 
                          : "bg-white/5 hover:bg-white/10 text-zinc-300 border-white/10"
                      )}
                      title={isPlayingAudio ? "Interromper voz" : "Ouvir conclusão por voz"}
                    >
                      <Volume2 size={14} className={isPlayingAudio ? "scale-105" : ""} />
                    </button>
                  </div>

                  <h3 className="text-2xl font-serif text-white tracking-tight leading-tight mt-4 font-light italic">
                    {result.name}
                  </h3>

                  {/* Confidence bar */}
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className="h-full bg-cyan-400 rounded-full"
                        style={{ width: `${result.confidence}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-cyan-400 font-bold">{result.confidence}% de certeza</span>
                  </div>
                </div>

                {/* Tab layout links navigation */}
                <div className="flex border-b border-white/5 text-xs font-mono tracking-wider text-zinc-500">
                  <button
                    onClick={() => setActiveTab('info')}
                    className={cn(
                      "flex-1 pb-3 text-center transition-all border-b-2 uppercase",
                      activeTab === 'info' ? "border-cyan-400 text-white font-bold" : "border-transparent hover:text-zinc-300"
                    )}
                  >
                    Identificação
                  </button>
                  <button
                    onClick={() => setActiveTab('details')}
                    className={cn(
                      "flex-1 pb-3 text-center transition-all border-b-2 uppercase",
                      activeTab === 'details' ? "border-cyan-400 text-white font-bold" : "border-transparent hover:text-zinc-300"
                    )}
                  >
                    Especificações
                  </button>
                  {isInternetSearch && (
                    <button
                      onClick={() => setActiveTab('web')}
                      className={cn(
                        "flex-1 pb-3 text-center transition-all border-b-2 uppercase relative",
                        activeTab === 'web' ? "border-cyan-400 text-white font-bold" : "border-transparent hover:text-zinc-300"
                      )}
                    >
                      Pesquisa Web
                      {result.citations && result.citations.length > 0 && (
                        <span className="absolute top-0 right-1 px-1 bg-cyan-400 text-black text-[8px] rounded-full scale-75 font-sans font-extrabold font-mono">
                          {result.citations.length}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                {/* Tab contents panel rendering */}
                <div className="flex-1">
                  {/* Tab 1: Info (Description & Tags) */}
                  {activeTab === 'info' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase block">Descrição Síntese</span>
                        <p className="text-xs text-zinc-300 leading-relaxed font-light whitespace-pre-wrap selection:bg-cyan-500/20">
                          {result.description}
                        </p>
                      </div>

                      {/* Display visual Tags */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase block">Etiquetas Visuais Encontradas</span>
                        <div className="flex flex-wrap gap-1.5">
                          {result.tags.map((tag, idx) => (
                            <span 
                              key={idx}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/[0.03] border border-white/[0.06] text-[10px] text-zinc-300 font-mono rounded-lg hover:border-cyan-400/30 transition-colors uppercase cursor-default"
                            >
                              <Tag size={9} className="text-cyan-400" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Tab 2: Specs (Bento grid of attributes) */}
                  {activeTab === 'details' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-1 gap-4"
                    >
                      {/* Brand / Origin card */}
                      <div className="p-4 bg-white/[0.01] border border-white/[0.04] rounded-2xl flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-cyan-400/10 flex items-center justify-center text-cyan-400 shrink-0 border border-cyan-400/15">
                          <Compass size={13} />
                        </div>
                        <div className="text-left">
                          <h4 className="text-[10px] font-mono uppercase tracking-wider text-cyan-400/80">Origem / Fabricante</h4>
                          <p className="text-xs text-zinc-300 mt-1 font-light leading-relaxed">{result.details.marcaOuOrigem}</p>
                        </div>
                      </div>

                      {/* Main Feature */}
                      <div className="p-4 bg-white/[0.01] border border-white/[0.04] rounded-2xl flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-cyan-400/10 flex items-center justify-center text-cyan-400 shrink-0 border border-cyan-400/15">
                          <Eye size={13} />
                        </div>
                        <div className="text-left">
                          <h4 className="text-[10px] font-mono uppercase tracking-wider text-cyan-400/80">Característica Física do Foco</h4>
                          <p className="text-xs text-zinc-300 mt-1 font-light leading-relaxed">{result.details.caracteristicaPrincipal}</p>
                        </div>
                      </div>

                      {/* Use context / tip */}
                      <div className="p-4 bg-white/[0.01] border border-white/[0.04] rounded-2xl flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-cyan-400/10 flex items-center justify-center text-cyan-400 shrink-0 border border-cyan-400/15">
                          <CheckCircle size={13} />
                        </div>
                        <div className="text-left">
                          <h4 className="text-[10px] font-mono uppercase tracking-wider text-cyan-400/80">Conselho OSONE / Utilidade</h4>
                          <p className="text-xs text-zinc-300 mt-1 font-light leading-relaxed">{result.details.curiosidadeOuUso}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Tab 3: Web results (Citations list Grounding) */}
                  {activeTab === 'web' && isInternetSearch && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="text-left">
                        <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase block mb-3">Correspondências Visuais na Internet</span>
                        
                        {result.citations && result.citations.length > 0 ? (
                          <div className="space-y-3">
                            {result.citations.map((cite, idx) => (
                              <a
                                key={idx}
                                href={cite.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block p-3.5 bg-cyan-500/[0.02] hover:bg-cyan-500/[0.05] border border-cyan-500/10 hover:border-cyan-500/30 rounded-2xl transition-all flex items-center justify-between group active:scale-[0.99]"
                              >
                                <div className="flex-1 min-w-0 pr-3">
                                  <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-cyan-300 transition-colors truncate">
                                    {cite.title}
                                  </h4>
                                  <p className="text-[9px] text-zinc-500 font-mono truncate mt-0.5">{cite.uri}</p>
                                </div>
                                <ExternalLink size={13} className="text-zinc-500 group-hover:text-cyan-400 transition-colors shrink-0" />
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="p-6 text-center border border-dashed border-white/5 rounded-2xl text-[11px] text-zinc-400 bg-white/[0.01]">
                            <p>Gemini identificou plenamente o item, mas nenhuma referência exata externa foi citada na Internet desta vez.</p>
                            <p className="text-[10px] text-zinc-500 mt-1">Geralmente, correspondências diretas aparecem para itens comerciais, pontos turísticos ou marcas famosas.</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Suggestions / follow up actions */}
                <div className="bg-white/[0.01] border border-white/[0.03] p-4 rounded-2xl">
                  <span className="text-[8px] font-mono text-zinc-500 tracking-wider uppercase block mb-2 font-bold flex items-center gap-1">
                    <CornerRightDown size={11} className="text-cyan-400" />
                    Pesquisas Sugeridas pelos Canais
                  </span>
                  <ul className="space-y-2 text-[10px] text-zinc-400 font-light list-inside list-disc">
                    {result.suggestions.map((sug, idx) => (
                      <li key={idx} className="hover:text-cyan-300 transition-colors cursor-default">
                        {sug}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
};
