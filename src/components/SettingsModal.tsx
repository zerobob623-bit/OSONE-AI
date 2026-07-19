import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Cpu, Palette, Key, Smartphone, Info, Power, Activity, CheckCircle2, AlertCircle, Loader2, Home, UserCircle, Pin, Volume2, RefreshCw, Copy, Check, Image } from 'lucide-react';
import { cn } from '../lib/utils';
import { ApiKeys, OrbStyle, AppTheme, AIProfile, VoiceModulation } from '../types';
import { googleHomeService } from '../services/googleHomeService';

const VOICE_DETAILS = [
  { id: 'Kore', name: 'Kore', desc: 'Feminina • Doce, expressiva e natural', category: 'Femininas' },
  { id: 'Puck', name: 'Puck', desc: 'Masculina • Divertida, enérgica e jovial', category: 'Masculinas' },
  { id: 'Charon', name: 'Charon', desc: 'Masculina • Amigável, casual e espontânea', category: 'Masculinas' },
  { id: 'Fenrir', name: 'Fenrir', desc: 'Masculina • Poderosa, profunda e imponente', category: 'Masculinas' },
  { id: 'Scarlet', name: 'Sensus (Scarlet)', desc: 'Quântica • Adaptativa, profunda e misteriosa', category: 'Especiais' }
];

type TabId = 'general' | 'elevenlabs' | 'interface' | 'profile' | 'automation' | 'sync';
type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error';

export const SettingsModal = ({ 
  isOpen, 
  onClose, 
  keys, 
  setKeys, 
  selectedVoice, 
  setSelectedVoice,
  voiceEngine,
  setVoiceEngine,
  isChatAutoSpeakActive = false,
  setIsChatAutoSpeakActive,
  voiceModulation,
  setVoiceModulation,
  orbStyle,
  setOrbStyle,
  orbSize = 100,
  setOrbSize,
  orbCenterMode = false,
  setOrbCenterMode,
  appTheme,
  setAppTheme,
  aiProfile,
  setAiProfile,
  onAddNotification,
  onRestoreState,
  vocalProfileEscarlate,
  setVocalProfileEscarlate
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  keys: ApiKeys;
  setKeys: (keys: ApiKeys) => void;
  selectedVoice: string;
  setSelectedVoice: (voice: string) => void;
  voiceEngine: 'gemini' | 'elevenlabs';
  setVoiceEngine: (engine: 'gemini' | 'elevenlabs') => void;
  isChatAutoSpeakActive?: boolean;
  setIsChatAutoSpeakActive?: (active: boolean) => void;
  voiceModulation: VoiceModulation;
  setVoiceModulation: (mod: VoiceModulation) => void;
  orbStyle: OrbStyle;
  setOrbStyle: (style: OrbStyle) => void;
  orbSize: number;
  setOrbSize: (size: number) => void;
  orbCenterMode?: boolean;
  setOrbCenterMode?: (centered: boolean) => void;
  appTheme: AppTheme;
  setAppTheme: (theme: AppTheme) => void;
  aiProfile: AIProfile;
  setAiProfile: (profile: AIProfile) => void;
  onAddNotification?: (msg: string, type: 'success' | 'info' | 'error') => void;
  onRestoreState?: (payload: Record<string, string>) => void;
  vocalProfileEscarlate: string;
  setVocalProfileEscarlate: (val: string) => void;
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [elVerificationStatus, setElVerificationStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [elVerificationMessage, setElVerificationMessage] = useState('');
  const [geminiVerificationStatus, setGeminiVerificationStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [geminiVerificationMessage, setGeminiVerificationMessage] = useState('');

  // ====== NEURAL CONNECTION MEMORY SYNC STATES ======
  const [syncLinkId, setSyncLinkId] = useState<string>(() => {
    return localStorage.getItem('osone_sync_link_id') || '';
  });
  const [inputId, setInputId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // Backup state to Cloud Sync
  const handleBackupToCloud = async (customId?: string) => {
    setIsSyncing(true);
    setSyncStatus('testing');
    setSyncMessage('Codificando e blindando perfil de canais neurais...');
    try {
      // Gather all local storage keys starting with 'osone_'
      const payload: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('osone_')) {
          const val = localStorage.getItem(key);
          if (val) {
            payload[key] = val;
          }
        }
      }

      // Hot-override with current live state props to guarantee zero latency on input values
      payload['osone_api_keys'] = JSON.stringify(keys);
      payload['osone_voice_engine'] = voiceEngine;
      payload['osone_selected_voice'] = selectedVoice;
      payload['osone_chat_auto_speak'] = String(isChatAutoSpeakActive);
      payload['osone_voice_modulation'] = JSON.stringify(voiceModulation);
      payload['osone_orb_style'] = orbStyle;
      payload['osone_orb_size'] = String(orbSize);
      payload['osone_orb_center_mode'] = String(orbCenterMode);
      payload['osone_app_theme'] = appTheme;
      payload['osone_ai_profile'] = JSON.stringify(aiProfile);

      const response = await fetch('/api/memory-sync/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          syncId: customId || syncLinkId || undefined,
          payload
        })
      });

      const data = await response.json();
      if (response.ok && data.status === 'success') {
        setSyncLinkId(data.syncId);
        localStorage.setItem('osone_sync_link_id', data.syncId);
        setSyncStatus('success');
        setSyncMessage(`Sincronização concluída! Link de Conexão Neural ativo: ${data.syncId}`);
        if (onAddNotification) {
          onAddNotification(`Conexão salva sob o ID: ${data.syncId}`, 'success');
        }
      } else {
        setSyncStatus('error');
        setSyncMessage(data.error || 'Erro ao sincronizar dados com o canal neural.');
      }
    } catch (err: any) {
      setSyncStatus('error');
      setSyncMessage('Erro de rede: canal de comunicação offline.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Restore state from Cloud Sync and reboot
  const handleRestoreFromCloud = async (id: string) => {
    if (!id.trim()) {
      setSyncStatus('error');
      setSyncMessage('Insira um ID de Conexão Neural válido.');
      return;
    }
    setIsSyncing(true);
    setSyncStatus('testing');
    setSyncMessage('Baixando dados e restabelecendo sinapses do OSONE...');
    try {
      const cleanedId = id.trim().toUpperCase();
      const response = await fetch(`/api/memory-sync/load/${cleanedId}`);
      const data = await response.json();
      
      if (response.ok && data.status === 'success') {
        const payload = data.payload;
        
        // Save all keys back into localStorage
        Object.keys(payload).forEach(key => {
          if (key.startsWith('osone_')) {
            localStorage.setItem(key, payload[key]);
          }
        });
        
        // Propagate current fields/state values to parent app state immediately
        if (onRestoreState) {
          onRestoreState(payload);
        }
        
        setSyncLinkId(cleanedId);
        localStorage.setItem('osone_sync_link_id', cleanedId);
        setSyncStatus('success');
        setSyncMessage('Sincronia concluída com sucesso! Todos os campos foram preenchidos e a sessão foi restabelecida.');
        
        if (onAddNotification) {
          onAddNotification(`Perfil restaurado! Todas as sinapses e chaves foram preenchidas com sucesso.`, 'success');
        }
        
        // Instead of reloading immediately, let the user see the updated states. 
        // We can reload after a longer delay or not reload at all (giving a seamless experience).
        // Let's reload after 3 seconds so the user can verify the fully populated inputs first!
        setTimeout(() => {
          window.location.reload();
        }, 3000);

      } else {
        setSyncStatus('error');
        setSyncMessage(data.error || 'ID de sincronização inválido ou expirado.');
      }
    } catch (err) {
      setSyncStatus('error');
      setSyncMessage('Erro de rede: sem resposta do canal neural.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTestConnection = async () => {
    setConnectionStatus('testing');
    setConnectionMessage('Iniciando handshake com Google Home Graph...');
    
    try {
      const result = await googleHomeService.verifyConnection(keys);
      if (result.success) {
        setConnectionStatus('connected');
        setConnectionMessage(result.message);
      } else {
        setConnectionStatus('error');
        setConnectionMessage(result.message);
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionMessage('Falha crítica na rede. Tente novamente.');
    }
  };

  const handleVerifyGemini = async () => {
    if (!keys.gemini || !keys.gemini.trim()) {
      setGeminiVerificationStatus('error');
      setGeminiVerificationMessage('Por favor, configure sua chave de API Gemini nos ajustes antes de validar.');
      return;
    }
    setGeminiVerificationStatus('testing');
    setGeminiVerificationMessage('Handshake ativo. Testando cognição do Gemini...');
    try {
      const response = await fetch('/api/gemini/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          geminiApiKey: keys.gemini
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setGeminiVerificationStatus('success');
        setGeminiVerificationMessage(data.message);
        if (onAddNotification) {
          onAddNotification('Handshake Gemini validado com sucesso!', 'success');
        }
      } else {
        setGeminiVerificationStatus('error');
        setGeminiVerificationMessage(data.message || 'Chave do Gemini rejeitada pelos servidores do Google.');
        if (onAddNotification) {
          onAddNotification(data.message || 'Falha ao validar chave API do Gemini.', 'error');
        }
      }
    } catch (err: any) {
      setGeminiVerificationStatus('error');
      setGeminiVerificationMessage('Erro de rede: sem resposta dos servidores do Gemini.');
    }
  };

  const handleVerifyElevenLabs = async () => {
    if (!keys.elevenLabsApiKey || !keys.elevenLabsApiKey.trim()) {
      setElVerificationStatus('error');
      setElVerificationMessage('Por favor, configure sua chave de API ElevenLabs nas configurações antes de validar.');
      return;
    }
    setElVerificationStatus('testing');
    setElVerificationMessage('Handshake local ativo. Solicitando dados detalhados para Elevenlabs...');
    try {
      const response = await fetch('/api/elevenlabs/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          elevenLabsApiKey: keys.elevenLabsApiKey,
          elevenLabsVoiceId: keys.elevenLabsVoiceId
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setElVerificationStatus('success');
        setElVerificationMessage(data.message);
        if (onAddNotification) {
          onAddNotification('Handshake ElevenLabs validado com sucesso!', 'success');
        }
      } else {
        setElVerificationStatus('error');
        setElVerificationMessage(data.message || 'Chave de API ou Voice ID recusados pelo servidor.');
        if (onAddNotification) {
          onAddNotification(data.message || 'Falha ao validar credenciais ElevenLabs.', 'error');
        }
      }
    } catch (err: any) {
      setElVerificationStatus('error');
      setElVerificationMessage('Erro de rede: sem resposta dos servidores de validação.');
    }
  };

  const tabs = [
    { id: 'general', label: 'Chaves', icon: Key },
    { id: 'elevenlabs', label: 'ElevenLabs', icon: Volume2 },
    { id: 'interface', label: 'Interface', icon: Palette },
    { id: 'profile', label: 'Perfil', icon: UserCircle },
    { id: 'automation', label: 'Automação', icon: Cpu },
    { id: 'sync', label: 'Sincronia', icon: RefreshCw },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-md p-0 sm:p-4"
        >
          <motion.div 
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-her-bg w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl border border-white/[0.05] backdrop-blur-2xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-8 pb-4 flex justify-between items-center bg-white/[0.02] border-b border-white/[0.05]">
              <div className="space-y-1">
                <h2 className="text-xl font-serif italic font-light">Configurações</h2>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-her-accent animate-pulse" />
                  <span className="text-[10px] text-her-muted uppercase tracking-[0.2em] font-medium">Osone System v3.0</span>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="p-3 hover:bg-white/[0.03] rounded-full transition-all text-her-muted active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs Navigation */}
            <div className="grid grid-cols-3 gap-1 p-3 bg-white/[0.01] border-b border-white/[0.05]">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabId)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2 transition-all relative rounded-xl border border-transparent cursor-pointer",
                      isActive 
                        ? "text-her-accent bg-her-accent/5 border-her-accent/10 font-bold" 
                        : "text-her-muted opacity-50 hover:opacity-100 hover:bg-white/[0.02]"
                    )}
                  >
                    <Icon size={14} className={isActive ? "animate-pulse mt-0.5" : "mt-0.5"} />
                    <span className="text-[9px] font-bold uppercase tracking-wider">{tab.label}</span>
                  </button>
                );
              })}
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              <AnimatePresence mode="wait">
                {activeTab === 'general' && (
                  <motion.div
                    key="general"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-6"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Key size={12} className="text-her-accent" />
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Gemini API Key</label>
                      </div>
                      <input 
                        type="password"
                        value={keys.gemini}
                        onChange={(e) => setKeys({ ...keys, gemini: e.target.value })}
                        className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-4 focus:outline-none focus:border-her-accent/30 transition-all text-base md:text-sm font-light text-her-ink/80 placeholder:text-her-muted/20"
                        placeholder="Insira sua chave Gemini..."
                      />
                      <button
                        onClick={handleVerifyGemini}
                        disabled={geminiVerificationStatus === 'testing'}
                        className={cn(
                          "w-full mt-3 py-3.5 rounded-2xl text-[10px] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-center gap-2 group cursor-pointer",
                          geminiVerificationStatus === 'testing' ? "bg-white/5 text-her-muted cursor-wait" :
                          geminiVerificationStatus === 'success' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          geminiVerificationStatus === 'error' ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                          "bg-her-accent/10 text-her-accent border border-her-accent/20 hover:bg-her-accent/20 active:scale-[0.98]"
                        )}
                      >
                        {geminiVerificationStatus === 'testing' ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-her-accent" />
                            Validando conexão Gemini...
                          </>
                        ) : geminiVerificationStatus === 'success' ? (
                          <>
                            <CheckCircle2 size={13} className="text-emerald-400" />
                            Handshake Gemini Concluído com Sucesso
                          </>
                        ) : geminiVerificationStatus === 'error' ? (
                          <>
                            <AlertCircle size={13} className="text-red-500" />
                            Falha no Handshake. Tentar Novamente
                          </>
                        ) : (
                          <>
                            <RefreshCw size={13} className="text-her-accent group-hover:rotate-180 transition-transform duration-500" />
                            Testar Handshake Gemini
                          </>
                        )}
                      </button>

                      {geminiVerificationMessage && (
                        <p className={cn(
                          "mt-2 text-[10px] font-mono leading-relaxed p-3 rounded-xl border",
                          geminiVerificationStatus === 'success' ? "bg-emerald-500/5 text-emerald-400/80 border-emerald-500/10" :
                          geminiVerificationStatus === 'error' ? "bg-red-500/5 text-red-400/80 border-red-500/10" :
                          "bg-white/[0.01] text-her-muted border-white/5"
                        )}>
                          {geminiVerificationMessage}
                        </p>
                      )}

                      <p className="mt-3 text-[10px] text-her-muted/40 italic leading-relaxed">
                        Chave necessária para o processamento de linguagem natural, transcrição de voz e visão computacional integrada do OSONE.
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Cpu size={12} className="text-her-accent" />
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Modelo de Inteligência</label>
                      </div>
                      <div className="grid grid-cols-3 gap-2 bg-white/[0.01] border border-white/[0.05] p-1.5 rounded-2xl">
                        <button
                          type="button"
                          onClick={() => setKeys({ ...keys, geminiModel: 'gemini-3.5-flash' })}
                          className={cn(
                            "py-2.5 px-3 rounded-xl text-[11px] font-semibold tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5",
                            (keys.geminiModel === 'gemini-3.5-flash' || !keys.geminiModel)
                              ? "bg-white/[0.08] text-white shadow-lg border border-white/[0.1] font-bold"
                              : "text-her-muted hover:text-white/80 hover:bg-white/[0.03] border border-transparent font-medium"
                          )}
                        >
                          Gemini 3.5 Flash
                          {(keys.geminiModel === 'gemini-3.5-flash' || !keys.geminiModel) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-her-accent animate-pulse" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setKeys({ ...keys, geminiModel: 'gemini-3.1-flash-lite' })}
                          className={cn(
                            "py-2.5 px-3 rounded-xl text-[11px] font-semibold tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5",
                            keys.geminiModel === 'gemini-3.1-flash-lite'
                              ? "bg-white/[0.08] text-white shadow-lg border border-white/[0.1] font-bold"
                              : "text-her-muted hover:text-white/80 hover:bg-white/[0.03] border border-transparent font-medium"
                          )}
                        >
                          Gemini 3.1 Lite
                          {keys.geminiModel === 'gemini-3.1-flash-lite' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-her-accent animate-pulse" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setKeys({ ...keys, geminiModel: 'gemini-2.5-flash' })}
                          className={cn(
                            "py-2.5 px-3 rounded-xl text-[11px] font-semibold tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5",
                            keys.geminiModel === 'gemini-2.5-flash'
                              ? "bg-white/[0.08] text-white shadow-lg border border-white/[0.1] font-bold"
                              : "text-her-muted hover:text-white/80 hover:bg-white/[0.03] border border-transparent font-medium"
                          )}
                        >
                          Gemini 2.5 Flash
                          {keys.geminiModel === 'gemini-2.5-flash' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-her-accent animate-pulse" />
                          )}
                        </button>
                      </div>
                      <p className="mt-3 text-[10px] text-her-muted/40 italic leading-relaxed">
                        Escolha o modelo de inteligência preferencial para geração de código, sugestão de melhorias e chats integrados do OSONE.
                      </p>
                    </div>

                    <div className="mt-5 border-t border-white/5 pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Image size={12} className="text-her-accent" />
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Geração de Imagens (Text-to-Image)</label>
                      </div>
                      <div className="p-3 rounded-2xl bg-white/[0.01] border border-white/[0.05] flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white">Nano Banana 2</p>
                          <p className="text-[10px] text-her-muted/60 font-mono">gemini-3.1-flash-image</p>
                        </div>
                        <span className="p-1 px-2.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase tracking-widest border border-emerald-500/25 flex items-center gap-1.5 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Padrão Ativo
                        </span>
                      </div>
                      <p className="mt-2 text-[10px] text-her-muted/40 italic leading-relaxed">
                        Este é o modelo generativo multimídia mais avançado do ecossistema Gemini para criação e edição de imagens de alta fidelidade e resolução.
                      </p>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'elevenlabs' && (
                  <motion.div
                    key="elevenlabs"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-6"
                  >
                    <div className="p-5 bg-white/[0.02] border border-white/[0.05] rounded-3xl space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-her-accent font-medium">
                          <Volume2 size={15} />
                          <span className="text-xs font-serif italic">Canal de Voz ElevenLabs</span>
                        </div>
                        <button
                          onClick={() => {
                            const nextEngine = voiceEngine === 'elevenlabs' ? 'gemini' : 'elevenlabs';
                            setVoiceEngine(nextEngine);
                            if (onAddNotification) {
                              onAddNotification(nextEngine === 'elevenlabs' ? "Motor ElevenLabs ativado como canal principal de voz" : "Gemini 3.1 TTS ativado", "info");
                            }
                          }}
                          className={cn(
                            "w-10 h-5 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer",
                            voiceEngine === 'elevenlabs' ? "bg-her-accent" : "bg-white/10"
                          )}
                        >
                          <span className={cn(
                            "w-4 h-4 rounded-full bg-white transition-transform block shadow-sm",
                            voiceEngine === 'elevenlabs' ? "translate-x-5" : "translate-x-0"
                          )} />
                        </button>
                      </div>
                      <p className="text-[10px] sm:text-xs text-her-muted/80 leading-relaxed font-light">
                        Ative o motor de síntese de fala mais avançado e realista do mundo para as interações. O handshaking e a latência de resposta dependem do modelo de latência selecionado abaixo.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Chave de API ElevenLabs</label>
                          <span 
                            className="text-[9.5px] text-her-accent font-medium hover:underline cursor-pointer flex items-center gap-1"
                            onClick={() => window.open('https://elevenlabs.io', '_blank')}
                          >
                            Obter Chave <Info size={10} />
                          </span>
                        </div>
                        <input 
                          type="password"
                          value={keys.elevenLabsApiKey || ''}
                          onChange={(e) => setKeys({ ...keys, elevenLabsApiKey: e.target.value })}
                          className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3.5 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-her-ink/80 placeholder:text-her-muted/20"
                          placeholder="Insira sua xi-api-key da Elevenlabs..."
                        />
                      </div>

                      <div className="bg-white/[0.01] border border-white/[0.05] p-4 rounded-3xl space-y-4">
                        <div className="flex flex-col gap-2">
                          <label className="block text-[10px] uppercase tracking-widest text-her-muted font-bold select-none text-left">Selecione a Voz Ativa (ElevenLabs)</label>
                          <div className="grid grid-cols-3 gap-2 p-1 bg-black/40 rounded-2xl border border-white/[0.05]">
                            {(['voice1', 'voice2', 'voice3'] as const).map((v, i) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setKeys({ ...keys, elevenLabsActiveVoice: v })}
                                className={cn(
                                  "py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer",
                                  (keys.elevenLabsActiveVoice || 'voice1') === v 
                                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/30 font-bold" 
                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
                                )}
                              >
                                Voz {i + 1}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-[10px] uppercase tracking-widest text-zinc-400 font-bold select-none text-left">ID da Voz 1 (Principal)</label>
                              <span className="text-[9px] text-her-muted/40 font-mono">Rachel se em branco</span>
                            </div>
                            <input 
                              type="text"
                              value={keys.elevenLabsVoiceId || ''}
                              onChange={(e) => setKeys({ ...keys, elevenLabsVoiceId: e.target.value })}
                              className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-3 focus:outline-none focus:border-rose-500/30 transition-all text-xs font-mono text-zinc-300 placeholder:text-her-muted/25"
                              placeholder="Ex: 21m00Tcm4TlvDq8ikWAM..."
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-[10px] uppercase tracking-widest text-zinc-400 font-bold select-none text-left">ID da Voz 2</label>
                              <span className="text-[9px] text-her-muted/40 font-mono">Opcional</span>
                            </div>
                            <input 
                              type="text"
                              value={keys.elevenLabsVoiceId2 || ''}
                              onChange={(e) => setKeys({ ...keys, elevenLabsVoiceId2: e.target.value })}
                              className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-3 focus:outline-none focus:border-rose-500/30 transition-all text-xs font-mono text-zinc-300 placeholder:text-her-muted/25"
                              placeholder="ID da segunda voz clone..."
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-[10px] uppercase tracking-widest text-zinc-400 font-bold select-none text-left">ID da Voz 3</label>
                              <span className="text-[9px] text-her-muted/40 font-mono">Opcional</span>
                            </div>
                            <input 
                              type="text"
                              value={keys.elevenLabsVoiceId3 || ''}
                              onChange={(e) => setKeys({ ...keys, elevenLabsVoiceId3: e.target.value })}
                              className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-3 focus:outline-none focus:border-rose-500/30 transition-all text-xs font-mono text-zinc-300 placeholder:text-her-muted/25"
                              placeholder="ID da terceira voz clone..."
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleVerifyElevenLabs}
                        disabled={elVerificationStatus === 'testing'}
                        className={cn(
                          "w-full py-3.5 rounded-2xl text-[10px] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-center gap-2 group",
                          elVerificationStatus === 'testing' ? "bg-white/5 text-her-muted cursor-wait" :
                          elVerificationStatus === 'success' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          elVerificationStatus === 'error' ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                          "bg-her-accent/10 text-her-accent border border-her-accent/20 hover:bg-her-accent/20 active:scale-[0.98]"
                        )}
                      >
                        {elVerificationStatus === 'testing' ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-her-accent" />
                            Validando conexão ElevenLabs...
                          </>
                        ) : elVerificationStatus === 'success' ? (
                          <>
                            <CheckCircle2 size={13} className="text-emerald-400" />
                            Conexão Estabelecida com Sucesso
                          </>
                        ) : elVerificationStatus === 'error' ? (
                          <>
                            <AlertCircle size={13} className="text-red-500" />
                            Falha na Conexão. Tentar Novamente
                          </>
                        ) : (
                          <>
                            <Activity size={13} className="group-hover:animate-pulse" />
                            Testar e Validar Conexão
                          </>
                        )}
                      </button>

                      {elVerificationStatus !== 'idle' && (
                        <div className={cn(
                          "p-4 rounded-2xl text-xs leading-relaxed font-light flex items-start gap-3 border animate-in fade-in slide-in-from-top-2 duration-200",
                          elVerificationStatus === 'success' ? "bg-emerald-500/5 text-emerald-300/90 border-emerald-500/10" :
                          "bg-red-500/5 text-red-300/95 border-red-500/10"
                        )}>
                          {elVerificationStatus === 'success' ? (
                            <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-400" />
                          ) : (
                            <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-400" />
                          )}
                          <div className="space-y-1">
                            <p className="font-medium text-[11px] uppercase tracking-wider">
                              {elVerificationStatus === 'success' ? 'Sucesso de Handshake' : 'Verificação Recusada'}
                            </p>
                            <p className="font-sans text-[11px] opacity-80">{elVerificationMessage}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-white/5 space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Parâmetros de Ajuste Vocal</label>
                        <button 
                          onClick={() => setKeys({ 
                            ...keys, 
                            elevenLabsStability: 0.5, 
                            elevenLabsSimilarityBoost: 0.75, 
                            elevenLabsStyle: 0.0,
                            elevenLabsSpeakerBoost: true,
                            elevenLabsModel: 'eleven_multilingual_v2'
                          })}
                          className="text-[9px] uppercase tracking-widest text-her-accent hover:underline font-bold"
                        >
                          Resetar Ajustes
                        </button>
                      </div>
 
                      <div className="space-y-1.5">
                        <label className="block text-[8px] uppercase tracking-wider text-her-muted/60 font-bold">Modelo Língua & Latência</label>
                        <select 
                          value={keys.elevenLabsModel || 'eleven_multilingual_v2'}
                          onChange={(e) => setKeys({ ...keys, elevenLabsModel: e.target.value })}
                          className="w-full bg-[#111111] border border-white/[0.05] rounded-xl px-4 py-3 focus:outline-none focus:border-her-accent/30 text-xs text-zinc-300 custom-select"
                        >
                          <option value="eleven_turbo_v2_5" className="bg-[#111111]">Eleven Turbo v2.5 (Bilateral - Recom. Baixa Latência)</option>
                          <option value="eleven_flash_v2_5" className="bg-[#111111]">Eleven Flash v2.5 (Altíssima Velocidade)</option>
                          <option value="eleven_multilingual_v2" className="bg-[#111111]">Eleven Multilingual v2 (Premium Riqueza Tonal)</option>
                          <option value="eleven_turbo_v2" className="bg-[#111111]">Eleven Turbo v2 (Clássico Rápido)</option>
                        </select>
                      </div>

                      <div className="space-y-4 p-5 bg-white/[0.01] border border-white/[0.03] rounded-3xl">
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] text-her-muted/70 uppercase font-medium">
                            <span>Estabilidade (Stability)</span>
                            <span className="text-her-accent font-mono">{(keys.elevenLabsStability ?? 0.5).toFixed(2)}</span>
                          </div>
                          <input 
                            type="range" min="0.0" max="1.0" step="0.05"
                            value={keys.elevenLabsStability ?? 0.5}
                            onChange={(e) => setKeys({ ...keys, elevenLabsStability: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                          />
                          <p className="text-[8.5px] text-her-muted/40 italic">Valores menores geram vozes mais expressivas e dinâmicas, porém menos consistentes.</p>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-white/[0.02]">
                          <div className="flex justify-between text-[10px] text-her-muted/70 uppercase font-medium">
                            <span>Fidelidade (Similarity Boost)</span>
                            <span className="text-her-accent font-mono">{(keys.elevenLabsSimilarityBoost ?? 0.75).toFixed(2)}</span>
                          </div>
                          <input 
                            type="range" min="0.0" max="1.0" step="0.05"
                            value={keys.elevenLabsSimilarityBoost ?? 0.75}
                            onChange={(e) => setKeys({ ...keys, elevenLabsSimilarityBoost: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                          />
                          <p className="text-[8.5px] text-her-muted/40 italic">Aumente para reforçar a similaridade exata com o clone de voz original cadastrado.</p>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-white/[0.02]">
                          <div className="flex justify-between text-[10px] text-her-muted/70 uppercase font-medium">
                            <span>Exagero de Estilo (Style Out)</span>
                            <span className="text-her-accent font-mono">{(keys.elevenLabsStyle ?? 0.0).toFixed(2)}</span>
                          </div>
                          <input 
                            type="range" min="0.0" max="1.0" step="0.05"
                            value={keys.elevenLabsStyle ?? 0.0}
                            onChange={(e) => setKeys({ ...keys, elevenLabsStyle: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-white/[0.02]">
                          <div className="flex flex-col text-left space-y-0.5">
                            <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider">Impulso de Locução (Speaker Boost)</span>
                            <span className="text-[8.5px] text-her-muted/60 leading-normal">Oferece um boost adicional na inteligibilidade fonética</span>
                          </div>
                          <button
                            onClick={() => setKeys({ ...keys, elevenLabsSpeakerBoost: !(keys.elevenLabsSpeakerBoost ?? true) })}
                            className={cn(
                              "w-10 h-5 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer",
                              (keys.elevenLabsSpeakerBoost ?? true) ? "bg-her-accent" : "bg-white/10"
                            )}
                          >
                            <span className={cn(
                              "w-4 h-4 rounded-full bg-white transition-transform block shadow-sm",
                              (keys.elevenLabsSpeakerBoost ?? true) ? "translate-x-5" : "translate-x-0"
                            )} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'interface' && (
                  <motion.div
                    key="interface"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-8"
                  >
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Voz do Sistema (Frequência Gemini Live)</label>
                        
                        <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1.5 custom-scrollbar">
                          {['Femininas', 'Masculinas', 'Especiais'].map((cat) => {
                            const catVoices = VOICE_DETAILS.filter(v => v.category === cat);
                            if (catVoices.length === 0) return null;
                            return (
                              <div key={cat} className="space-y-2 text-left">
                                <span className="block text-[8.5px] uppercase tracking-[0.15em] text-her-muted/65 font-bold mb-1.5 select-none">{cat}</span>
                                <div className="grid grid-cols-2 gap-2">
                                  {catVoices.map((v) => (
                                    <button
                                      key={v.id}
                                      onClick={() => setSelectedVoice(v.id)}
                                      className={cn(
                                        "px-4 py-3 rounded-2xl transition-all border text-left flex flex-col gap-1.5 group relative overflow-hidden cursor-pointer",
                                        selectedVoice === v.id 
                                          ? "bg-her-accent/10 text-her-accent border-her-accent/30" 
                                          : "bg-white/[0.02] text-her-muted border-white/[0.05] hover:bg-white/[0.05]",
                                        v.id === 'Scarlet' && selectedVoice !== 'Scarlet' && "border-cyan-950/20 hover:border-cyan-500/20 hover:bg-cyan-950/5",
                                        v.id === 'Scarlet' && selectedVoice === 'Scarlet' && "bg-cyan-950/20 text-cyan-400 border-cyan-500/40"
                                      )}
                                    >
                                      <div className="flex items-center justify-between w-full">
                                        <span className={cn(
                                          "text-[11px] font-semibold tracking-wide",
                                          v.id === 'Scarlet' ? "text-cyan-400 font-medium" : "text-zinc-250 transition-colors",
                                          selectedVoice === v.id && (v.id === 'Scarlet' ? "text-cyan-300" : "text-her-accent")
                                        )}>
                                          {v.name}
                                        </span>
                                        {selectedVoice === v.id && (
                                          <div className={cn(
                                            "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(var(--her-accent),0.5)]",
                                            v.id === 'Scarlet' ? "bg-cyan-500 shadow-cyan-500/50" : "bg-her-accent"
                                          )} />
                                        )}
                                      </div>
                                      <span className="text-[9px] text-zinc-400 transition-colors leading-normal font-sans select-none">
                                        {v.desc}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {selectedVoice === 'Scarlet' && (
                          <div className="mt-3 p-4 bg-cyan-950/10 border border-cyan-900/30 rounded-2xl space-y-2 animate-fadeIn text-left">
                            <label className="block text-[9px] uppercase tracking-[0.15em] text-cyan-400 font-bold select-none">
                              Perfil Vocal do Modo Sensus (Quantum)
                            </label>
                            <textarea
                              value={vocalProfileEscarlate}
                              onChange={(e) => setVocalProfileEscarlate(e.target.value)}
                              rows={2}
                              placeholder="Ex: voz profunda, ressonante, pausada, de sabedoria cósmica, misteriosa... "
                              className="w-full bg-[#0a0a0a]/80 border border-cyan-900/20 rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500 text-xs text-cyan-100 placeholder-cyan-900/40 resize-none font-sans"
                            />
                            <p className="text-[8.5px] text-cyan-850/80 leading-normal font-sans">
                              Descreva os atributos acústicos do Osone Sensus. O motor neural adaptará a pronúncia por inteligência quântica para ressoar as características fornecidas acima.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Chat Auto Speak Option */}
                      <div className="flex items-center justify-between bg-white/[0.01]/10 p-4 rounded-3xl border border-white/5">
                        <div className="flex flex-col text-left space-y-0.5">
                          <span className="text-xs text-zinc-300 font-medium select-none flex items-center gap-1.5 align-middle">
                            <Volume2 size={13} className="text-her-accent" />
                            Auto-Leitura de Mensagens
                          </span>
                          <span className="text-[10px] text-her-muted select-none leading-normal">
                            Fala respostas da IA automaticamente no chat principal usando o motor atual
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            if (setIsChatAutoSpeakActive) {
                              const newState = !isChatAutoSpeakActive;
                              setIsChatAutoSpeakActive(newState);
                              if (onAddNotification) {
                                onAddNotification(newState ? "Auto-leitura do chat ativada" : "Auto-leitura do chat desativada", "info");
                              }
                            }
                          }}
                          className={cn(
                            "w-10 h-5 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer",
                            isChatAutoSpeakActive ? "bg-her-accent" : "bg-white/10"
                          )}
                        >
                          <span className={cn(
                            "w-4 h-4 rounded-full bg-white transition-transform block shadow-sm",
                            isChatAutoSpeakActive ? "translate-x-5" : "translate-x-0"
                          )} />
                        </button>
                      </div>

                      <div>
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted mb-4 font-bold">Estilo do Orb de IA</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'classic', name: 'Clássico (Esfera)' },
                            { id: 'wave', name: 'Fluidos (Alabastro)' },
                            { id: 'neural', name: 'Constelação Neural (Padrão)' },
                            { id: 'jarvis', name: 'Jarvis (HUD 3D)' },
                            { id: 'smoke', name: 'Nuvem de Fumaça (Virtual)' },
                            { id: 'shadow', name: 'Osone Sensus (Quântico)' },
                          ].map((styleOption) => (
                            <button
                              key={styleOption.id}
                              onClick={() => setOrbStyle(styleOption.id as OrbStyle)}
                              className={cn(
                                "px-4 py-3 rounded-2xl text-[10px] sm:text-xs font-light transition-all border text-left flex items-center justify-between group",
                                orbStyle === styleOption.id 
                                  ? "bg-her-accent/10 text-her-accent border-her-accent/30" 
                                  : "bg-white/[0.02] text-her-muted border-white/[0.05] hover:bg-white/[0.05]"
                              )}
                            >
                              <span>{styleOption.name}</span>
                              {orbStyle === styleOption.id && (
                                <div className="w-1.5 h-1.5 rounded-full bg-her-accent shadow-[0_0_8px_rgba(var(--her-accent),0.5)]" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-6 pt-6 border-t border-white/[0.03] space-y-3">
                        <div className="flex justify-between items-center text-[10px] uppercase font-bold text-her-muted tracking-[0.2em]">
                          <span>Calibrador de Tamanho do Orb</span>
                          <span className="text-her-accent font-mono tracking-normal lowercase">{orbSize}%</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] text-her-muted/50 font-light font-mono">50%</span>
                          <input 
                            type="range"
                            min="50"
                            max="250"
                            step="5"
                            value={orbSize}
                            onChange={(e) => setOrbSize(Number(e.target.value))}
                            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-her-accent focus:outline-none"
                          />
                          <span className="text-[10px] text-her-muted/50 font-light font-mono">250%</span>
                        </div>
                        <p className="text-[10px] text-her-muted/40 font-light leading-normal">
                          Deslize para calibrar e redimensionar o tamanho físico de todas as interfaces e renderizações do Orb do OSONE.
                        </p>
                      </div>

                      <div className="mt-6 pt-6 border-t border-white/[0.03] space-y-3">
                        <div className="flex justify-between items-center text-[10px] uppercase font-bold text-her-muted tracking-[0.2em]">
                          <span>Centralização do Orb</span>
                          <span className={cn("font-mono tracking-normal text-[10px] uppercase", orbCenterMode ? "text-her-accent" : "text-her-muted/50")}>
                            {orbCenterMode ? "Sempre Centralizado" : "Minimizado no Topo"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 bg-white/[0.01] border border-white/[0.03] p-3 rounded-2xl">
                          <div className="space-y-0.5">
                            <span className="block text-[10px] text-zinc-300 font-medium">Manter Orb no Centro</span>
                            <span className="block text-[9px] text-her-muted/40 font-light leading-normal">
                              Evita que o Orb seja ocultado no topo ao interagir pelo chat de texto.
                            </span>
                          </div>
                          <button
                            onClick={() => setOrbCenterMode && setOrbCenterMode(!orbCenterMode)}
                            className={cn(
                              "w-10 h-5 rounded-full relative transition-colors focus:outline-none cursor-pointer shrink-0",
                              orbCenterMode ? "bg-her-accent" : "bg-white/10"
                            )}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all",
                              orbCenterMode ? "left-55" : "left-0.5"
                            ).replace('left-55', 'left-5.5')} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 bg-white/[0.01] border border-white/[0.03] rounded-3xl space-y-6">
                      <div className="flex items-center justify-between">
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Modulador de Voz</label>
                        <button 
                          onClick={() => setVoiceModulation({ pitch: 1.0, rate: 1.0, distortion: 0 })}
                          className="text-[8px] uppercase tracking-widest text-her-accent hover:underline"
                        >
                          Resetar
                        </button>
                      </div>

                      <div className="space-y-5">
                        <div className="space-y-3">
                          <div className="flex justify-between text-[10px] text-her-muted/60 uppercase font-medium">
                            <span>Tonalidade (Pitch)</span>
                            <span className="text-her-accent">{voiceModulation.pitch.toFixed(2)}x</span>
                          </div>
                          <input 
                            type="range" min="0.5" max="2.0" step="0.05"
                            value={voiceModulation.pitch}
                            onChange={(e) => setVoiceModulation({ ...voiceModulation, pitch: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                          />
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between text-[10px] text-her-muted/60 uppercase font-medium">
                            <span>Velocidade (Rate)</span>
                            <span className="text-her-accent">{voiceModulation.rate.toFixed(2)}x</span>
                          </div>
                          <input 
                            type="range" min="0.5" max="2.0" step="0.05"
                            value={voiceModulation.rate}
                            onChange={(e) => setVoiceModulation({ ...voiceModulation, rate: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                          />
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between text-[10px] text-her-muted/60 uppercase font-medium">
                            <span>Distorção / Ruído</span>
                            <span className="text-her-accent">{Math.round(voiceModulation.distortion * 100)}%</span>
                          </div>
                          <input 
                            type="range" min="0" max="1" step="0.01"
                            value={voiceModulation.distortion}
                            onChange={(e) => setVoiceModulation({ ...voiceModulation, distortion: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'profile' && (
                  <motion.div
                    key="profile"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-6"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <UserCircle size={12} className="text-her-accent" />
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Identidade da Inteligência</label>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] text-her-muted/60 mb-2 ml-1">Nome da IA</label>
                          <input 
                            type="text"
                            value={aiProfile.name}
                            onChange={(e) => setAiProfile({ ...aiProfile, name: e.target.value })}
                            className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-her-ink/80"
                            placeholder="Ex: OSONE, EREBUS, JARVIS..."
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-her-muted/60 mb-2 ml-1">Personalidade e Essência</label>
                          <textarea 
                            value={aiProfile.personality}
                            onChange={(e) => setAiProfile({ ...aiProfile, personality: e.target.value })}
                            className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-her-ink/80 min-h-[100px] resize-none"
                            placeholder="Descreva como a IA deve se comportar..."
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-her-muted/60 mb-2 ml-1">Jeito de Escrever / Tom de Voz</label>
                          <textarea 
                            value={aiProfile.writingStyle}
                            onChange={(e) => setAiProfile({ ...aiProfile, writingStyle: e.target.value })}
                            className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-her-ink/80 min-h-[80px] resize-none"
                            placeholder="Ex: Respostas curtas, uso de gírias, tom acadêmico..."
                          />
                        </div>

                        {/* Obsidian Integration */}
                        <div className="pt-4 border-t border-white/5">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-5 h-5 rounded bg-[#7C3AED]/20 flex items-center justify-center">
                              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-[#7C3AED]" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 0L2.5 4.5V19.5L12 24L21.5 19.5V4.5L12 0ZM19.5 18.25L12 21.75L4.5 18.25V5.75L12 2.25L19.5 5.75V18.25Z" />
                                <path d="M12 5.5L7.5 8V16L12 18.5L16.5 16V8L12 5.5ZM15 15.25L12 17L9 15.25V8.75L12 7L15 8.75V15.25Z" />
                              </svg>
                            </div>
                            <span className="text-[10px] uppercase tracking-widest text-her-accent font-bold">Obsidian Local Sync</span>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="block text-[9px] text-her-muted/50 mb-1 ml-1 uppercase">API Url (Local REST API)</label>
                              <input 
                                type="text"
                                value={aiProfile.obsidianConfig?.baseUrl || ''}
                                onChange={(e) => setAiProfile({ 
                                  ...aiProfile, 
                                  obsidianConfig: { ...(aiProfile.obsidianConfig || { apiKey: '' }), baseUrl: e.target.value } 
                                })}
                                className="w-full bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-2 focus:outline-none focus:border-her-accent/20 transition-all text-[11px] font-mono"
                                placeholder="http://127.0.0.1:27123"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] text-her-muted/50 mb-1 ml-1 uppercase">API Key</label>
                              <input 
                                type="password"
                                value={aiProfile.obsidianConfig?.apiKey || ''}
                                onChange={(e) => setAiProfile({ 
                                  ...aiProfile, 
                                  obsidianConfig: { ...(aiProfile.obsidianConfig || { baseUrl: '' }), apiKey: e.target.value } 
                                })}
                                className="w-full bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-2 focus:outline-none focus:border-her-accent/20 transition-all text-[11px] font-mono"
                                placeholder="Sua chave secreta..."
                              />
                            </div>
                            <p className="text-[9px] text-her-muted/40 italic">
                              Habilite o plugin "Local REST API" no Obsidian para obter estes dados.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'automation' && (
                  <motion.div
                    key="automation"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-8"
                  >
                    <div className="p-6 bg-white/[0.03] border border-white/[0.05] rounded-[2rem] space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-her-accent/10 rounded-2xl">
                          <Home className="text-her-accent" size={24} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-her-ink">Google Home</h3>
                          <p className="text-[10px] text-her-muted uppercase tracking-widest">Sincronização Cloud-to-Cloud</p>
                        </div>
                      </div>
                      <p className="text-xs text-her-muted leading-relaxed font-light">
                        Integre o OSONE à sua infraestrutura Google Home. Controle dispositivos, execute rotinas e monitore sua casa via comandos neurais.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted pl-1 font-bold">Google Project ID</label>
                        <input 
                          type="text"
                          value={keys.googleHomeId || ''}
                          onChange={(e) => setKeys({ ...keys, googleHomeId: e.target.value })}
                          className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-her-ink/80"
                          placeholder="osone-home-automation"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] uppercase tracking-[0.2em] text-her-muted pl-1 font-bold">OAuth Access Token</label>
                        <input 
                          type="password"
                          value={keys.googleHomeToken || ''}
                          onChange={(e) => setKeys({ ...keys, googleHomeToken: e.target.value })}
                          className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-her-ink/80"
                          placeholder="ya29.a0AfH6S..."
                        />
                      </div>
                      
                      <button
                        onClick={handleTestConnection}
                        disabled={connectionStatus === 'testing'}
                        className={cn(
                          "w-full py-3 rounded-2xl text-[10px] uppercase tracking-[0.2em] font-bold transition-all flex items-center justify-center gap-2",
                          connectionStatus === 'testing' ? "bg-white/5 text-her-muted" :
                          connectionStatus === 'connected' ? "bg-green-500/10 text-green-400 border border-green-500/20" :
                          connectionStatus === 'error' ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                          "bg-her-accent/10 text-her-accent border border-her-accent/20 hover:bg-her-accent/20"
                        )}
                      >
                        {connectionStatus === 'testing' ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Verificando...
                          </>
                        ) : connectionStatus === 'connected' ? (
                          <>
                            <CheckCircle2 size={14} />
                            Conta Vinculada
                          </>
                        ) : (
                          <>
                            <Activity size={14} />
                            Verificar Credenciais
                          </>
                        )}
                      </button>

                      {connectionStatus !== 'idle' && (
                      <div className={cn(
                        "px-4 py-3 rounded-xl text-[10px] flex flex-col gap-2 animate-in fade-in slide-in-from-top-1",
                        connectionStatus === 'connected' ? "bg-green-500/5 text-green-400" :
                        connectionStatus === 'error' ? "bg-red-500/5 text-red-400" :
                        "bg-white/5 text-her-muted"
                      )}>
                        <div className="flex items-start gap-2">
                          {connectionStatus === 'error' ? <AlertCircle size={12} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={12} className="shrink-0 mt-0.5" />}
                          <span className="leading-relaxed font-medium uppercase tracking-wider">{connectionMessage}</span>
                        </div>
                        {connectionStatus === 'error' && (
                          <button 
                            onClick={() => {
                              setKeys({ ...keys, googleHomeToken: '' });
                              setConnectionStatus('idle');
                            }}
                            className="text-[8px] uppercase tracking-[0.2em] font-bold text-her-accent hover:underline text-left mt-1"
                          >
                            Recuperar Conta / Limpar Cache
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bg-white/5 p-5 rounded-2xl space-y-3 border border-white/5">
                      <div className="flex items-center gap-2">
                        <Info size={14} className="text-her-accent" />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-her-ink">Guia de Recuperação</span>
                      </div>
                      <ul className="space-y-2 text-[10px] text-her-muted/60 leading-relaxed list-none pl-1">
                        <li className="flex gap-2 border-l border-white/10 pl-3">
                          <span className="text-her-accent font-bold">01</span>
                          Verifique se o seu Token OAuth está ativo no Google Cloud Console.
                        </li>
                        <li className="flex gap-2 border-l border-white/10 pl-3">
                          <span className="text-her-accent font-bold">02</span>
                          Certifique-se de que o "Home Graph API" está habilitado no seu projeto.
                        </li>
                        <li className="flex gap-2 border-l border-white/10 pl-3">
                          <span className="text-her-accent font-bold">03</span>
                          Se o login persistir bloqueado, limpe o token acima e gere um novo.
                        </li>
                      </ul>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'sync' && (
                  <motion.div
                    key="sync"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-6"
                  >
                    <div className="p-6 bg-gradient-to-br from-[#0c0f12] to-[#080d16] border border-white/[0.05] rounded-[2rem] space-y-4 shadow-inner relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-her-accent/5 rounded-full blur-2xl pointer-events-none select-none" />
                      
                      <div className="flex items-center gap-4">
                        <div className="p-3.5 bg-her-accent/10 rounded-2xl border border-her-accent/25 shadow-[0_0_15px_rgba(var(--her-accent),0.1)]">
                          <RefreshCw className="text-her-accent animate-spin" style={{ animationDuration: '8s' }} size={24} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-her-ink">Link de Conexão Neural</h3>
                          <p className="text-[10px] text-her-muted uppercase tracking-widest font-mono">Portabilidade Fina de Memória</p>
                        </div>
                      </div>
                      
                      <p className="text-xs text-her-muted leading-relaxed font-light">
                        Vincule toda a sua experiência OSONE — incluindo <strong>chaves de API</strong>, <strong>histórico total de conversas</strong>, <strong>perfil mental</strong> de IA, <strong>memória de longo prazo</strong> e personalizações — a um único token na nuvem. Use este token em qualquer navegador ou ambiente para restabelecer suas sinapses instantaneamente.
                      </p>
                    </div>

                    {/* SEÇÃO 1: SALVAR / ATUALIZAR CONFIGURAÇÃO NA NUVEM */}
                    <div className="p-5 bg-white/[0.01] border border-white/[0.03] rounded-3xl space-y-4">
                      <span className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold mb-1">Backup e Sincronização de Estado</span>
                      
                      {syncLinkId ? (
                        <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-her-muted font-mono">ID de Conexão Ativo:</span>
                            <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-mono uppercase">Vinculado</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-black border border-white/10 px-4 py-3 rounded-xl font-mono text-xs text-center select-all text-white font-bold uppercase tracking-wider">
                              {syncLinkId}
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(syncLinkId);
                                setIsCopied(true);
                                if (onAddNotification) onAddNotification("ID de Conexão copiado!", "success");
                                setTimeout(() => setIsCopied(false), 2000);
                              }}
                              className="p-3.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 rounded-xl text-her-ink transition active:scale-95 flex items-center justify-center shrink-0"
                              title="Copiar ID de Conexão"
                            >
                              {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-her-accent" />}
                            </button>
                          </div>
                          
                          <p className="text-[9.5px] text-her-muted/40 italic text-center">
                            Compartilhe ou guarde este ID para carregar toda a sua experiência instantaneamente em outro computador ou navegador.
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 bg-white/[0.01] rounded-2xl border border-dashed border-white/10 text-center space-y-1">
                          <p className="text-xs text-her-muted font-light">Nenhum ID de sincronização ativo neste navegador.</p>
                          <p className="text-[10px] text-her-muted/60 font-mono">Crie um canal de Conexão único ao salvar seu estado atual.</p>
                        </div>
                      )}

                      <button
                        onClick={() => handleBackupToCloud()}
                        disabled={isSyncing}
                        className={cn(
                          "w-full py-3.5 rounded-2xl text-[10px] uppercase tracking-[0.2em] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                          isSyncing ? "bg-white/5 text-her-muted cursor-wait" : "bg-her-accent hover:bg-her-accent/80 text-white shadow-lg shadow-her-accent/10 active:scale-[0.98]"
                        )}
                      >
                        {isSyncing ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            Sincronizando Estado...
                          </>
                        ) : (
                          <>
                            <RefreshCw size={13} />
                            {syncLinkId ? 'Sincronizar Atualizações na Nuvem' : 'Gerar ID e Salvar na Nuvem'}
                          </>
                        )}
                      </button>
                    </div>

                    {/* SEÇÃO 2: IMPORTAR / RESTAURAR ID DA NUVEM */}
                    <div className="p-5 bg-white/[0.01] border border-white/[0.03] rounded-3xl space-y-4">
                      <span className="block text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Resgatar Conexão Existente</span>
                      <p className="text-[11px] text-her-muted/70 leading-relaxed font-light">
                        Mudou de navegador ou dispositivo comercial? Cole seu ID de Conexão Neural existente para reviver todas as suas mensagens e chaves.
                      </p>

                      <div className="space-y-2">
                        <input 
                          type="text"
                          value={inputId}
                          onChange={(e) => setInputId(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 font-mono text-sm uppercase tracking-wide focus:outline-none focus:border-her-accent/30 transition-all text-center text-white placeholder:text-her-muted/30"
                          placeholder="EX: OSONE-ABCD-EFGH"
                        />
                      </div>

                      <button
                        onClick={() => handleRestoreFromCloud(inputId)}
                        disabled={isSyncing || !inputId.trim()}
                        className={cn(
                          "w-full py-3.5 rounded-2xl text-[10px] uppercase tracking-[0.2em] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                          (isSyncing || !inputId.trim()) 
                            ? "bg-white/5 text-her-muted/40 cursor-not-allowed" 
                            : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 active:scale-[0.98]"
                        )}
                      >
                        {isSyncing ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-emerald-400" />
                            Injetando Dados...
                          </>
                        ) : (
                          <>
                            <Power size={13} />
                            Desestruturar ID e Reiniciar Sessão
                          </>
                        )}
                      </button>
                    </div>

                    {/* NOTIFICAÇÃO INTERNA DE STATUS */}
                    {syncStatus !== 'idle' && (
                      <div className={cn(
                        "p-4 rounded-2xl text-xs leading-relaxed font-light flex items-start gap-3 border animate-in fade-in slide-in-from-top-2 duration-200",
                        syncStatus === 'success' ? "bg-emerald-500/5 text-emerald-300/90 border-emerald-500/10" :
                        "bg-red-500/5 text-red-300/95 border-red-500/10"
                      )}>
                        {syncStatus === 'success' ? (
                          <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-400" />
                        ) : (
                          <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-400" />
                        )}
                        <div className="space-y-1">
                          <p className="font-medium text-[11px] uppercase tracking-wider">
                            {syncStatus === 'success' ? 'Operação Concluída' : 'Erro de Registro'}
                          </p>
                          <p className="font-sans text-[11px] opacity-80">{syncMessage}</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <div className="p-8 pt-4 bg-white/[0.02] border-t border-white/[0.05]">
              <button 
                onClick={onClose}
                className="group relative w-full bg-her-accent text-white rounded-2xl py-4 font-bold text-xs uppercase tracking-[0.2em] overflow-hidden shadow-lg shadow-her-accent/20 active:scale-95 transition-all"
              >
                <span className="relative z-10">Consolidar Parâmetros</span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>
              <div className="mt-4 text-center">
                <span className="text-[8px] text-her-muted opacity-30 uppercase tracking-[0.3em]">Quantum Encrypted Tunnel Active</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};


