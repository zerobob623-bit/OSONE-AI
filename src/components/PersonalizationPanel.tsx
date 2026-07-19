import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Cpu, 
  Palette, 
  Key, 
  UserCircle, 
  Volume2, 
  Activity, 
  Sliders, 
  Check, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  Copy, 
  ChevronRight,
  Info,
  Video,
  Zap,
  Radio,
  Trash2,
  MessageSquare,
  Eye,
  Heart,
  Users
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ApiKeys, OrbStyle, AppTheme, AIProfile, VoiceModulation } from '../types';

interface PersonalizationPanelProps {
  onMenuClick: () => void;
  onBack: () => void;
  keys: ApiKeys;
  setKeys: (keys: ApiKeys) => void;
  selectedVoice: string;
  setSelectedVoice: (voice: string) => void;
  voiceEngine: 'gemini' | 'elevenlabs';
  setVoiceEngine: (engine: 'gemini' | 'elevenlabs') => void;
  isChatAutoSpeakActive: boolean;
  setIsChatAutoSpeakActive: (active: boolean) => void;
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
  onAddNotification: (msg: string, type: 'success' | 'info' | 'error') => void;
  vocalProfileEscarlate: string;
  setVocalProfileEscarlate: (val: string) => void;
}

type TabId = 'profile' | 'voice' | 'elevenlabs' | 'keys' | 'interface' | 'sync';

export default function PersonalizationPanel({
  onMenuClick,
  onBack,
  keys,
  setKeys,
  selectedVoice,
  setSelectedVoice,
  voiceEngine,
  setVoiceEngine,
  isChatAutoSpeakActive,
  setIsChatAutoSpeakActive,
  voiceModulation,
  setVoiceModulation,
  orbStyle,
  setOrbStyle,
  orbSize,
  setOrbSize,
  orbCenterMode,
  setOrbCenterMode,
  appTheme,
  setAppTheme,
  aiProfile,
  setAiProfile,
  onAddNotification,
  vocalProfileEscarlate,
  setVocalProfileEscarlate
}: PersonalizationPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<TabId>('profile');
  const [elVerificationStatus, setElVerificationStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [elVerificationMessage, setElVerificationMessage] = useState('');
  const [geminiVerificationStatus, setGeminiVerificationStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [geminiVerificationMessage, setGeminiVerificationMessage] = useState('');
  
  // Cloud Sync properties
  const [syncLinkId, setSyncLinkId] = useState<string>(() => {
    return localStorage.getItem('osone_sync_link_id') || '';
  });
  const [inputId, setInputId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // Verification for Gemini API Key
  const handleVerifyGemini = async () => {
    if (!keys.gemini || !keys.gemini.trim()) {
      setGeminiVerificationStatus('error');
      setGeminiVerificationMessage('Por favor, configure sua chave de API Gemini antes de validar.');
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

  // Verification for ElevenLabs API Key
  const handleVerifyElevenLabs = async () => {
    if (!keys.elevenLabsApiKey) {
      setElVerificationStatus('error');
      setElVerificationMessage('Por favor, insira uma chave API do Elevenlabs.');
      return;
    }

    setElVerificationStatus('testing');
    setElVerificationMessage('Estabelecendo ponte sináptica premium...');

    try {
      const response = await fetch('/api/elevenlabs/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keys.elevenLabsApiKey })
      });

      const data = await response.json();
      if (response.ok && data.status === 'valid') {
        setElVerificationStatus('success');
        setElVerificationMessage(`Conectado com sucesso como: ${data.username || "Canal Premium"}`);
        onAddNotification("Sintonia Premium ElevenLabs Ativa", "success");
      } else {
        setElVerificationStatus('error');
        setElVerificationMessage(data.error || 'Autenticação recusada pelos servidores Elevenlabs.');
        onAddNotification("Erro ao autenticar ElevenLabs", "error");
      }
    } catch (err) {
      setElVerificationStatus('error');
      setElVerificationMessage('Erro de tráfego de rede ao alcançar o cluster Elevenlabs.');
      onAddNotification("Falha na ponte de rede", "error");
    }
  };

  // Cloud backup & sync features
  const handleBackupToCloudLocal = async () => {
    setIsSyncing(true);
    setSyncStatus('testing');
    setSyncMessage('Codificando e blindando perfil de canais neurais...');
    try {
      const payload: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('osone_')) {
          const val = localStorage.getItem(key);
          if (val) payload[key] = val;
        }
      }

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syncId: syncLinkId || undefined,
          payload
        })
      });

      const data = await response.json();
      if (response.ok && data.status === 'success') {
        setSyncLinkId(data.syncId);
        localStorage.setItem('osone_sync_link_id', data.syncId);
        setSyncStatus('success');
        setSyncMessage(`Sincronização concluída! Link Neural ativo: ${data.syncId}`);
        onAddNotification(`Conexão salva sob o ID: ${data.syncId}`, 'success');
      } else {
        setSyncStatus('error');
        setSyncMessage(data.error || 'Erro ao sincronizar dados com o canal neural.');
      }
    } catch (err) {
      setSyncStatus('error');
      setSyncMessage('Erro de rede: canal de comunicação offline.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestoreFromCloudLocal = async () => {
    if (!inputId.trim()) {
      setSyncStatus('error');
      setSyncMessage('Insira um ID de Conexão Neural válido.');
      return;
    }
    setIsSyncing(true);
    setSyncStatus('testing');
    setSyncMessage('Baixando dados e restabelecendo sinapses do OSONE...');
    try {
      const cleanedId = inputId.trim().toUpperCase();
      const response = await fetch(`/api/memory-sync/load/${cleanedId}`);
      const data = await response.json();
      
      if (response.ok && data.status === 'success') {
        const payload = data.payload;
        
        Object.keys(payload).forEach(key => {
          if (key.startsWith('osone_')) {
            localStorage.setItem(key, payload[key]);
          }
        });
        
        // Triggers immediate real-time updates of keys and values
        const parsedKeys = payload['osone_api_keys'] ? JSON.parse(payload['osone_api_keys']) : null;
        if (parsedKeys) setKeys(parsedKeys);
        
        const voiceEngineVal = payload['osone_voice_engine'];
        if (voiceEngineVal === 'gemini' || voiceEngineVal === 'elevenlabs') setVoiceEngine(voiceEngineVal as any);

        const selVoiceVal = payload['osone_selected_voice'];
        if (selVoiceVal) setSelectedVoice(selVoiceVal);

        const autoSpeakVal = payload['osone_chat_auto_speak'];
        if (autoSpeakVal) setIsChatAutoSpeakActive(autoSpeakVal === 'true');

        const voiceModVal = payload['osone_voice_modulation'] ? JSON.parse(payload['osone_voice_modulation']) : null;
        if (voiceModVal) setVoiceModulation(voiceModVal);

        const orbStyleVal = payload['osone_orb_style'] as OrbStyle;
        if (orbStyleVal) setOrbStyle(orbStyleVal);

        const orbSizeVal = payload['osone_orb_size'];
        if (orbSizeVal) setOrbSize(parseInt(orbSizeVal, 10));

        const orbCenterModeVal = payload['osone_orb_center_mode'];
        if (orbCenterModeVal && setOrbCenterMode) setOrbCenterMode(orbCenterModeVal === 'true');

        const aiProfileVal = payload['osone_ai_profile'] ? JSON.parse(payload['osone_ai_profile']) : null;
        if (aiProfileVal) setAiProfile(aiProfileVal);
        
        setSyncLinkId(cleanedId);
        localStorage.setItem('osone_sync_link_id', cleanedId);
        setSyncStatus('success');
        setSyncMessage('Sinapses restauradas com sucesso!');
        onAddNotification("Canal Neural sincronizado e ativo", "success");
      } else {
        setSyncStatus('error');
        setSyncMessage(data.error || 'Chave de conexão não encontrada nos canais neurais.');
      }
    } catch (err) {
      setSyncStatus('error');
      setSyncMessage('Não foi possível estabelecer comunicação de download.');
    } finally {
      setIsSyncing(false);
    }
  };

  const copySyncIdToClipboard = () => {
    if (!syncLinkId) return;
    navigator.clipboard.writeText(syncLinkId);
    setIsCopied(true);
    onAddNotification("Link de Conexão Neural copiado", "info");
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="w-full flex-1 flex flex-col md:flex-row h-full overflow-y-auto bg-gradient-to-b from-[#0b0b0b] to-[#040404]">
      {/* Sidebar de sub-navegação dos ajustes */}
      <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/[0.05] p-5 flex flex-col gap-1.5 shrink-0">
        <div className="flex items-center gap-3 mb-6">
          <button 
            type="button"
            onClick={onBack}
            className="p-2 bg-white/[0.03] hover:bg-white/[0.05] rounded-xl transition-all text-her-muted border border-white/[0.05]"
          >
            <ChevronRight size={14} className="rotate-180" />
          </button>
          <div className="text-left">
            <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-white">Painel OSONE</h2>
            <p className="text-[10px] text-her-muted">Voz, Perfil & Inteligência</p>
          </div>
        </div>

        {[
          { id: 'profile', label: 'Perfil & Identidade', icon: UserCircle },
          { id: 'voice', label: 'Sintonia de Voz', icon: Volume2 },
          { id: 'keys', label: 'Chaves & APIs', icon: Key },
          { id: 'interface', label: 'Estética do Orb', icon: Sliders },
        ].map((subTab) => {
          const isActive = activeSubTab === subTab.id;
          return (
            <button
              key={subTab.id}
              onClick={() => setActiveSubTab(subTab.id as TabId)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all text-xs font-medium text-left border relative",
                isActive 
                  ? "bg-her-accent/10 border-her-accent/20 text-her-accent shadow-[0_4px_20px_rgba(255,78,0,0.05)] font-bold" 
                  : "bg-transparent border-transparent text-her-muted hover:text-white hover:bg-white/[0.02]"
              )}
            >
              <subTab.icon size={15} className={cn("transition-colors", isActive ? "text-her-accent" : "text-her-muted/60")} />
              <span>{subTab.label}</span>
              {isActive && (
                <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-her-accent" />
              )}
            </button>
          );
        })}
        
        <div className="mt-auto hidden md:block pt-4 border-t border-white/[0.03] text-center">
          <p className="text-[9px] text-her-muted/20 uppercase tracking-[0.1em] font-bold">OSONE Conscious Node</p>
        </div>
      </div>

      {/* Conteúdo dinâmico do sub-tab */}
      <div className="flex-1 p-6 md:p-8 space-y-6">
        <AnimatePresence mode="wait">
          {activeSubTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="space-y-6 max-w-2xl mx-auto"
            >
              <div>
                <h3 className="text-base font-bold uppercase tracking-wider text-white">Identidade da Inteligência</h3>
                <p className="text-xs text-her-muted/60 mt-1">Dite as regras de consciência e os dados analíticos de personalidade do assistente.</p>
              </div>

              <div className="space-y-5 bg-white/[0.01] border border-white/[0.03] p-6 rounded-3xl">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-her-muted mb-2 font-bold select-none">Nome da IA</label>
                  <input 
                    type="text"
                    value={aiProfile.name}
                    onChange={(e) => setAiProfile({ ...aiProfile, name: e.target.value })}
                    className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-4 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-white placeholder:text-her-muted/20"
                    placeholder="Ex: OSONE, EREBUS, JARVIS..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-her-muted mb-2 font-bold select-none">Personalidade e Essência</label>
                  <textarea 
                    value={aiProfile.personality}
                    onChange={(e) => setAiProfile({ ...aiProfile, personality: e.target.value })}
                    className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-4 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-white min-h-[120px] resize-none leading-relaxed placeholder:text-her-muted/20"
                    placeholder="Descreva as instruções fundamentais e os filtros cognitivos que moldam o comportamento da IA..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-her-muted mb-2 font-bold select-none">Jeito de Escrever / Tom de Voz</label>
                  <textarea 
                    value={aiProfile.writingStyle}
                    onChange={(e) => setAiProfile({ ...aiProfile, writingStyle: e.target.value })}
                    className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-4 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-white min-h-[90px] resize-none leading-relaxed placeholder:text-her-muted/20"
                    placeholder="Ex: Respostas curtas, focado em códigos lógicos, tom profissional ou informal..."
                  />
                </div>
              </div>

              {/* Obsidian Integration */}
              <div className="bg-white/[0.01] border border-white/[0.03] p-6 rounded-3xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-purple-400" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 0L2.5 4.5V19.5L12 24L21.5 19.5V4.5L12 0ZM19.5 18.25L12 21.75L4.5 18.25V5.75L12 2.25L19.5 5.75V18.25Z" />
                      <path d="M12 5.5L7.5 8V16L12 18.5L16.5 16V8L12 5.5ZM15 15.25L12 17L9 15.25V8.75L12 7L15 8.75V15.25Z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-purple-400">Obsidian Sync</h4>
                    <p className="text-[10px] text-her-muted">Sincronize pensamentos e anotações diretamente no seu Obsidian local.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-her-muted mb-1.5 ml-1 uppercase font-bold tracking-wider">REST API Url (Local)</label>
                    <input 
                      type="text"
                      value={aiProfile.obsidianConfig?.baseUrl || ''}
                      onChange={(e) => setAiProfile({ 
                        ...aiProfile, 
                        obsidianConfig: { ...(aiProfile.obsidianConfig || { apiKey: '' }), baseUrl: e.target.value } 
                      })}
                      className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 focus:outline-none focus:border-her-accent/20 transition-all text-xs font-mono text-white"
                      placeholder="http://127.0.0.1:27123"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-her-muted mb-1.5 ml-1 uppercase font-bold tracking-wider">Obsidian API Key</label>
                    <input 
                      type="password"
                      value={aiProfile.obsidianConfig?.apiKey || ''}
                      onChange={(e) => setAiProfile({ 
                        ...aiProfile, 
                        obsidianConfig: { ...(aiProfile.obsidianConfig || { baseUrl: '' }), apiKey: e.target.value } 
                      })}
                      className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3 focus:outline-none focus:border-her-accent/20 transition-all text-xs font-mono text-white"
                      placeholder="Sua chave de acesso ao vault local..."
                    />
                  </div>
                </div>
                <p className="text-[10px] text-her-muted/40 italic mt-1 leading-relaxed">
                  Necessário o plugin desenvolvido pela comunidade "Local REST API" ativo no Obsidian para habilitar leitura e escrita sincronizadas dentro de notas locais.
                </p>
              </div>
            </motion.div>
          )}

          {activeSubTab === 'voice' && (
            <motion.div
              key="voice"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="space-y-6 max-w-2xl mx-auto"
            >
              <div>
                <h3 className="text-base font-bold uppercase tracking-wider text-white">Sintonia e Timbre de Voz</h3>
                <p className="text-xs text-her-muted/60 mt-1">Personalize os moduladores de frequência e as vozes sintéticas.</p>
              </div>

              <div className="space-y-6 bg-white/[0.01] border border-white/[0.03] p-6 rounded-3xl">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-her-muted mb-4 font-bold select-none">Voz Ativa do Sistema</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {['Kore', 'Puck', 'Charon', 'Fenrir', 'Scarlet'].map((voice) => (
                      <button
                        key={voice}
                        onClick={() => setSelectedVoice(voice)}
                        className={cn(
                          "px-4 py-3.5 rounded-2xl text-xs font-light transition-all border text-left flex items-center justify-between group cursor-pointer",
                          selectedVoice === voice 
                            ? "bg-her-accent/15 text-her-accent border-her-accent/30 font-bold" 
                            : "bg-white/[0.01] text-her-muted border-white/[0.03] hover:bg-white/[0.03] hover:text-white",
                          voice === 'Scarlet' && "border-cyan-950 hover:border-cyan-500/30"
                        )}
                      >
                        <span className={cn(voice === 'Scarlet' && "text-cyan-400 font-medium")}>{voice === 'Scarlet' ? 'Sensus' : voice}</span>
                        {selectedVoice === voice && (
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.5)]",
                            voice === 'Scarlet' ? "bg-cyan-500 shadow-cyan-500/50" : "bg-her-accent"
                          )} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedVoice === 'Scarlet' && (
                  <div className="mt-3 p-4 bg-cyan-950/10 border border-cyan-900/30 rounded-2xl space-y-2 animate-fadeIn text-left">
                    <label className="block text-[10px] uppercase tracking-[0.15em] text-cyan-400 font-bold select-none">
                      Perfil Vocal do Modo Sensus (Quantum)
                    </label>
                    <textarea
                      value={vocalProfileEscarlate}
                      onChange={(e) => setVocalProfileEscarlate(e.target.value)}
                      rows={2}
                      placeholder="Ex: voz profunda, ressonante, pausada, de sabedoria cósmica, misteriosa... "
                      className="w-full bg-[#0a0a0a]/80 border border-cyan-900/20 rounded-xl px-4 py-3 focus:outline-none focus:border-cyan-500 text-xs text-cyan-100 placeholder-cyan-900/40 resize-none font-sans"
                    />
                    <p className="text-[9.5px] text-cyan-850/80 leading-normal">
                      Descreva os atributos acústicos do Osone Sensus. O motor neural adaptará a pronúncia por inteligência quântica para ressoar as características fornecidas acima.
                    </p>
                  </div>
                )}

                {/* Auto Speak Option */}
                <div className="flex items-center justify-between bg-white/[0.01] p-4 rounded-2xl border border-white/[0.04]">
                  <div className="flex flex-col text-left space-y-1 pr-4">
                    <span className="text-xs text-zinc-200 font-bold flex items-center gap-1.5 align-middle select-none">
                      <Volume2 size={13} className="text-her-accent" />
                      Auto-Leitura de Respostas
                    </span>
                    <span className="text-[10px] text-her-muted select-none leading-relaxed">
                      Sempre que o chat receber uma resposta escrita, o OSONE fará a leitura falada simultaneamente em formato neural.
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const newState = !isChatAutoSpeakActive;
                      setIsChatAutoSpeakActive(newState);
                      onAddNotification(newState ? "Leitura do chat ativada" : "Leitura do chat desativada", "info");
                    }}
                    className={cn(
                      "w-10 h-5 rounded-full transition-all duration-300 relative flex items-center p-0.5 cursor-pointer shrink-0",
                      isChatAutoSpeakActive ? "bg-her-accent" : "bg-white/10"
                    )}
                  >
                    <span className={cn(
                      "w-4 h-4 rounded-full bg-white transition-all block shadow-sm",
                      isChatAutoSpeakActive ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
                </div>
              </div>

              {/* Slider Controls for Modulating TTS voices (classic WebSpeech modulation) */}
              <div className="bg-white/[0.01] border border-white/[0.03] p-6 rounded-3xl space-y-6">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] uppercase tracking-widest text-her-muted font-bold select-none">Modulador Adaptativo</label>
                  <button 
                    onClick={() => setVoiceModulation({ pitch: 1.0, rate: 1.0, distortion: 0 })}
                    className="text-[9px] uppercase tracking-widest text-her-accent hover:underline font-bold"
                  >
                    Resetar Sinal
                  </button>
                </div>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-her-muted/65 font-medium select-none">
                      <span>Tonalidade (Pitch)</span>
                      <span className="text-her-accent font-mono">{voiceModulation.pitch.toFixed(2)}x</span>
                    </div>
                    <input 
                      type="range" min="0.5" max="2.0" step="0.05"
                      value={voiceModulation.pitch}
                      onChange={(e) => setVoiceModulation({ ...voiceModulation, pitch: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-white/[0.06] rounded-lg appearance-none cursor-pointer accent-her-accent"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-her-muted/65 font-medium select-none">
                      <span>Velocidade de Dicção (Rate)</span>
                      <span className="text-her-accent font-mono">{voiceModulation.rate.toFixed(2)}x</span>
                    </div>
                    <input 
                      type="range" min="0.5" max="2.0" step="0.05"
                      value={voiceModulation.rate}
                      onChange={(e) => setVoiceModulation({ ...voiceModulation, rate: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-white/[0.06] rounded-lg appearance-none cursor-pointer accent-her-accent"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-her-muted/65 font-medium select-none">
                      <span>Distorção Epitelial (Ruído Sintético)</span>
                      <span className="text-her-accent font-mono">{Math.round(voiceModulation.distortion * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.01"
                      value={voiceModulation.distortion}
                      onChange={(e) => setVoiceModulation({ ...voiceModulation, distortion: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-white/[0.06] rounded-lg appearance-none cursor-pointer accent-her-accent"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSubTab === 'keys' && (
            <motion.div
              key="keys"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="space-y-6 max-w-2xl mx-auto"
            >
              <div>
                <h3 className="text-base font-bold uppercase tracking-wider text-white">Central de Chaves & APIs</h3>
                <p className="text-xs text-her-muted/60 mt-1">Configure suas chaves de API para Google Gemini, ElevenLabs e Google Custom Search na mesma página.</p>
              </div>

              {/* Gemini Section */}
              <div className="space-y-5 bg-white/[0.01] border border-white/[0.03] p-6 rounded-3xl">
                <div className="flex items-center gap-2 mb-1">
                  <Key size={13} className="text-her-accent" />
                  <h4 className="text-xs font-bold uppercase tracking-widest text-[#efefef]">Google Gemini API</h4>
                </div>
                
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-her-muted/60 mb-2 font-bold select-none">Gemini API Key</label>
                  <input 
                    type="password"
                    value={keys.gemini}
                    onChange={(e) => setKeys({ ...keys, gemini: e.target.value })}
                    className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-4 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-mono text-white placeholder:text-her-muted/20"
                    placeholder="Insira sua API Key do Gemini..."
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

                  <div className="flex flex-col gap-2.5 mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={14} className="text-amber-400 shrink-0 animate-pulse" />
                      <span className="text-xs font-bold text-amber-200">Atenção: Limite de Cota do Servidor (Erro 429)</span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed font-sans">
                      Se você está visualizando erros de <strong>Quota Exceeded (Erro 429)</strong> ou limite de taxa neural nas conversas, significa que a chave de API padrão embutida no servidor atingiu as cotas limites de uso coletivos da plataforma.
                    </p>
                    <p className="text-[11px] text-zinc-400 leading-relaxed font-sans mt-0.5">
                      <strong>Para resolver instantaneamente:</strong> Você pode criar sua própria chave de API individual de forma <strong>100% gratuita</strong> no Google AI Studio em menos de 1 minuto:
                    </p>
                    <div className="flex flex-col gap-1.5 pl-2 font-sans text-[11px] text-zinc-400">
                      <div>1. Acesse o site do <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline font-bold">Google AI Studio ↗</a></div>
                      <div>2. Faça login com sua conta Google e clique em <strong>"Get API Key"</strong></div>
                      <div>3. Crie uma nova chave, cole no campo acima e clique em <strong>"Testar Handshake Gemini"</strong></div>
                    </div>
                  </div>
                </div>

                {/* Seletor de Modelo */}
                <div className="pt-2 border-t border-white/[0.03]">
                  <div className="flex items-center gap-2 mb-3">
                    <Cpu size={12} className="text-her-accent" />
                    <label className="block text-[10px] uppercase tracking-widest text-her-muted font-bold">Modelo Construtor Preferencial</label>
                  </div>
                  <div className="grid grid-cols-3 gap-2 bg-white/[0.01] border border-white/[0.04] p-1.5 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setKeys({ ...keys, geminiModel: 'gemini-3.5-flash' })}
                      className={cn(
                        "py-2.5 px-3 rounded-xl text-[11px] font-semibold tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer",
                        (keys.geminiModel === 'gemini-3.5-flash' || !keys.geminiModel)
                          ? "bg-white/[0.08] text-white border border-white/[0.1] font-bold shadow-[0_4px_12px_rgba(255,255,255,0.03)]"
                          : "text-her-muted hover:text-white/80 hover:bg-white/[0.02] border border-transparent"
                      )}
                    >
                      Gemini 3.5
                      {(keys.geminiModel === 'gemini-3.5-flash' || !keys.geminiModel) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-her-accent animate-pulse" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setKeys({ ...keys, geminiModel: 'gemini-3.1-flash-lite' })}
                      className={cn(
                        "py-2.5 px-3 rounded-xl text-[11px] font-semibold tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer",
                        keys.geminiModel === 'gemini-3.1-flash-lite'
                          ? "bg-white/[0.08] text-white border border-white/[0.1] font-bold shadow-[0_4px_12px_rgba(255,255,255,0.03)]"
                          : "text-her-muted hover:text-white/80 hover:bg-white/[0.02] border border-transparent"
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
                        "py-2.5 px-3 rounded-xl text-[11px] font-semibold tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer",
                        keys.geminiModel === 'gemini-2.5-flash'
                          ? "bg-white/[0.08] text-white border border-white/[0.1] font-bold shadow-[0_4px_12px_rgba(255,255,255,0.03)]"
                          : "text-her-muted hover:text-white/80 hover:bg-white/[0.02] border border-transparent"
                      )}
                    >
                      Gemini 2.5
                      {keys.geminiModel === 'gemini-2.5-flash' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-her-accent animate-pulse" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* ElevenLabs Speech API Section */}
              <div className="space-y-5 bg-white/[0.01] border border-white/[0.03] p-6 rounded-3xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <Cpu size={13} className="text-her-accent" />
                    <h4 className="text-xs font-bold uppercase tracking-widest text-[#efefef]">ElevenLabs Speech API</h4>
                  </div>
                  <span className="text-[9px] uppercase font-mono tracking-widest text-zinc-500">SÍNTESE DE VOZ</span>
                </div>

                {/* Status and Brain selector section */}
                <div className="p-5 bg-gradient-to-r from-her-accent/5 to-transparent border border-her-accent/10 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-her-accent animate-pulse" />
                      <div className="text-left">
                        <span className="text-xs font-serif italic text-white block">Cérebro Conversacional</span>
                        <span className="text-[10px] font-mono text-her-accent uppercase tracking-wider font-semibold">Gemini + ElevenLabs Ativo</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-[#efefef]">Voz ElevenLabs</span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextEngine = voiceEngine === 'elevenlabs' ? 'gemini' : 'elevenlabs';
                          setVoiceEngine(nextEngine);
                          onAddNotification(nextEngine === 'elevenlabs' ? "Motor ElevenLabs ativado como canal principal de voz" : "Gemini 3.1 TTS ativado", "info");
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
                  </div>
                  <p className="text-[11px] text-her-muted/80 leading-relaxed font-light text-left">
                    Esta conexão une o poder reflexivo de raciocínio da IA <strong className="text-white">Gemini</strong> para processar, pensar e articular as respostas textuais com a oratória humana hiper-realista dos modelos de locução da <strong className="text-white">ElevenLabs</strong>.
                  </p>
                </div>

                {/* API keys inputs and validation */}
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[10px] uppercase tracking-widest text-her-muted font-bold select-none text-left">Chave de API ElevenLabs</label>
                      <span 
                        className="text-[10px] text-her-accent font-medium hover:underline cursor-pointer flex items-center gap-1"
                        onClick={() => window.open('https://elevenlabs.io', '_blank')}
                      >
                        Obter Chave <Info size={10} />
                      </span>
                    </div>
                    <input 
                      type="password"
                      value={keys.elevenLabsApiKey || ''}
                      onChange={(e) => setKeys({ ...keys, elevenLabsApiKey: e.target.value })}
                      className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-4 focus:outline-none focus:border-her-accent/30 transition-all text-sm font-light text-white placeholder:text-her-muted/20"
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
                    type="button"
                    onClick={handleVerifyElevenLabs}
                    disabled={elVerificationStatus === 'testing'}
                    className={cn(
                      "w-full py-4 rounded-2xl text-[10px] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
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
                        <Activity size={13} />
                        Testar e Validar Conexão ElevenLabs
                      </>
                    )}
                  </button>

                  {elVerificationStatus !== 'idle' && elVerificationMessage && (
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
                      <div className="space-y-1 text-left">
                        <p className="font-medium text-[11px] uppercase tracking-wider">
                          {elVerificationStatus === 'success' ? 'Sucesso de Handshake' : 'Verificação Recusada'}
                        </p>
                        <p className="font-sans text-[11px] opacity-80">{elVerificationMessage}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Advanced Controls & Parameters */}
                <div className="pt-4 border-t border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] uppercase tracking-[0.2em] text-her-muted font-bold">Parâmetros Vocais Avançados (ElevenLabs)</label>
                    <button 
                      type="button"
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

                  <div className="space-y-1.5 text-left">
                    <label className="block text-[9px] uppercase tracking-wider text-her-muted/60 font-bold">Modelo de IA & Latência Verbal</label>
                    <select 
                      value={keys.elevenLabsModel || 'eleven_multilingual_v2'}
                      onChange={(e) => setKeys({ ...keys, elevenLabsModel: e.target.value })}
                      className="w-full bg-[#111111] border border-white/[0.05] rounded-xl px-4 py-3 focus:outline-none focus:border-her-accent/30 text-xs text-zinc-300 custom-select"
                    >
                      <option value="eleven_turbo_v2_5" className="bg-[#111111]">Eleven Turbo v2.5 (Bilateral - Alta Velocidade)</option>
                      <option value="eleven_flash_v2_5" className="bg-[#111111]">Eleven Flash v2.5 (Baixa Latência)</option>
                      <option value="eleven_multilingual_v2" className="bg-[#111111]">Eleven Multilingual v2 (Premium Riqueza Tonal)</option>
                      <option value="eleven_turbo_v2" className="bg-[#111111]">Eleven Turbo v2 (Clássico Rápido)</option>
                    </select>
                  </div>

                  <div className="space-y-4 p-5 bg-white/[0.01] border border-white/[0.03] rounded-2xl">
                    <div className="space-y-2">
                      <div className="flex justify-between text-[11px] text-her-muted/70 uppercase font-medium">
                        <span>Estabilidade (Stability)</span>
                        <span className="text-her-accent font-mono">{(keys.elevenLabsStability ?? 0.5).toFixed(2)}</span>
                      </div>
                      <input 
                        type="range" min="0.0" max="1.0" step="0.05"
                        value={keys.elevenLabsStability ?? 0.5}
                        onChange={(e) => setKeys({ ...keys, elevenLabsStability: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                      />
                      <p className="text-[9px] text-her-muted/40 italic text-left leading-normal">Valores menores geram vozes mais expressivas e dinâmicas, porém menos consistentes.</p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-white/[0.02]">
                      <div className="flex justify-between text-[11px] text-her-muted/70 uppercase font-medium">
                        <span>Fidelidade do Clone (Similarity Boost)</span>
                        <span className="text-her-accent font-mono">{(keys.elevenLabsSimilarityBoost ?? 0.75).toFixed(2)}</span>
                      </div>
                      <input 
                        type="range" min="0.0" max="1.0" step="0.05"
                        value={keys.elevenLabsSimilarityBoost ?? 0.75}
                        onChange={(e) => setKeys({ ...keys, elevenLabsSimilarityBoost: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-her-accent"
                      />
                      <p className="text-[9px] text-her-muted/40 italic text-left leading-normal">Aumente para reforçar a similaridade exata com o clone de voz original cadastrado.</p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-white/[0.02]">
                      <div className="flex justify-between text-[11px] text-her-muted/70 uppercase font-medium">
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
                        <span className="text-[9px] text-her-muted/60 leading-normal">Oferece um boost adicional na inteligibilidade fonética</span>
                      </div>
                      <button
                        type="button"
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
              </div>

              {/* Google Custom Search Section */}
              <div className="space-y-5 bg-white/[0.01] border border-white/[0.03] p-6 rounded-3xl">
                <div className="flex items-center gap-2 mb-1">
                  <Key size={13} className="text-purple-400" />
                  <h4 className="text-xs font-bold uppercase tracking-widest text-[#efefef]">Google Custom Search API</h4>
                </div>
                
                <p className="text-[11px] text-zinc-400 font-sans leading-relaxed text-left">
                  Configure o Custom Search para habilitar buscas na web em tempo real localmente sem depender exclusivamente da pesquisa geradora padrão do Gemini.
                </p>

                <div className="space-y-4">
                  <div className="text-left">
                    <label className="block text-[10px] uppercase tracking-widest text-her-muted/60 mb-2 font-bold select-none">Google Custom Search API Key (Developer Key)</label>
                    <input 
                      type="password"
                      value={keys.googleCustomSearchApiKey || ''}
                      onChange={(e) => setKeys({ ...keys, googleCustomSearchApiKey: e.target.value })}
                      className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-4 focus:outline-none focus:border-purple-500/30 transition-all text-sm font-mono text-white placeholder:text-her-muted/20"
                      placeholder="Ex: AIzaSyD..."
                    />
                  </div>

                  <div className="text-left">
                    <label className="block text-[10px] uppercase tracking-widest text-her-muted/60 mb-2 font-bold select-none">Search Engine ID (CX)</label>
                    <input 
                      type="text"
                      value={keys.googleCustomSearchCx || ''}
                      onChange={(e) => setKeys({ ...keys, googleCustomSearchCx: e.target.value })}
                      className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-4 focus:outline-none focus:border-purple-500/30 transition-all text-sm font-mono text-white placeholder:text-her-muted/20"
                      placeholder="Ex: d18bde89..."
                    />
                  </div>
                </div>
              </div>

              {/* Tavily Search Section */}
              <div className="space-y-5 bg-white/[0.01] border border-white/[0.03] p-6 rounded-3xl">
                <div className="flex items-center gap-2 mb-1">
                  <Key size={13} className="text-cyan-400" />
                  <h4 className="text-xs font-bold uppercase tracking-widest text-[#efefef]">Tavily Search Agent Web API</h4>
                </div>
                
                <p className="text-[11px] text-zinc-400 font-sans leading-relaxed text-left">
                  Habilite o Tavily Search para respostas dinâmicas focadas em agentes de IA. Perfeito para pesquisas técnicas rápidas e busca em tempo real com excelente síntese informativa.
                </p>

                <div className="space-y-4">
                  <div className="text-left">
                    <label className="block text-[10px] uppercase tracking-widest text-her-muted/60 mb-2 font-bold select-none">Tavily API Key (Opcional)</label>
                    <input 
                      type="password"
                      value={keys.tavilyApiKey || ''}
                      onChange={(e) => setKeys({ ...keys, tavilyApiKey: e.target.value })}
                      className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-500/30 transition-all text-sm font-mono text-white placeholder:text-her-muted/20"
                      placeholder="Ex: tvly-..."
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSubTab === 'interface' && (
            <motion.div
              key="interface"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="space-y-6 max-w-2xl mx-auto"
            >
              <div>
                <h3 className="text-base font-bold uppercase tracking-wider text-white">Visual & Estética do Orb</h3>
                <p className="text-xs text-her-muted/60 mt-1">Customize a geometria do pulso sensorial da interface principal.</p>
              </div>

              <div className="space-y-4 bg-white/[0.01] border border-white/[0.03] p-6 rounded-3xl">
                <label className="block text-[10px] uppercase tracking-widest text-her-muted font-bold mb-3 select-none">Formatos Sinápticos do Orb</label>
                <div className="grid grid-cols-2 gap-3">
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
                      onClick={() => {
                        setOrbStyle(styleOption.id as OrbStyle);
                        onAddNotification(`Orb alterado para: ${styleOption.name}`, 'info');
                      }}
                      className={cn(
                        "px-4 py-4 rounded-2xl text-xs font-light transition-all border text-left flex items-center justify-between group cursor-pointer",
                        orbStyle === styleOption.id 
                          ? "bg-her-accent/15 text-her-accent border-her-accent/30 font-bold" 
                          : "bg-white/[0.01] text-her-muted border-white/[0.03] hover:bg-white/[0.03] hover:text-white"
                      )}
                    >
                      <span>{styleOption.name}</span>
                      {orbStyle === styleOption.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-her-accent" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-white/[0.03] space-y-3">
                  <div className="flex justify-between items-center text-[10px] uppercase font-bold text-her-muted tracking-[0.2em] select-none">
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

                <div className="mt-6 pt-6 border-t border-white/[0.03] space-y-3 animate-in fade-in duration-300">
                  <div className="flex justify-between items-center text-[10px] uppercase font-bold text-her-muted tracking-[0.2em] select-none">
                    <span>Centralização do Orb</span>
                    <span className={cn("font-mono tracking-normal text-[10px] uppercase", orbCenterMode ? "text-her-accent" : "text-her-muted/50")}>
                      {orbCenterMode ? "Sempre Centralizado" : "Minimizado no Topo"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 bg-white/[0.01] border border-white/[0.03] p-3 rounded-2xl">
                    <div className="space-y-0.5 text-left">
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
                        orbCenterMode ? "left-5.5" : "left-0.5"
                      )} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSubTab === 'sync' && (
            <motion.div
              key="sync"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="space-y-6 max-w-2xl mx-auto"
            >
              <div>
                <h3 className="text-base font-bold uppercase tracking-wider text-white">Sincronização & Backup de Sinapses</h3>
                <p className="text-xs text-her-muted/60 mt-1">Salve suas preferências e reestabeleça suas pontes neurais em qualquer dispositivo eletrônico.</p>
              </div>

              <div className="space-y-6 bg-white/[0.01] border border-white/[0.03] p-6 rounded-3xl">
                {/* Cloud Saving action */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 bg-white/[0.01] border border-white/[0.05] rounded-2xl">
                  <div className="text-left space-y-1">
                    <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-widest flex items-center gap-1.5">
                      <RefreshCw size={12} className="text-her-accent animate-spin" />
                      Backup Neural Completo
                    </h4>
                    <p className="text-[10px] text-her-muted max-w-md">Salva todo o setup e histórico de conversas do OSONE local em nosso cluster de armazenamento durável.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBackupToCloudLocal}
                    disabled={isSyncing}
                    className="w-full md:w-auto px-5 py-3 bg-her-accent hover:bg-her-accent/90 active:bg-her-accent/80 text-black text-xs font-bold uppercase tracking-widest transition-all rounded-2xl cursor-pointer shrink-0"
                  >
                    {isSyncing ? "Enviando..." : "Salvar na Nuvem"}
                  </button>
                </div>

                {/* Cloud Restoring action */}
                <div className="space-y-4 pt-4 border-t border-white/[0.03]">
                  <h4 className="text-xs font-bold text-[#efefef] uppercase tracking-wider">Restaurar Conectividade OSONE</h4>
                  <p className="text-[10px] text-her-muted leading-relaxed">
                    Insira o ID Criptografado de Conexão recebido anteriormente para sincronizar os dados e restabelecer as sinapses nesta instância.
                  </p>
                  
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={inputId}
                      onChange={(e) => setInputId(e.target.value)}
                      className="flex-1 bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-4 focus:outline-none focus:border-her-accent/20 transition-all text-xs font-mono uppercase text-white"
                      placeholder="Ex: NEURAL-789-ALPHA"
                    />
                    <button
                      type="button"
                      onClick={handleRestoreFromCloudLocal}
                      disabled={isSyncing || !inputId.trim()}
                      className="px-6 py-4 bg-white/[0.03] hover:bg-white/[0.06] active:bg-white/[0.02] border border-white/[0.06] text-white text-xs font-bold uppercase tracking-widest transition-all rounded-2xl cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {isSyncing ? "Sincronizando..." : "Conectar"}
                    </button>
                  </div>
                </div>

                {/* Status indicator message */}
                {syncMessage && (
                  <div className={cn(
                    "flex items-center gap-2.5 p-3.5 rounded-2xl text-[11px] font-medium leading-relaxed mt-2",
                    syncStatus === 'success' && "bg-emerald-500/10 border border-emerald-500/15 text-emerald-400",
                    syncStatus === 'error' && "bg-red-500/10 border border-red-500/15 text-red-400",
                    syncStatus === 'testing' && "bg-white/[0.02] border border-white/[0.05] text-her-muted"
                  )}>
                    {syncStatus === 'testing' ? (
                      <Loader2 size={12} className="animate-spin text-her-accent shrink-0" />
                    ) : syncStatus === 'success' ? (
                      <CheckCircle2 size={13} className="shrink-0" />
                    ) : (
                      <AlertCircle size={13} className="shrink-0" />
                    )}
                    <span>{syncMessage}</span>
                  </div>
                )}

                {/* Display created sync key link ID */}
                {syncLinkId && (
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between gap-3 mt-4">
                    <div className="text-left font-mono text-[11px]">
                      <span className="text-her-muted text-[9px] uppercase tracking-widest block font-bold">Código da Conexão Neural Ativa</span>
                      <span className="text-white text-xs font-bold block mt-0.5 tracking-wider uppercase">{syncLinkId}</span>
                    </div>
                    <button
                      type="button"
                      onClick={copySyncIdToClipboard}
                      className="px-3.5 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl transition-all border border-white/[0.06] text-white cursor-pointer"
                      title="Copiar ID"
                    >
                      {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
