import React, { useState, useEffect } from 'react';
import { 
  Image as ImageIcon, Video, Sparkles, Download, Trash2, AlertTriangle, 
  RefreshCw, Check, Info, Upload, Film, Play, Eye, X, ShieldAlert, DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ApiKeys } from '../types';
import { getVideoProvider, VideoGenerationParams, VideoGenerationResult } from '../services/video';

interface MediaItem {
  id: string;
  type: 'image' | 'video';
  filename: string;
  fileUrl: string;
  prompt: string;
  createdAt: number;
  dateStr: string;
  providerName: string;
  mimeType?: string;
  durationSeconds?: number;
  estimatedCostUsd?: number;
  mode?: string;
  sizeBytes?: number;
}

interface AudiovisualSectionProps {
  apiKeys: ApiKeys;
  addNotification: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function AudiovisualSection({ apiKeys, addNotification }: AudiovisualSectionProps) {
  // Sub-tab: 'image' | 'video'
  const [subTab, setSubTab] = useState<'image' | 'video'>('image');

  // Images state
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageAspectRatio, setImageAspectRatio] = useState<'1:1' | '16:9' | '9:16' | '4:3'>('1:1');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Videos state
  const [videoMode, setVideoMode] = useState<'text-to-video' | 'image-to-video'>('text-to-video');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [motionPrompt, setMotionPrompt] = useState('');
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<number>(5);
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);

  // Cost warning confirmation modal
  const [showCostModal, setShowCostModal] = useState(false);

  // Gallery & Usage state
  const [items, setItems] = useState<MediaItem[]>([]);
  const [todayCount, setTodayCount] = useState<number>(0);
  const [isLoadingGallery, setIsLoadingGallery] = useState(true);
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null);

  // Load gallery history from backend
  const fetchGallery = async () => {
    try {
      const res = await fetch('/api/audiovisual/gallery');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setItems(data.items || []);
          setTodayCount(data.todayCount || 0);
        }
      }
    } catch (e) {
      console.error("Erro ao carregar galeria audiovisual:", e);
    } finally {
      setIsLoadingGallery(false);
    }
  };

  useEffect(() => {
    fetchGallery();
  }, []);

  // Handle image generation
  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) {
      addNotification('Por favor, digite uma descrição (prompt) para gerar a imagem.', 'error');
      return;
    }

    setIsGeneratingImage(true);
    try {
      const res = await fetch('/api/audiovisual/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imagePrompt.trim(),
          aspectRatio: imageAspectRatio,
          clientApiKey: apiKeys.gemini
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao gerar imagem.');
      }

      addNotification('Imagem gerada e salva localmente em generated-content/images/ com sucesso! 🎨', 'success');
      setImagePrompt('');
      if (data.item) {
        setItems(prev => [data.item, ...prev]);
      }
      if (typeof data.todayCount === 'number') {
        setTodayCount(data.todayCount);
      }
    } catch (err: any) {
      addNotification(err.message || 'Erro ao gerar imagem.', 'error');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Trigger video confirmation modal
  const handleRequestVideoModal = () => {
    if (!videoPrompt.trim()) {
      addNotification('Por favor, digite uma descrição para o vídeo.', 'error');
      return;
    }
    if (videoMode === 'image-to-video' && !uploadedImageBase64) {
      addNotification('Por favor, faça o upload de uma imagem de referência.', 'error');
      return;
    }
    // Open explicit manual confirmation modal (NO automatic generation)
    setShowCostModal(true);
  };

  // Confirmed video generation execution
  const handleConfirmGenerateVideo = async () => {
    setShowCostModal(false);
    setIsGeneratingVideo(true);

    try {
      const provider = getVideoProvider('veo-lite');
      const params: VideoGenerationParams = {
        mode: videoMode,
        prompt: videoPrompt.trim(),
        motionPrompt: motionPrompt.trim() || undefined,
        inputImageUrl: uploadedImageBase64 || undefined,
        durationSeconds,
        aspectRatio: videoAspectRatio
      };

      // Call pluggable video provider with confirmed = true
      const result = await provider.generateVideo(params, apiKeys.gemini, true);

      addNotification(`Vídeo gerado via ${result.providerName} e salvo em generated-content/videos/! 🎬`, 'success');
      setVideoPrompt('');
      setMotionPrompt('');
      setUploadedImageBase64(null);
      setUploadedFileName('');

      // Refresh gallery
      await fetchGallery();
    } catch (err: any) {
      addNotification(err.message || 'Erro ao gerar vídeo.', 'error');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  // Image Upload for image-to-video
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addNotification('Por favor selecione um arquivo de imagem válido.', 'error');
      return;
    }

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setUploadedImageBase64(base64);
      addNotification(`Imagem "${file.name}" carregada para imagem-para-vídeo!`, 'info');
    };
    reader.readAsDataURL(file);
  };

  // Delete item from gallery & disk
  const handleDeleteItem = async (item: MediaItem) => {
    if (!confirm(`Tem certeza que deseja apagar "${item.filename}" permanentemente do disco?`)) return;

    try {
      const res = await fetch('/api/audiovisual/file', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, filename: item.filename, type: item.type })
      });

      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id));
        addNotification(`Arquivo "${item.filename}" removido com sucesso do disco!`, 'success');
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao excluir.');
      }
    } catch (err: any) {
      addNotification(err.message || 'Erro ao excluir arquivo.', 'error');
    }
  };

  // Filtered lists
  const imageItems = items.filter(i => i.type === 'image');
  const videoItems = items.filter(i => i.type === 'video');

  const estimatedCost = (durationSeconds * 0.03).toFixed(2);

  return (
    <div className="w-full flex flex-col gap-6 text-white">
      {/* Header & Sub-tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#181716] border border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-orange-500/30 text-orange-400">
              <Film size={20} />
            </span>
            <h2 className="text-lg font-bold font-serif italic text-amber-100">Estúdio de Conteúdo Audiovisual</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Geração de imagens gratuitas e vídeos cinematográficos via IA com salvamento local.
          </p>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/[0.05]">
          <button
            onClick={() => setSubTab('image')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer",
              subTab === 'image'
                ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/20"
                : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
            )}
          >
            <ImageIcon size={15} />
            <span>Gerar Imagem</span>
            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-mono">
              Grátis
            </span>
          </button>

          <button
            onClick={() => setSubTab('video')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer",
              subTab === 'video'
                ? "bg-gradient-to-r from-amber-500 to-yellow-600 text-white shadow-lg shadow-amber-500/20"
                : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
            )}
          >
            <Video size={15} />
            <span>Gerar Vídeo</span>
            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 font-mono">
              Veo AI
            </span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: GERAR IMAGEM */}
      {subTab === 'image' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Form */}
          <div className="lg:col-span-1 flex flex-col gap-4 p-5 rounded-3xl bg-[#161514] border border-white/[0.05]">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
              <span className="text-xs font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} />
                Criação de Imagens (Ativa)
              </span>
              <span className="text-[10px] font-mono bg-white/[0.03] text-zinc-400 px-2.5 py-1 rounded-full border border-white/[0.05]" title="Contador zerado à meia-noite">
                Gerações hoje: <strong className="text-amber-400">{todayCount}</strong>
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-300 font-medium">Prompt Descritivo da Imagem</label>
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Ex: Foto fotorrealista de um gato astronauta navegando em uma nébula neon cibernética, resolução 4k, iluminação volumétrica..."
                className="w-full h-32 bg-[#1e1d1b] border border-white/[0.06] rounded-2xl p-3.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 resize-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-300 font-medium">Proporção da Imagem (Aspect Ratio)</label>
              <div className="grid grid-cols-4 gap-2">
                {(['1:1', '16:9', '9:16', '4:3'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setImageAspectRatio(ratio)}
                    className={cn(
                      "py-2 rounded-xl text-xs font-mono border transition-all cursor-pointer",
                      imageAspectRatio === ratio
                        ? "bg-orange-500/20 border-orange-500/50 text-orange-300 font-bold"
                        : "bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:text-white"
                    )}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerateImage}
              disabled={isGeneratingImage}
              className={cn(
                "w-full py-3.5 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg mt-2",
                isGeneratingImage
                  ? "bg-stone-800 border-white/5 text-zinc-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-orange-500 to-amber-600 hover:brightness-110 text-white shadow-orange-500/20"
              )}
            >
              {isGeneratingImage ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Sintetizando Imagem...</span>
                </>
              ) : (
                <>
                  <ImageIcon size={16} />
                  <span>Gerar Imagem Grátis</span>
                </>
              )}
            </button>

            <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
              * Salvo em <code className="text-amber-400/80">generated-content/images/</code> com nome baseado em timestamp.
            </p>
          </div>

          {/* Image Gallery */}
          <div className="lg:col-span-2 flex flex-col gap-4 p-5 rounded-3xl bg-[#161514] border border-white/[0.05]">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon size={14} className="text-orange-400" />
                Galeria de Imagens ({imageItems.length})
              </span>
              <button
                onClick={fetchGallery}
                className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                <RefreshCw size={11} /> Atualizar
              </button>
            </div>

            {imageItems.length === 0 ? (
              <div className="flex-1 min-h-[250px] flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/[0.05] rounded-2xl">
                <ImageIcon size={32} className="text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-400">Nenhuma imagem gerada ainda nesta sessão.</p>
                <p className="text-[10px] text-zinc-600 mt-1">Gere sua primeira arte gratuita acima!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                {imageItems.map((item) => (
                  <div
                    key={item.id}
                    className="group relative rounded-2xl overflow-hidden bg-black/40 border border-white/[0.06] hover:border-orange-500/40 transition-all flex flex-col"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-zinc-900">
                      <img
                        src={item.fileUrl}
                        alt={item.prompt}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
                        <button
                          onClick={() => setPreviewMedia(item)}
                          className="p-2 rounded-xl bg-white/20 backdrop-blur text-white hover:bg-white/40 transition-colors"
                          title="Visualizar em tamanho grande"
                        >
                          <Eye size={14} />
                        </button>
                        <div className="flex gap-1">
                          <a
                            href={item.fileUrl}
                            download={item.filename}
                            className="p-2 rounded-xl bg-orange-500/80 text-white hover:bg-orange-500 transition-colors flex items-center gap-1 text-[10px]"
                            title="Baixar imagem"
                          >
                            <Download size={14} />
                          </a>
                          <button
                            onClick={() => handleDeleteItem(item)}
                            className="p-2 rounded-xl bg-rose-500/80 text-white hover:bg-rose-500 transition-colors"
                            title="Excluir do disco"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="p-2.5 flex flex-col gap-1 bg-[#121110]">
                      <p className="text-[11px] text-zinc-300 line-clamp-2 leading-tight">{item.prompt}</p>
                      <div className="flex items-center justify-between text-[9px] text-zinc-500 font-mono mt-1 pt-1 border-t border-white/[0.03]">
                        <span>{item.providerName}</span>
                        <span>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: GERAR VÍDEO (PAGO / GOOGLE VEO) */}
      {subTab === 'video' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Controls & Mode selection */}
          <div className="lg:col-span-1 flex flex-col gap-4 p-5 rounded-3xl bg-[#161514] border border-white/[0.05]">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Video size={14} />
                Geração de Vídeo (Com Trava)
              </span>
              <span className="text-[9px] bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded font-mono">
                PAGO (~$0,03/s)
              </span>
            </div>

            {/* Mode selection: Text to Video vs Image to Video */}
            <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-2xl border border-white/[0.05]">
              <button
                onClick={() => setVideoMode('text-to-video')}
                className={cn(
                  "py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5",
                  videoMode === 'text-to-video'
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <Film size={13} />
                <span>Texto p/ Vídeo</span>
              </button>

              <button
                onClick={() => setVideoMode('image-to-video')}
                className={cn(
                  "py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5",
                  videoMode === 'image-to-video'
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <Upload size={13} />
                <span>Imagem p/ Vídeo</span>
              </button>
            </div>

            {/* Image Upload if Image-to-Video mode */}
            {videoMode === 'image-to-video' && (
              <div className="flex flex-col gap-2 p-3 rounded-2xl bg-white/[0.01] border border-white/[0.05]">
                <label className="text-xs text-zinc-300 font-medium">Upload da Imagem de Referência</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileUpload}
                  className="hidden"
                  id="video-image-upload"
                />
                <label
                  htmlFor="video-image-upload"
                  className="w-full py-3 px-4 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 text-xs font-mono flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Upload size={14} />
                  <span>{uploadedFileName || 'Escolher imagem de fundo...'}</span>
                </label>
                {uploadedImageBase64 && (
                  <div className="relative w-full h-24 rounded-xl overflow-hidden border border-white/[0.1] mt-1">
                    <img src={uploadedImageBase64} alt="Ref" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            )}

            {/* Prompt description */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-300 font-medium">
                {videoMode === 'text-to-video' ? 'Prompt de Descrição do Vídeo' : 'Instrução de Movimento e Ação'}
              </label>
              <textarea
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                placeholder={
                  videoMode === 'text-to-video'
                    ? "Ex: Câmera lenta de gotas de chuva caindo em um lago espelhado ao pôr do sol, cinematográfico 4k..."
                    : "Ex: Câmera faz um zoom lento suave pra frente enquanto o fogo no fundo ganha vida e fumaça sobe..."
                }
                className="w-full h-24 bg-[#1e1d1b] border border-white/[0.06] rounded-2xl p-3.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
              />
            </div>

            {/* Duration Selector */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium">Duração em Segundos</span>
                <span className="text-amber-400 font-mono font-bold">~US$ {estimatedCost}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[3, 5, 10].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setDurationSeconds(sec)}
                    className={cn(
                      "py-2 rounded-xl text-xs font-mono border transition-all cursor-pointer flex flex-col items-center",
                      durationSeconds === sec
                        ? "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold"
                        : "bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:text-white"
                    )}
                  >
                    <span>{sec}s</span>
                    <span className="text-[9px] text-zinc-500 font-normal">${(sec * 0.03).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Provider Info Badge */}
            <div className="p-3 rounded-2xl bg-amber-950/20 border border-amber-500/20 text-[11px] text-amber-200/90 flex items-start gap-2 leading-relaxed">
              <ShieldAlert size={16} className="shrink-0 text-amber-400 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-300">Trava de Segurança Ativa</p>
                <p className="text-[10px] text-zinc-400">
                  O vídeo usa o modelo Veo mais econômico (veo-3.1-lite). O botão abaixo apenas abre a confirmação de custo.
                </p>
              </div>
            </div>

            {/* Trigger Button (ONLY opens confirmation modal) */}
            <button
              onClick={handleRequestVideoModal}
              disabled={isGeneratingVideo}
              className={cn(
                "w-full py-3.5 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg mt-1",
                isGeneratingVideo
                  ? "bg-stone-800 border-white/5 text-zinc-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-amber-500 to-yellow-600 hover:brightness-110 text-white shadow-amber-500/20"
              )}
            >
              {isGeneratingVideo ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Gerando Vídeo no Veo...</span>
                </>
              ) : (
                <>
                  <DollarSign size={16} />
                  <span>Solicitar Geração de Vídeo (${estimatedCost})</span>
                </>
              )}
            </button>
          </div>

          {/* Video Gallery */}
          <div className="lg:col-span-2 flex flex-col gap-4 p-5 rounded-3xl bg-[#161514] border border-white/[0.05]">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Video size={14} className="text-amber-400" />
                Histórico de Vídeos ({videoItems.length})
              </span>
              <button
                onClick={fetchGallery}
                className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                <RefreshCw size={11} /> Atualizar
              </button>
            </div>

            {videoItems.length === 0 ? (
              <div className="flex-1 min-h-[250px] flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/[0.05] rounded-2xl">
                <Film size={32} className="text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-400">Nenhum vídeo gerado ainda nesta sessão.</p>
                <p className="text-[10px] text-zinc-600 mt-1">Gere seus vídeos via Veo AI com salvamento direto em disco!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                {videoItems.map((item) => (
                  <div
                    key={item.id}
                    className="group relative rounded-2xl overflow-hidden bg-black/40 border border-white/[0.06] hover:border-amber-500/40 transition-all flex flex-col"
                  >
                    <div className="relative aspect-video w-full overflow-hidden bg-black flex items-center justify-center">
                      <video
                        src={item.fileUrl}
                        controls
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-3 flex flex-col gap-1.5 bg-[#121110]">
                      <p className="text-[11px] text-zinc-300 line-clamp-2 leading-snug">{item.prompt}</p>
                      <div className="flex items-center justify-between text-[9px] text-zinc-500 font-mono mt-1 pt-1.5 border-t border-white/[0.03]">
                        <span className="text-amber-400">{item.durationSeconds}s • ${item.estimatedCostUsd?.toFixed(2)}</span>
                        <span>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex justify-end gap-1.5 mt-1">
                        <a
                          href={item.fileUrl}
                          download={item.filename}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[10px] font-mono flex items-center gap-1 transition-colors"
                        >
                          <Download size={12} /> Baixar MP4
                        </a>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="p-1 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors"
                          title="Excluir do disco"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* COST WARNING EXPLICIT CONFIRMATION MODAL (NEVER GENERATE WITHOUT CLICK) */}
      <AnimatePresence>
        {showCostModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#181716] border border-amber-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 text-white"
            >
              <div className="flex items-center gap-3 text-amber-400">
                <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold">Confirmação de Geração Paga</h3>
                  <p className="text-[11px] text-amber-300/80 font-mono">Modelo: Google Veo (veo-3.1-lite)</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/20 text-xs text-zinc-300 leading-relaxed space-y-2">
                <p>
                  Esta geração é paga (aproximadamente <strong>US$ 0,03/segundo</strong>).
                </p>
                <div className="flex items-center justify-between bg-black/40 p-2.5 rounded-xl font-mono text-xs border border-white/[0.05]">
                  <span>Duração selecionada:</span>
                  <span className="text-amber-300 font-bold">{durationSeconds} segundos</span>
                </div>
                <div className="flex items-center justify-between bg-black/40 p-2.5 rounded-xl font-mono text-xs border border-white/[0.05]">
                  <span>Custo total estimado:</span>
                  <span className="text-emerald-400 font-bold">US$ {estimatedCost}</span>
                </div>
                <p className="text-[11px] text-zinc-400 pt-1">
                  Nenhuma cobrança automática é feita sem o seu clique explícito abaixo.
                </p>
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setShowCostModal(false)}
                  className="flex-1 py-3 rounded-xl border border-white/[0.1] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.08] text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmGenerateVideo}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:brightness-110 text-white text-xs font-bold uppercase transition-all shadow-lg shadow-amber-500/20 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check size={16} />
                  <span>Confirmar (${estimatedCost})</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LIGHTBOX MEDIA PREVIEW */}
      <AnimatePresence>
        {previewMedia && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center"
            >
              <button
                onClick={() => setPreviewMedia(null)}
                className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white bg-white/10 rounded-full backdrop-blur transition-colors"
              >
                <X size={20} />
              </button>
              <div className="rounded-2xl overflow-hidden border border-white/10 max-h-[75vh]">
                {previewMedia.type === 'image' ? (
                  <img src={previewMedia.fileUrl} alt={previewMedia.prompt} className="max-h-[75vh] w-auto object-contain" />
                ) : (
                  <video src={previewMedia.fileUrl} controls className="max-h-[75vh] w-auto" />
                )}
              </div>
              <div className="mt-4 p-4 rounded-2xl bg-[#161514] border border-white/[0.08] w-full max-w-xl text-center">
                <p className="text-xs text-zinc-200">{previewMedia.prompt}</p>
                <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-zinc-500 font-mono">
                  <span>Provedor: {previewMedia.providerName}</span>
                  <span>Data: {new Date(previewMedia.createdAt).toLocaleString()}</span>
                  <a href={previewMedia.fileUrl} download={previewMedia.filename} className="text-orange-400 hover:underline">
                    Baixar Arquivo
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
