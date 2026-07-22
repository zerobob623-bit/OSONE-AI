import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  QrCode, CheckCircle2, RefreshCw, WifiOff, 
  Smartphone, Loader2, Sparkles, ShieldCheck, Power, 
  AlertCircle, MessageSquare
} from 'lucide-react';

export type WhatsAppStatus = 'desconectado' | 'iniciando' | 'aguardando_qr' | 'conectado' | 'erro';

export interface WhatsAppConnectProps {
  onStatusChange?: (status: WhatsAppStatus) => void;
  className?: string;
}

export function WhatsAppConnect({ onStatusChange, className = '' }: WhatsAppConnectProps) {
  const [status, setStatus] = useState<WhatsAppStatus>('desconectado');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phoneInfo, setPhoneInfo] = useState<{ number?: string; name?: string }>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Poll status endpoint every 3 seconds
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        const currentStatus = data.status as WhatsAppStatus;
        setStatus(currentStatus);
        setPhoneInfo(data.phone || {});
        if (data.error) setErrorMsg(data.error);

        if (onStatusChange) {
          onStatusChange(currentStatus);
        }

        // If waiting for QR, fetch QR code image
        if (currentStatus === 'aguardando_qr') {
          fetchQrCode();
        } else {
          setQrCode(null);
        }
      }
    } catch (e) {
      console.error("[WhatsAppConnect] Erro ao consultar status:", e);
    }
  }, [onStatusChange]);

  const fetchQrCode = async () => {
    try {
      const res = await fetch('/api/whatsapp/qr');
      if (res.ok) {
        const data = await res.json();
        if (data.qr) {
          setQrCode(data.qr);
        }
      }
    } catch (e) {
      console.error("[WhatsAppConnect] Erro ao obter QR Code:", e);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status || 'iniciando');
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Erro ao conectar WhatsApp");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      if (res.ok) {
        setStatus('desconectado');
        setQrCode(null);
        setPhoneInfo({});
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Erro ao desconectar WhatsApp");
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Connect automatically on component mount
  useEffect(() => {
    handleConnect();

    // Setup status polling
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return (
    <div className={`p-6 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl relative overflow-hidden shadow-2xl text-white ${className}`}>
      {/* Background Neural Glow Orb */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-gradient-to-br from-orange-500/20 via-amber-500/10 to-transparent rounded-full blur-3xl pointer-events-none animate-pulse" />

      {/* Header */}
      <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-lg shadow-orange-500/10">
            <MessageSquare size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              WhatsApp Copilot
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 font-semibold">
                Local Session
              </span>
            </h3>
            <p className="text-xs text-zinc-400">whatsapp-web.js via Puppeteer local</p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {status === 'conectado' && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Conectado
            </span>
          )}
          {status === 'aguardando_qr' && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Aguardando QR Code
            </span>
          )}
          {status === 'iniciando' && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <Loader2 size={12} className="animate-spin" />
              Iniciando Motor...
            </span>
          )}
          {status === 'desconectado' && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
              <WifiOff size={12} />
              Desconectado
            </span>
          )}
          {status === 'erro' && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
              <AlertCircle size={12} />
              Erro na Conexão
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        {/* State 1: CONECTADO */}
        {status === 'conectado' && (
          <motion.div
            key="connected"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-emerald-500/10 via-black/40 to-black/60 rounded-2xl border border-emerald-500/20 my-2"
          >
            <div className="relative mb-4">
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/20">
                <CheckCircle2 size={40} />
              </div>
              <div className="absolute -bottom-1 -right-1 p-1 bg-emerald-500 text-black rounded-full shadow-md">
                <Sparkles size={14} />
              </div>
            </div>

            <h4 className="text-lg font-bold text-white mb-1">WhatsApp Sincronizado e Ativo!</h4>
            <p className="text-sm text-emerald-300/80 mb-4 max-w-sm">
              Sua sessão local do WhatsApp está pareada e pronta para responder mensagens via OSONE IA.
            </p>

            {phoneInfo.name && (
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-xs text-zinc-300 mb-6">
                <Smartphone size={14} className="text-emerald-400" />
                <span className="font-semibold text-white">{phoneInfo.name}</span>
                {phoneInfo.number && <span className="text-zinc-500">({phoneInfo.number})</span>}
              </div>
            )}

            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isDisconnecting ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
              Encerrar Sessão
            </button>
          </motion.div>
        )}

        {/* State 2: AGUARDANDO QR CODE */}
        {status === 'aguardando_qr' && (
          <motion.div
            key="waiting_qr"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center justify-center p-6 text-center bg-black/40 rounded-2xl border border-amber-500/20 my-2"
          >
            <h4 className="text-sm font-bold text-amber-400 mb-1 flex items-center gap-2">
              <QrCode size={16} />
              Escaneie o QR Code abaixo
            </h4>
            <p className="text-xs text-zinc-400 mb-5 max-w-md">
              Abra o WhatsApp no seu celular → Configurações / Aparelhos Conectados → Conectar um aparelho e aponte a câmera.
            </p>

            {qrCode ? (
              <div className="relative p-4 bg-white rounded-2xl shadow-2xl border-4 border-amber-500/30 mb-4 group">
                <img src={qrCode} alt="WhatsApp QR Code" className="w-56 h-56 object-contain rounded-lg" />
                <div className="absolute inset-0 bg-black/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <span className="text-xs text-black font-bold bg-white/90 px-2 py-1 rounded-md shadow">
                    Atualização Automática
                  </span>
                </div>
              </div>
            ) : (
              <div className="w-56 h-56 bg-zinc-900/80 rounded-2xl border border-white/10 flex flex-col items-center justify-center text-zinc-500 gap-3 mb-4">
                <Loader2 size={32} className="animate-spin text-amber-400" />
                <span className="text-xs">Gerando QR Code...</span>
              </div>
            )}

            <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-amber-400" />
              A sessão será salva localmente na pasta <code className="text-zinc-300 font-mono">.wwebjs_auth</code>.
            </p>
          </motion.div>
        )}

        {/* State 3: INICIANDO / LOADING (Com Orbe de Constelação Neural Laranja OSONE) */}
        {(status === 'iniciando' || isConnecting) && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center justify-center p-10 text-center bg-black/40 rounded-2xl border border-orange-500/20 my-2 relative overflow-hidden"
          >
            {/* Neural Constellation Orb Animation */}
            <div className="relative w-28 h-28 mb-6 flex items-center justify-center">
              {/* Outer Pulsing Ring */}
              <div className="absolute inset-0 rounded-full border-2 border-orange-500/40 animate-ping opacity-30" />
              {/* Rotating Constellation Ring */}
              <div className="absolute inset-2 rounded-full border border-dashed border-amber-400/50 animate-[spin_8s_linear_infinite]" />
              {/* Core Neural Glowing Orb */}
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-600 via-amber-500 to-yellow-400 shadow-[0_0_40px_rgba(255,107,0,0.6)] flex items-center justify-center animate-pulse">
                <Sparkles size={28} className="text-black animate-spin" />
              </div>
            </div>

            <h4 className="text-base font-bold text-white mb-1">
              Inicializando Motor Puppeteer OSONE...
            </h4>
            <p className="text-xs text-orange-300/80 max-w-sm">
              Carregando Chromium e autenticação persistente em disco...
            </p>
          </motion.div>
        )}

        {/* State 4: DESCONECTADO */}
        {status === 'desconectado' && !isConnecting && (
          <motion.div
            key="disconnected"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center justify-center p-6 text-center bg-black/40 rounded-2xl border border-white/5 my-2"
          >
            <div className="w-16 h-16 rounded-full bg-zinc-800/80 border border-white/10 flex items-center justify-center text-zinc-400 mb-4">
              <WifiOff size={28} />
            </div>

            <h4 className="text-base font-bold text-white mb-1">WhatsApp Desconectado</h4>
            <p className="text-xs text-zinc-400 mb-6 max-w-sm">
              Clique no botão abaixo para inicializar o cliente local e parear seu WhatsApp via QR Code.
            </p>

            <button
              onClick={handleConnect}
              className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black font-bold text-xs shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Power size={14} />
              Iniciar Conexão WhatsApp
            </button>
          </motion.div>
        )}

        {/* State 5: ERRO */}
        {status === 'erro' && !isConnecting && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center justify-center p-6 text-center bg-red-500/10 rounded-2xl border border-red-500/30 my-2"
          >
            <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 mb-4">
              <AlertCircle size={28} />
            </div>

            <h4 className="text-base font-bold text-red-400 mb-1">Falha na Conexão</h4>
            <p className="text-xs text-red-300/80 mb-4 max-w-sm font-mono break-all bg-black/40 p-3 rounded-xl border border-red-500/20">
              {errorMsg || "Não foi possível inicializar o navegador Puppeteer local."}
            </p>

            <button
              onClick={handleConnect}
              className="px-6 py-2.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs shadow-lg transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw size={14} />
              Tentar Novamente
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-500">
        <span className="flex items-center gap-1">
          <RefreshCw size={12} className="animate-spin text-orange-400" />
          Status atualizado em tempo real (Polling 3s)
        </span>
        <span className="font-mono text-zinc-400">OSONE v5.0</span>
      </div>
    </div>
  );
}
