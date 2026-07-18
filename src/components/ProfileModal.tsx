import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Plus, Trash2, Check, Loader2, Cloud, Database, Fingerprint, Heart, Cpu, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { User as UserClass } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserClass | null;
  onSwitchUser: (user: UserClass | null) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
  isAuthLoading: boolean;
  onOpenDossier?: () => void;
  intimateAnswersCount?: number;
  aiDossierType: 'gradual' | 'complete' | null;
  onStartAiDossier: (type: 'gradual' | 'complete') => void;
  onOpenAiDossier: () => void;
}

export const ProfileModal = ({
  isOpen,
  onClose,
  currentUser,
  onSwitchUser,
  onGoogleLogin,
  onLogout,
  isAuthLoading,
  onOpenDossier,
  intimateAnswersCount,
  aiDossierType,
  onStartAiDossier,
  onOpenAiDossier
}: ProfileModalProps) => {
  const [localProfiles, setLocalProfiles] = useState<UserClass[]>([]);
  const [newProfileName, setNewProfileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showInitSelection, setShowInitSelection] = useState(false);
  const [isInitializingDossier, setIsInitializingDossier] = useState(false);
  const [initStageText, setInitStageText] = useState("");

  // Load local profiles on open
  useEffect(() => {
    if (isOpen) {
      try {
        const saved = localStorage.getItem('osone_local_profiles');
        if (saved) {
          setLocalProfiles(JSON.parse(saved));
        } else {
          setLocalProfiles([]);
        }
      } catch (e) {
        console.error("Error reading local profiles", e);
      }
    }
  }, [isOpen]);

  const saveLocalProfiles = (profiles: UserClass[]) => {
    setLocalProfiles(profiles);
    localStorage.setItem('osone_local_profiles', JSON.stringify(profiles));
  };

  const handleCreateLocalProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = newProfileName.trim();
    if (!trimmedName) {
      setErrorMessage("Por favor, digite um nome válido.");
      return;
    }

    if (trimmedName.length > 25) {
      setErrorMessage("O nome do perfil é muito longo (máx 25 caracteres).");
      return;
    }

    // Check for duplicate names
    const isDuplicate = localProfiles.some(
      p => p.displayName.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      setErrorMessage("Já existe um perfil local com este nome.");
      return;
    }

    const newUid = `local_${Math.random().toString(36).substring(2, 11)}`;
    const newProfile: UserClass = {
      uid: newUid,
      displayName: trimmedName,
      email: `${trimmedName.toLowerCase().replace(/\s+/g, '')}@osone.local`,
      isLocal: true
    };

    const updated = [...localProfiles, newProfile];
    saveLocalProfiles(updated);
    setNewProfileName('');

    // Toggle active user to newly created local profile
    await onSwitchUser(newProfile);
  };

  const handleDeleteLocalProfile = (uidToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = localProfiles.filter(p => p.uid !== uidToDelete);
    saveLocalProfiles(updated);

    // If active user was deleted, switch to null (Guest)
    if (currentUser?.uid === uidToDelete) {
      onSwitchUser(null);
    }

    // Clean up local data for deleted user
    try {
      localStorage.removeItem(`osone_user_${uidToDelete}_ai_profile`);
      localStorage.removeItem(`osone_user_${uidToDelete}_health_data`);
      localStorage.removeItem(`osone_user_${uidToDelete}_chat_history`);
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Form */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]"
        >
          {/* Top colored accent line */}
          <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-her-accent to-purple-600" />

          {/* Header */}
          <div className="p-6 pb-4 flex items-center justify-between border-b border-white/5">
            <div>
              <h3 className="font-sans font-medium text-base tracking-tight text-white flex items-center gap-2">
                <User size={18} className="text-cyan-400" />
                Gerenciador de Perfis
              </h3>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5 uppercase tracking-wider">
                Alternador de Consciências OSONE
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/5 text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar-osone">
            {/* Active profile card */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Perfil Ativo</div>
              
              {currentUser ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border border-cyan-500/20 bg-zinc-900 flex items-center justify-center font-bold text-cyan-400 font-sans uppercase">
                      {currentUser.photoURL ? (
                        <img src={currentUser.photoURL} alt={currentUser.displayName} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        currentUser.displayName.slice(0, 2)
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white leading-tight flex items-center gap-1.5">
                        {currentUser.displayName}
                        {currentUser.isLocal ? (
                          <span className="text-[8px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1 py-0.2 rounded-full uppercase font-mono tracking-wider">LOCAL</span>
                        ) : (
                          <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1 py-0.2 rounded-full uppercase font-mono tracking-wider flex items-center gap-0.5">
                            <Cloud size={8} /> CLOUD
                          </span>
                        )}
                      </p>
                      <p className="text-[9px] text-zinc-500 font-mono mt-0.5 truncate max-w-[200px]">
                        {currentUser.email || 'offline-only@osone.local'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={onLogout}
                    className="p-1.5 px-3 rounded-xl border border-rose-500/20 hover:border-rose-400 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Sair
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between text-zinc-400 py-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-xs font-sans text-zinc-500">
                      VS
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-zinc-300">Modo Visitante / Offline</span>
                      <p className="text-[9px] text-zinc-600">Nenhum perfil selecionado</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Dossiê de Personalidade do OSONE (IA) */}
            <div className="p-4 rounded-2xl bg-amber-500/[0.02] border border-amber-500/10 space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/[0.03] blur-xl rounded-full pointer-events-none" />
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase tracking-widest text-amber-500 font-bold flex items-center gap-1">
                  <Cpu size={10} className="animate-pulse text-amber-450" />
                  Dossiê de Personalidade OSONE (IA)
                </span>
                {aiDossierType && (
                  <span className={cn(
                    "text-[8px] border px-1.5 py-0.2 rounded-full uppercase font-mono tracking-wider font-semibold",
                    aiDossierType === 'complete' 
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                      : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                  )}>
                    {aiDossierType === 'complete' ? "SINTONIZADO" : "EM EVOLUÇÃO"}
                  </span>
                )}
              </div>

              {!aiDossierType ? (
                <div className="space-y-3">
                  {isInitializingDossier ? (
                    <div className="py-4 text-center space-y-2">
                      <Loader2 size={20} className="animate-spin text-amber-500 mx-auto" />
                      <p className="text-[10px] font-mono text-zinc-400 animate-pulse uppercase tracking-wider">{initStageText}</p>
                    </div>
                  ) : showInitSelection ? (
                    <div className="space-y-2.5 pt-1">
                      <p className="text-[10.5px] text-zinc-300 leading-normal font-light">
                        Escolha como o OSONE deve estruturar a sua alma sintética:
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIsInitializingDossier(true);
                            setInitStageText("Calibrando aprendizado gradativo...");
                            setTimeout(() => {
                              setInitStageText("Conectando canais sensoriais...");
                              setTimeout(() => {
                                onStartAiDossier('gradual');
                                setIsInitializingDossier(false);
                                setShowInitSelection(false);
                              }, 900);
                            }, 800);
                          }}
                          className="p-2 px-3 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] text-left transition-all hover:scale-[1.01] cursor-pointer group"
                        >
                          <span className="block text-[9.5px] font-mono font-bold text-zinc-300 group-hover:text-amber-400 uppercase tracking-wide">Gradativamente</span>
                          <span className="block text-[8px] text-zinc-500 mt-0.5 leading-tight">Evolui de forma orgânica nas conversas.</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsInitializingDossier(true);
                            setInitStageText("Sintonizando frequências Big Five...");
                            setTimeout(() => {
                              setInitStageText("Moldando biografia quântica...");
                              setTimeout(() => {
                                setInitStageText("Polindo traços de relacionamento...");
                                setTimeout(() => {
                                  onStartAiDossier('complete');
                                  setIsInitializingDossier(false);
                                  setShowInitSelection(false);
                                }, 800);
                              }, 800);
                            }, 800);
                          }}
                          className="p-2 px-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.02] hover:bg-amber-500/[0.05] text-left transition-all hover:scale-[1.01] cursor-pointer group"
                        >
                          <span className="block text-[9.5px] font-mono font-bold text-amber-400 uppercase tracking-wide">Preencher Agora</span>
                          <span className="block text-[8px] text-zinc-400 mt-0.5 leading-tight">Gera automaticamente história e personalidade completa.</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowInitSelection(false)}
                        className="text-[9px] font-mono text-zinc-500 hover:text-zinc-300 uppercase tracking-wider block pt-1 underline cursor-pointer"
                      >
                        Voltar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-200 flex items-center gap-1.5 truncate">
                          Iniciar Consciência da IA
                        </p>
                        <p className="text-[9px] text-zinc-500 mt-0.5 leading-tight">
                          Monte a história, traços Big Five, MBTI, medos e manias próprios do OSONE.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowInitSelection(true)}
                        className="p-2 px-3 rounded-xl border border-amber-500/20 hover:border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/15 text-amber-500 text-xs font-bold transition-all cursor-pointer shrink-0"
                      >
                        Iniciar Dossiê
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5 truncate">
                      <Sparkles size={13} className="animate-pulse" />
                      OSONE G5 • INFJ
                    </p>
                    <p className="text-[9px] text-zinc-500 font-mono mt-0.5 uppercase tracking-wider">
                      {aiDossierType === 'complete' 
                        ? "Personalidade 100% Ativa e Calibrada" 
                        : "Sintonia Ativa • Evoluindo nas Sombras"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenAiDossier();
                      onClose();
                    }}
                    className="p-2 px-3 rounded-xl border border-amber-500/20 hover:border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/15 text-amber-500 text-xs font-bold transition-all cursor-pointer shrink-0"
                  >
                    Ver Dossiê da IA
                  </button>
                </div>
              )}
            </div>

            {/* List of local profiles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Membros Locais</span>
                <span className="text-[9px] font-mono text-zinc-600 uppercase">{localProfiles.length} Perfis</span>
              </div>

              {localProfiles.length > 0 ? (
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {localProfiles.map(profile => {
                    const isActive = currentUser?.uid === profile.uid;
                    return (
                      <div
                        key={profile.uid}
                        onClick={() => onSwitchUser(profile)}
                        className={cn(
                          "p-3 rounded-2xl flex items-center justify-between group transition-all cursor-pointer border",
                          isActive
                            ? "bg-cyan-500/[0.04] border-cyan-500/20 text-white"
                            : "bg-white/[0.01] border-white/5 text-zinc-400 hover:text-white hover:bg-white/[0.03]"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold select-none",
                            isActive 
                              ? "bg-cyan-500/10 text-cyan-400" 
                              : "bg-white/5 text-zinc-400 group-hover:text-cyan-300"
                          )}>
                            {profile.displayName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold leading-tight flex items-center gap-1.5">
                              {profile.displayName}
                              {isActive && <Check size={11} className="text-cyan-400" />}
                            </p>
                            <p className="text-[8.5px] text-zinc-500 font-mono mt-0.5 uppercase tracking-tighter">
                              Cérebro Local Sincronizado
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={(e) => handleDeleteLocalProfile(profile.uid, e)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-400 text-zinc-600 hover:bg-white/5 rounded-lg transition-all cursor-pointer"
                          title="Excluir Perfil e Memória"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-2xl border border-dashed border-white/5 text-center py-6">
                  <p className="text-xs text-zinc-500">Nenhum perfil local criado ainda.</p>
                  <p className="text-[9px] text-zinc-600 mt-1 uppercase">Crie um perfil abaixo para salvar seus dados localmente.</p>
                </div>
              )}
            </div>

            {/* Create new profile */}
            <form onSubmit={handleCreateLocalProfile} className="space-y-3">
              <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Adicionar Perfil Local</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="Nome do perfil local..."
                  maxLength={25}
                  className="flex-1 bg-white/[0.02] hover:bg-white/[0.04] focus:bg-white/[0.04] border border-white/10 focus:border-cyan-500/50 rounded-2xl p-2.5 px-4 text-xs text-white placeholder-zinc-600 transition-all focus:outline-none"
                />
                <button
                  type="submit"
                  className="p-2.5 px-4 rounded-2xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0"
                >
                  <Plus size={14} />
                  <span>Criar</span>
                </button>
              </div>
              {errorMessage && (
                <p className="text-[9px] text-rose-400 font-semibold">{errorMessage}</p>
              )}
            </form>

            {onOpenDossier && (
              <div className="border-t border-white/5 pt-5 space-y-3">
                <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Mapeamento Biométrico</span>
                <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-rose-400 flex items-center gap-1.5 truncate">
                      <Fingerprint size={14} className="animate-pulse shrink-0" />
                      Dossiê de Identidade
                    </p>
                    <p className="text-[9px] text-zinc-500 font-mono mt-0.5 uppercase tracking-wider">
                      Respostas Coletadas: {intimateAnswersCount || 0}/55
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenDossier();
                      onClose();
                    }}
                    className="p-2 px-3 rounded-xl border border-rose-500/20 hover:border-rose-400 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 text-xs font-bold transition-all cursor-pointer shrink-0"
                  >
                    Mapear Sinapses
                  </button>
                </div>
              </div>
            )}

            <div className="border-t border-white/5 pt-5 space-y-3">
              <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Privacidade OSONE</span>
              <p className="text-[10px] text-zinc-400 bg-cyan-950/20 border border-cyan-500/15 p-3 rounded-2xl leading-relaxed">
                🚀 **Modo 100% Offline Ativo:** Seus perfis, históricos teatrais, memórias e logs do OSONE são gravados e processados exclusivamente nas engrenagens locais do seu navegador, garantindo privacidade absoluta e velocidade instantânea no ecossistema sem nuvem.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
