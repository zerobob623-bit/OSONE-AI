import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Volume2, FileText, Folder, Music, Gamepad2, Zap, Activity, LogOut, User, Cpu, Puzzle, MessageSquare, Sliders, Compass, Database, Video, Radio, Eye, Heart, BookOpen } from 'lucide-react';
import { cn } from '../lib/utils';
import { WorkspaceMode } from '../types';

export const Sidebar = ({ isOpen, onClose, mode, setMode, user, onLogout, onLogin, onOpenProfileModal }: { 
  isOpen: boolean; 
  onClose: () => void;
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  user?: any;
  onLogout?: () => void;
  onLogin?: () => void;
  onOpenProfileModal?: () => void;
}) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px]"
        />
        <motion.div 
          initial={{ x: -300 }}
          animate={{ x: 0 }}
          exit={{ x: -300 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed inset-y-0 left-0 z-50 w-72 bg-her-bg border-r border-white/[0.03] shadow-2xl p-8 flex flex-col"
        >
          <div className="flex justify-between items-center mb-12">
            <h1 className="text-2xl font-serif italic tracking-tight font-light text-her-ink/40">OSONE G5</h1>
            <button onClick={onClose} className="p-2 hover:bg-white/[0.03] rounded-full transition-colors text-her-muted">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-10 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <div>
              <h3 className="text-[9px] uppercase tracking-[0.3em] text-her-muted mb-6 font-light">Navegação</h3>
              <div className="space-y-3">
                <button 
                  onClick={() => { setMode('home'); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm",
                    mode === 'home' ? "bg-her-accent/10 text-her-accent border border-her-accent/20" : "hover:bg-white/[0.02] text-her-ink/60"
                  )}
                >
                  <Volume2 size={18} />
                  <span>Início</span>
                </button>
                <button 
                  onClick={() => { setMode('sounds'); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm",
                    mode === 'sounds' ? "bg-her-accent/10 text-her-accent border border-her-accent/20" : "hover:bg-white/[0.02] text-her-ink/60"
                  )}
                >
                  <Music size={18} />
                  <span>Biblioteca</span>
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-[9px] uppercase tracking-[0.3em] text-her-muted mb-6 font-light">Workspace</h3>
              <div className="space-y-3">
                <button 
                  onClick={() => { setMode('writing'); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm",
                    mode === 'writing' ? "bg-her-accent/10 text-her-accent border border-her-accent/20" : "hover:bg-white/[0.02] text-her-ink/60"
                  )}
                >
                  <FileText size={18} />
                  <span>Escrita</span>
                </button>

                <button 
                  onClick={() => { setMode('wellness'); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm",
                    mode === 'wellness' ? "bg-her-accent/10 text-her-accent border border-her-accent/20" : "hover:bg-white/[0.02] text-her-ink/60"
                  )}
                >
                  <Activity size={18} />
                  <span>Saúde & Estilo</span>
                </button>
                <button 
                  onClick={() => { setMode('canvas'); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm",
                    mode === 'canvas' ? "bg-her-accent/10 text-her-accent border border-her-accent/20" : "hover:bg-white/[0.02] text-her-ink/60"
                  )}
                >
                  <Gamepad2 size={18} />
                  <span>Interativo</span>
                </button>
                <button 
                  onClick={() => { setMode('map'); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm",
                    mode === 'map' ? "bg-purple-500/10 text-purple-300 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.15)]" : "hover:bg-white/[0.02] text-her-ink/60"
                  )}
                >
                  <Compass size={18} className="text-purple-400" />
                  <span>Mapa OS</span>
                </button>
                <button 
                  onClick={() => { setMode('aural_control'); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm",
                    mode === 'aural_control' ? "bg-her-accent/10 text-her-accent border border-her-accent/20" : "hover:bg-white/[0.02] text-her-ink/60"
                  )}
                >
                  <Sliders size={18} />
                  <span>Ajustes & Perfil</span>
                </button>

                <button 
                  onClick={() => { setMode('whatsapp'); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm",
                    mode === 'whatsapp' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "hover:bg-white/[0.02] text-her-ink/60"
                  )}
                >
                  <MessageSquare size={18} />
                  <span>WhatsApp Evolution</span>
                </button>

                <button 
                  onClick={() => { setMode('rag'); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm",
                    mode === 'rag' ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]" : "hover:bg-white/[0.02] text-her-ink/60"
                  )}
                >
                  <Database size={18} className="text-cyan-400" />
                  <span>RAG • Conector PC</span>
                </button>

                <button 
                  onClick={() => { setMode('creator'); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm",
                    mode === 'creator' ? "bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.15)]" : "hover:bg-white/[0.02] text-her-ink/60"
                  )}
                >
                  <Video size={18} className="text-orange-400" />
                  <span>Criador Viral</span>
                </button>

                <button 
                  onClick={() => { setMode('tiktok'); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm",
                    mode === 'tiktok' ? "bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]" : "hover:bg-white/[0.02] text-her-ink/60"
                  )}
                >
                  <Radio size={18} className="text-rose-400 scale-105" />
                  <span>TikTok Live Co-piloto</span>
                </button>

                <button 
                  onClick={() => { setMode('sensus_evolution'); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm",
                    mode === 'sensus_evolution' ? "bg-amber-500/10 text-amber-400 border border-amber-500/25 shadow-[0_0_15px_rgba(245,158,11,0.15)]" : "hover:bg-white/[0.02] text-her-ink/60"
                  )}
                >
                  <Heart size={18} className="text-amber-500 animate-pulse" />
                  <span>Cérebro Sensus ("Her")</span>
                </button>

                <button 
                  onClick={() => { setMode('memory_book'); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm",
                    mode === 'memory_book' ? "bg-pink-500/10 text-pink-300 border border-pink-500/25 shadow-[0_0_15px_rgba(244,63,94,0.15)]" : "hover:bg-white/[0.02] text-her-ink/60"
                  )}
                >
                  <BookOpen size={18} className="text-pink-400" />
                  <span>Livro de Memórias</span>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-white/[0.03]">
            {user ? (
              <div 
                onClick={onOpenProfileModal}
                className="mb-4 p-4 rounded-3xl bg-cyan-500/[0.01] hover:bg-cyan-500/[0.04] border border-cyan-500/10 hover:border-cyan-500/25 flex items-center justify-between gap-3 cursor-pointer transition-all min-w-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full border border-cyan-500/20 overflow-hidden bg-zinc-900 flex items-center justify-center shrink-0">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-cyan-400 font-bold text-xs uppercase">{user.displayName.slice(0, 2)}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-her-ink/80 truncate leading-tight">{user.displayName}</p>
                    <p className="text-[8px] text-zinc-400 truncate mt-0.5">{user.email}</p>
                    {user.isLocal ? (
                      <p className="text-[7px] text-cyan-400 mt-1 uppercase tracking-wider font-semibold">Cérebro Local</p>
                    ) : (
                      <p className="text-[7px] text-emerald-400 mt-1 uppercase tracking-wider font-semibold">Firebase Secure</p>
                    )}
                  </div>
                </div>
                {onLogout && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onLogout(); }}
                    className="p-1.5 hover:bg-rose-500/10 rounded-lg text-rose-400 hover:text-rose-300 transition-all cursor-pointer"
                    title="Desconectar"
                  >
                    <LogOut size={14} />
                  </button>
                )}
              </div>
            ) : (
              <div 
                onClick={onOpenProfileModal}
                className="mb-4 p-4 rounded-3xl bg-zinc-500/[0.02] hover:bg-white/[0.02] border border-zinc-500/10 flex items-center justify-between gap-3 text-left cursor-pointer transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 font-bold text-xs select-none">
                    ?
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-her-ink/65 truncate leading-tight uppercase tracking-wider">Modo Visitante</p>
                    <p className="text-[8px] text-zinc-500 mt-0.5 uppercase tracking-wide">Sem Identidade</p>
                  </div>
                </div>
                {onOpenProfileModal && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onOpenProfileModal(); }}
                    className="py-1 px-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all border border-cyan-500/25 cursor-pointer"
                  >
                    Entrar
                  </button>
                )}
              </div>
            )}

          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);
