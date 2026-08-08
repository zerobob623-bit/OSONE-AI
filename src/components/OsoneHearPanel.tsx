import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import {
  Ear, Mic, Square, Sparkles, Copy, Check, Trash2, AlertCircle, Loader2, FileText, Wand2, Keyboard
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  ESCUTA_VAZIA,
  EstadoDaEscuta,
  aplicarResultado,
  contarPalavras,
  criarReconhecedor,
  explicarErroDaEscuta,
  formatarDuracao,
  reconhecimentoDisponivel,
  textoDaEscuta
} from '../lib/escutaAtiva';
import {
  DiscursoElaborado,
  MINIMO_DE_PALAVRAS,
  elaborarDiscurso
} from '../lib/elaborarDiscurso';

/**
 * OSONE HEAR — o microfone que fica ouvindo, e o discurso que sai organizado no formato que o
 * assunto pede.
 *
 * O caminho é curto de propósito: liga o microfone, fala o quanto quiser, para, e clica em
 * elaborar. Tudo que decide se isso funciona está fora daqui — a acumulação do reconhecimento
 * em `lib/escutaAtiva.ts` e a escolha do formato em `lib/elaborarDiscurso.ts` —, porque as duas
 * coisas são lógica que precisa ser conferida sem microfone e sem alguém falando na sala.
 */

/** A transcrição sobrevive a um recarregar sem querer: uma hora de fala não se refaz. */
const CHAVE_DA_TRANSCRICAO = 'osone_hear_transcricao';

export const OsoneHearPanel: React.FC<{
  chaveGemini?: string;
  modeloGemini?: string;
  onNotification?: (msg: string, type: 'info' | 'success' | 'error') => void;
}> = ({ chaveGemini, modeloGemini, onNotification }) => {
  const [suportado] = useState<boolean>(() => reconhecimentoDisponivel());
  const [ouvindo, setOuvindo] = useState(false);
  const [escuta, setEscuta] = useState<EstadoDaEscuta>(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_DA_TRANSCRICAO);
      return salvo ? { finalizado: salvo, parcial: '' } : ESCUTA_VAZIA;
    } catch { return ESCUTA_VAZIA; }
  });
  const [aviso, setAviso] = useState('');
  const [segundos, setSegundos] = useState(0);

  const [elaborando, setElaborando] = useState(false);
  const [resultado, setResultado] = useState<DiscursoElaborado | null>(null);
  const [erroDaElaboracao, setErroDaElaboracao] = useState('');
  const [copiado, setCopiado] = useState<'transcricao' | 'discurso' | ''>('');

  const reconhecedorRef = useRef<any>(null);
  /**
   * Se a parada foi pedida pela PESSOA ou veio do navegador desligando sozinho no silêncio.
   * Vive num ref, e não em estado, porque quem lê isso é o `onend` do reconhecedor — um callback
   * preso ao render em que foi criado, que enxergaria para sempre o primeiro valor do estado e
   * religaria o microfone depois de a pessoa mandar parar.
   */
  const pararDeVezRef = useRef(false);
  const areaDaTranscricaoRef = useRef<HTMLDivElement>(null);

  const texto = textoDaEscuta(escuta);
  const palavras = contarPalavras(escuta.finalizado);

  // Guarda só o definitivo: o parcial é uma aposta do navegador que ainda vai mudar.
  useEffect(() => {
    try {
      if (escuta.finalizado) localStorage.setItem(CHAVE_DA_TRANSCRICAO, escuta.finalizado);
      else localStorage.removeItem(CHAVE_DA_TRANSCRICAO);
    } catch { /* sem espaço no navegador: a transcrição segue valendo nesta sessão */ }
  }, [escuta.finalizado]);

  // O cronômetro é da sessão de escuta, não do componente.
  useEffect(() => {
    if (!ouvindo) return;
    const t = setInterval(() => setSegundos(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [ouvindo]);

  // Acompanha o que está sendo dito, sem exigir que a pessoa role a página enquanto fala.
  useEffect(() => {
    const area = areaDaTranscricaoRef.current;
    if (area && ouvindo) area.scrollTop = area.scrollHeight;
  }, [texto, ouvindo]);

  const pararEscuta = useCallback(() => {
    pararDeVezRef.current = true;
    try { reconhecedorRef.current?.stop(); } catch { /* já estava parado */ }
    setOuvindo(false);
    // A última aposta parcial é promovida a definitivo: quem para no meio de uma frase não pode
    // perdê-la só porque o navegador não teve tempo de confirmá-la.
    setEscuta(atual => atual.parcial
      ? { finalizado: textoDaEscuta(atual), parcial: '' }
      : atual);
  }, []);

  const comecarEscuta = useCallback(() => {
    if (!suportado) return;

    const rec = criarReconhecedor('pt-BR');
    if (!rec) return;

    reconhecedorRef.current = rec;
    pararDeVezRef.current = false;
    setAviso('');
    setSegundos(0);

    rec.onresult = (evento: any) => {
      setEscuta(atual => aplicarResultado(atual, evento));
    };

    rec.onerror = (evento: any) => {
      const explicacao = explicarErroDaEscuta(evento?.error || '');
      if (explicacao) setAviso(explicacao);
      // Erro de permissão e de microfone não têm como se resolver religando — insistir viraria
      // um laço de tentativas que nunca dá certo e ainda esconde a causa.
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(evento?.error)) {
        pararDeVezRef.current = true;
        setOuvindo(false);
      }
    };

    /**
     * AQUI É A "ESCUTA ATIVA". O navegador encerra a sessão em cada silêncio um pouco mais
     * longo — a pausa entre dois parágrafos basta. Sem religar, o microfone morre na primeira
     * respiração de quem fala, e a pessoa segue discursando para um campo que parou de
     * escrever. Só a parada pedida por ela é definitiva.
     */
    rec.onend = () => {
      if (pararDeVezRef.current) {
        setOuvindo(false);
        return;
      }
      try {
        rec.start();
      } catch {
        // start() logo após onend às vezes é recusado por ainda estar encerrando; uma batida
        // depois ele aceita. Sem esta segunda tentativa, uma pausa mais longa encerrava a escuta.
        setTimeout(() => {
          if (!pararDeVezRef.current) {
            try { rec.start(); } catch { setOuvindo(false); }
          }
        }, 300);
      }
    };

    try {
      rec.start();
      setOuvindo(true);
    } catch (e: any) {
      setAviso(`Não foi possível abrir o microfone: ${e?.message || e}`);
      setOuvindo(false);
    }
  }, [suportado]);

  // Um reconhecedor vivo depois que a aba fecha continua com o microfone aberto.
  useEffect(() => () => {
    pararDeVezRef.current = true;
    try { reconhecedorRef.current?.stop(); } catch { /* já estava parado */ }
  }, []);

  const limpar = () => {
    if (ouvindo) pararEscuta();
    setEscuta(ESCUTA_VAZIA);
    setResultado(null);
    setErroDaElaboracao('');
    setSegundos(0);
  };

  const editarTranscricao = (conteudo: string) => {
    setEscuta({ finalizado: conteudo, parcial: '' });
    // Um resultado elaborado antes da correção pertence ao texto antigo.
    setResultado(null);
    setErroDaElaboracao('');
  };

  const copiar = (conteudo: string, qual: 'transcricao' | 'discurso') => {
    navigator.clipboard?.writeText(conteudo);
    setCopiado(qual);
    setTimeout(() => setCopiado(''), 2000);
  };

  const elaborar = async () => {
    // Com a escuta ligada, o discurso ainda está crescendo: elaborar agora entregaria ao modelo
    // um texto cortado no meio da frase que está sendo dita.
    if (ouvindo) pararEscuta();

    setElaborando(true);
    setErroDaElaboracao('');
    try {
      const elaborado = await elaborarDiscurso({
        transcricao: textoDaEscuta(escuta),
        chaveGemini,
        modelo: modeloGemini
      });
      setResultado(elaborado);
      onNotification?.(`Discurso elaborado: "${elaborado.tema}" (${elaborado.formato}).`, 'success');
    } catch (e: any) {
      const msg = e?.message || String(e);
      setErroDaElaboracao(msg);
      onNotification?.(`Não foi possível elaborar o discurso: ${msg}`, 'error');
    } finally {
      setElaborando(false);
    }
  };

  const podeElaborar = palavras >= MINIMO_DE_PALAVRAS && !elaborando;

  return (
    <div className="w-full flex-1 flex flex-col bg-[#07090e] text-zinc-100 min-h-0 overflow-hidden font-sans relative">

      <div className="h-16 border-b border-white/5 bg-[#0a0d14]/90 backdrop-blur-md px-6 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300 shadow-lg shadow-violet-950/40">
            <Ear size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
              OSONE HEAR
              <span className={cn(
                "text-[10px] px-2.5 py-0.5 rounded-full border font-normal transition-colors",
                ouvindo
                  ? "bg-red-500/15 text-red-300 border-red-500/40"
                  : "bg-violet-500/10 text-violet-300 border-violet-500/30"
              )}>
                {ouvindo ? 'ouvindo' : 'escuta ativa'}
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Fale à vontade. O OSONE escreve tudo e depois organiza no formato que o assunto pedir.
            </p>
          </div>
        </div>

        {ouvindo && (
          <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/50 border border-red-500/25">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-sm font-mono font-bold text-red-300 tabular-nums">{formatarDuracao(segundos)}</span>
            <span className="text-[11px] font-mono text-zinc-500">{palavras} palavra(s)</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 min-h-0 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-5">

          {/* Navegador sem reconhecimento de voz: dizer, em vez de mostrar um botão que não faz
              nada. O Firefox é o caso comum, e o silêncio ali pareceria defeito do OSONE. */}
          {!suportado && (
            <div className="p-6 rounded-3xl bg-[#0c0e17] border border-amber-500/30 flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white font-mono">Este navegador não transcreve voz</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  O OSONE HEAR usa o reconhecimento de voz do próprio navegador, e o seu não tem esse recurso
                  (o Firefox, por exemplo, não tem). Abra o OSONE no Chrome, no Edge ou pelo app instalado.
                </p>
              </div>
            </div>
          )}

          {/* O MICROFONE. Um botão só, grande, que liga e desliga — não há modo escondido. */}
          <div className="p-8 rounded-3xl bg-[#0c0f18] border border-white/5 flex flex-col items-center gap-4">
            <button
              onClick={ouvindo ? pararEscuta : comecarEscuta}
              disabled={!suportado}
              className={cn(
                "relative w-24 h-24 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed",
                ouvindo
                  ? "bg-red-500 text-black shadow-2xl shadow-red-500/30"
                  : "bg-violet-500 hover:bg-violet-400 text-black shadow-2xl shadow-violet-500/25"
              )}
              title={ouvindo ? 'Parar a escuta' : 'Começar a escutar'}
            >
              {ouvindo && (
                <motion.span
                  className="absolute inset-0 rounded-full bg-red-500/40"
                  animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <span className="relative">{ouvindo ? <Square size={30} fill="currentColor" /> : <Mic size={34} />}</span>
            </button>

            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-white font-mono">
                {ouvindo ? 'Ouvindo — pode falar' : palavras > 0 ? 'Escuta parada' : 'Toque para começar a falar'}
              </p>
              <p className="text-xs text-zinc-500 leading-relaxed max-w-md">
                {ouvindo
                  ? 'Pode pausar entre as frases: a escuta se religa sozinha e só termina quando você mandar parar.'
                  : 'A escuta fica ligada até você parar. Pausas no meio do discurso não a encerram.'}
              </p>
            </div>

            {aviso && (
              <div className="w-full p-3 rounded-2xl bg-amber-500/[0.07] border border-amber-500/25 flex items-start gap-2">
                <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                <span className="text-[11px] text-amber-100/80 leading-relaxed">{aviso}</span>
              </div>
            )}
          </div>

          {/* TRANSCRIÇÃO DO DISCURSO */}
          <div className="rounded-3xl bg-[#0c0f18] border border-white/5 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText size={15} className="text-violet-400 shrink-0" />
                <h3 className="text-sm font-bold text-white font-mono truncate">Transcrição do discurso</h3>
                {palavras > 0 && (
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0">{palavras} palavra(s)</span>
                )}
              </div>
              {!ouvindo && (
                <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-violet-300/80 shrink-0">
                  <Keyboard size={12} /> Clique abaixo para digitar ou corrigir
                </span>
              )}
              {texto && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => copiar(texto, 'transcricao')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer"
                    title="Copiar a transcrição"
                  >
                    {copiado === 'transcricao' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                  <button
                    onClick={limpar}
                    className="p-2 rounded-xl bg-white/5 hover:bg-red-500/15 text-zinc-500 hover:text-red-300 transition-all cursor-pointer"
                    title="Apagar tudo e começar de novo"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>

            <div
              ref={areaDaTranscricaoRef}
              className="p-5 min-h-[220px] max-h-[420px] overflow-y-auto custom-scrollbar"
            >
              {ouvindo ? (
                <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {escuta.finalizado}
                  {/* A cauda que ainda está sendo decidida aparece apagada: quem lê enxerga que
                      aquele trecho ainda pode mudar, em vez de achar que o OSONE escreveu errado. */}
                  {escuta.parcial && (
                    <span className="text-zinc-500 italic">{escuta.finalizado ? ' ' : ''}{escuta.parcial}</span>
                  )}
                </p>
              ) : (
                <textarea
                  value={escuta.finalizado}
                  onChange={evento => editarTranscricao(evento.target.value)}
                  className="block w-full min-h-[180px] resize-y bg-transparent text-sm text-zinc-200 leading-relaxed outline-none placeholder:text-zinc-600 caret-violet-400"
                  placeholder="Nada transcrito ainda. Fale pelo microfone ou clique aqui para digitar, colar e corrigir o texto."
                  aria-label="Transcrição editável do discurso"
                  spellCheck
                />
              )}
            </div>

            {/* ELABORAR DISCURSO — logo abaixo da transcrição, que é onde a pessoa termina de ler. */}
            <div className="px-5 py-4 border-t border-white/5 bg-black/20 flex flex-wrap items-center gap-3">
              <button
                onClick={elaborar}
                disabled={!podeElaborar}
                className={cn(
                  "px-5 py-3 rounded-2xl font-bold text-xs font-mono transition-all flex items-center gap-2 cursor-pointer",
                  podeElaborar
                    ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 text-black shadow-lg shadow-violet-500/20"
                    : "bg-white/5 text-zinc-600 cursor-not-allowed"
                )}
              >
                {elaborando ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                <span>{elaborando ? 'Elaborando...' : 'Elaborar discurso'}</span>
              </button>
              <span className="text-[11px] text-zinc-500 leading-tight">
                {palavras < MINIMO_DE_PALAVRAS
                  ? 'Fale um pouco mais para o OSONE ter o que organizar.'
                  : 'O OSONE lê o discurso, nomeia o tema e escolhe a forma que aquele assunto pede.'}
              </span>
            </div>
          </div>

          {erroDaElaboracao && (
            <div className="p-5 rounded-3xl bg-[#0c0e17] border border-red-500/30 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <h3 className="text-sm font-bold text-white font-mono">A elaboração falhou</h3>
                {/* A transcrição continua intacta: o texto abaixo do erro é o motivo, não a perda. */}
                <p className="text-xs text-red-200/70 leading-relaxed break-words">{erroDaElaboracao}</p>
                <p className="text-[11px] text-zinc-500 leading-relaxed pt-1">
                  Sua transcrição não foi perdida — está inteira aí em cima. Pode tentar de novo.
                </p>
              </div>
            </div>
          )}

          {/* O DISCURSO ELABORADO */}
          {resultado && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl bg-[#0c0f18] border border-violet-500/25 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-white/5 bg-gradient-to-r from-violet-500/[0.07] to-transparent space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Sparkles size={16} className="text-violet-400 shrink-0" />
                    <h3 className="text-base font-bold text-white truncate">{resultado.tema}</h3>
                  </div>
                  <button
                    onClick={() => copiar(resultado.discurso, 'discurso')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all shrink-0 cursor-pointer"
                    title="Copiar o discurso elaborado"
                  >
                    {copiado === 'discurso' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                </div>

                {/* A ESCOLHA APARECE. Mostrar qual formato foi usado e por quê é o que deixa a
                    adaptação verificável: se o mesmo formato voltar para todo assunto, quem
                    está lendo percebe na hora, em vez de o padrão passar despercebido. */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                    {resultado.formato}
                  </span>
                  {resultado.porqueDoFormato && (
                    <span className="text-[11px] text-zinc-500 leading-relaxed">{resultado.porqueDoFormato}</span>
                  )}
                </div>
              </div>

              {/* 'markdown-body' é a classe que este projeto usa para texto vindo de Markdown
                  (definida em index.css). O `prose` do Tailwind não serve aqui: o plugin de
                  tipografia não está instalado, então essas classes não geram CSS nenhum e o
                  discurso sairia sem títulos e sem marcadores de lista. */}
              <div className="p-6 markdown-body leading-relaxed">
                <ReactMarkdown>{resultado.discurso}</ReactMarkdown>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};
