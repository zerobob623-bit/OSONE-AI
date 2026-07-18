import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

interface VoiceSwitcherProps {
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const VOICES = [
  'Kore', 'Puck', 'Charon', 'Fenrir', 'Scarlet'
];

export const VoiceSwitcher = ({ selectedVoice, onVoiceChange, isOpen, onToggle }: VoiceSwitcherProps) => {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.2em] font-light transition-all",
          "bg-white/[0.03] text-her-muted hover:bg-white/[0.08] hover:text-her-ink border border-white/[0.05]"
        )}
      >
        <Volume2 size={12} className={cn(isOpen && "text-her-accent")} />
        <span>{selectedVoice === 'Scarlet' ? 'Sensus' : selectedVoice}</span>
        <ChevronUp size={10} className={cn("transition-transform duration-300", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full left-0 mb-4 p-2 bg-her-bg/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl z-50 min-w-[130px]"
          >
            <div className="flex flex-col gap-1 max-h-[240px] overflow-y-auto custom-scrollbar">
              {VOICES.map((voice) => (
                <button
                  key={voice}
                  onClick={() => {
                    onVoiceChange(voice);
                    onToggle();
                  }}
                  className={cn(
                    "px-4 py-2 rounded-xl text-left text-[11px] font-light tracking-wide transition-all",
                    selectedVoice === voice
                      ? "bg-her-accent/10 text-her-accent font-medium"
                      : "text-her-muted hover:bg-white/5 hover:text-her-ink"
                  )}
                >
                  {voice === 'Scarlet' ? 'Sensus (Quantum)' : voice}
                </button>
              ))}
            </div>
            {/* Arrow */}
            <div className="absolute -bottom-1 left-6 w-2 h-2 bg-her-bg border-r border-b border-white/10 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
