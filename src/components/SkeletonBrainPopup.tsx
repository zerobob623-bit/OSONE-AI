import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { 
  Brain, 
  Check, 
  X, 
  AlertCircle,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { cn } from '../lib/utils';
import { SkeletonPlan } from '../types';

interface SkeletonBrainPopupProps {
  plan: SkeletonPlan | null;
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
}

export function SkeletonBrainPopup({ plan, onApprove, onReject }: SkeletonBrainPopupProps) {
  if (!plan || plan.status !== 'pending') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-her-bg/80 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, y: 20, opacity: 0 }}
          className="w-full max-w-4xl max-h-[85vh] bg-her-bg border border-white/[0.08] rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="shrink-0 p-8 border-b border-white/[0.05] flex items-center justify-between bg-gradient-to-r from-her-accent/10 to-transparent">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-her-accent/20 rounded-2xl flex items-center justify-center text-her-accent border border-her-accent/30 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                <Brain size={28} className="animate-pulse" />
              </div>
              <div>
                <h2 className="text-2xl font-serif italic text-white leading-tight">SKELETON BRAIN</h2>
                <p className="text-[10px] uppercase tracking-[0.3em] text-her-muted">Plano de Arquitetura IA Proposto</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full text-green-400 text-[10px] uppercase tracking-widest">
              <ShieldCheck size={14} />
              Protocolo Seguro
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-3 mb-8 opacity-60">
                <AlertCircle size={16} className="text-her-accent" />
                <p className="text-xs text-her-muted italic">Aguardando validação humana para iniciar execução técnica...</p>
              </div>

              <div className="prose prose-invert prose-her markdown-body">
                <ReactMarkdown>{plan.content}</ReactMarkdown>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="shrink-0 p-8 border-t border-white/[0.05] bg-white/[0.02] flex flex-col md:flex-row items-center gap-4">
            <div className="flex-1 text-[11px] text-her-muted leading-relaxed text-center md:text-left">
              Ao aprovar, o <b>OSONE G5</b> iniciará a construção seguindo rigorosamente a sequência lógica acima.
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={() => onReject(plan.id)}
                className="flex-1 md:flex-none px-8 py-4 bg-white/[0.03] hover:bg-white/[0.08] text-her-muted hover:text-white rounded-2xl transition-all border border-white/[0.05] text-[10px] uppercase tracking-[0.2em] font-medium flex items-center justify-center gap-2 group"
              >
                <X size={16} className="group-hover:rotate-90 transition-transform" />
                Ajustar Plano
              </button>
              <button
                onClick={() => onApprove(plan.id)}
                className="flex-1 md:flex-none px-10 py-4 bg-her-accent text-white rounded-2xl hover:bg-her-accent/90 transition-all shadow-[0_10px_30px_-5px_rgba(239,68,68,0.3)] hover:shadow-[0_15px_40px_-5px_rgba(239,68,68,0.5)] text-[10px] uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-3 group"
              >
                <Check size={18} className="group-hover:scale-125 transition-transform" />
                Aprovar & Executar
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
