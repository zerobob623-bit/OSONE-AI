import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Camera, Loader2, Mic, Square, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  ESCUTA_VAZIA, EstadoDaEscuta, aplicarResultado, criarReconhecedor,
  explicarErroDaEscuta, reconhecimentoDisponivel, textoDaEscuta
} from '../lib/escutaAtiva';
import {
  QuadroDoEnsino, TreinamentoDoCowork, apagarTreinamentoDoCowork,
  assimilarEnsinamento, lerTreinamentosDoCowork, salvarTreinamentoDoCowork
} from '../lib/ensinoDoCowork';
import { apagarAutomacaoEnsinada, guardarAutomacaoEnsinada } from '../lib/historicoDoCowork';
import { tocar } from '../lib/somDoCowork';

interface Props {
  objetivo: string;
  bloqueado?: boolean;
  chaveGemini?: string;
  modeloGemini?: string;
  onNotification: (mensagem: string, tipo?: 'success' | 'error' | 'info') => void;
}

type EstadoDoEnsino = 'parado' | 'iniciando' | 'gravando' | 'assimilando';

/**
 * Ensino por demonstração: a pessoa compartilha a tela que vai usar, fala e executa o caminho.
 * Cada frase definitiva ganha um frame JPEG comprimido. Ao concluir, fala + frames viram passos
 * semânticos e o material bruto permanece no IndexedDB local para poder ser revisto.
 */
export const CoworkTeachingPanel: React.FC<Props> = ({
  objetivo, bloqueado, chaveGemini, modeloGemini, onNotification
}) => {
  const [estado, setEstado] = useState<EstadoDoEnsino>('parado');
  const [escuta, setEscuta] = useState<EstadoDaEscuta>(ESCUTA_VAZIA);
  const [quadros, setQuadros] = useState<QuadroDoEnsino[]>([]);
  const [aviso, setAviso] = useState('');
  const [treinamentos, setTreinamentos] = useState<TreinamentoDoCowork[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const reconhecedorRef = useRef<any>(null);
  const pararDeVezRef = useRef(false);
  const escutaRef = useRef<EstadoDaEscuta>(ESCUTA_VAZIA);
  const quadrosRef = useRef<QuadroDoEnsino[]>([]);
  const filaDeCapturaRef = useRef<Promise<any>>(Promise.resolve());

  useEffect(() => { lerTreinamentosDoCowork().then(setTreinamentos); }, []);
  useEffect(() => { escutaRef.current = escuta; }, [escuta]);
  useEffect(() => { quadrosRef.current = quadros; }, [quadros]);

  const encerrarDispositivos = useCallback(() => {
    pararDeVezRef.current = true;
    try { reconhecedorRef.current?.stop(); } catch { /* já acabou */ }
    reconhecedorRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => encerrarDispositivos, [encerrarDispositivos]);

  const capturarQuadro = useCallback(async (fala: string, forcar = false) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return false;
    if (!forcar && quadrosRef.current.length >= 12) return false;

    const largura = Math.min(960, video.videoWidth);
    const altura = Math.max(1, Math.round(video.videoHeight * (largura / video.videoWidth)));
    const canvas = document.createElement('canvas');
    canvas.width = largura; canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, largura, altura);
    const imagem = canvas.toDataURL('image/jpeg', 0.72);
    const anterior = quadrosRef.current[quadrosRef.current.length - 1];
    // A mesma imagem pode ser pedida pelo fim da frase e logo depois pelo botão de concluir.
    if (!forcar && anterior?.imagem === imagem) return false;
    const quadro: QuadroDoEnsino = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      capturadoEm: Date.now(), fala: fala.trim(), imagem
    };
    const nova = [...quadrosRef.current, quadro].slice(-12);
    quadrosRef.current = nova;
    setQuadros(nova);
    tocar('captura');
    return true;
  }, []);

  const enfileirarCaptura = useCallback((fala: string, forcar = false) => {
    filaDeCapturaRef.current = filaDeCapturaRef.current.then(() => capturarQuadro(fala, forcar));
    return filaDeCapturaRef.current;
  }, [capturarQuadro]);

  const iniciarReconhecimento = useCallback(() => {
    const rec = criarReconhecedor('pt-BR');
    if (!rec) throw new Error('Este navegador não oferece transcrição de voz.');
    reconhecedorRef.current = rec;
    pararDeVezRef.current = false;

    rec.onresult = (evento: any) => {
      setEscuta(atual => {
        const nova = aplicarResultado(atual, evento);
        escutaRef.current = nova;
        return nova;
      });
      // Um frame no fim de cada frase liga “o que você explicou” ao estado que demonstrou.
      for (let i = Math.max(0, evento.resultIndex || 0); i < (evento.results?.length || 0); i++) {
        const resultado = evento.results[i];
        const fala = String(resultado?.[0]?.transcript || '').trim();
        if (resultado?.isFinal && fala) enfileirarCaptura(fala);
      }
    };
    rec.onerror = (evento: any) => {
      const mensagem = explicarErroDaEscuta(evento?.error || '');
      if (mensagem) setAviso(mensagem);
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(evento?.error)) {
        pararDeVezRef.current = true;
        encerrarDispositivos();
        setEstado('parado');
      }
    };
    rec.onend = () => {
      if (pararDeVezRef.current) return;
      setTimeout(() => {
        if (!pararDeVezRef.current) {
          try { rec.start(); } catch { setAviso('O microfone parou. Conclua o ensino para preservar o que já foi gravado.'); }
        }
      }, 250);
    };
    rec.start();
  }, [encerrarDispositivos, enfileirarCaptura]);

  const iniciar = async () => {
    if (!objetivo.trim()) {
      onNotification('Escreva primeiro o nome da tarefa que você vai ensinar.', 'error');
      return;
    }
    if (!reconhecimentoDisponivel()) {
      onNotification('Este navegador não oferece transcrição contínua. Use o Chrome ou o app instalado.', 'error');
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      onNotification('O compartilhamento de tela não está disponível neste ambiente.', 'error');
      return;
    }
    setEstado('iniciando'); setAviso(''); setEscuta(ESCUTA_VAZIA); setQuadros([]);
    escutaRef.current = ESCUTA_VAZIA; quadrosRef.current = [];
    // Ainda dentro do clique da pessoa: libera o AudioContext antes de abrir o seletor nativo,
    // para os sons de captura continuarem permitidos quando ela estiver demonstrando noutra aba.
    tocar('ensinando');
    try {
      // O clique neste botão é o gesto exigido pelo navegador para abrir o seletor de tela.
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 8 }, audio: false });
      streamRef.current = stream;
      const video = document.createElement('video');
      video.muted = true; video.playsInline = true; video.srcObject = stream;
      videoRef.current = video;
      await video.play();
      await new Promise<void>(resolve => {
        if (video.readyState >= 2) resolve();
        else video.onloadeddata = () => resolve();
      });
      stream.getVideoTracks()[0].onended = () => {
        pararDeVezRef.current = true;
        try { reconhecedorRef.current?.stop(); } catch { /* idem */ }
        // Mantém o botão “Concluir ensino”: fechar o compartilhamento não pode jogar fora fala e
        // quadros já gravados. A assimilação segue com o material capturado até aqui.
        setAviso('O compartilhamento foi encerrado. Clique em Concluir ensino para assimilar o que já foi demonstrado.');
      };
      iniciarReconhecimento();
      setEstado('gravando');
      await enfileirarCaptura('Tela inicial da demonstração', true);
    } catch (err: any) {
      encerrarDispositivos();
      setEstado('parado');
      const mensagem = err?.name === 'NotAllowedError'
        ? 'O compartilhamento ou o microfone não foi autorizado.'
        : `Não consegui iniciar o ensino: ${err?.message || err}`;
      setAviso(mensagem);
      onNotification(mensagem, 'error');
    }
  };

  const concluir = async () => {
    if (estado !== 'gravando') return;
    // O último quadro precisa ser tirado antes de encerrar a faixa compartilhada.
    await enfileirarCaptura('Estado final da demonstração', true);
    pararDeVezRef.current = true;
    try { reconhecedorRef.current?.stop(); } catch { /* idem */ }
    const atual = escutaRef.current;
    const transcricao = textoDaEscuta(atual).trim();
    encerrarDispositivos();
    if (!transcricao || !quadrosRef.current.length) {
      setEstado('parado');
      onNotification('Fale pelo menos uma instrução durante a demonstração.', 'error');
      return;
    }
    setEstado('assimilando');
    try {
      const assimilado = await assimilarEnsinamento({
        objetivo: objetivo.trim(), transcricao, quadros: quadrosRef.current,
        chaveGemini, modelo: modeloGemini
      });
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const treinamento: TreinamentoDoCowork = {
        id, objetivo: objetivo.trim(), transcricao, criadoEm: Date.now(),
        quadros: quadrosRef.current, ...assimilado
      };
      setTreinamentos(await salvarTreinamentoDoCowork(treinamento));
      guardarAutomacaoEnsinada({ objetivo: treinamento.objetivo, treinamentoId: id, passos: assimilado.passos });
      setEstado('parado');
      tocar('concluido');
      onNotification(`Automação ensinada: ${assimilado.passos.length} passo(s) assimilado(s).`, 'success');
    } catch (err: any) {
      setEstado('parado');
      const mensagem = err?.message || 'Não foi possível assimilar o treinamento.';
      setAviso(mensagem); onNotification(mensagem, 'error'); tocar('falha');
    }
  };

  const excluir = async (id: string) => {
    apagarAutomacaoEnsinada(id);
    setTreinamentos(await apagarTreinamentoDoCowork(id));
  };

  const gravando = estado === 'gravando';
  return (
    <div className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.035] p-5">
      <div className="flex items-center gap-2">
        <BookOpen size={15} className="text-violet-300" />
        <p className="text-[10px] uppercase tracking-[0.2em] text-violet-200/80 flex-1">Ensinar por demonstração</p>
        {gravando && <span className="text-[9px] uppercase tracking-widest text-red-300 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> gravando</span>}
      </div>
      <p className="mt-2 text-[11px] text-her-muted leading-relaxed">
        Compartilhe a aba ou tela, faça o caminho e explique em voz alta como ensinaria uma pessoa. Cada pausa associa sua fala ao quadro atual.
      </p>
      <p className="mt-1 text-[9px] text-her-muted/65 leading-relaxed">
        Fala e quadros são enviados ao Gemini ao concluir para assimilar os passos e ficam salvos somente neste aparelho, no IndexedDB.
      </p>

      {gravando ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => enfileirarCaptura('Quadro registrado manualmente', true)} className="py-2.5 rounded-xl border border-white/10 text-xs text-her-ink/80 hover:bg-white/[0.04] flex items-center justify-center gap-2">
            <Camera size={13} /> Registrar quadro
          </button>
          <button onClick={concluir} className="py-2.5 rounded-xl border border-red-500/25 bg-red-500/10 text-xs text-red-200 hover:bg-red-500/15 flex items-center justify-center gap-2">
            <Square size={12} /> Concluir ensino
          </button>
        </div>
      ) : (
        <button
          onClick={iniciar}
          disabled={bloqueado || estado !== 'parado' || !objetivo.trim()}
          className="mt-3 w-full py-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 text-sm text-violet-200 hover:bg-violet-500/15 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {estado === 'iniciando' || estado === 'assimilando'
            ? <><Loader2 size={14} className="animate-spin" /> {estado === 'assimilando' ? 'Assimilando passos...' : 'Abrindo tela e microfone...'}</>
            : <><Mic size={14} /> Ensinar automação</>}
        </button>
      )}

      {(gravando || escuta.finalizado || escuta.parcial) && (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <p className="text-[10px] text-her-muted mb-1">Transcrição · {quadros.length} quadro(s)</p>
          <p className="text-xs text-her-ink/80 leading-relaxed max-h-24 overflow-y-auto">
            {escuta.finalizado} <em className="text-her-muted">{escuta.parcial}</em>
          </p>
        </div>
      )}
      {aviso && <p className="mt-2 text-[10px] text-amber-300/90 leading-relaxed">{aviso}</p>}

      {treinamentos.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-her-muted">Treinamentos salvos neste aparelho</p>
          {treinamentos.slice(0, 5).map(t => (
            <div key={t.id} className="flex items-center gap-2 rounded-xl border border-white/[0.05] p-2">
              {t.quadros[0]?.imagem && <img src={t.quadros[0].imagem} className="w-14 h-9 rounded object-cover border border-white/10" alt="Primeiro quadro do treinamento" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-her-ink/80 truncate">{t.objetivo}</p>
                <p className="text-[9px] text-her-muted">{t.passos.length} passos · {t.quadros.length} quadros locais</p>
              </div>
              <button onClick={() => excluir(t.id)} title="Apagar este treinamento e seus quadros" className={cn('p-1.5 rounded-lg text-her-muted hover:text-red-300 hover:bg-red-500/10')}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
