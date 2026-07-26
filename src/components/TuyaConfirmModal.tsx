import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Lock, 
  KeyRound, 
  ShieldAlert, 
  Check, 
  X, 
  ArrowRight, 
  AlertTriangle,
  Cpu
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface PendingTuyaConfirmation {
  id: string;
  deviceId: string;
  deviceName?: string;
  category?: string;
  code: string;
  value: any;
  onConfirm: () => void;
  onCancel: () => void;
}

interface TuyaConfirmModalProps {
  pending: PendingTuyaConfirmation | null;
}

export function TuyaConfirmModal({ pending }: TuyaConfirmModalProps) {
  if (!pending) return null;

  const isUnlock = pending.value === true || pending.value === 'unlock' || pending.value === 'open' || pending.value === 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-6 bg-her-bg/85 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0.92, y: 15, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 15, opacity: 0 }}
          className="w-full max-w-xl bg-her-bg border border-white/10 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="shrink-0 p-6 md:p-8 border-b border-white/[0.06] flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center border shadow-lg shrink-0 bg-amber-500/20 text-amber-400 border-amber-500/30 shadow-amber-500/10">
                <Lock size={26} className="animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-serif italic text-white leading-tight">
                  {isUnlock ? "Destravar Fechadura Física" : "Alterar Estado da Fechadura"}
                </h2>
                <p className="text-[10px] uppercase tracking-[0.25em] text-amber-400 font-bold mt-0.5">
                  Tuya Cloud API • Segurança Crítica de Hardware
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-300 text-[9px] uppercase tracking-wider font-bold">
              <ShieldAlert size={12} />
              Segurança Físico
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
              <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90 leading-relaxed font-sans">
                Ação com impacto físico real. O OSONE exige autorização humana prévia para alterar o estado de fechaduras e travas eletrônicas.
              </p>
            </div>

            <div className="p-5 bg-white/[0.02] border border-white/[0.05] rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Cpu size={14} className="text-amber-400" />
                  Detalhes do Dispositivo
                </span>
                <span className="text-[10px] text-her-muted bg-white/5 px-2.5 py-0.5 rounded-full font-mono">
                  {pending.category || 'Fechadura/Lock'}
                </span>
              </div>

              <div className="p-3.5 bg-amber-500/5 border border-amber-500/15 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    {pending.deviceName || `Dispositivo ${pending.deviceId}`}
                  </span>
                  <span className="text-[10px] text-amber-400 font-mono">
                    ID: {pending.deviceId}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-amber-300/80 font-mono pt-1">
                  <KeyRound size={13} className="shrink-0" />
                  <span>Comando: <code className="text-white bg-white/10 px-1.5 py-0.5 rounded">{pending.code}</code> = <code className="text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded font-bold">{String(pending.value)}</code></span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="shrink-0 p-6 md:p-8 border-t border-white/[0.06] bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[11px] text-her-muted text-center sm:text-left leading-relaxed">
              Confirme para enviar o sinal via Tuya Cloud API.
            </p>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={pending.onCancel}
                className="flex-1 sm:flex-none px-6 py-3.5 bg-white/[0.04] hover:bg-white/[0.08] text-her-muted hover:text-white rounded-2xl transition-all border border-white/10 text-[10px] uppercase tracking-[0.15em] font-medium flex items-center justify-center gap-2 cursor-pointer"
              >
                <X size={15} />
                Cancelar
              </button>
              <button
                type="button"
                onClick={pending.onConfirm}
                className="flex-1 sm:flex-none px-8 py-3.5 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-2xl transition-all text-[10px] uppercase tracking-[0.15em] flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                <Check size={16} />
                Autorizar Ação
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
