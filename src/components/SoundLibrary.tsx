import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Music, Plus, Trash2, Play, Volume2, X, Search, Upload, Link, Square, Edit2, Sparkles, 
  Wand2, Music2, Brain, Pause, SkipForward, SkipBack, ListPlus, FolderPlus, Compass, Disc, Heart,
  Image, Video, Camera, Film, UserPlus, ChevronRight 
} from 'lucide-react';
import { cn, safeJsonParse } from '../lib/utils';
import { SoundEffect } from '../types';
import { saveAudio } from '../lib/audioDb';

export interface GalleryItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  name?: string;
}

export interface CastMember {
  id: string;
  name: string;
  items: GalleryItem[];
}

interface SoundLibraryProps {
  sounds: SoundEffect[];
  playingUrl: string | null;
  apiKeys: { gemini: string };
  isSoundPaused?: boolean;
  onPauseSound?: () => void;
  onResumeSound?: () => void;
  onAddSound: (sound: Partial<SoundEffect>) => void;
  onUpdateSound: (id: string, sound: Partial<SoundEffect>) => void;
  onRemoveSound: (id: string) => void;
  onRestoreDefaults: () => void;
  onPlaySound: (url: string) => void;
  onStopSound: () => void;
  onClose: () => void;
  chosenInitSoundUrl?: string;
  onSelectInitSound?: (url: string) => void;
}

interface Playlist {
  id: string;
  name: string;
  soundIds: string[];
}

export const SoundLibrary = ({ 
  sounds, 
  playingUrl, 
  apiKeys, 
  isSoundPaused = false,
  onPauseSound,
  onResumeSound,
  onAddSound, 
  onUpdateSound, 
  onRemoveSound, 
  onRestoreDefaults, 
  onPlaySound, 
  onStopSound, 
  onClose,
  chosenInitSoundUrl,
  onSelectInitSound
}: SoundLibraryProps) => {
  const [filter, setFilter] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [currentTab, setCurrentTab] = useState<'sounds' | 'music_playlists' | 'gallery'>('sounds');
  
  // Cast members state for Elenco/Gallery
  const [castMembers, setCastMembers] = useState<CastMember[]>(() => {
    try {
      const saved = localStorage.getItem('osone_cast_albums');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error("Erro ao carregar osone_cast_albums:", e);
    }
    // Default elenco
    return [
      {
        id: 'elenco-1',
        name: 'Juliana',
        items: [
          { id: 'item-juliana-1', type: 'image', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&auto=format&fit=crop&q=80', name: 'Juliana Sorrindo' },
          { id: 'item-juliana-2', type: 'image', url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&auto=format&fit=crop&q=80', name: 'Juliana Perfil' },
          { id: 'item-juliana-3', type: 'image', url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&auto=format&fit=crop&q=80', name: 'Juliana Casual' }
        ]
      },
      {
        id: 'elenco-2',
        name: 'Henrique',
        items: [
          { id: 'item-henrique-1', type: 'image', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80', name: 'Henrique Retrato' },
          { id: 'item-henrique-2', type: 'image', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&auto=format&fit=crop&q=80', name: 'Henrique Sorridente' }
        ]
      }
    ];
  });

  const saveCastMembers = (updated: CastMember[]) => {
    setCastMembers(updated);
    localStorage.setItem('osone_cast_albums', JSON.stringify(updated));
    // Trigger window event so other components receive updates instantly if needed
    window.dispatchEvent(new Event('osone_cast_albums_updated'));
  };

  const [selectedCastId, setSelectedCastId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('osone_cast_albums');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].id;
      }
    } catch {}
    return 'elenco-1';
  });

  const [newCastName, setNewCastName] = useState('');
  const [isAddingCast, setIsAddingCast] = useState(false);
  const [isAddMediaOpen, setIsAddMediaOpen] = useState(false);
  
  const [newMediaDetails, setNewMediaDetails] = useState<{ name: string; type: 'image' | 'video'; url: string }>({
    name: '',
    type: 'image',
    url: ''
  });
  const [mediaUploadType, setMediaUploadType] = useState<'url' | 'file'>('url');
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  const handleCreateCastMember = () => {
    if (!newCastName.trim()) return;
    const isDuplicate = castMembers.some(m => m.name.toLowerCase() === newCastName.trim().toLowerCase());
    if (isDuplicate) {
      alert("Já existe alguém no elenco cadastrado sob este nome!");
      return;
    }
    const created: CastMember = {
      id: 'member-' + Math.random().toString(36).substr(2, 9),
      name: newCastName.trim(),
      items: []
    };
    const updated = [...castMembers, created];
    saveCastMembers(updated);
    setNewCastName('');
    setIsAddingCast(false);
    setSelectedCastId(created.id);
  };

  const handleAddMediaToAlbum = () => {
    if (!newMediaDetails.url || !selectedCastId) return;
    const updated = castMembers.map(m => {
      if (m.id === selectedCastId) {
        return {
          ...m,
          items: [
            ...(m.items || []),
            {
              id: 'media-' + Math.random().toString(36).substr(2, 9),
              type: newMediaDetails.type,
              url: newMediaDetails.url,
              name: newMediaDetails.name || 'Mídia'
            }
          ]
        };
      }
      return m;
    });
    saveCastMembers(updated);
    setNewMediaDetails({ name: '', type: 'image', url: '' });
    setMediaUploadType('url');
    setIsAddMediaOpen(false);
  };

  const handleMediaFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploadingMedia(true);
      try {
        const reader = new FileReader();
        reader.onloadend = () => {
          setNewMediaDetails(prev => ({
            ...prev,
            url: reader.result as string
          }));
          setIsUploadingMedia(false);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error("Erro ao converter e ler arquivo de mídia:", err);
        setIsUploadingMedia(false);
        alert("Erro ao decodificar arquivo local.");
      }
    }
  };
  
  // Playlist State
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const saved = localStorage.getItem('osone_playlists_musica');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  // Queue State for Continuous Playlist Playback
  const [activeQueue, setActiveQueue] = useState<SoundEffect[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number>(-1);
  const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSound, setEditingSound] = useState<SoundEffect | null>(null);
  const [newSound, setNewSound] = useState({ name: '', category: 'funny', url: '' });
  const [uploadType, setUploadType] = useState<'url' | 'file'>('url');
  const [isUploading, setIsUploading] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Auto categories
  const categories = ['all', ...Array.from(new Set(sounds.map(s => s.category)))];

  // Save playlists helper
  const savePlaylists = (updated: Playlist[]) => {
    setPlaylists(updated);
    localStorage.setItem('osone_playlists_musica', JSON.stringify(updated));
  };

  // Find currently playing sound details
  const currentPlayingSound = sounds.find(s => s.url === playingUrl) || 
    (activeQueue[currentQueueIndex] && activeQueue[currentQueueIndex].url === playingUrl ? activeQueue[currentQueueIndex] : null);

  // Monitor playingUrl finish to auto play next in queue
  useEffect(() => {
    if (playingUrl === null && activeQueue.length > 0 && currentQueueIndex >= 0 && currentQueueIndex < activeQueue.length - 1) {
      const nextIndex = currentQueueIndex + 1;
      const nextSound = activeQueue[nextIndex];
      setCurrentQueueIndex(nextIndex);
      onPlaySound(nextSound.url);
    }
  }, [playingUrl]);

  const handleCreatePlaylist = () => {
    if (!newPlaylistName.trim()) return;
    const isDuplicate = playlists.some(p => p.name.toLowerCase() === newPlaylistName.trim().toLowerCase());
    if (isDuplicate) {
      alert("Já existe uma playlist com esse nome!");
      return;
    }
    const created: Playlist = {
      id: 'pl-' + Math.random().toString(36).substr(2, 9),
      name: newPlaylistName.trim(),
      soundIds: []
    };
    const updated = [...playlists, created];
    savePlaylists(updated);
    setNewPlaylistName('');
    setIsPlaylistModalOpen(false);
    setActivePlaylistId(created.id);
  };

  const handleDeletePlaylist = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Tem certeza que deseja excluir esta playlist?")) {
      const updated = playlists.filter(p => p.id !== id);
      savePlaylists(updated);
      if (activePlaylistId === id) setActivePlaylistId(null);
      if (playingPlaylistId === id) {
        onStopSound();
        setActiveQueue([]);
        setCurrentQueueIndex(-1);
        setPlayingPlaylistId(null);
      }
    }
  };

  const toggleSoundInPlaylist = (playlistId: string, soundId: string) => {
    const updated = playlists.map(p => {
      if (p.id === playlistId) {
        const contains = p.soundIds.includes(soundId);
        return {
          ...p,
          soundIds: contains ? p.soundIds.filter(id => id !== soundId) : [...p.soundIds, soundId]
        };
      }
      return p;
    });
    savePlaylists(updated);

    // If currently playing, dynamically update queue
    if (playingPlaylistId === playlistId) {
      const currentPl = updated.find(p => p.id === playlistId);
      if (currentPl) {
        const matchingSounds = currentPl.soundIds.map(sid => sounds.find(s => s.id === sid)).filter(Boolean) as SoundEffect[];
        setActiveQueue(matchingSounds);
        const index = matchingSounds.findIndex(s => s.url === playingUrl);
        setCurrentQueueIndex(index);
      }
    }
  };

  const playPlaylist = (playlist: Playlist) => {
    const plSounds = playlist.soundIds.map(id => sounds.find(s => s.id === id)).filter(Boolean) as SoundEffect[];
    if (plSounds.length === 0) {
      alert("Esta playlist está vazia. Adicione algumas músicas primeiro!");
      return;
    }
    setActiveQueue(plSounds);
    setCurrentQueueIndex(0);
    setPlayingPlaylistId(playlist.id);
    onPlaySound(plSounds[0].url);
  };

  const handleNext = () => {
    if (activeQueue.length > 0 && currentQueueIndex >= 0 && currentQueueIndex < activeQueue.length - 1) {
      const nextIndex = currentQueueIndex + 1;
      setCurrentQueueIndex(nextIndex);
      onPlaySound(activeQueue[nextIndex].url);
    }
  };

  const handlePrev = () => {
    if (activeQueue.length > 0 && currentQueueIndex > 0) {
      const prevIndex = currentQueueIndex - 1;
      setCurrentQueueIndex(prevIndex);
      onPlaySound(activeQueue[prevIndex].url);
    }
  };

  // Filter handlers
  const filteredSounds = sounds.filter(s => {
    const matchesFilter = s.name.toLowerCase().includes(filter.toLowerCase());
    const matchesCategory = activeCategory === 'all' || s.category === activeCategory;
    return matchesFilter && matchesCategory;
  });

  // Music list only (or synth/ambient/epic categories which represent high-quality audio)
  const musicSounds = sounds.filter(s => 
    s.category === 'musica' || 
    s.category === 'synth' || 
    s.category === 'ambient' || 
    s.category === 'epic'
  );

  const filteredMusicSounds = musicSounds.filter(s => 
    s.name.toLowerCase().includes(filter.toLowerCase())
  );

  const handleAdd = () => {
    if (newSound.name && newSound.url) {
      if (editingSound) {
        onUpdateSound(editingSound.id, newSound);
      } else {
        onAddSound(newSound);
      }
      resetForm();
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    const apiKey = apiKeys.gemini;
    setAiError(null);
    if (!apiKey || apiKey.trim() === '') {
      setAiError("Por favor, vincule sua própria chave API Gemini nas configurações para gerar sons.");
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const prompt = `Você é um gerador de efeitos sonoros e músicas via IA para o sistema operacional OSONE.
      O usuário quer o seguinte som: "${aiPrompt}"
      
      Retorne um JSON com:
      {
        "name": "Nome curto e criativo em Português",
        "category": "Uma destas: funny, comico, horror, suspense, halloween, sneaky, epic, synth, ambient, musica",
        "url": "Escolha a URL mais adequada da lista abaixo baseada na descrição",
        "rationale": "Breve explicação por que este som foi escolhido/gerado"
      }

      LISTA DE SONS DISPONÍVEIS (URLs):
      - https://assets.mixkit.co/active_storage/sfx/2012/2012-preview.mp3 (Epic cinematic whoosh)
      - https://assets.mixkit.co/active_storage/sfx/2103/2103-preview.mp3 (Funny bounce)
      - https://assets.mixkit.co/active_storage/sfx/123/123-preview.mp3 (Horror screech)
      - https://assets.mixkit.co/active_storage/sfx/543/543-preview.mp3 (Sneaky footsteps)
      - https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3 (Ambient nature)
      - https://assets.mixkit.co/active_storage/sfx/1113/1113-preview.mp3 (Suspense drone)
      - https://assets.mixkit.co/active_storage/sfx/619/619-preview.mp3 (Synth sequence)
      - https://assets.mixkit.co/active_storage/sfx/2345/2345-preview.mp3 (Portal magic)
      - https://assets.mixkit.co/active_storage/sfx/3001/3001-preview.mp3 (Retro game jump)
      `;

      const response = await fetch("/api/gemini/generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientApiKey: apiKey,
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Erro de rede no proxy do servidor.");
      }

      const result = await response.json();
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const data = safeJsonParse(textResponse, { name: "Som", category: "funny", url: "" });
      
      onAddSound({
        name: `[AI] ${data.name}`,
        category: data.category,
        url: data.url
      });

      setAiPrompt('');
      setIsAiModalOpen(false);
    } catch (error: any) {
      console.error("AI Generation Error:", error);
      setAiError(error?.message || "Erro ao gerar som com IA. Verifique sua chave API.");
    } finally {
      setIsGenerating(false);
    }
  };

  const resetForm = () => {
    setNewSound({ name: '', category: 'funny', url: '' });
    setUploadType('url');
    setIsAddModalOpen(false);
    setEditingSound(null);
  };

  const openEdit = (sound: SoundEffect) => {
    setEditingSound(sound);
    setNewSound({ name: sound.name, category: sound.category, url: sound.url });
    setUploadType((sound.url.startsWith('data:') || sound.url.startsWith('db://')) ? 'file' : 'url');
    setIsAddModalOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) { 
        alert('Este arquivo é muito grande. A biblioteca do OSONE suporta músicas e áudios de até 5 minutos (limite de 50MB).');
        return;
      }
      setIsUploading(true);
      try {
        const audioId = "audio-" + Math.random().toString(36).substr(2, 9);
        const dbUrl = await saveAudio(audioId, file, file.name || "Música Upload");
        setNewSound({ ...newSound, url: dbUrl });
      } catch (error) {
        console.error("Erro ao fazer upload do arquivo:", error);
        alert("Não foi possível processar este arquivo em seu navegador. Tente um formato padrão (MP3, WAV, AAC).");
      } finally {
        setIsUploading(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-her-bg/50 backdrop-blur-xl overflow-hidden w-full relative">
      {/* Header */}
      <div className="p-4 md:p-8 flex items-center justify-between border-b border-white/[0.05] bg-black/20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-her-accent/10 border border-her-accent/20 text-her-accent rounded-xl">
            <Music size={18} />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-serif italic text-white/90">Biblioteca de Sons & Música</h2>
            <p className="text-[8px] md:text-[9px] text-her-muted uppercase tracking-[0.2em] font-light">Efeitos sonoros e playlists do OSONE</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => { setIsAiModalOpen(true); setAiError(null); }}
            className="px-4 py-2.5 bg-purple-500/10 text-purple-200 border border-purple-500/20 hover:bg-purple-500/20 transition-all uppercase tracking-wider text-[10px] rounded-lg flex items-center gap-2"
          >
            <Sparkles size={12} className="text-purple-400" />
            <span>Gerar com IA</span>
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 bg-her-accent text-white hover:bg-her-accent/90 transition-all uppercase tracking-wider text-[10px] rounded-lg flex items-center gap-2"
          >
            <Plus size={12} />
            <span>Adicionar</span>
          </button>
          <button onClick={onClose} className="p-2 hover:bg-white/[0.03] rounded-full transition-colors text-her-muted">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex px-4 md:px-8 border-b border-white/[0.05] bg-black/10 shrink-0 gap-6">
        <button 
          onClick={() => setCurrentTab('sounds')}
          className={cn(
            "py-4 text-[10px] uppercase font-semibold tracking-[0.15em] border-b-2 transition-all flex items-center gap-2",
            currentTab === 'sounds' 
              ? "border-her-accent text-her-accent bg-transparent" 
              : "border-transparent text-her-muted hover:text-white/60"
          )}
        >
          <Compass size={13} />
          Biblioteca Geral de Sons
        </button>
        <button 
          onClick={() => setCurrentTab('music_playlists')}
          className={cn(
            "py-4 text-[10px] uppercase font-semibold tracking-[0.15em] border-b-2 transition-all flex items-center gap-2",
            currentTab === 'music_playlists' 
              ? "border-her-accent text-her-accent" 
              : "border-transparent text-her-muted hover:text-white/60"
          )}
        >
          <ListPlus size={14} />
          Músicas & Playlists ({musicSounds.length} faixas)
        </button>
        <button 
          onClick={() => setCurrentTab('gallery')}
          className={cn(
            "py-4 text-[10px] uppercase font-semibold tracking-[0.15em] border-b-2 transition-all flex items-center gap-2",
            currentTab === 'gallery' 
              ? "border-her-accent text-her-accent" 
              : "border-transparent text-her-muted hover:text-white/60"
          )}
        >
          <Image size={13} />
          Galeria de Elenco (Álbum)
        </button>
      </div>

      {/* Tab 1: Sounds Explore */}
      {currentTab === 'sounds' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 md:p-8 gap-4 overflow-hidden">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3 shrink-0">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-her-muted" size={14} />
              <input 
                type="text" 
                placeholder="Buscar som pelo nome..." 
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full bg-white/[0.02] border border-white/[0.05] py-3 pl-10 pr-4 text-xs font-light focus:outline-none focus:border-her-accent/30 rounded-lg transition-all"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1.5 md:pb-0 scrollbar-none">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "px-4 py-2 text-[9px] uppercase tracking-wider font-light transition-all whitespace-nowrap border rounded-md",
                    activeCategory === cat 
                      ? "bg-her-accent/10 text-her-accent border-her-accent/20" 
                      : "bg-white/[0.02] text-her-muted border-white/[0.05] hover:bg-white/[0.05]"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid view of all sounds */}
          <div className="flex-1 overflow-y-auto pr-1 pb-[120px] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 bg-transparent">
              {filteredSounds.map((sound) => (
                <motion.div
                  layout
                  key={sound.id}
                  className={cn(
                    "group relative p-4 rounded-xl border transition-all flex flex-col justify-between h-[130px]",
                    playingUrl === sound.url 
                      ? "bg-her-accent/10 border-her-accent/30" 
                      : "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04]"
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <span className={cn(
                        "text-[8px] uppercase tracking-widest px-2 py-0.5 rounded-full font-light border",
                        sound.category === 'musica' 
                          ? "bg-purple-500/10 text-purple-300 border-purple-500/20" 
                          : "bg-white/[0.03] text-her-muted border-white/[0.04]"
                      )}>
                        {sound.category}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => onSelectInitSound?.(sound.url)}
                          className={cn(
                            "p-1 rounded-md transition-all",
                            chosenInitSoundUrl === sound.url 
                              ? "text-purple-400 bg-purple-500/10 border border-purple-500/20" 
                              : "text-zinc-500 hover:text-white hover:bg-white/5"
                          )}
                          title="Tocar ao inicializar via viva-voz"
                        >
                          <Sparkles size={11} className={chosenInitSoundUrl === sound.url ? "animate-pulse" : ""} />
                        </button>
                        <button 
                          onClick={() => openEdit(sound)}
                          className="p-1 opacity-0 group-hover:opacity-100 text-her-muted hover:text-her-accent transition-all"
                          title="Editar"
                        >
                          <Edit2 size={11} />
                        </button>
                        <button 
                          onClick={() => onRemoveSound(sound.id)}
                          className="p-1 opacity-0 group-hover:opacity-100 text-her-muted hover:text-red-400 transition-all"
                          title="Excluir"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                    <h3 className="text-xs font-semibold text-white/90 mt-2 truncate line-clamp-1">{sound.name}</h3>
                  </div>

                  <button
                    onClick={() => {
                      if (playingUrl === sound.url) {
                        onStopSound();
                      } else {
                        setActiveQueue([sound]);
                        setCurrentQueueIndex(0);
                        setPlayingPlaylistId(null);
                        onPlaySound(sound.url);
                      }
                    }}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] uppercase tracking-wider transition-all mt-2",
                      playingUrl === sound.url 
                        ? "bg-her-accent text-white font-medium" 
                        : "bg-white/[0.05] hover:bg-her-accent hover:text-white"
                    )}
                  >
                    {playingUrl === sound.url ? (
                      <>
                        <Square size={10} fill="currentColor" />
                        <span>Parar</span>
                      </>
                    ) : (
                      <>
                        <Play size={10} fill="currentColor" />
                        <span>Ouvir</span>
                      </>
                    )}
                  </button>
                </motion.div>
              ))}
            </div>

            {filteredSounds.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-her-muted border border-dashed border-white/[0.05] rounded-3xl">
                <Music size={32} className="mb-3 opacity-20" />
                <p className="text-xs font-light">Nenhum som encontrado para esta busca.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Music & Playlists */}
      {currentTab === 'music_playlists' && (
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Playlists Left Panel */}
          <div className="w-full md:w-[280px] border-r border-white/[0.05] bg-black/10 flex flex-col min-h-0">
            <div className="p-4 flex items-center justify-between border-b border-white/[0.05] shrink-0">
              <span className="text-[9px] uppercase tracking-widest text-her-muted font-light">Playlists</span>
              <button 
                onClick={() => setIsPlaylistModalOpen(true)}
                className="p-1 px-2.5 bg-her-accent/20 hover:bg-her-accent/30 text-her-accent rounded-md border border-her-accent/20 flex items-center gap-1.5 transition-all"
              >
                <FolderPlus size={12} />
                <span className="text-[9px] font-medium uppercase tracking-wider">Criar</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-none">
              <button
                onClick={() => setActivePlaylistId(null)}
                className={cn(
                  "w-full p-3 rounded-lg text-left text-xs flex items-center justify-between transition-all",
                  activePlaylistId === null 
                    ? "bg-white/[0.06] text-white font-medium" 
                    : "text-her-muted hover:bg-white/[0.02]"
                )}
              >
                <div className="flex items-center gap-2">
                  <Disc size={13} className={cn(activePlaylistId === null ? "text-her-accent" : "text-her-muted")} />
                  <span>Todas as Músicas</span>
                </div>
                <span className="text-[10px] bg-white/[0.05] px-2 py-0.5 rounded-full">{musicSounds.length}</span>
              </button>

              {playlists.map(pl => {
                const isPlayingPl = playingPlaylistId === pl.id;
                return (
                  <div
                    key={pl.id}
                    onClick={() => setActivePlaylistId(pl.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActivePlaylistId(pl.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "w-full p-3 rounded-lg text-left text-xs flex items-center justify-between transition-all group cursor-pointer select-none focus:outline-none focus:bg-white/[0.04]",
                      activePlaylistId === pl.id 
                        ? "bg-white/[0.06] text-white font-medium border-l-2 border-her-accent" 
                        : "text-her-muted hover:bg-white/[0.02] border-l-2 border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <Heart size={13} className={cn(isPlayingPl ? "text-red-400 animate-pulse" : "text-her-muted")} />
                      <span className="truncate">{pl.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] bg-white/[0.05] px-1.5 py-0.5 rounded-full">{pl.soundIds.length}</span>
                      <button 
                        onClick={(e) => handleDeletePlaylist(pl.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all text-her-muted cursor-pointer"
                        title="Excluir Playlist"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {playlists.length === 0 && (
                <div className="py-8 px-4 text-center text-her-muted italic text-[11px] font-light">
                  Nenhuma playlist criada. Use o botão acima para organizar suas faixas do OSONE!
                </div>
              )}
            </div>
          </div>

          {/* Music Grid / Song Selector Pane Right */}
          <div className="flex-1 flex flex-col min-h-0 p-4 md:p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h3 className="text-sm font-serif italic text-white/90">
                  {activePlaylistId === null 
                    ? "Todas as Músicas da Biblioteca" 
                    : playlists.find(p => p.id === activePlaylistId)?.name}
                </h3>
                <p className="text-[9px] text-her-muted uppercase tracking-wider mt-0.5 font-light">
                  {activePlaylistId === null 
                    ? "Músicas enviadas e predefinidas disponíveis no sistema" 
                    : "Músicas pertencentes a esta playlist. Você pode reproduzir todas em sequência"}
                </p>
              </div>

              {activePlaylistId !== null && (
                <button
                  onClick={() => {
                    const currentPl = playlists.find(p => p.id === activePlaylistId);
                    if (currentPl) playPlaylist(currentPl);
                  }}
                  disabled={playlists.find(p => p.id === activePlaylistId)?.soundIds.length === 0}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg hover:shadow-green-500/10 text-[9px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-2 transition-all disabled:opacity-20 disabled:pointer-events-none"
                >
                  <Play size={10} fill="currentColor" />
                  <span>Tocar Playlist</span>
                </button>
              )}
            </div>

            {/* Song search/filter */}
            <div className="relative mb-4 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-her-muted" size={13} />
              <input 
                type="text" 
                placeholder="Filtrar faixas de música por nome..." 
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full bg-white/[0.02] border border-white/[0.05] py-2.5 pl-10 pr-4 text-xs font-light focus:outline-none focus:border-purple-500/30 rounded-lg transition-all"
              />
            </div>

            {/* List / Grid of songs with playlist assignment toggles */}
            <div className="flex-1 overflow-y-auto pr-1 pb-[120px] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <div className="space-y-2">
                {(activePlaylistId === null ? filteredMusicSounds : filteredMusicSounds.filter(s => playlists.find(p => p.id === activePlaylistId)?.soundIds.includes(s.id))).map((sound) => {
                  const isCurrentSongPlaying = playingUrl === sound.url;
                  
                  return (
                    <motion.div 
                      key={sound.id}
                      className={cn(
                        "p-3 rounded-lg border flex items-center justify-between transition-all gap-4",
                        isCurrentSongPlaying 
                          ? "bg-her-accent/15 border-her-accent/30 text-white" 
                          : "bg-white/[0.01] border-white/[0.05] hover:bg-white/[0.03]"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button
                          onClick={() => {
                            if (isCurrentSongPlaying) {
                              onStopSound();
                            } else {
                              if (activePlaylistId !== null) {
                                // Playing from playlist context
                                const currentPl = playlists.find(p => p.id === activePlaylistId);
                                if (currentPl) {
                                  const plSounds = currentPl.soundIds.map(id => sounds.find(s => s.id === id)).filter(Boolean) as SoundEffect[];
                                  setActiveQueue(plSounds);
                                  const soundIndex = plSounds.findIndex(s => s.id === sound.id);
                                  setCurrentQueueIndex(soundIndex !== -1 ? soundIndex : 0);
                                  setPlayingPlaylistId(currentPl.id);
                                }
                              } else {
                                // Custom independent play queue
                                setActiveQueue(sounds.filter(s => s.category === 'musica' || s.category === 'synth' || s.category === 'ambient'));
                                const soundIndex = sounds.filter(s => s.category === 'musica' || s.category === 'synth' || s.category === 'ambient').findIndex(s => s.id === sound.id);
                                setCurrentQueueIndex(soundIndex !== -1 ? soundIndex : 0);
                                setPlayingPlaylistId(null);
                              }
                              onPlaySound(sound.url);
                            }
                          }}
                          className={cn(
                            "p-2.5 rounded-lg shrink-0 flex items-center justify-center transition-all",
                            isCurrentSongPlaying ? "bg-her-accent text-white animate-spin" : "bg-white/[0.05] hover:bg-her-accent hover:text-white"
                          )}
                        >
                          {isCurrentSongPlaying ? <Disc size={13} /> : <Play size={12} fill="currentColor" />}
                        </button>
                        
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-semibold text-white/90 truncate">{sound.name}</h4>
                          <span className="text-[9px] text-her-muted capitalize font-light">{sound.category}</span>
                        </div>
                      </div>

                      {/* Playlist Assignment Control Side */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => onSelectInitSound?.(sound.url)}
                          className={cn(
                            "px-2 py-1 text-[9px] uppercase font-bold tracking-wider rounded-md border flex items-center gap-1.5 transition-all",
                            chosenInitSoundUrl === sound.url
                              ? "bg-purple-500/10 border-purple-500/30 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                              : "bg-white/[0.01] border-white/[0.05] text-white/40 hover:text-white/80 hover:bg-white/[0.03]"
                          )}
                          title="Tocar esta faixa ao ativar o sistema via viva-voz (Ei Osone / Palmas)"
                        >
                          <Sparkles size={10} className={chosenInitSoundUrl === sound.url ? "animate-pulse text-purple-400" : "text-white/30"} />
                          <span>{chosenInitSoundUrl === sound.url ? "Inicialização On" : "Tocar no Início"}</span>
                        </button>

                        {playlists.length > 0 && activePlaylistId === null && (
                          <div className="relative group/pl">
                            <span className="text-[9px] uppercase tracking-wider text-her-muted border border-white/[0.05] px-2 py-1 rounded-md bg-white/[0.01] hover:bg-white/[0.05] cursor-pointer flex items-center gap-1.5 transition-all">
                              <ListPlus size={11} />
                              Adicionar à...
                            </span>
                            
                            {/* Hover Dropdown */}
                            <div className="absolute right-0 top-full pt-1 z-50 pointer-events-none opacity-0 group-hover/pl:pointer-events-auto group-hover/pl:opacity-100 transition-all w-[180px] bg-her-bg border border-white/[0.1] rounded-lg shadow-2xl p-1.5 space-y-1">
                              {playlists.map(pl => {
                                const hasSong = pl.soundIds.includes(sound.id);
                                return (
                                  <button
                                    key={pl.id}
                                    onClick={() => toggleSoundInPlaylist(pl.id, sound.id)}
                                    className={cn(
                                      "w-full text-left text-[10px] p-2 rounded-md font-medium transition-colors flex items-center justify-between",
                                      hasSong ? "bg-her-accent/10 border border-her-accent/20 text-her-accent" : "text-her-muted hover:bg-white/[0.03]"
                                    )}
                                  >
                                    <span className="truncate">{pl.name}</span>
                                    {hasSong ? <X size={10} /> : <Plus size={10} />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {activePlaylistId !== null && (
                          <button
                            onClick={() => toggleSoundInPlaylist(activePlaylistId, sound.id)}
                            className="p-1 px-2 hover:bg-red-400/10 hover:text-red-400 rounded-md text-[9px] uppercase font-medium border border-transparent hover:border-red-400/20 text-her-muted transition-all"
                            title="Remover de Playlist"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}

                {(activePlaylistId === null ? filteredMusicSounds : filteredMusicSounds.filter(s => playlists.find(p => p.id === activePlaylistId)?.soundIds.includes(s.id))).length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-her-muted border border-dashed border-white/[0.05] rounded-3xl">
                    <Music2 size={32} className="mb-3 opacity-20" />
                    <p className="text-xs font-light">Sua biblioteca ou playlist está vazia.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Cast Gallery Management & Album */}
      {currentTab === 'gallery' && (() => {
        const selectedMember = castMembers.find(m => m.id === selectedCastId);
        return (
          <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden text-zinc-100">
            {/* Elenco Left Panel */}
            <div className="w-full md:w-[280px] border-r border-white/[0.05] bg-black/10 flex flex-col min-h-0">
              <div className="p-4 flex items-center justify-between border-b border-white/[0.05] shrink-0">
                <span className="text-[9px] uppercase tracking-widest text-[#9ca3af] font-light">Elenco de Integrantes</span>
                <button 
                  onClick={() => setIsAddingCast(true)}
                  className="p-1 px-2.5 bg-[#db2777]/20 hover:bg-[#db2777]/30 text-[#f472b6] rounded-md border border-[#db2777]/20 flex items-center gap-1.5 transition-all text-[9.5px] font-bold uppercase tracking-wider cursor-pointer active:scale-95"
                >
                  <Plus size={11} />
                  <span>Cadastrar +</span>
                </button>
              </div>

              {/* List of members */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-none">
                {castMembers.map(member => {
                  const isSelected = selectedCastId === member.id;
                  return (
                    <div
                      key={member.id}
                      onClick={() => setSelectedCastId(member.id)}
                      className={cn(
                        "w-full p-3 rounded-lg text-left text-xs flex items-center justify-between transition-all cursor-pointer group/member",
                        isSelected 
                          ? "bg-white/[0.06] text-white font-medium border-l-2 border-[#db2777]" 
                          : "text-zinc-400 hover:bg-white/[0.02] border-l-2 border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <div className="w-6 h-6 rounded-full bg-[#db2777]/10 flex items-center justify-center font-serif italic text-[#f472b6] border border-[#db2777]/20 shrink-0 select-none text-[10px]">
                          {member.name.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="truncate">{member.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[9px] bg-white/[0.05] px-1.5 py-0.5 rounded-full select-none text-zinc-400">
                          {member.items?.length || 0}
                        </span>
                        {member.id !== 'elenco-1' && member.id !== 'elenco-2' && ( 
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Tem certeza que deseja excluir ${member.name} do elenco? Seu álbum de imagens também será apagado.`)) {
                                const updated = castMembers.filter(m => m.id !== member.id);
                                saveCastMembers(updated);
                                if (selectedCastId === member.id && updated.length > 0) {
                                  setSelectedCastId(updated[0].id);
                                }
                              }
                            }}
                            className="opacity-0 group-hover/member:opacity-100 p-1 hover:text-red-400 transition-all text-zinc-500 hover:text-red-400"
                            title="Excluir do Elenco"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {castMembers.length === 0 && (
                  <div className="py-8 px-4 text-center text-zinc-500 italic text-[11px] font-light">
                    Nenhum integrante cadastrado. Clique no botão acima para adicionar!
                  </div>
                )}
              </div>
            </div>

            {/* Album Right Panel */}
            <div className="flex-1 flex flex-col min-h-0 p-4 md:p-6 overflow-hidden bg-black/5">
              {selectedMember ? (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Member Header */}
                  <div className="flex items-center justify-between mb-4 shrink-0">
                    <div>
                      <h3 className="text-sm font-serif italic text-white/95">
                        Álbum de {selectedMember.name}
                      </h3>
                      <p className="text-[9px] text-zinc-400 uppercase tracking-wider mt-0.5 font-light">
                        Gerencie as fotos e vídeos desta pessoa. Quando requisitados no chat central, eles flutuarão na tela inicial.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsAddMediaOpen(true)}
                        className="px-4 py-2 bg-gradient-to-r from-purple-500 to-[#db2777] text-white hover:shadow-lg hover:shadow-purple-500/10 text-[9px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-2 transition-all cursor-pointer"
                      >
                        <Plus size={11} />
                        <span>Adicionar Mídia</span>
                      </button>
                    </div>
                  </div>

                  {/* Media Grid */}
                  <div className="flex-1 overflow-y-auto pr-1 pb-[120px] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {selectedMember.items && selectedMember.items.map((item) => (
                        <div 
                          key={item.id}
                          className="group relative rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden aspect-square flex flex-col justify-between hover:border-[#db2777]/30 transition-all"
                        >
                          <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
                            {item.type === 'video' ? (
                              <div className="w-full h-full bg-zinc-950 flex flex-col items-center justify-center relative">
                                <Film size={24} className="text-zinc-600 mb-1" />
                                <span className="text-[8px] uppercase tracking-wider text-zinc-500 font-mono">Vídeo</span>
                                <video src={item.url} className="absolute inset-0 w-full h-full object-cover" muted loop playsInline autoPlay />
                              </div>
                            ) : (
                              <img 
                                src={item.url} 
                                alt={item.name || "Imagem do Álbum"} 
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                              />
                            )}

                            {/* Float delete button */}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-1">
                              <button
                                onClick={() => {
                                  if (confirm("Deseja mesmo remover esta imagem/vídeo do álbum?")) {
                                    const updated = castMembers.map(m => {
                                      if (m.id === selectedMember.id) {
                                        return {
                                          ...m,
                                          items: m.items.filter(i => i.id !== item.id)
                                        };
                                      }
                                      return m;
                                    });
                                    saveCastMembers(updated);
                                  }
                                }}
                                className="p-1 px-1.5 bg-black/80 hover:bg-red-500/90 text-white rounded-md transition-colors flex items-center justify-center cursor-pointer"
                                title="Excluir Mídia"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>

                          {item.name ? (
                            <div className="p-2 bg-black/50 border-t border-white/[0.03] backdrop-blur-sm truncate">
                              <p className="text-[10px] text-zinc-300 font-light truncate select-none">{item.name}</p>
                            </div>
                          ) : (
                            <div className="p-2 bg-black/50 border-t border-white/[0.03] backdrop-blur-sm truncate">
                              <p className="text-[10px] text-zinc-500 font-light truncate select-none">Mídia sem nome</p>
                            </div>
                          )}
                        </div>
                      ))}

                      {(!selectedMember.items || selectedMember.items.length === 0) && (
                        <div className="col-span-full py-16 text-center border border-dashed border-white/[0.05] rounded-2xl flex flex-col items-center justify-center text-zinc-500">
                          <Camera size={28} className="mb-2 opacity-20 text-zinc-400" />
                          <p className="text-xs font-light text-zinc-400">Este álbum está vazio.</p>
                          <p className="text-[10px] text-zinc-500 mt-1 max-w-[200px]">Adicione imagens ou vídeos usando o botão no canto superior!</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 border border-dashed border-white/[0.05] rounded-3xl p-8">
                  <UserPlus size={36} className="mb-3 opacity-20" />
                  <p className="text-xs font-light">Nenhum integrante selecionado do elenco.</p>
                  <p className="text-[10px] text-zinc-500 mt-1">Crie um novo integrante no botão Cadastrar para iniciar!</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Global Interactive Media Player Footer */}
      <AnimatePresence>
        {playingUrl && currentPlayingSound && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="absolute bottom-0 left-0 right-0 z-50 bg-her-bg/95 backdrop-blur-2xl border-t border-white/[0.08] shadow-[0_-15px_30px_rgba(0,0,0,0.4)] p-4 flex flex-col md:flex-row items-center justify-between gap-4 px-6 md:px-10"
          >
            {/* Song Meta Panel */}
            <div className="flex items-center gap-3 w-full md:w-[30%] min-w-0">
              <div className="p-3 bg-gradient-to-tr from-purple-500/20 to-her-accent/20 text-purple-400 border border-purple-500/20 rounded-xl relative overflow-hidden shrink-0">
                <Music size={16} className="animate-bounce" />
                <div className="absolute inset-0 bg-white/5 animate-pulse" />
              </div>
              <div className="min-w-0">
                <span className="text-[8px] tracking-[0.2em] uppercase font-light text-her-accent block">TOCANDO AGORA</span>
                <h4 className="text-xs font-bold text-white/90 truncate mt-0.5">{currentPlayingSound.name}</h4>
                <p className="text-[10px] text-her-muted uppercase tracking-wider font-light flex items-center gap-1.5 mt-0.5">
                  <span className="capitalize">{currentPlayingSound.category}</span>
                  {playingPlaylistId && (
                    <>
                      <span>•</span>
                      <span className="text-purple-400">Playlist: {playlists.find(p => p.id === playingPlaylistId)?.name}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Custom Play/Pause Controls */}
            <div className="flex flex-col items-center gap-2 w-full md:w-[40%]">
              <div className="flex items-center gap-4">
                <button 
                  onClick={handlePrev}
                  disabled={activeQueue.length === 0 || currentQueueIndex <= 0}
                  className="p-2 bg-white/[0.02] border border-white/[0.05] rounded-full hover:bg-white/[0.06] text-white/60 hover:text-white transition-all disabled:opacity-20"
                  title="Anterior"
                >
                  <SkipBack size={14} />
                </button>

                <button
                  onClick={() => {
                    if (isSoundPaused) {
                      onResumeSound?.();
                    } else {
                      onPauseSound?.();
                    }
                  }}
                  className="p-3.5 bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-all text-center flex items-center justify-center shadow-lg"
                  title={isSoundPaused ? "Retomar" : "Pausar"}
                >
                  {isSoundPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
                </button>

                <button 
                  onClick={onStopSound}
                  className="p-2.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20 rounded-full hover:scale-105 active:scale-95 transition-all flex items-center justify-center shrink-0"
                  title="Parar"
                >
                  <Square size={12} fill="currentColor" />
                </button>

                <button 
                  onClick={handleNext}
                  disabled={activeQueue.length === 0 || currentQueueIndex < 0 || currentQueueIndex >= activeQueue.length - 1}
                  className="p-2 bg-white/[0.02] border border-white/[0.05] rounded-full hover:bg-white/[0.06] text-white/60 hover:text-white transition-all disabled:opacity-20"
                  title="Próxima"
                >
                  <SkipForward size={14} />
                </button>
              </div>

              {/* Progress visualizer block */}
              <div className="w-full max-w-[280px] bg-white/[0.05] h-1 rounded-full relative overflow-hidden shrink-0 mt-0.5">
                <motion.div 
                  className="bg-gradient-to-r from-purple-500 to-her-accent h-full w-full origin-left"
                  animate={{
                    scaleX: isSoundPaused ? [0.45, 0.45] : [0.1, 0.95],
                  }}
                  transition={{
                    duration: 35,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              </div>
            </div>

            {/* Volume indicator or auxiliary info */}
            <div className="hidden md:flex items-center gap-2 justify-end w-[30%] font-mono text-[9px] text-her-muted">
              <Volume2 size={12} />
              <span>Canais Estéreo OSONE Live • 60% Vol</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: Creative Playlist */}
      <AnimatePresence>
        {isPlaylistModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-her-bg w-full max-w-sm rounded-[2rem] shadow-2xl p-6 border border-white/[0.1] relative overflow-hidden"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-serif italic text-white/90">Criar Playlist de Música</h3>
                <button onClick={() => setIsPlaylistModalOpen(false)} className="p-1 hover:bg-white/[0.03] rounded-full">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-her-muted mb-2 font-light">Nome da Playlist</label>
                  <input 
                    type="text" 
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="Ex: Chillwave da Noite"
                    className="w-full bg-white/[0.03] border border-white/[0.05] py-3 px-4 rounded-xl text-xs font-light focus:outline-none focus:border-her-accent/30 text-white/90"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button 
                    onClick={() => setIsPlaylistModalOpen(false)}
                    className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium uppercase tracking-wider rounded-lg text-her-muted"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleCreatePlaylist}
                    disabled={!newPlaylistName.trim()}
                    className="px-5 py-2 bg-her-accent hover:bg-her-accent/90 text-xs font-bold uppercase tracking-wider rounded-lg text-white disabled:opacity-20"
                  >
                    Criar Playlist
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Sound Lab Generation Modal */}
      <AnimatePresence>
        {isAiModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-her-bg w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 border border-white/[0.1] relative overflow-hidden"
            >
              {/* Background Glow */}
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-500/10 blur-[80px] rounded-full" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-her-accent/10 blur-[80px] rounded-full" />

              <div className="relative">
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-purple-500/20 to-her-accent/20 rounded-2xl text-purple-400 border border-purple-500/20">
                      <Wand2 size={20} />
                    </div>
                    <div>
                      <h3 className="text-xl font-serif italic">AI Sound Lab</h3>
                      <p className="text-[9px] text-her-muted uppercase tracking-[0.2em] font-light">Geração de áudio neural</p>
                    </div>
                  </div>
                  <button onClick={() => { setIsAiModalOpen(false); setAiError(null); }} className="p-2 hover:bg-white/[0.03] rounded-full">
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-her-muted mb-3 font-light">O que você deseja ouvir?</label>
                    <textarea 
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Descreva o som... (ex: 'Uma batida de synthwave futurista', 'Efeito de magia sombria', 'Risada robótica maléfica')"
                      className="w-full bg-white/[0.03] border border-white/[0.05] rounded-2xl py-4 px-5 text-sm font-light focus:outline-none focus:border-purple-500/30 min-h-[120px] resize-none leading-relaxed transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setAiPrompt("Batida futurista de ficção científica")}
                      className="p-3 bg-white/[0.03] border border-white/[0.05] rounded-xl text-[10px] text-her-muted hover:text-white hover:bg-white/[0.06] transition-all text-left"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Music2 size={12} className="text-purple-400" />
                        <span className="font-medium text-white/60">Sugerido</span>
                      </div>
                      Ambiental Sci-Fi
                    </button>
                    <button 
                      onClick={() => setAiPrompt("Efeito sonoro épico de impacto cinematográfico")}
                      className="p-3 bg-white/[0.03] border border-white/[0.05] rounded-xl text-[10px] text-her-muted hover:text-white hover:bg-white/[0.06] transition-all text-left"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Square size={12} className="text-her-accent" />
                        <span className="font-medium text-white/60">Sugerido</span>
                      </div>
                      Impacto Épico
                    </button>
                  </div>

                  {aiError && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-300 text-xs rounded-2xl leading-relaxed font-light">
                      <p className="font-bold flex items-center gap-1.5 mb-1.5 text-red-400 uppercase text-[9px] tracking-wider">
                        <span>⚠️ Erro na Síntese Virtual</span>
                      </p>
                      <p>{aiError}</p>
                      <p className="mt-3 text-[10px] text-zinc-400">
                        *Nota: Se sua cota estiver excedida (Limite 429), insira sua própria API Key do Google no painel central de Ajustes.*
                      </p>
                    </div>
                  )}

                  <button 
                    onClick={handleAiGenerate}
                    disabled={!aiPrompt.trim() || isGenerating}
                    className="w-full py-4 bg-gradient-to-r from-purple-500 to-her-accent text-white rounded-2xl text-xs font-medium hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3 group"
                  >
                    {isGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        <span className="tracking-widest uppercase text-[10px]">Sintonizando IA...</span>
                      </>
                    ) : (
                      <>
                        <Brain size={16} className="group-hover:scale-110 transition-transform" />
                        <span className="tracking-widest uppercase text-[10px]">Gerar Áudio com IA</span>
                      </>
                    )}
                  </button>
                  
                  <p className="text-[9px] text-her-muted text-center italic opacity-60">
                    A IA levará alguns segundos para processar os parâmetros e encontrar a frequência ideal.
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-her-bg w-full max-w-sm rounded-[2rem] shadow-2xl p-8 border border-white/[0.1]"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-serif italic">{editingSound ? 'Editar Som' : 'Novo Som'}</h3>
                <button onClick={resetForm} className="p-2 hover:bg-white/[0.03] rounded-full">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex bg-white/[0.03] p-1 mb-2">
                  <button 
                    onClick={() => setUploadType('url')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-4 text-[10px] uppercase tracking-wider transition-all",
                      uploadType === 'url' ? "bg-white/10 text-white" : "text-her-muted hover:text-white/60"
                    )}
                  >
                    <Link size={12} />
                    Link
                  </button>
                  <button 
                    onClick={() => setUploadType('file')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-4 text-[10px] uppercase tracking-wider transition-all",
                      uploadType === 'file' ? "bg-white/10 text-white" : "text-her-muted hover:text-white/60"
                    )}
                  >
                    <Upload size={12} />
                    Arquivo
                  </button>
                </div>

                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-her-muted mb-2 font-light">Nome do Som</label>
                  <input 
                    type="text" 
                    value={newSound.name}
                    onChange={(e) => setNewSound({ ...newSound, name: e.target.value })}
                    placeholder="Ex: Risada Comica"
                    className="w-full bg-white/[0.03] border border-white/[0.05] py-3 px-4 text-sm font-light focus:outline-none focus:border-her-accent/30"
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-her-muted mb-2 font-light">Categoria</label>
                  <select 
                    value={newSound.category}
                    onChange={(e) => setNewSound({ ...newSound, category: e.target.value })}
                    className="w-full bg-white/[0.03] border border-white/[0.05] py-3 px-4 text-sm font-light focus:outline-none focus:border-her-accent/30 appearance-none text-white bg-black/60"
                  >
                    <option value="funny">Funny</option>
                    <option value="comico">Comico</option>
                    <option value="horror">Terror</option>
                    <option value="suspense">Suspense</option>
                    <option value="halloween">Halloween</option>
                    <option value="sneaky">Sneaky</option>
                    <option value="musica">Música</option>
                    <option value="epic">Cinematic / Épico</option>
                    <option value="ambient">Ambient / Relaxante</option>
                    <option value="synth">Synthwave / Futurista</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-her-muted mb-2 font-light">
                    {uploadType === 'url' ? 'URL do Som (MP3/WAV)' : 'Upload de Arquivo (MP3/WAV)'}
                  </label>
                  {uploadType === 'url' ? (
                    <input 
                      type="text" 
                      value={newSound.url}
                      onChange={(e) => setNewSound({ ...newSound, url: e.target.value })}
                      placeholder="https://exemplo.com/som.mp3"
                      className="w-full bg-white/[0.03] border border-white/[0.05] py-3 px-4 text-sm font-light focus:outline-none focus:border-her-accent/30 text-white/90"
                    />
                  ) : (
                    <div className="relative">
                      <input 
                        type="file" 
                        accept="audio/*"
                        onChange={handleFileChange}
                        className="hidden" 
                        id="audio-upload"
                      />
                      <label 
                        htmlFor="audio-upload"
                        className={cn(
                          "w-full flex flex-col items-center justify-center gap-3 p-6 bg-white/[0.03] border-2 border-dashed border-white/[0.05] rounded-2xl cursor-pointer hover:bg-white/[0.05] hover:border-her-accent/30 transition-all",
                          newSound.url && "border-her-accent/50 bg-her-accent/5"
                        )}
                      >
                        {isUploading ? (
                          <div className="animate-spin rounded-full h-6 w-6 border-2 border-her-accent border-t-transparent" />
                        ) : newSound.url ? (
                          <>
                            <div className="p-3 bg-her-accent/20 rounded-full text-her-accent">
                              <Volume2 size={24} />
                            </div>
                            <span className="text-[10px] text-her-accent uppercase tracking-widest">Arquivo Carregado</span>
                          </>
                        ) : (
                          <>
                            <Upload className="text-her-muted" size={24} />
                            <span className="text-[10px] text-her-muted uppercase tracking-widest">Clique para selecionar</span>
                          </>
                        )}
                      </label>
                    </div>
                  )}
                </div>

                <button 
                  onClick={handleAdd}
                  disabled={!newSound.name || !newSound.url || isUploading}
                  className="w-full py-5 bg-her-accent text-white text-xs font-black uppercase tracking-[0.2em] hover:bg-her-accent/90 transition-all disabled:opacity-30 disabled:grayscale mt-4"
                >
                  {isUploading ? 'Processando...' : editingSound ? 'Salvar Alterações' : 'Adicionar à Biblioteca'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: Cadastrar Integrante no Elenco */}
      <AnimatePresence>
        {isAddingCast && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0e0f12]/95 backdrop-blur-xl w-full max-w-sm rounded-[2rem] shadow-2xl p-6 border border-white/[0.1] relative overflow-hidden text-zinc-100"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-serif italic text-white">Cadastrar Integrante do Elenco</h3>
                <button onClick={() => setIsAddingCast(false)} className="p-1 hover:bg-white/[0.05] rounded-full transition-colors cursor-pointer text-zinc-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-zinc-400 mb-2 font-mono">Nome da Pessoa/Integrante</label>
                  <input 
                    type="text" 
                    value={newCastName}
                    onChange={(e) => setNewCastName(e.target.value)}
                    placeholder="Ex: Amanda Silva, Carlos de Souza..."
                    className="w-full bg-white/[0.03] border border-white/[0.06] py-3 px-4 rounded-xl text-xs font-light focus:outline-none focus:border-[#db2777]/50 text-white"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateCastMember()}
                    autoFocus
                  />
                  <p className="text-[9px] text-zinc-500 mt-2 font-sans">
                    💡 Toda vez que o nome deste integrante for citado no chat central, as imagens do seu álbum flutuarão na tela inicial.
                  </p>
                </div>

                <div className="flex gap-2 justify-end pt-2 font-medium">
                  <button 
                    onClick={() => setIsAddingCast(false)}
                    className="px-4 py-2 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium uppercase tracking-wider rounded-lg text-zinc-400 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleCreateCastMember}
                    disabled={!newCastName.trim()}
                    className="px-5 py-2 bg-[#db2777] hover:bg-[#db2777]/90 text-xs font-bold uppercase tracking-wider rounded-lg text-white disabled:opacity-20 transition-all cursor-pointer"
                  >
                    Adicionar ao Elenco
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: Adicionar Nova Mídia ao Álbum */}
      <AnimatePresence>
        {isAddMediaOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0e0f12]/95 backdrop-blur-xl w-full max-w-sm rounded-[2rem] shadow-2xl p-7 border border-white/[0.1] text-zinc-100"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-base font-serif italic text-white flex items-center gap-2">
                    <Camera size={16} className="text-[#f472b6]" />
                    <span>Adicionar Mídia</span>
                  </h3>
                  <p className="text-[8px] text-zinc-400 font-sans uppercase tracking-widest mt-0.5">Álbum do de elenco selecionado</p>
                </div>
                <button onClick={() => { setIsAddMediaOpen(false); setNewMediaDetails({ name: '', type: 'image', url: '' }); }} className="p-1.5 hover:bg-white/[0.05] rounded-full transition-colors cursor-pointer text-zinc-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Method selector */}
                <div className="flex bg-white/[0.03] p-1 border border-white/5 rounded-xl">
                  <button 
                    onClick={() => setMediaUploadType('url')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 text-[9px] uppercase tracking-wider transition-colors rounded-lg font-bold cursor-pointer",
                      mediaUploadType === 'url' ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"
                    )}
                  >
                    <Link size={12} />
                    <span>Link Externo</span>
                  </button>
                  <button 
                    onClick={() => setMediaUploadType('file')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 text-[9px] uppercase tracking-wider transition-colors rounded-lg font-bold cursor-pointer",
                      mediaUploadType === 'file' ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"
                    )}
                  >
                    <Upload size={12} />
                    <span>Upload Arquivo</span>
                  </button>
                </div>

                {/* Media Type */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setNewMediaDetails(prev => ({ ...prev, type: 'image' }))}
                    className={cn(
                      "py-2.5 rounded-xl border text-[9px] uppercase font-bold tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer",
                      newMediaDetails.type === 'image' 
                        ? "bg-[#db2777]/10 border-[#db2777]/30 text-[#f472b6]" 
                        : "bg-white/[0.02] border-white/5 text-zinc-400 hover:bg-white/[0.04]"
                    )}
                  >
                    <Image size={12} />
                    <span>Imagem</span>
                  </button>
                  <button
                    onClick={() => setNewMediaDetails(prev => ({ ...prev, type: 'video' }))}
                    className={cn(
                      "py-2.5 rounded-xl border text-[9px] uppercase font-bold tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer",
                      newMediaDetails.type === 'video' 
                        ? "bg-purple-500/10 border-purple-500/30 text-purple-300" 
                        : "bg-white/[0.02] border-white/5 text-zinc-400 hover:bg-white/[0.04]"
                    )}
                  >
                    <Film size={12} />
                    <span>Vídeo</span>
                  </button>
                </div>

                {/* Name / Label */}
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-zinc-400 mb-1.5 font-mono">Legenda / Nome (Opcional)</label>
                  <input 
                    type="text" 
                    value={newMediaDetails.name}
                    onChange={(e) => setNewMediaDetails({ ...newMediaDetails, name: e.target.value })}
                    placeholder="Ex: Sorriso de Verão"
                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl py-2.5 px-4 text-xs font-light focus:outline-none focus:border-[#db2777]/40 text-white"
                  />
                </div>

                {/* Value Input */}
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-zinc-400 mb-1.5 font-mono">
                    {mediaUploadType === 'url' ? 'URL da Imagem ou do Vídeo' : 'Upload Local de Arquivo'}
                  </label>
                  {mediaUploadType === 'url' ? (
                    <input 
                      type="text" 
                      value={newMediaDetails.url}
                      onChange={(e) => setNewMediaDetails({ ...newMediaDetails, url: e.target.value })}
                      placeholder="https://exemplo.com/foto.jpg"
                      className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl py-2.5 px-4 text-xs font-light focus:outline-none focus:border-[#db2777]/40 text-white"
                    />
                  ) : (
                    <div className="relative">
                      <input 
                        type="file" 
                        accept={newMediaDetails.type === 'image' ? "image/*" : "video/*"}
                        onChange={handleMediaFileChange}
                        className="hidden" 
                        id="media-gallery-upload"
                      />
                      <label 
                        htmlFor="media-gallery-upload"
                        className={cn(
                          "w-full flex flex-col items-center justify-center gap-3 p-5 bg-white/[0.03] border-2 border-dashed border-white/[0.06] rounded-2xl cursor-pointer hover:bg-white/[0.05] hover:border-[#db2777]/30 transition-all text-center",
                          newMediaDetails.url && "border-emerald-500/50 bg-emerald-500/5 text-emerald-400"
                        )}
                      >
                        {isUploadingMedia ? (
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#db2777] border-t-transparent" />
                        ) : newMediaDetails.url ? (
                          <>
                            <div className="p-2 bg-emerald-500/10 rounded-full text-emerald-400 border border-emerald-500/30">
                              <Plus size={16} />
                            </div>
                            <span className="text-[9px] text-emerald-400 uppercase tracking-widest font-bold">Arquivo Carregado!</span>
                          </>
                        ) : (
                          <>
                            <Upload className="text-zinc-500" size={20} />
                            <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-light">Selecione uma {newMediaDetails.type === 'image' ? 'Imagem' : 'Mídia de Vídeo'}</span>
                          </>
                        )}
                      </label>
                    </div>
                  )}
                </div>

                <button 
                  onClick={handleAddMediaToAlbum}
                  disabled={!newMediaDetails.url || isUploadingMedia}
                  className="w-full py-4 bg-gradient-to-r from-purple-500 to-[#db2777] text-white text-xs font-black uppercase tracking-[0.15em] rounded-xl transition-all disabled:opacity-30 disabled:grayscale mt-2 cursor-pointer shadow-lg active:scale-[0.98]"
                >
                  {isUploadingMedia ? 'Processando Arquivo...' : 'Salvar no Álbum'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
