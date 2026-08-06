import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, MousePointerClick, Play, Square, Loader2, Check, AlertTriangle,
  History, Trash2, RefreshCw, Monitor, ShieldAlert, X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { PassoDoPlano, ResultadoDoPasso } from '../lib/planoDeAcoes';
import {
  PlanoDoCowork, TarefaDoHistorico, INSTRUCAO_PARA_PLANEJAR,
  lerPlanoDoModelo, lerHistorico, guardarNoHistorico, limparHistorico
} from '../lib/planoDoCowork';

/**
 * OSONE COWORK — o lugar de pedir uma tarefa no computador e ver ela sendo feita.
 *
 * O motor que clica e digita já existia inteiro (planoDeAcoes.ts): ele executa uma sequência
 * medindo o tempo de cada passo, confere com uma foto nova se a ação pegou, tenta de novo quando
 * não pegou e para sozinho em cinco situações. O que NÃO existia era um lugar para acioná-lo: a
 * única forma de usá-lo era conversar no chat e torcer para o modelo decidir chamar a ferramenta
 * sozinho — sem poder pedir diretamente, sem ver o que ele ia fazer antes de fazer, e sem repetir
 * amanhã a tarefa que deu certo hoje.
 *
 * Esta aba é esse lugar. Ela NÃO reimplementa o motor, e é de propósito: o laço, os limites e a
 * recusa de dinheiro continuam morando em planoDeAcoes.ts, chamados daqui. Uma segunda cópia das
 * regras de segurança envelheceria em silêncio, e a que envelhece é justamente a que deixa passar.
 *
 * As quatro partes da tela, na ordem em que se usa:
 *
 *   1. O PEDIDO — uma caixa de texto onde se descreve a tarefa em português.
 *   2. O PLANO PARA APROVAR — os passos escritos antes de qualquer coisa acontecer. Aprovar uma
 *      vez não é o mesmo que confirmar oito vezes: a pessoa vê o que vai acontecer enquanto ainda
 *      é barato mudar de ideia, e depois não é mais interrompida.
 *   3. A TELA AO VIVO — a foto do computador com o alvo do passo marcado, atualizada a cada passo
 *      concluído. É o que separa "está trabalhando" de "travou".
 *   4. O HISTÓRICO — as tarefas que já deram certo, para repetir com um clique. Montar o plano é
 *      a parte cara; sem guardá-lo, a pessoa refaz o mesmo pedido toda vez.
 */

interface CoworkSectionProps {
  onBack: () => void;
  localAgentToken: string;
  chaveGemini: string;
  modeloGemini: string;
  /** Sistema, pastas e shell da máquina, quando já detectados. Entra no pedido do plano. */
  ambiente?: any;
  /** Executa o plano pelo motor que já existe (useLocalAgent.executarCowork). */
  onExecutar: (passos: PassoDoPlano[]) => Promise<any>;
  planoEmCurso: { passos: ResultadoDoPasso[]; total: number; rodando: boolean } | null;
  /** Onde o passo atual MEDIU o alvo (escala 0–1000), quando já mediu. Marca o ponto na foto. */
  alvoMedido?: { x: number; y: number; rotulo: string; quando: number } | null;
  motorParado: boolean;
  onParar: () => void;
  onRetomar: () => void;
  onNotification: (mensagem: string, tipo?: 'success' | 'error' | 'info') => void;
}

/** Uma foto da tela do computador, com o tamanho real para posicionar a marca do alvo. */
interface FotoDaTela {
  imagem: string;
  largura?: number;
  altura?: number;
  quando: number;
}

const CAIXA = "rounded-3xl border border-white/[0.06] bg-white/[0.02]";

export const CoworkSection: React.FC<CoworkSectionProps> = ({
  onBack, localAgentToken, chaveGemini, modeloGemini, ambiente,
  onExecutar, planoEmCurso, alvoMedido, motorParado, onParar, onRetomar, onNotification
}) => {
  const [tarefa, setTarefa] = useState('');
  const [montandoPlano, setMontandoPlano] = useState(false);
  const [plano, setPlano] = useState<PlanoDoCowork | null>(null);
  const [executando, setExecutando] = useState(false);
  const [relatorio, setRelatorio] = useState<any>(null);
  const [historico, setHistorico] = useState<TarefaDoHistorico[]>([]);

  const [foto, setFoto] = useState<FotoDaTela | null>(null);
  const [tirandoFoto, setTirandoFoto] = useState(false);
  const [erroDaTela, setErroDaTela] = useState('');
  /**
   * O agente está disponível AQUI?
   *
   * 'web' não é um erro a esconder: na versão hospedada o /api/agent é bloqueado de propósito
   * (nenhum servidor na nuvem pode clicar no computador de ninguém), e quem abrir esta aba pelo
   * navegador precisa saber disso de cara, e não depois de escrever uma tarefa inteira.
   */
  const [disponibilidade, setDisponibilidade] = useState<'checando' | 'ok' | 'sem-agente' | 'web'>('checando');

  useEffect(() => { setHistorico(lerHistorico()); }, []);

  // ====== O AGENTE ESTÁ AÍ? ======
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const token = (localAgentToken || '').trim();
      if (!token) { setDisponibilidade('sem-agente'); return; }
      try {
        const res = await fetch('/api/agent/status', { headers: { Authorization: `Bearer ${token}` } });
        const dados = await res.json().catch(() => null);
        if (cancelado) return;
        if (dados?.unavailableOnVercel) setDisponibilidade('web');
        else setDisponibilidade(res.ok ? 'ok' : 'sem-agente');
      } catch {
        if (!cancelado) setDisponibilidade('sem-agente');
      }
    })();
    return () => { cancelado = true; };
  }, [localAgentToken]);

  // ====== A TELA ======

  const olharATela = async () => {
    const token = (localAgentToken || '').trim();
    if (!token) return;
    setTirandoFoto(true);
    try {
      const res = await fetch('/api/agent/screen/capture?grade=0', { headers: { Authorization: `Bearer ${token}` } });
      const dados = await res.json().catch(() => null);
      if (!res.ok || !dados?.image) {
        setErroDaTela(dados?.error || 'Não foi possível ver a tela do computador.');
        return;
      }
      setErroDaTela('');
      setFoto({ imagem: dados.image, largura: dados.screenWidth, altura: dados.screenHeight, quando: Date.now() });
    } catch {
      setErroDaTela('O Agente Local não respondeu ao pedido de captura da tela.');
    } finally {
      setTirandoFoto(false);
    }
  };

  /**
   * A foto se atualiza a CADA PASSO CONCLUÍDO, e não num relógio próprio.
   *
   * Um poller de um em um segundo dispararia uma segunda captura de tela em paralelo com a que o
   * próprio motor tira entre os passos — duas capturas concorrentes na mesma máquina, cada uma
   * abrindo um processo de captura, justamente enquanto ela precisa estar livre para executar o
   * passo. Amarrada ao progresso, a tela se atualiza quando há o que ver de novo, e fica quieta
   * quando não há.
   */
  const passosFeitos = planoEmCurso?.passos.length ?? 0;
  const ultimaFotoDoPassoRef = useRef(-1);
  useEffect(() => {
    if (!executando) return;
    if (ultimaFotoDoPassoRef.current === passosFeitos) return;
    ultimaFotoDoPassoRef.current = passosFeitos;
    olharATela();
  }, [passosFeitos, executando]);

  /**
   * A marca do alvo só aparece sobre uma posição MEDIDA.
   *
   * O plano descreve o alvo em palavras ("o campo de busca"), e não em coordenadas: quem escreveu
   * o plano não estava vendo a tela deste instante. A posição vira número quando o motor olha a
   * tela, e é essa — a medida, que chega em alvoMedido — que é desenhada. Marcar qualquer outra
   * coisa seria desenhar um palpite com cara de precisão.
   *
   * A marca também expira, e some quando o plano termina: ela diz onde o passo EM CURSO vai agir.
   * Uma medição de quinze segundos atrás pode já não valer para a tela de agora, e uma marca
   * parada sobre uma execução encerrada aponta com confiança para um lugar que não é mais o alvo
   * de nada.
   */
  const VALIDADE_DA_MARCA_MS = 15000;
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!executando) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [executando]);

  const alvoAtual = executando && alvoMedido && agora - alvoMedido.quando < VALIDADE_DA_MARCA_MS
    ? { x: Math.min(1000, Math.max(0, alvoMedido.x)), y: Math.min(1000, Math.max(0, alvoMedido.y)), rotulo: alvoMedido.rotulo }
    : null;

  const passoAtual = plano && executando ? plano.passos[Math.min(passosFeitos, plano.passos.length - 1)] : undefined;

  // ====== O PEDIDO VIRA PLANO ======

  const montarPlano = async () => {
    const texto = tarefa.trim();
    if (!texto || montandoPlano) return;

    setMontandoPlano(true);
    setPlano(null);
    setRelatorio(null);
    try {
      const contexto = ambiente
        ? `\n\nO COMPUTADOR DO USUÁRIO: ${ambiente.osName || ambiente.platform}, usuário "${ambiente.userName || ''}", ` +
          `pasta pessoal ${ambiente.homeDir || ''}. Use nomes de programa que existam neste sistema.`
        : '';

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `TAREFA: ${texto}${contexto}`,
          systemInstruction: INSTRUCAO_PARA_PLANEJAR,
          responseMimeType: 'application/json',
          clientApiKey: chaveGemini,
          model: modeloGemini
        })
      });
      const dados = await res.json().catch(() => null);
      if (!res.ok) {
        setPlano({ tarefa: texto, passos: [], recusa: dados?.error || `Não consegui montar o plano (HTTP ${res.status}).` });
        return;
      }
      setPlano(lerPlanoDoModelo(texto, dados?.text || ''));
    } catch (err: any) {
      setPlano({ tarefa: texto, passos: [], recusa: `Falha ao falar com o modelo: ${err?.message || err}` });
    } finally {
      setMontandoPlano(false);
    }
  };

  // ====== O PLANO APROVADO VIRA EXECUÇÃO ======

  const executarOPlano = async () => {
    if (!plano || plano.passos.length === 0 || executando) return;
    if (motorParado) onRetomar();

    setExecutando(true);
    setRelatorio(null);
    ultimaFotoDoPassoRef.current = -1;
    await olharATela();

    try {
      const resultado = await onExecutar(plano.passos);
      setRelatorio(resultado);

      const deuErro = !!resultado?.error;
      const desfecho: TarefaDoHistorico['desfecho'] = deuErro
        ? 'erro'
        : resultado?.motivo === 'concluido'
          ? 'concluida'
          : resultado?.motivo === 'parado-pelo-usuario'
            ? 'parada'
            : 'erro';

      setHistorico(guardarNoHistorico({
        id: Math.random().toString(36).slice(2, 10),
        tarefa: plano.tarefa,
        quando: Date.now(),
        passos: plano.passos,
        desfecho,
        detalhe: deuErro ? String(resultado.error) : String(resultado?.resumo || '')
      }));

      onNotification(
        deuErro ? String(resultado.error) : String(resultado?.resumo || 'Plano finalizado.'),
        desfecho === 'concluida' ? 'success' : desfecho === 'parada' ? 'info' : 'error'
      );
      await olharATela();
    } finally {
      setExecutando(false);
    }
  };

  /**
   * Repetir não remonta o plano: reusa os passos guardados.
   *
   * É o ganho real do histórico. A ida ao modelo é a parte cara e a parte incerta — pedir de novo
   * gastaria tempo para talvez receber um plano diferente do que já se sabe que funciona. O plano
   * volta para aprovação assim mesmo: a tela do computador de hoje não é a de ontem, e quem
   * aprova precisa olhar de novo antes de soltar.
   */
  const repetir = (item: TarefaDoHistorico) => {
    setTarefa(item.tarefa);
    setPlano({ tarefa: item.tarefa, passos: item.passos });
    setRelatorio(null);
  };

  const iconeDoPasso = (i: number) => {
    const feito = planoEmCurso?.passos[i];
    if (feito) return feito.ok
      ? <Check className="w-4 h-4 text-emerald-400" />
      : <AlertTriangle className="w-4 h-4 text-red-400" />;
    if (executando && i === passosFeitos) return <Loader2 className="w-4 h-4 animate-spin text-her-accent" />;
    return <span className="w-4 h-4 flex items-center justify-center text-[10px] text-her-muted">{i + 1}</span>;
  };

  const avisoDeDisponibilidade =
    disponibilidade === 'web'
      ? 'Esta aba só funciona no OSONE instalado no computador. Na versão pelo navegador o controle da máquina é bloqueado de propósito — nenhum servidor na nuvem clica no seu computador.'
      : disponibilidade === 'sem-agente'
        ? 'O Agente Local não respondeu. Abra o OSONE instalado no computador e confira o Token do Agente Local nas Configurações.'
        : '';

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 p-6 md:p-10 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-3 rounded-full hover:bg-white/[0.04] text-her-muted transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-light text-her-ink flex items-center gap-2">
            <MousePointerClick size={20} className="text-indigo-400" />
            OSONE COWORK
          </h2>
          <p className="text-xs text-her-muted mt-1">
            Descreva uma tarefa no computador. O OSONE monta o plano, você aprova, e ele clica e digita sozinho.
          </p>
        </div>
        <span className={cn(
          "text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border shrink-0",
          disponibilidade === 'ok' ? "border-emerald-500/25 text-emerald-400 bg-emerald-500/[0.06]"
            : disponibilidade === 'checando' ? "border-white/10 text-her-muted"
            : "border-amber-500/25 text-amber-400 bg-amber-500/[0.06]"
        )}>
          {disponibilidade === 'ok' ? 'Agente pronto'
            : disponibilidade === 'checando' ? 'Verificando...'
            : disponibilidade === 'web' ? 'Só no app instalado' : 'Agente offline'}
        </span>
      </div>

      {avisoDeDisponibilidade && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4 text-xs text-amber-200/90 font-light leading-relaxed max-w-5xl">
          <ShieldAlert size={16} className="shrink-0 mt-0.5 text-amber-400" />
          <span>{avisoDeDisponibilidade}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 max-w-6xl">
        {/* ====== COLUNA DA ESQUERDA: PEDIR E APROVAR ====== */}
        <div className="flex flex-col gap-6 min-w-0">
          <div className={cn(CAIXA, "p-5")}>
            <label className="text-[10px] uppercase tracking-[0.2em] text-her-muted">O que você quer que ele faça</label>
            <textarea
              value={tarefa}
              onChange={e => setTarefa(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) montarPlano(); }}
              placeholder={'Ex: abrir o navegador, ir no YouTube e procurar por "OSONE"'}
              rows={3}
              disabled={executando}
              className="mt-3 w-full bg-transparent border border-white/[0.06] rounded-2xl px-4 py-3 text-sm
                         text-her-ink/90 font-light placeholder:text-her-muted/50 outline-none
                         focus:border-indigo-500/30 resize-none disabled:opacity-50"
            />
            <button
              onClick={montarPlano}
              disabled={!tarefa.trim() || montandoPlano || executando}
              className="mt-3 w-full py-3 rounded-2xl text-sm font-light transition-all
                         bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 hover:bg-indigo-500/15
                         disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {montandoPlano ? <><Loader2 size={14} className="animate-spin" /> Montando o plano...</> : 'Montar o plano'}
            </button>
            <p className="mt-2 text-[10px] text-her-muted/70 font-light">
              Nada acontece no computador enquanto você não aprovar o plano.
            </p>
          </div>

          {/* ====== O PLANO ====== */}
          <AnimatePresence>
            {plano && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={cn(CAIXA, "p-5")}
              >
                {plano.recusa ? (
                  <div className="flex items-start gap-3">
                    <ShieldAlert size={16} className="shrink-0 mt-0.5 text-amber-400" />
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.2em] text-amber-400/80 mb-2">Plano não aprovado</p>
                      <p className="text-sm text-her-ink/80 font-light leading-relaxed">{plano.recusa}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-her-muted flex-1">
                        {executando ? `Executando — passo ${Math.min(passosFeitos + 1, plano.passos.length)} de ${plano.passos.length}` : `Plano: ${plano.passos.length} passo(s)`}
                      </p>
                      {!executando && (
                        <button
                          onClick={() => { setPlano(null); setRelatorio(null); }}
                          title="Descartar este plano"
                          className="p-1.5 rounded-lg hover:bg-white/[0.05] text-her-muted"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-[38vh] overflow-y-auto custom-scrollbar pr-1">
                      {plano.passos.map((p, i) => {
                        const feito = planoEmCurso?.passos[i];
                        return (
                          <div key={i} className={cn(
                            "flex items-start gap-3 px-3 py-2 rounded-xl border",
                            feito?.ok ? "border-emerald-500/15 bg-emerald-500/[0.04]"
                              : feito ? "border-red-500/20 bg-red-500/[0.04]"
                              : executando && i === passosFeitos ? "border-her-accent/25 bg-her-accent/[0.05]"
                              : "border-white/[0.04]"
                          )}>
                            <div className="mt-0.5 shrink-0">{iconeDoPasso(i)}</div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-her-ink/85 font-light leading-tight">{p.descricao}</p>
                              <p className="text-[10px] text-her-muted/70 mt-0.5">
                                {p.acao}
                                {p.args?.alvo && ` · alvo: ${p.args.alvo}`}
                                {p.args?.caminho && ` · ${p.args.caminho}`}
                                {p.args?.texto && ` · "${String(p.args.texto).slice(0, 30)}"`}
                                {/* O tempo previsto ao lado do medido é a prova de que o motor se
                                    calibra: na segunda ação do mesmo tipo os dois já se aproximam. */}
                                {feito && ` · ${(feito.esperaMedidaMs / 1000).toFixed(1)}s (previa ${(feito.esperaPrevistaMs / 1000).toFixed(1)}s)`}
                                {feito && feito.tentativas > 1 && ` · ${feito.tentativas} tentativas`}
                              </p>
                              {feito?.erro && <p className="text-[10px] text-red-400/90 mt-0.5">{feito.erro}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex gap-2">
                      {executando ? (
                        motorParado ? (
                          <button
                            onClick={onRetomar}
                            className="flex-1 py-3 rounded-2xl text-sm font-light bg-emerald-500/10 text-emerald-300
                                       border border-emerald-500/25 hover:bg-emerald-500/15 flex items-center justify-center gap-2"
                          >
                            <Play size={14} /> Retomar
                          </button>
                        ) : (
                          <button
                            onClick={onParar}
                            className="flex-1 py-3 rounded-2xl text-sm font-light bg-red-500/10 text-red-300
                                       border border-red-500/25 hover:bg-red-500/15 flex items-center justify-center gap-2"
                          >
                            <Square size={14} /> Parar agora
                          </button>
                        )
                      ) : (
                        <button
                          onClick={executarOPlano}
                          disabled={disponibilidade === 'web'}
                          className="flex-1 py-3 rounded-2xl text-sm font-light bg-indigo-500/10 text-indigo-300
                                     border border-indigo-500/25 hover:bg-indigo-500/15 disabled:opacity-40
                                     disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          <Play size={14} /> Aprovar e executar
                        </button>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ====== COMO TERMINOU ====== */}
          {relatorio && !executando && (
            <div className={cn(
              CAIXA, "p-5",
              relatorio.error || relatorio.motivo !== 'concluido' ? "border-amber-500/20" : "border-emerald-500/20"
            )}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-her-muted mb-2">Como terminou</p>
              <p className="text-sm text-her-ink/85 font-light leading-relaxed">
                {relatorio.error || relatorio.resumo}
              </p>
            </div>
          )}
        </div>

        {/* ====== COLUNA DA DIREITA: A TELA E O HISTÓRICO ====== */}
        <div className="flex flex-col gap-6 min-w-0">
          <div className={cn(CAIXA, "p-5")}>
            <div className="flex items-center gap-2 mb-3">
              <Monitor size={14} className="text-her-muted" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-her-muted flex-1">
                A tela do computador
                {foto && <span className="normal-case tracking-normal text-her-muted/60"> · {new Date(foto.quando).toLocaleTimeString('pt-BR')}</span>}
              </p>
              <button
                onClick={olharATela}
                disabled={tirandoFoto || disponibilidade === 'web'}
                title="Ver a tela agora"
                className="p-1.5 rounded-lg hover:bg-white/[0.05] text-her-muted disabled:opacity-30"
              >
                <RefreshCw size={14} className={cn(tirandoFoto && "animate-spin")} />
              </button>
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-white/[0.06] bg-black aspect-video">
              {foto ? (
                <>
                  <img src={foto.imagem} alt="Tela do computador" className="w-full h-full object-contain" />
                  {/* A marca do alvo, na mesma escala 0–1000 em que o clique é dado. */}
                  {alvoAtual && (
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ left: `${alvoAtual.x / 10}%`, top: `${alvoAtual.y / 10}%` }}
                    >
                      <div className="w-8 h-8 rounded-full border-2 border-indigo-400 animate-ping absolute inset-0" />
                      <div className="w-8 h-8 rounded-full border-2 border-indigo-400 bg-indigo-400/20" />
                    </motion.div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-her-muted">
                  <Monitor size={28} className="opacity-40" />
                  <span className="text-xs font-light">{erroDaTela || 'Nenhuma captura ainda'}</span>
                </div>
              )}
            </div>

            <p className="mt-2 text-[10px] text-her-muted/70 font-light leading-relaxed">
              {alvoAtual
                ? `Alvo medido na tela: ${alvoAtual.rotulo} (x=${alvoAtual.x}, y=${alvoAtual.y})`
                : passoAtual
                  ? `Passo atual: ${passoAtual.descricao} — a marca aparece quando a posição for medida.`
                  : 'A foto se atualiza a cada passo concluído.'}
            </p>
          </div>

          {/* ====== HISTÓRICO ====== */}
          <div className={cn(CAIXA, "p-5")}>
            <div className="flex items-center gap-2 mb-3">
              <History size={14} className="text-her-muted" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-her-muted flex-1">Tarefas já feitas</p>
              {historico.length > 0 && (
                <button
                  onClick={() => { limparHistorico(); setHistorico([]); }}
                  title="Limpar o histórico"
                  className="p-1.5 rounded-lg hover:bg-white/[0.05] text-her-muted"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {historico.length === 0 ? (
              <p className="text-xs text-her-muted/70 font-light">
                Quando uma tarefa rodar, ela aparece aqui — e repetir passa a ser um clique, sem remontar o plano.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[32vh] overflow-y-auto custom-scrollbar pr-1">
                {historico.map(item => (
                  <div key={item.id} className="flex items-start gap-3 px-3 py-2 rounded-xl border border-white/[0.04] hover:bg-white/[0.02]">
                    <span className={cn(
                      "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                      item.desfecho === 'concluida' ? "bg-emerald-400" : item.desfecho === 'parada' ? "bg-amber-400" : "bg-red-400"
                    )} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-her-ink/85 font-light leading-tight truncate">{item.tarefa}</p>
                      <p className="text-[10px] text-her-muted/70 mt-0.5">
                        {item.passos.length} passo(s) · {new Date(item.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {item.desfecho !== 'concluida' && ` · ${item.desfecho === 'parada' ? 'parada' : 'não concluiu'}`}
                      </p>
                    </div>
                    <button
                      onClick={() => repetir(item)}
                      disabled={executando}
                      title="Repetir esta tarefa (o plano volta para aprovação)"
                      className="p-1.5 rounded-lg hover:bg-indigo-500/10 text-indigo-300 disabled:opacity-30 shrink-0"
                    >
                      <Play size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-[11px] text-her-muted leading-relaxed font-light space-y-2">
            <p><strong className="text-her-ink/70">O que ele não faz:</strong></p>
            <p>• <strong className="text-her-ink/60">Dinheiro, nunca.</strong> Pagamento, compra, PIX, transferência, boleto, cartão ou saque são recusados antes de tocar no computador. Ele te leva até a tela; quem conclui é você.</p>
            <p>• Apagar, mover ou renomear arquivo e rodar comando de terminal ficam fora do plano automático — essas passam pela confirmação normal, uma a uma.</p>
            <p>• Ele para sozinho se a tela não mudar como o passo previa, se der falhas seguidas, ou se passar de 25 passos ou 5 minutos.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
