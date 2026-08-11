import React, { useCallback, useEffect, useRef, useState } from 'react';
// 'motion/react' e NÃO 'framer-motion' — as outras 38 telas importam daqui.
// Misturar os dois puxa duas cópias do mesmo motor de animação para o grafo de módulos, e o
// fatiamento em pedaços (manualChunks) acaba criando uma dependência circular ENTRE pedaços: um
// deles lê uma variável do outro antes de ela existir. O resultado é
// "Cannot access 'At' before initialization" antes do React montar — ou seja, tela branca no app
// inteiro, não só nesta aba, porque o erro acontece antes de qualquer coisa renderizar.
import { motion, AnimatePresence } from 'motion/react';
import {
  Video, VideoOff, Plus, Trash2, ChevronLeft, Loader2, AlertTriangle,
  Play, X, Eye, Clock, Film, ImageIcon, Settings2, Wifi, WifiOff, CircleDot
} from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * O PAINEL DAS CÂMERAS.
 *
 * A imagem ao vivo chega numa tag <img> comum, e isso não é gambiarra: o servidor entrega MJPEG
 * (multipart/x-mixed-replace), que é justamente o formato que um <img> sabe consumir sozinho,
 * quadro após quadro, sem player, sem biblioteca e sem codec. É o que faz o vídeo aparecer igual
 * no navegador, no app instalado e no Android — três lugares onde um player de verdade daria três
 * problemas diferentes.
 *
 * Uma consequência disso guia a tela inteira: enquanto o <img> está apontado para a câmera, a
 * conexão fica ABERTA. Cinco câmeras na tela são cinco conexões vivas e cinco fluxos de rede. Por
 * isso a lista mostra miniaturas paradas e só a câmera ESCOLHIDA transmite — a grade que mostra
 * tudo ao vivo ao mesmo tempo é bonita na primeira olhada e derruba a rede na segunda.
 */

interface CameraNaTela {
  id: string;
  nome: string;
  local?: string;
  ligada: boolean;
  sensibilidade: number;
  criadaEm: number;
  endereco: string;
  estado: 'parada' | 'conectando' | 'ao-vivo' | 'erro';
  erro?: string;
  ultimoQuadroEm: number | null;
  espectadores: number;
  gravando: boolean;
}

interface EventoNaTela {
  id: string;
  cameraId: string;
  cameraNome: string;
  local?: string;
  quando: number;
  tipo: string;
  intensidade: number;
  clipe?: string;
  quadro?: string;
  erroDaGravacao?: string;
}

interface CamerasSectionProps {
  onBack: () => void;
  onNotification: (mensagem: string, tipo?: 'success' | 'error' | 'info') => void;
}

const quandoPorExtenso = (quando: number): string => {
  const data = new Date(quando);
  const hoje = new Date();
  const mesmoDia = data.toDateString() === hoje.toDateString();
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return mesmoDia ? `Hoje, ${hora}` : `${data.toLocaleDateString('pt-BR')}, ${hora}`;
};

export const CamerasSection: React.FC<CamerasSectionProps> = ({ onBack, onNotification }) => {
  const [cameras, setCameras] = useState<CameraNaTela[]>([]);
  const [eventos, setEventos] = useState<EventoNaTela[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [eventoAberto, setEventoAberto] = useState<EventoNaTela | null>(null);

  const [nome, setNome] = useState('');
  const [local, setLocal] = useState('');
  const [url, setUrl] = useState('');
  const [testando, setTestando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resultadoDoTeste, setResultadoDoTeste] = useState<{ ok: boolean; texto: string } | null>(null);

  /**
   * Muda a cada troca de câmera, e entra na URL do <img>.
   *
   * Sem isso o navegador reaproveita a conexão MJPEG anterior ao voltar para uma câmera já vista, e
   * o que aparece é o último quadro congelado de minutos atrás — parece que a câmera travou.
   */
  const [selo, setSelo] = useState(() => Date.now());
  /** Muda quando a pessoa manda tentar de novo — é o que rearma a releitura periódica. */
  const [tentativa, setTentativa] = useState(0);
  const jaMontado = useRef(true);

  /**
   * POR QUE PAROU DE PERGUNTAR — e o motivo, para a pessoa ler.
   *
   * Nasceu de um defeito real: quando o servidor não podia atender (o site na Vercel não alcança
   * a rede da casa de ninguém), a releitura de 5 em 5 segundos continuava para sempre, engolindo o
   * erro em silêncio. Em poucos minutos eram centenas de pedidos fracassados no console e nenhuma
   * explicação na tela — o pior dos dois mundos: barulhento por dentro e mudo por fora.
   *
   * Repetir só faz sentido quando repetir pode dar certo. Uma queda passageira do servidor merece
   * insistência; "este ambiente não faz isso" não merece nenhuma.
   */
  const [paradoPorque, setParadoPorque] = useState<{ texto: string; definitivo: boolean } | null>(null);
  const falhasSeguidas = useRef(0);

  const buscar = useCallback(async (silencioso = false): Promise<'ok' | 'falhou' | 'impossivel'> => {
    try {
      const [respCameras, respEventos] = await Promise.all([
        fetch('/api/cameras'),
        fetch('/api/cameras/eventos?limite=100')
      ]);

      // 501 é o servidor dizendo "aqui isso não existe", e não "deu erro agora". Insistir nunca vai
      // mudar essa resposta, então a tela para de perguntar e passa a explicar.
      if (respCameras.status === 501) {
        const corpo = await respCameras.json().catch(() => null);
        if (!jaMontado.current) return 'impossivel';
        setParadoPorque({
          texto: corpo?.error
            || 'As câmeras vivem na sua rede, e este endereço na internet não alcança a sua rede. Use o OSONE instalado no computador.',
          definitivo: true
        });
        setCarregando(false);
        return 'impossivel';
      }

      const dadosCameras = await respCameras.json();
      const dadosEventos = await respEventos.json().catch(() => ({ eventos: [] }));
      if (!jaMontado.current) return 'ok';
      if (!respCameras.ok) throw new Error(dadosCameras?.error || 'Não consegui ler a lista de câmeras.');

      falhasSeguidas.current = 0;
      setParadoPorque(null);
      setCameras(dadosCameras.cameras || []);
      setEventos(dadosEventos.eventos || []);
      return 'ok';
    } catch (err: any) {
      falhasSeguidas.current++;
      if (!silencioso) onNotification(err?.message || 'Não consegui falar com o servidor das câmeras.', 'error');
      if (jaMontado.current && falhasSeguidas.current >= 3) {
        setParadoPorque({
          texto: `Sem contato com o servidor das câmeras depois de ${falhasSeguidas.current} tentativas. Parei de tentar para não encher o console de erro.`,
          definitivo: false
        });
      }
      return 'falhou';
    } finally {
      if (jaMontado.current) setCarregando(false);
    }
  }, [onNotification]);

  useEffect(() => {
    jaMontado.current = true;
    let relogio: ReturnType<typeof setInterval> | null = null;

    const parar = () => { if (relogio) { clearInterval(relogio); relogio = null; } };

    // O estado da câmera muda por fora (queda de rede, reconexão, evento gravando), e nada disso
    // gera aviso para a tela. Uma releitura leve a cada 5s é o que mantém o painel honesto —
    // enquanto ela puder dar certo.
    const rodar = async (primeira: boolean) => {
      const r = await buscar(primeira);
      if (r === 'impossivel' || (r === 'falhou' && falhasSeguidas.current >= 3)) parar();
      return r;
    };

    // A primeira leitura passa pelo MESMO caminho das seguintes, e não por uma chamada à parte.
    // Tratá-la como caso especial fazia a contagem de desistência começar torta: a tentativa
    // inicial não era conferida, e a tela insistia uma rodada a mais do que o combinado.
    rodar(true).then(r => {
      if (r === 'impossivel' || !jaMontado.current) return;
      relogio = setInterval(() => rodar(false), 5_000);
    });

    return () => { jaMontado.current = false; parar(); };
  }, [buscar, tentativa]);

  useEffect(() => {
    if (!selecionada && cameras.length) setSelecionada(cameras.find(c => c.ligada)?.id || cameras[0].id);
    if (selecionada && !cameras.some(c => c.id === selecionada)) setSelecionada(cameras[0]?.id || null);
  }, [cameras, selecionada]);

  const testarEndereco = async () => {
    if (!url.trim()) return;
    setTestando(true);
    setResultadoDoTeste(null);
    try {
      const resp = await fetch('/api/cameras/testar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });
      const dados = await resp.json();
      setResultadoDoTeste(dados.ok
        ? { ok: true, texto: 'Conectou. É uma câmera válida.' }
        : { ok: false, texto: dados.error || 'Não conectou.' });
    } catch (err: any) {
      setResultadoDoTeste({ ok: false, texto: err?.message || 'Não consegui testar agora.' });
    } finally {
      setTestando(false);
    }
  };

  const salvarCamera = async () => {
    if (!nome.trim() || !url.trim()) {
      onNotification('Preencha o nome e o endereço da câmera.', 'error');
      return;
    }
    setSalvando(true);
    try {
      const resp = await fetch('/api/cameras', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim(), local: local.trim(), url: url.trim() })
      });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados?.error || 'Não consegui salvar a câmera.');
      onNotification(`Câmera "${nome.trim()}" adicionada.`, 'success');
      setNome(''); setLocal(''); setUrl(''); setResultadoDoTeste(null); setFormAberto(false);
      setSelecionada(dados.camera?.id || null);
      setSelo(Date.now());
      buscar(true);
    } catch (err: any) {
      onNotification(err?.message || 'Não consegui salvar a câmera.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const alternarCamera = async (camera: CameraNaTela) => {
    try {
      const resp = await fetch(`/api/cameras/${camera.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ligada: !camera.ligada })
      });
      if (!resp.ok) throw new Error((await resp.json())?.error || 'Não consegui mudar o estado da câmera.');
      setSelo(Date.now());
      buscar(true);
    } catch (err: any) {
      onNotification(err?.message || 'Não consegui mudar o estado da câmera.', 'error');
    }
  };

  const apagarCamera = async (camera: CameraNaTela) => {
    if (!confirm(`Remover a câmera "${camera.nome}"? As gravações já feitas continuam guardadas.`)) return;
    try {
      const resp = await fetch(`/api/cameras/${camera.id}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error((await resp.json())?.error || 'Não consegui remover a câmera.');
      onNotification(`Câmera "${camera.nome}" removida. As gravações ficaram.`, 'success');
      buscar(true);
    } catch (err: any) {
      onNotification(err?.message || 'Não consegui remover a câmera.', 'error');
    }
  };

  const ajustarSensibilidade = async (camera: CameraNaTela, valor: number) => {
    setCameras(prev => prev.map(c => c.id === camera.id ? { ...c, sensibilidade: valor } : c));
    try {
      await fetch(`/api/cameras/${camera.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensibilidade: valor })
      });
    } catch {
      onNotification('Não consegui salvar a sensibilidade.', 'error');
    }
  };

  const ativa = cameras.find(c => c.id === selecionada) || null;

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 bg-[#08090d] text-white">
      {/* BARRA SUPERIOR */}
      <div className="border-b border-white/5 bg-[#0c0e14]/90 backdrop-blur-md px-3 py-2 flex items-center gap-2 shrink-0">
        <button
          onClick={onBack}
          className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors shrink-0"
          title="Voltar ao início"
        >
          <ChevronLeft size={18} />
        </button>
        <Video size={18} className="text-rose-400 shrink-0" />
        <h2 className="text-sm font-semibold tracking-tight text-white font-mono whitespace-nowrap">
          OSONE VIGIA
        </h2>
        <span className="hidden sm:inline text-[11px] text-zinc-500 truncate">
          {cameras.length
            ? `${cameras.filter(c => c.estado === 'ao-vivo').length} de ${cameras.length} ao vivo`
            : 'nenhuma câmera ainda'}
        </span>

        <button
          onClick={() => setFormAberto(v => !v)}
          className={cn(
            'ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all shrink-0 active:scale-95',
            formAberto
              ? 'bg-rose-500/20 text-rose-200 border-rose-500/50'
              : 'bg-rose-500/10 text-rose-300 border-rose-500/25 hover:bg-rose-500/15'
          )}
        >
          <Plus size={14} />
          <span className="hidden min-[400px]:inline">Câmera</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* ================= COLUNA DA ESQUERDA: CÂMERAS ================= */}
        <div className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col min-h-0">
          <AnimatePresence>
            {formAberto && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden border-b border-white/5"
              >
                <div className="p-3 flex flex-col gap-2">
                  <input
                    value={nome} onChange={(e) => setNome(e.target.value)}
                    placeholder="Nome (ex: Garagem)"
                    className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-rose-400/50"
                  />
                  <input
                    value={local} onChange={(e) => setLocal(e.target.value)}
                    placeholder="Onde fica (opcional)"
                    className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-rose-400/50"
                  />
                  <input
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setResultadoDoTeste(null); }}
                    placeholder="rtsp://usuario:senha@192.168.0.10:554/stream1"
                    spellCheck={false}
                    className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono focus:outline-none focus:border-rose-400/50"
                  />
                  {/*
                    O endereço RTSP é a parte que ninguém acerta de primeira: cada fabricante usa um
                    caminho diferente depois do IP. Dizer isso aqui poupa a busca no manual.
                  */}
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    O caminho muda por fabricante. Intelbras costuma ser <code className="text-zinc-400">/cam/realmonitor?channel=1&amp;subtype=0</code>,
                    Hikvision <code className="text-zinc-400">/Streaming/Channels/101</code>, TP-Link <code className="text-zinc-400">/stream1</code>.
                    Teste antes de salvar.
                  </p>

                  {resultadoDoTeste && (
                    <div className={cn(
                      'text-[11px] rounded-xl px-3 py-2 border flex items-start gap-2',
                      resultadoDoTeste.ok
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                        : 'bg-amber-500/10 text-amber-200 border-amber-500/25'
                    )}>
                      {resultadoDoTeste.ok ? <Wifi size={13} className="shrink-0 mt-0.5" /> : <AlertTriangle size={13} className="shrink-0 mt-0.5" />}
                      <span>{resultadoDoTeste.texto}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={testarEndereco}
                      disabled={testando || !url.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border border-white/10 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40 transition-colors"
                    >
                      {testando ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
                      Testar
                    </button>
                    <button
                      onClick={salvarCamera}
                      disabled={salvando || !nome.trim() || !url.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 hover:bg-rose-500/25 disabled:opacity-40 transition-colors"
                    >
                      {salvando ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      Salvar
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1.5">
            {carregando ? (
              <div className="flex items-center justify-center py-8 text-zinc-500 text-xs gap-2">
                <Loader2 size={14} className="animate-spin" /> lendo as câmeras…
              </div>
            ) : paradoPorque ? (
              <div className="px-3 py-6 text-center">
                <WifiOff size={26} className="mx-auto text-zinc-700 mb-2" />
                <p className="text-[11px] text-zinc-400 leading-relaxed">{paradoPorque.texto}</p>
                {!paradoPorque.definitivo && (
                  <button
                    onClick={() => { falhasSeguidas.current = 0; setParadoPorque(null); setCarregando(true); setTentativa(t => t + 1); }}
                    className="mt-3 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[11px] text-zinc-300 hover:bg-white/10 transition-colors"
                  >
                    Tentar de novo
                  </button>
                )}
              </div>
            ) : !cameras.length ? (
              <div className="text-center py-8 px-3">
                <VideoOff size={28} className="mx-auto text-zinc-700 mb-2" />
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Nenhuma câmera ainda. Adicione uma pelo botão acima — o vídeo aparece aqui dentro,
                  sem abrir o app da fabricante.
                </p>
              </div>
            ) : cameras.map(camera => (
              <div
                key={camera.id}
                onClick={() => { setSelecionada(camera.id); setSelo(Date.now()); }}
                className={cn(
                  'px-2.5 py-2 rounded-xl border cursor-pointer transition-all flex items-center gap-2 group',
                  camera.id === selecionada
                    ? 'bg-rose-500/10 border-rose-500/35'
                    : 'bg-transparent border-transparent hover:bg-white/5'
                )}
              >
                <span className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  camera.estado === 'ao-vivo' ? 'bg-emerald-400 animate-pulse'
                    : camera.estado === 'conectando' ? 'bg-amber-400 animate-pulse'
                      : camera.estado === 'erro' ? 'bg-rose-500' : 'bg-zinc-600'
                )} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{camera.nome}</p>
                  <p className="text-[10px] text-zinc-500 truncate">
                    {camera.gravando ? 'gravando…' : camera.local || camera.estado}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); alternarCamera(camera); }}
                  className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
                  title={camera.ligada ? 'Desligar (para de consumir rede)' : 'Ligar'}
                >
                  {camera.ligada ? <Wifi size={12} /> : <WifiOff size={12} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); apagarCamera(camera); }}
                  className="p-1 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remover câmera"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ================= MEIO: O VÍDEO ================= */}
        <div className="flex-1 min-h-0 flex flex-col p-3 gap-3">
          <div className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-black overflow-hidden relative flex items-center justify-center">
            {!ativa ? (
              <div className="text-center px-6">
                <Video size={36} className="mx-auto text-zinc-800 mb-3" />
                <p className="text-sm text-zinc-500">Escolha uma câmera para ver ao vivo.</p>
              </div>
            ) : !ativa.ligada ? (
              <div className="text-center px-6">
                <WifiOff size={36} className="mx-auto text-zinc-700 mb-3" />
                <p className="text-sm text-zinc-400 mb-1">{ativa.nome} está desligada.</p>
                <button
                  onClick={() => alternarCamera(ativa)}
                  className="mt-2 px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 hover:bg-rose-500/25 transition-colors"
                >
                  Ligar câmera
                </button>
              </div>
            ) : (
              <>
                {/*
                  Aqui mora o vídeo. A key com o selo força o navegador a abrir uma conexão NOVA a
                  cada troca; sem ela, ele reusa a anterior e mostra um quadro velho congelado.
                */}
                <img
                  key={`${ativa.id}-${selo}`}
                  src={`/api/cameras/${ativa.id}/ao-vivo?t=${selo}`}
                  alt={`Câmera ${ativa.nome} ao vivo`}
                  className="max-w-full max-h-full object-contain"
                />

                <div className="absolute top-2 left-2 flex items-center gap-2">
                  <span className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-mono font-bold backdrop-blur-sm',
                    ativa.estado === 'ao-vivo'
                      ? 'bg-black/60 text-emerald-300'
                      : 'bg-black/60 text-amber-300'
                  )}>
                    <CircleDot size={10} className={ativa.estado === 'ao-vivo' ? 'animate-pulse' : ''} />
                    {ativa.estado === 'ao-vivo' ? 'AO VIVO' : 'CONECTANDO'}
                  </span>
                  {ativa.gravando && (
                    <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-600/80 text-white text-[10px] font-mono font-bold backdrop-blur-sm">
                      <Film size={10} /> GRAVANDO
                    </span>
                  )}
                </div>

                {ativa.erro && (
                  <div className="absolute bottom-2 left-2 right-2 flex items-start gap-2 px-3 py-2 rounded-xl bg-black/80 border border-amber-500/30 text-[11px] text-amber-200 backdrop-blur-sm">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span className="truncate">{ativa.erro}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sensibilidade: o único ajuste que precisa existir na tela, porque só quem vê a câmera
              sabe se aquela árvore ao vento é movimento ou paisagem. */}
          {ativa && (
            <div className="shrink-0 flex items-center gap-3 px-3 py-2 rounded-xl border border-white/5 bg-white/[0.02]">
              <Settings2 size={14} className="text-zinc-500 shrink-0" />
              <label className="text-[11px] text-zinc-400 shrink-0">Sensibilidade</label>
              <input
                type="range" min={0.005} max={0.15} step={0.005}
                value={ativa.sensibilidade}
                onChange={(e) => ajustarSensibilidade(ativa, Number(e.target.value))}
                className="flex-1 accent-rose-400"
              />
              <span className="text-[11px] font-mono text-zinc-400 w-20 text-right shrink-0">
                {ativa.sensibilidade <= 0.02 ? 'alta' : ativa.sensibilidade <= 0.05 ? 'média' : 'baixa'}
              </span>
            </div>
          )}
        </div>

        {/* ================= DIREITA: O QUE ACONTECEU ================= */}
        <div className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-white/5 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2 shrink-0">
            <Clock size={14} className="text-zinc-500" />
            <h3 className="text-xs font-semibold text-zinc-300">O que aconteceu</h3>
            <span className="ml-auto text-[10px] text-zinc-600 font-mono">{eventos.length}</span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1.5">
            {!eventos.length ? (
              <p className="text-[11px] text-zinc-600 text-center py-6 px-3 leading-relaxed">
                Nada registrado ainda. Cada movimento detectado entra aqui com o quadro do momento e
                o clipe de {30} segundos.
              </p>
            ) : eventos.map(evento => (
              <div
                key={evento.id}
                onClick={() => setEventoAberto(evento)}
                className="rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/10 transition-all cursor-pointer overflow-hidden"
              >
                {evento.quadro && (
                  <img
                    src={`/api/cameras/gravacoes/${evento.quadro}`}
                    alt=""
                    loading="lazy"
                    className="w-full h-24 object-cover"
                  />
                )}
                <div className="px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-zinc-200 truncate">
                    {evento.cameraNome}{evento.local ? ` — ${evento.local}` : ''}
                  </p>
                  <p className="text-[10px] text-zinc-500">{quandoPorExtenso(evento.quando)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {evento.clipe ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400"><Film size={9} /> clipe</span>
                    ) : evento.erroDaGravacao ? (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400" title={evento.erroDaGravacao}>
                        <AlertTriangle size={9} /> sem clipe
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-zinc-500"><Loader2 size={9} className="animate-spin" /> gravando</span>
                    )}
                    {evento.quadro && <span className="flex items-center gap-1 text-[10px] text-zinc-500"><ImageIcon size={9} /> quadro</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ================= O EVENTO ABERTO ================= */}
      <AnimatePresence>
        {eventoAberto && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setEventoAberto(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl bg-[#0b0e17] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
            >
              <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                <Eye size={15} className="text-rose-400" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {eventoAberto.cameraNome}{eventoAberto.local ? ` — ${eventoAberto.local}` : ''}
                  </p>
                  <p className="text-[11px] text-zinc-500">{quandoPorExtenso(eventoAberto.quando)}</p>
                </div>
                <button
                  onClick={() => setEventoAberto(null)}
                  className="ml-auto p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="bg-black">
                {eventoAberto.clipe ? (
                  <video
                    src={`/api/cameras/gravacoes/${eventoAberto.clipe}`}
                    controls autoPlay
                    className="w-full max-h-[60vh]"
                  />
                ) : eventoAberto.quadro ? (
                  <img src={`/api/cameras/gravacoes/${eventoAberto.quadro}`} alt="" className="w-full max-h-[60vh] object-contain" />
                ) : (
                  <div className="py-12 text-center text-zinc-600 text-sm">Sem imagem guardada deste evento.</div>
                )}
              </div>

              {eventoAberto.erroDaGravacao && (
                <div className="px-4 py-3 flex items-start gap-2 text-[11px] text-amber-200 bg-amber-500/10 border-t border-amber-500/20">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>
                    O clipe não foi gravado: {eventoAberto.erroDaGravacao}
                    {' '}Câmeras que só aceitam uma conexão por vez costumam falhar aqui.
                  </span>
                </div>
              )}

              <div className="px-4 py-3 flex items-center gap-3 text-[11px] text-zinc-500 border-t border-white/5">
                <span className="flex items-center gap-1"><Play size={11} /> movimento</span>
                <span className="font-mono">intensidade {eventoAberto.intensidade}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CamerasSection;
