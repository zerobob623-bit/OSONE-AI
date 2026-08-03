import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Square, Play, X, Loader2, Check, AlertTriangle, Ban } from 'lucide-react';
import { AcaoDoMotor } from '../hooks/useLocalAgent';

/**
 * Painel do motor de ações: mostra, em ordem, o que o OSONE está fazendo no computador — e
 * permite parar no meio.
 *
 * Antes a única pista de que algo acontecia era um aviso "Ação do Agente Local processada" que
 * aparecia e sumia, sem dizer qual ação era, quantas faltavam nem se tinha travado. Numa sequência
 * de vários passos isso é indistinguível de estar parado, e não havia como interromper: era
 * preciso fechar o app. Ver a fila e ter um botão de parada é o que torna o controle do
 * computador algo que dá para acompanhar e abortar, em vez de algo que se assiste torcendo.
 */
export const MotorDeAcoes = ({
  acoes,
  parado,
  onParar,
  onRetomar,
  onLimpar
}: {
  acoes: AcaoDoMotor[];
  parado: boolean;
  onParar: () => void;
  onRetomar: () => void;
  onLimpar: () => void;
}) => {
  if (acoes.length === 0) return null;

  const executando = acoes.some(a => a.estado === 'executando');

  const icone = (estado: AcaoDoMotor['estado']) => {
    if (estado === 'executando') return <Loader2 className="w-3.5 h-3.5 animate-spin text-her-accent" />;
    if (estado === 'ok') return <Check className="w-3.5 h-3.5 text-emerald-400" />;
    if (estado === 'erro') return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
    return <Ban className="w-3.5 h-3.5 text-neutral-500" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      className="fixed right-4 top-24 z-[9998] w-[320px] max-h-[60vh] flex flex-col
                 rounded-xl border border-white/10 bg-black/80 backdrop-blur-md shadow-2xl"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <span className={`w-2 h-2 rounded-full ${executando ? 'bg-her-accent animate-pulse' : parado ? 'bg-red-500' : 'bg-emerald-400'}`} />
        <span className="text-[11px] tracking-widest uppercase text-neutral-300 flex-1">
          {parado ? 'Motor parado' : executando ? 'Motor executando' : 'Motor ocioso'}
        </span>

        {parado ? (
          <button
            onClick={onRetomar}
            title="Retomar o motor"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[11px]"
          >
            <Play className="w-3 h-3" /> Retomar
          </button>
        ) : (
          <button
            onClick={onParar}
            title="Parar imediatamente as próximas ações"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/15 hover:bg-red-500/25 text-red-300 text-[11px]"
          >
            <Square className="w-3 h-3" /> Parar
          </button>
        )}

        <button onClick={onLimpar} title="Limpar a lista" className="p-1 rounded-md hover:bg-white/10 text-neutral-400">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="overflow-y-auto px-2 py-2 space-y-1">
        <AnimatePresence initial={false}>
          {acoes.map(a => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5"
            >
              <div className="mt-0.5 shrink-0">{icone(a.estado)}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-neutral-100 leading-tight">
                  {a.rotulo}
                  {a.detalhe && <span className="text-neutral-500"> · {a.detalhe}</span>}
                </div>
                {/* Erros podem trazer a lista do que o OCR leu: é longa, e é justamente o dado
                    útil para descobrir por que a busca falhou — por isso rola em vez de ser cortada. */}
                {a.resultado && (
                  <div className={`text-[10px] leading-tight mt-0.5 max-h-24 overflow-y-auto ${a.estado === 'erro' ? 'text-red-400/90' : 'text-neutral-500'}`}>
                    {a.resultado}
                  </div>
                )}
              </div>
              <div className="text-[10px] text-neutral-600 shrink-0">
                {new Date(a.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
