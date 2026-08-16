import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { auth, googleProvider, signInWithPopup, explicarErroDeLogin } from '../firebase';

/**
 * Tela aberta pelo app INSTALADO no navegador padrão do sistema, nunca dentro do Electron.
 *
 * O Google recusa o popup de login dentro de uma janela do Electron, mas sempre aceitou aqui —
 * é por isso que o app instalado manda a pessoa para cá em vez de tentar entrar na própria
 * janela. Depois do login, esta aba entrega a sessão de volta ao app instalado através de
 * "codigo" (um código de uso único gerado pelo Electron) e pode ser fechada.
 */
export const TelaDeEntregaDeLogin = ({ codigo }: { codigo: string }) => {
  const [estado, setEstado] = useState<'entrando' | 'enviando' | 'concluido' | 'erro'>('entrando');
  const [erro, setErro] = useState<string>('');
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setEstado('entrando');
      setErro('');
      try {
        const resultado = await signInWithPopup(auth, googleProvider);
        if (cancelado) return;
        setEstado('enviando');
        const idToken = await resultado.user.getIdToken();
        const resposta = await fetch('/api/login/entrega', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo, idToken })
        });
        if (!resposta.ok) {
          const dados = await resposta.json().catch(() => ({}));
          throw new Error(dados?.error || 'O servidor recusou a entrega do login.');
        }
        if (!cancelado) setEstado('concluido');
      } catch (err: any) {
        if (cancelado) return;
        console.error('Erro na entrega de login para o app instalado:', err);
        setErro(explicarErroDeLogin(err) || err?.message || 'Não foi possível concluir o login.');
        setEstado('erro');
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, tentativa]);

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden flex flex-col items-center justify-center bg-[#0d0c0b] px-6">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_40%,_rgba(230,126,34,0.06)_0%,_transparent_65%)]" />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-[420px] flex flex-col items-center text-center"
      >
        <span className="text-[9px] tracking-[0.5em] uppercase text-her-muted font-light opacity-50">OSONE G5</span>
        <h1 className="mt-3 text-2xl font-light text-neutral-100">Login para o app instalado</h1>

        {(estado === 'entrando' || estado === 'enviando') && (
          <>
            <Loader2 className="mt-8 w-6 h-6 animate-spin text-her-accent" />
            <p className="mt-4 text-[13px] leading-relaxed text-neutral-500">
              {estado === 'entrando'
                ? 'Aguardando você entrar com sua conta Google...'
                : 'Entregando o login para o OSONE instalado no seu computador...'}
            </p>
          </>
        )}

        {estado === 'concluido' && (
          <>
            <CheckCircle2 className="mt-8 w-8 h-8 text-emerald-400" />
            <p className="mt-4 text-[13px] leading-relaxed text-neutral-300">
              Pronto! O login foi concluído no aplicativo OSONE.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">
              Pode voltar para o app instalado e fechar esta aba.
            </p>
          </>
        )}

        {estado === 'erro' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8 w-full p-3 rounded-xl border border-red-500/25 bg-red-500/[0.05] text-left"
          >
            <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold uppercase tracking-widest">
              <AlertTriangle size={12} />
              Não deu para entrar
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-red-200/80">{erro}</p>
            <button
              type="button"
              onClick={() => setTentativa(n => n + 1)}
              className="mt-3 w-full py-2.5 rounded-xl border border-white/15 hover:border-white/30
                         bg-white/[0.03] hover:bg-white/[0.07] text-neutral-200 text-[12px] font-medium
                         flex items-center justify-center gap-2 transition-all"
            >
              Tentar de novo
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};
