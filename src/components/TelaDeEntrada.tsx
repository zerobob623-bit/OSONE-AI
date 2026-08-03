import React from 'react';
import { motion } from 'motion/react';
import { Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';

/**
 * A porta do OSONE: sem conta Google, o app não abre.
 *
 * Antes havia três caminhos de entrada (Google, perfil local no navegador e modo visitante), e o
 * usuário só queria um. Os outros dois não eram apenas supérfluos: perfil local guarda memória que
 * some junto com o navegador, e o visitante entra sem identidade nenhuma — três estados diferentes
 * para o mesmo app, cada um com um comportamento de memória diferente.
 *
 * Com uma porta só, a contrapartida é que uma falha de configuração do Firebase deixa de ser um
 * incômodo e passa a trancar o app inteiro. É por isso que esta tela não tem um botão mudo: ela
 * nomeia a variável que falta, o endereço em que o app está rodando e a tela do Console onde se
 * resolve — o que der errado aqui precisa dizer o que fazer, porque não há um segundo caminho.
 */
export const TelaDeEntrada = ({
  onEntrarComGoogle,
  carregando,
  erro,
  configFaltando
}: {
  onEntrarComGoogle: () => Promise<void>;
  carregando: boolean;
  erro: string | null;
  /** Variáveis VITE_FIREBASE_* ausentes nesta instalação. Vazio quando está tudo certo. */
  configFaltando: string[];
}) => {
  const semConfiguracao = configFaltando.length > 0;
  const endereco = typeof window !== 'undefined' ? window.location.origin : '';

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
        <h1 className="mt-3 text-2xl font-light text-neutral-100">Sistema Operacional Neural</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-neutral-500">
          Entre com sua conta Google para o OSONE reconhecer você e sincronizar memórias, histórico
          e configurações em qualquer aparelho.
        </p>

        {semConfiguracao ? (
          <div className="mt-8 w-full p-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] text-left">
            <div className="flex items-center gap-2 text-amber-400 text-[11px] font-bold uppercase tracking-widest">
              <AlertTriangle size={13} />
              Instalação sem as chaves do Firebase
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-neutral-400">
              Esta cópia do OSONE foi construída sem os dados do projeto Firebase, então não existe
              login para oferecer. Preencha no arquivo <code className="text-amber-300/90">.env</code> (ou
              nos secrets do GitHub, se o app veio de uma release):
            </p>
            <ul className="mt-2 space-y-1">
              {configFaltando.map(nome => (
                <li key={nome} className="text-[11px] font-mono text-amber-300/90">{nome}</li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
              Os valores estão no Console do Firebase, em Configurações do projeto &gt; Seus apps.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={onEntrarComGoogle}
            disabled={carregando}
            className="mt-8 w-full py-3.5 rounded-2xl border border-emerald-500/25 hover:border-emerald-500/50
                       bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12] text-emerald-300 text-[13px] font-bold
                       flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 disabled:cursor-wait"
          >
            {carregando ? <Loader2 size={16} className="animate-spin" /> : <GoogleGlifo />}
            {carregando ? 'Abrindo o Google...' : 'Entrar com Google'}
          </button>
        )}

        {erro && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 w-full p-3 rounded-xl border border-red-500/25 bg-red-500/[0.05] text-left"
          >
            <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold uppercase tracking-widest">
              <AlertTriangle size={12} />
              Não deu para entrar
            </div>
            {/* O texto do erro é longo de propósito — ele traz a tela do Console e o valor a
                preencher. Cortá-lo devolveria o "deu erro" que não diz nada. */}
            <p className="mt-1.5 text-[12px] leading-relaxed text-red-200/80">{erro}</p>
          </motion.div>
        )}

        <div className="mt-8 flex items-center gap-2 text-[10px] text-neutral-600">
          <ShieldCheck size={12} />
          <span>O OSONE recebe do Google apenas nome, e-mail e foto.</span>
        </div>
        {endereco && (
          <span className="mt-2 text-[9px] font-mono text-neutral-700">{endereco}</span>
        )}
      </motion.div>
    </div>
  );
};

/** O "G" do Google nas cores oficiais — é o que faz o botão ser reconhecido sem ler. */
const GoogleGlifo = () => (
  <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.7-.4-4H24v7.3h12.1c-.2 1.9-1.6 4.9-4.5 6.9l6.9 5.3c4.1-3.8 6.6-9.4 6.6-15.5z" />
    <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.3c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8.1 41 15.4 46 24 46z" />
    <path fill="#FBBC05" d="M11.5 28.5c-.5-1.4-.7-2.9-.7-4.5s.3-3.1.7-4.5l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 10z" />
    <path fill="#EA4335" d="M24 10.6c4.1 0 6.9 1.8 8.5 3.3l6.1-6C34.9 4.5 29.9 2 24 2 15.4 2 8.1 7 4.4 14l7.1 5.5c1.8-5.3 6.7-8.9 12.5-8.9z" />
  </svg>
);
