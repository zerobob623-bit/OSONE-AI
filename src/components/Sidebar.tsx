import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Volume2, FileText, Code2, Music, Gamepad2, Zap, Activity, LogOut, MessageSquare,
  Compass, Crown, Database, Video, Radio, Eye, Heart, BookOpen, Settings, MousePointerClick, Ear,
  Search, HardDrive,
  type LucideIcon
} from 'lucide-react';
import { cn } from '../lib/utils';
import { WorkspaceMode } from '../types';
import type { OsonePlanId } from '../lib/planos';

/**
 * Uma entrada do menu.
 *
 * A barra era quinze blocos de JSX praticamente idênticos, cada um com sua cor escrita à mão. Em
 * lista, a ORDEM vira um dado que se lê de uma vez — e reordenar deixa de significar mover
 * dezenas de linhas de marcação, que é o tipo de mudança em que um item se perde pelo caminho.
 */
interface ItemDoMenu {
  rotulo: string;
  icone: LucideIcon;
  /** Aba de destino. Ausente nos itens que abrem um painel em vez de trocar de aba. */
  modo?: WorkspaceMode;
  /** Outros modos que também deixam este item aceso (a aba do OSONE HOME tem dois). */
  tambemEm?: WorkspaceMode[];
  /** Classes do estado ativo. Sem isto, todos os itens acendem na cor padrão do sistema. */
  ativo?: string;
  corDoIcone?: string;
  pulsa?: boolean;
}

interface GrupoDoMenu {
  titulo: string;
  itens: ItemDoMenu[];
}

const ATIVO_PADRAO = "bg-her-accent/10 text-her-accent border border-her-accent/20";

/**
 * O menu em ordem de importância, e não de idade.
 *
 * A ordem anterior era a de quem foi construído primeiro: "Biblioteca" de sons aparecia em
 * segundo, logo abaixo de Início, enquanto o WhatsApp, o OSONE HOME e o controle do
 * computador — o que o OSONE faz o dia inteiro — ficavam no meio e no fim de uma lista de treze.
 * Configurações ficava enfiado entre duas abas de trabalho.
 *
 * Aqui o primeiro grupo é o que se usa todo dia, o segundo é criação, o terceiro é a memória do
 * sistema, e o último junta o que se abre de vez em quando.
 */
const GRUPOS: GrupoDoMenu[] = [
  {
    titulo: 'Principal',
    itens: [
      { rotulo: 'Início', icone: Volume2, modo: 'home' },
      {
        rotulo: 'OSONE ZAP', icone: MessageSquare, modo: 'whatsapp',
        ativo: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
      },
      {
        rotulo: 'OSONE HOME', icone: Zap, modo: 'smarthome', tambemEm: ['local_control'],
        ativo: "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]",
        corDoIcone: "text-cyan-400", pulsa: true
      },
      {
        /**
         * O agente que clica e digita ganha entrada própria, e fica no grupo de todo dia.
         *
         * Até aqui ele só existia dentro da conversa: era preciso pedir no chat e torcer para o
         * modelo decidir chamar a ferramenta. Uma capacidade que não tem onde ser acionada é, na
         * prática, uma capacidade que ninguém usa. Fica logo abaixo da automação da casa porque é
         * o par dela — uma automatiza os aparelhos, a outra automatiza o computador.
         */
        rotulo: 'OSONE COWORK', icone: MousePointerClick, modo: 'cowork',
        ativo: "bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 shadow-[0_0_15px_rgba(99,102,241,0.15)]",
        corDoIcone: "text-indigo-400"
      },
      {
        /**
         * A escuta fica no grupo de todo dia, e não em "Criação": o que ela faz primeiro é
         * capturar o que está sendo dito agora — numa aula, numa reunião, numa ideia falada em
         * voz alta. A elaboração vem depois, e só se a pessoa pedir.
         */
        rotulo: 'OSONE HEAR', icone: Ear, modo: 'hear',
        ativo: "bg-violet-500/10 text-violet-300 border border-violet-500/25 shadow-[0_0_15px_rgba(139,92,246,0.15)]",
        corDoIcone: "text-violet-400"
      },
      {
        rotulo: 'OSONE PESQUISA', icone: Search, modo: 'web_research',
        ativo: "bg-purple-500/10 text-purple-300 border border-purple-500/25 shadow-[0_0_15px_rgba(168,85,247,0.15)]",
        corDoIcone: "text-purple-300"
      },
      {
        /**
         * A vigilância fica junto da automação da casa, e não em "Criação": as três entradas
         * vizinhas são o que o OSONE faz COM o mundo físico — os aparelhos, o computador, e agora
         * o que as câmeras estão vendo.
         */
        rotulo: 'OSONE VIGIA', icone: Video, modo: 'cameras',
        ativo: "bg-rose-500/10 text-rose-300 border border-rose-500/25 shadow-[0_0_15px_rgba(244,63,94,0.15)]",
        corDoIcone: "text-rose-400"
      },
      {
        rotulo: 'Controle por Visão', icone: Eye, modo: 'vision_control',
        ativo: "bg-teal-500/10 text-teal-300 border border-teal-500/25 shadow-[0_0_15px_rgba(20,184,166,0.15)]",
        corDoIcone: "text-teal-400"
      }
    ]
  },
  {
    titulo: 'Criação',
    itens: [
      {
        rotulo: 'Criador Viral', icone: Video, modo: 'creator',
        ativo: "bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.15)]",
        corDoIcone: "text-orange-400"
      },
      { rotulo: 'Escrita', icone: FileText, modo: 'writing' },
      {
        rotulo: 'OSONE CODE', icone: Code2, modo: 'code',
        ativo: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.12)]",
        corDoIcone: "text-cyan-400"
      },
      {
        /**
         * Fica logo abaixo do OSONE CODE porque é o par dele: o CODE escreve projeto novo num
         * espaço do próprio OSONE, a IDE trabalha numa pasta que já existe no computador da
         * pessoa. Quem chega procurando "onde eu abro o meu projeto" olha primeiro aqui.
         */
        rotulo: 'OSONE IDE', icone: HardDrive, modo: 'ide',
        ativo: "bg-sky-500/10 text-sky-300 border border-sky-500/25 shadow-[0_0_15px_rgba(14,165,233,0.15)]",
        corDoIcone: "text-sky-400"
      },
      {
        rotulo: 'TikTok Live Co-piloto', icone: Radio, modo: 'tiktok',
        ativo: "bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]",
        corDoIcone: "text-rose-400"
      }
    ]
  },
  {
    titulo: 'Memória',
    itens: [
      {
        rotulo: 'Cérebro Sensus ("Her")', icone: Heart, modo: 'sensus_evolution',
        ativo: "bg-amber-500/10 text-amber-400 border border-amber-500/25 shadow-[0_0_15px_rgba(245,158,11,0.15)]",
        corDoIcone: "text-amber-500", pulsa: true
      },
      {
        rotulo: 'Livro de Memórias', icone: BookOpen, modo: 'memory_book',
        ativo: "bg-pink-500/10 text-pink-300 border border-pink-500/25 shadow-[0_0_15px_rgba(244,63,94,0.15)]",
        corDoIcone: "text-pink-400"
      },
      {
        rotulo: 'RAG • Conector PC', icone: Database, modo: 'rag',
        ativo: "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]",
        corDoIcone: "text-cyan-400"
      }
    ]
  },
  {
    titulo: 'Mais',
    itens: [
      { rotulo: 'Saúde & Estilo', icone: Activity, modo: 'wellness' },
      { rotulo: 'Biblioteca de Sons', icone: Music, modo: 'sounds' },
      { rotulo: 'Interativo', icone: Gamepad2, modo: 'canvas' },
      {
        rotulo: 'Mapa OS', icone: Compass, modo: 'map',
        ativo: "bg-purple-500/10 text-purple-300 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.15)]",
        corDoIcone: "text-purple-400"
      }
    ]
  }
];

const CLASSE_DO_BOTAO = "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-light text-sm";

export const Sidebar = ({ isOpen, onClose, mode, setMode, user, currentPlan, onLogout, onOpenProfileModal, onOpenSettings, onOpenPlans }: {
  isOpen: boolean;
  onClose: () => void;
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  user?: any;
  currentPlan?: OsonePlanId;
  onLogout?: () => void;
  onOpenProfileModal?: () => void;
  onOpenSettings?: () => void;
  onOpenPlans?: () => void;
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
            {GRUPOS.map(grupo => (
              <div key={grupo.titulo}>
                <h3 className="text-[9px] uppercase tracking-[0.3em] text-her-muted mb-6 font-light">{grupo.titulo}</h3>
                <div className="space-y-3">
                  {grupo.itens.map(item => {
                    const Icone = item.icone;
                    const estaAtivo = item.modo === mode || (item.tambemEm || []).includes(mode);
                    return (
                      <button
                        key={item.rotulo}
                        onClick={() => { if (item.modo) setMode(item.modo); onClose(); }}
                        className={cn(
                          CLASSE_DO_BOTAO,
                          estaAtivo ? (item.ativo || ATIVO_PADRAO) : "hover:bg-white/[0.02] text-her-ink/60"
                        )}
                      >
                        <Icone size={18} className={cn(item.corDoIcone, item.pulsa && "animate-pulse")} />
                        <span>{item.rotulo}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Configurações fica junto do perfil, e não no meio das abas de trabalho: é ajuste do
              sistema, não um lugar para onde se vai trabalhar. */}
          <div className="mt-auto pt-6 border-t border-white/[0.03]">
            <button
              onClick={() => { onOpenPlans?.(); onClose(); }}
              className={cn(CLASSE_DO_BOTAO, "mb-3 bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border border-cyan-400/15 text-cyan-200 cursor-pointer")}
            >
              <Crown size={18} className="text-amber-300" />
              <span>Planos</span>
              <span className="ml-auto text-[8px] uppercase tracking-widest text-cyan-300/70">{currentPlan || 'free'}</span>
            </button>
            <button
              onClick={() => { if (onOpenSettings) onOpenSettings(); onClose(); }}
              className={cn(CLASSE_DO_BOTAO, "mb-3 hover:bg-white/[0.02] text-her-ink/60 cursor-pointer")}
            >
              <Settings size={18} className="text-her-accent" />
              <span>Configurações</span>
            </button>

            {user && (
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
                    <p className="text-[7px] text-emerald-400 mt-1 uppercase tracking-wider font-semibold">Firebase Secure</p>
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
            )}
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);
