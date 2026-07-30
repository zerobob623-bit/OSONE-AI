import React, { useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Eye, Hand, AlertTriangle, Camera } from 'lucide-react';
import { cn } from '../lib/utils';
import { useVisionControl } from '../hooks/useVisionControl';

interface VisionControlPanelProps {
  onBack: () => void;
  localAgentToken: string;
  onNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const VisionControlPanel: React.FC<VisionControlPanelProps> = ({ onBack, localAgentToken, onNotification }) => {
  const tokenRef = useRef(localAgentToken);
  tokenRef.current = localAgentToken;
  const getToken = useCallback(() => tokenRef.current, []);

  const { status, errorMessage, isPinching, videoRef, canvasRef, start, stop } = useVisionControl(getToken);

  const isActive = status !== 'idle' && status !== 'error';

  const handleToggle = async () => {
    if (isActive) {
      stop();
      onNotification('Controle por Visão desativado.', 'info');
    } else {
      await start();
    }
  };

  const statusLabel: Record<string, string> = {
    idle: 'Desligado',
    starting: 'Iniciando câmera e modelo de rastreamento...',
    tracking: isPinching ? 'Mão detectada — pinçando (clique/arrasto)' : 'Mão detectada — rastreando',
    no_hand: 'Câmera ativa — nenhuma mão no quadro',
    error: 'Erro'
  };

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 p-6 md:p-10 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => { stop(); onBack(); }}
          className="p-3 rounded-full hover:bg-white/[0.04] text-her-muted transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-light text-her-ink flex items-center gap-2">
            <Eye size={20} className="text-teal-400" />
            Controle por Visão
          </h2>
          <p className="text-xs text-her-muted mt-1">Mova o cursor e clique com gestos de mão pela câmera, via Agente Local.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 max-w-5xl">
        <div className="relative rounded-3xl overflow-hidden border border-white/[0.06] bg-black aspect-video">
          <video
            ref={videoRef}
            className="w-full h-full object-cover scale-x-[-1]"
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none"
          />
          {!isActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-her-muted">
              <Camera size={32} className="opacity-50" />
              <span className="text-sm font-light">Câmera desligada</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className={cn(
            "rounded-2xl border p-5 transition-colors",
            status === 'tracking' ? "border-teal-500/30 bg-teal-500/[0.06]" :
            status === 'error' ? "border-red-500/30 bg-red-500/[0.06]" :
            "border-white/[0.06] bg-white/[0.02]"
          )}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-her-muted mb-2">
              <Hand size={14} />
              Status
            </div>
            <p className="text-sm text-her-ink/80 font-light">{statusLabel[status]}</p>
            {status === 'error' && errorMessage && (
              <div className="mt-3 flex items-start gap-2 text-xs text-red-400">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleToggle}
            className={cn(
              "w-full py-4 rounded-2xl font-light text-sm transition-all",
              isActive
                ? "bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/15"
                : "bg-teal-500/10 text-teal-300 border border-teal-500/25 hover:bg-teal-500/15"
            )}
          >
            {isActive ? 'Desligar Controle por Visão' : 'Ligar Controle por Visão'}
          </button>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-xs text-her-muted leading-relaxed font-light space-y-2">
            <p><strong className="text-her-ink/70">Como usar:</strong></p>
            <p>• Aponte o dedo indicador para a câmera para mover o cursor pela tela (inclusive entre monitores).</p>
            <p>• Aproxime o polegar do indicador (pinça) para clicar; segure a pinça e mova a mão para arrastar.</p>
            <p>• Solte a pinça para largar o clique/arrasto.</p>
            <p className="pt-2 text-her-muted/70">Requer o Agente Local do OSONE rodando no PC com o token configurado nos Ajustes. No Linux, requer o pacote <code className="text-her-ink/60">xdotool</code> instalado (funciona em sessões X11; Wayland pode restringir o controle de cursor).</p>
          </div>
        </div>
      </div>
    </div>
  );
};
