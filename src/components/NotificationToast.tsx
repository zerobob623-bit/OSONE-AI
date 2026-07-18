import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, CheckCircle, AlertCircle, X } from 'lucide-react';
import { cn } from '../lib/utils';

export type NotificationType = 'info' | 'success' | 'error';

interface NotificationProps {
  id: string;
  message: string;
  type?: NotificationType;
  onClose: (id: string) => void;
  duration?: number;
}

export function NotificationToast({ id, message, type = 'info', onClose, duration = 7000 }: NotificationProps) {
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = setTimeout(() => {
      onCloseRef.current(id);
    }, duration);
    return () => clearTimeout(timer);
  }, [id, duration]);

  const icons = {
    info: <Info size={18} className="text-blue-400" />,
    success: <CheckCircle size={18} className="text-green-400" />,
    error: <AlertCircle size={18} className="text-red-400" />,
  };

  const bgColors = {
    info: 'bg-blue-500/10 border-blue-500/20',
    success: 'bg-green-500/10 border-green-500/20',
    error: 'bg-red-500/10 border-red-500/20',
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.95 }}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl pointer-events-auto min-w-[280px] max-w-sm",
        bgColors[type]
      )}
    >
      <div className="shrink-0">{icons[type]}</div>
      <p className="flex-1 text-sm text-her-ink/90 font-medium">{message}</p>
      <button 
        onClick={() => onClose(id)}
        className="shrink-0 p-1 hover:bg-white/10 rounded-full transition-colors text-her-ink/40 hover:text-her-ink"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
