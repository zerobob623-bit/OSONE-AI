import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, MousePointerClick, Play, Square, Loader2, Check, AlertTriangle,
  History, Trash2, RefreshCw, Monitor, MonitorPlay, ShieldAlert, AppWindow, Eye, CornerDownRight,
  Volume2, VolumeX
} from 'lucide-react';
import { cn } from '../lib/utils';
import { VoltaDoAgente, RelatorioDoAgente } from '../lib/agenteAutonomo';
import { JanelaDeTrabalho, EstadoDaAreaParalela, CapturaConfirmada } from '../hooks/useLocalAgent';
import {
  TarefaDoHistorico, desfechoDoMotivo,
  lerHistorico, guardarNoHistorico, limparHistorico
} from '../lib/historicoDoCowork';
import { tocar, notaDaAcao, somLigado, definirSom, baterPonto } from '../lib/somDoCowork';
import { CoworkTeachingPanel } from './CoworkTeachingPanel';

/**
 * OSONE COWORK — você diz o objetivo, ele trabalha e conta o que está fazendo.
 *
 * ====== O QUE MUDOU, E POR QUÊ ======
 *
 * A primeira versão desta aba montava um PLANO de passos, você aprovava, e ele executava a lista.
 * Isso quebra pelo motivo mais comum do mundo: quem escreve o plano não está vendo a tela em que
 * ele vai rodar. Faltando um passo — um aviso de cookies, um login, um botão que mudou de lugar —
 * a lista não se ajusta e a tarefa para no meio. Foi o que aconteceu ao pedir a análise do gráfico
 * de um canal: o plano previu o caminho, a tela real pediu outra coisa, e a resposta foi "não
 * achei".
 *
 * Agora não existe plano. O agente OLHA a janela, DECIDE uma ação, EXECUTA, e OLHA de novo — e
 * essa volta se repete até a tarefa estar feita. Ele replaneja porque decide sempre olhando, não
 * porque alguém programou um replanejamento.
 *
 * ====== AS TRÊS COISAS QUE ESTA TELA PRECISA MOSTRAR ======
 *
 * 1. EM QUE JANELA ele está trabalhando. Ele olha UMA janela, não a tela inteira: assim o quadro é
 *    sempre o mesmo programa, e o que acontece fora dele não vira ruído na decisão. Ele mesmo abre
 *    e troca de janela quando precisa — você não fica escolhendo por ele.
 * 2. O QUE ELE ESTÁ FAZENDO, agora e desde o começo, com o motivo de cada ação em português. Um
 *    agente que age sozinho e não conta nada é indistinguível de um travado.
 * 3. A RESPOSTA. Quando a tarefa era descobrir algo, o resultado é a informação lida da tela — e
 *    ela aparece em destaque, não escondida na última linha do registro.
 */

interface CoworkSectionProps {
  onBack: () => void;
  localAgentToken: string;
  chaveGemini: string;
  modeloGemini: string;
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  elevenLabsStability?: number;
  elevenLabsSimilarityBoost?: number;
  elevenLabsStyle?: number;
  elevenLabsSpeakerBoost?: boolean;
  elevenLabsModel?: string;
  ambiente?: any;
  listarJanelas: () => Promise<JanelaDeTrabalho[]>;
  janelaDeTrabalho: JanelaDeTrabalho | null;
  definirJanela: (j: JanelaDeTrabalho | null) => void;
  /** A janela pode ser nula quando a tela do agente está ligada e ainda vazia. */
  onTrabalhar: (
    objetivo: string,
    janela: JanelaDeTrabalho | null,
    aoCapturar?: (frame: CapturaConfirmada) => void
  ) => Promise<RelatorioDoAgente | { error: string }>;
  relatoDoAgente: { voltas: VoltaDoAgente[]; rodando: boolean } | null;
  areaParalela: EstadoDaAreaParalela | null;
  onConsultarArea: () => Promise<EstadoDaAreaParalela | null>;
  onLigarArea: () => Promise<EstadoDaAreaParalela>;
  onDesligarArea: () => Promise<EstadoDaAreaParalela | null>;
  onFotografarArea: () => Promise<string | null>;
  motorParado: boolean;
  onParar: () => void;
  onRetomar: () => void;
  onNotification: (mensagem: string, tipo?: 'success' | 'error' | 'info') => void;
}

const CAIXA = "rounded-3xl border border-white/[0.06] bg-white/[0.02]";
const CHAVE_DA_NARRACAO = 'osone_cowork_narracao';
// v2 migra quem estava no antigo padrão Piper para a nova voz neural. Depois da primeira
// escolha, a preferência volta a ser preservada normalmente.
const CHAVE_DO_MOTOR_NARRACAO = 'osone_cowork_motor_narracao_v2';
type MotorNarracaoCowork = 'supertonic-feminina' | 'supertonic-masculina' | 'piper' | 'elevenlabs';

const ELEVENLABS_API_KEY_ID_MESSAGE = "A chave da ElevenLabs salva parece ser o ID da chave, não a API Key secreta. Gere ou rotacione a chave e cole a chave completa que começa com sk_.";

const validarChaveElevenLabsParaUso = (apiKey?: string): { ok: boolean; key: string; message?: string } => {
  const key = (apiKey || '').trim();
  if (!key) return { ok: true, key: '' };
  if (!key.startsWith('sk_')) return { ok: false, key, message: ELEVENLABS_API_KEY_ID_MESSAGE };
  return { ok: true, key };
};

/** Janelas do próprio OSONE não servem de alvo: ele trabalharia dentro de si mesmo. */
const ehJanelaDoOsone = (j: JanelaDeTrabalho) =>
  /osone|electron/i.test(`${j.titulo} ${j.app}`);

const narracaoLigada = (): boolean => {
  try { return localStorage.getItem(CHAVE_DA_NARRACAO) !== 'nao'; } catch { return true; }
};

const definirNarracao = (ligada: boolean): void => {
  try { localStorage.setItem(CHAVE_DA_NARRACAO, ligada ? 'sim' : 'nao'); } catch { /* preferência local apenas */ }
};

const lerMotorNarracao = (): MotorNarracaoCowork => {
  try {
    const valor = localStorage.getItem(CHAVE_DO_MOTOR_NARRACAO);
    if (valor === 'supertonic-feminina' || valor === 'supertonic-masculina' || valor === 'piper' || valor === 'elevenlabs') return valor;
    return 'supertonic-feminina';
  } catch { return 'supertonic-feminina'; }
};

const salvarMotorNarracao = (motor: MotorNarracaoCowork): void => {
  try { localStorage.setItem(CHAVE_DO_MOTOR_NARRACAO, motor); } catch { /* preferência local apenas */ }
};

const limparTextoParaVoz = (texto: string): string =>
  texto
    .replace(/https?:\/\/\S+/g, 'um endereço')
    .replace(/[{}[\]_"`<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const fraseDaVolta = (v: VoltaDoAgente): string => {
  if (!v.ok) return `Tive um problema: ${v.relato}`;
  if (v.acao === 'clicar') return `Cliquei. ${v.pensamento}`;
  if (v.acao === 'clique_direito') return `Abri o menu contextual. ${v.pensamento}`;
  if (v.acao === 'digitar') return `Digitei no campo em foco.`;
  if (v.acao === 'rolar') return `Rolei a tela para procurar mais opções.`;
  if (v.acao === 'abrir') return `Abri o destino e estou olhando a janela.`;
  if (v.acao === 'trocar_janela') return `Troquei para a janela certa.`;
  if (v.acao === 'esperar') return `Estou esperando a tela carregar.`;
  if (v.acao === 'concluir') return `Concluí. ${v.relato}`;
  if (v.acao === 'desistir') return `Parei. ${v.relato}`;
  return v.pensamento || v.relato;
};

export const CoworkSection: React.FC<CoworkSectionProps> = ({
  onBack, localAgentToken, chaveGemini, modeloGemini,
  elevenLabsApiKey, elevenLabsVoiceId, elevenLabsStability, elevenLabsSimilarityBoost,
  elevenLabsStyle, elevenLabsSpeakerBoost, elevenLabsModel,
  ambiente, listarJanelas, janelaDeTrabalho, definirJanela,
  onTrabalhar, relatoDoAgente, areaParalela, onConsultarArea, onLigarArea, onDesligarArea,
  onFotografarArea, motorParado, onParar, onRetomar, onNotification
}) => {
  const [objetivo, setObjetivo] = useState('');
  const [trabalhando, setTrabalhando] = useState(false);
  const [relatorio, setRelatorio] = useState<any>(null);
  const [historico, setHistorico] = useState<TarefaDoHistorico[]>([]);

  const [janelas, setJanelas] = useState<JanelaDeTrabalho[]>([]);
  const [carregandoJanelas, setCarregandoJanelas] = useState(false);
  const [erroDasJanelas, setErroDasJanelas] = useState('');

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

  // ====== AS JANELAS ABERTAS ======
  const atualizarJanelas = async () => {
    setCarregandoJanelas(true);
    try {
      const lista = await listarJanelas();
      setJanelas(lista);
      setErroDasJanelas(lista.length ? '' : (areaParalela?.ligada
        ? 'A tela dele ainda está vazia. Diga o objetivo: a primeira coisa que ele faz é abrir o que precisar.'
        : 'Nenhuma janela encontrada. Abra o programa em que você quer que eu trabalhe.'));
      // Escolha inicial: a janela que está na frente, desde que não seja o próprio OSONE — a
      // pessoa acabou de vir de lá, e trabalhar dentro do OSONE não é o que ela quer dizer.
      if (!janelaDeTrabalho) {
        const candidata = lista.find(j => j.ativa && !ehJanelaDoOsone(j)) || lista.find(j => !ehJanelaDoOsone(j));
        if (candidata) definirJanela(candidata);
      }
    } finally {
      setCarregandoJanelas(false);
    }
  };

  useEffect(() => {
    if (disponibilidade === 'ok') { atualizarJanelas(); onConsultarArea(); }
  }, [disponibilidade]);

  // ====== A TELA DO AGENTE ======
  const [mexendoNaArea, setMexendoNaArea] = useState(false);
  const [fotoDaArea, setFotoDaArea] = useState<string | null>(null);

  const alternarArea = async () => {
    setMexendoNaArea(true);
    try {
      const estado = areaParalela?.ligada ? await onDesligarArea() : await onLigarArea();
      if (estado && !estado.ligada && estado.explicacao && !areaParalela?.ligada) {
        // Xvfb ausente ou plataforma sem suporte: o motivo é acionável e precisa ser lido, não
        // virar um botão que não faz nada.
        onNotification(estado.explicacao, 'error');
      }
      setFotoDaArea(null);
      await atualizarJanelas();
    } finally {
      setMexendoNaArea(false);
    }
  };

  /**
   * A TELA DO AGENTE AO VIVO, SEM VOCÊ PRECISAR SAIR DAQUI.
   *
   * Parado, o preview consulta a área em ritmo baixo. Trabalhando, o próprio motor já fotografa a
   * tela para decidir e estabilizar cada ação; manter este segundo laço junto disparava dois
   * processos de captura concorrentes, aumentava CPU/disco e às vezes fazia o frame operacional
   * ser descartado como antigo. Nesse período o quadro usa as fotos do relatório do motor.
   */
  useEffect(() => {
    if (!areaParalela?.ligada || trabalhando) return;
    let vivo = true;
    let emVoo = false;
    const puxar = async () => {
      if (!vivo || emVoo) return;
      emVoo = true;
      const img = await onFotografarArea();
      if (vivo && img) setFotoDaArea(img);
      emVoo = false;
    };
    puxar();
    const t = setInterval(puxar, 4000);
    return () => { vivo = false; clearInterval(t); };
  }, [areaParalela?.ligada, trabalhando]);

  // ====== O SOM ======
  const [comSom, setComSom] = useState(somLigado());
  const [comNarracao, setComNarracao] = useState(narracaoLigada());
  const [motorNarracao, setMotorNarracao] = useState<MotorNarracaoCowork>(lerMotorNarracao());
  const [frameAtual, setFrameAtual] = useState<CapturaConfirmada | null>(null);
  const ultimoSomDeCapturaRef = useRef(0);
  const ultimaNarracaoRef = useRef(0);
  const audioNarracaoRef = useRef<HTMLAudioElement | null>(null);
  const urlAudioNarracaoRef = useRef<string | null>(null);
  const piperIndisponivelRef = useRef(false);
  const supertonicIndisponivelRef = useRef(false);
  const elevenLabsIndisponivelRef = useRef(false);

  useEffect(() => {
    return () => {
      audioNarracaoRef.current?.pause();
      if (urlAudioNarracaoRef.current) URL.revokeObjectURL(urlAudioNarracaoRef.current);
    };
  }, []);

  useEffect(() => {
    elevenLabsIndisponivelRef.current = false;
  }, [
    elevenLabsApiKey,
    elevenLabsVoiceId,
    elevenLabsStability,
    elevenLabsSimilarityBoost,
    elevenLabsStyle,
    elevenLabsSpeakerBoost,
    elevenLabsModel
  ]);

  const aoCapturar = (frame: CapturaConfirmada) => {
    setFrameAtual(frame);
    // A estabilização fotografa em sequência curta; um obturador por segundo informa sem virar
    // uma metralhadora de bipes.
    if (Date.now() - ultimoSomDeCapturaRef.current >= 900) {
      tocar('captura');
      ultimoSomDeCapturaRef.current = Date.now();
    }
  };
  const alternarSom = () => {
    const novo = !comSom;
    definirSom(novo);
    setComSom(novo);
    // Tocar ao LIGAR é o que prova que funciona: um botão de som que não faz som ao ser ligado
    // deixa a pessoa sem saber se está mudo por escolha dela ou por defeito.
    if (novo) tocar('inicio');
  };
  const pararNarracaoAtual = () => {
    try {
      audioNarracaoRef.current?.pause();
      audioNarracaoRef.current = null;
      if (urlAudioNarracaoRef.current) {
        URL.revokeObjectURL(urlAudioNarracaoRef.current);
        urlAudioNarracaoRef.current = null;
      }
    } catch { /* áudio acessório */ }
  };

  const tocarAudioDaNarracao = async (blob: Blob, prioridade = false) => {
    if (typeof window === 'undefined') return;
    // Cada narração nova substitui a anterior, esteja ela terminada ou não — sem isso, a fala
    // de uma ação que ainda não acabou de tocar quando a próxima ação já concluiu ficava
    // sobreposta à fala seguinte, as duas vozes juntas ao mesmo tempo. `prioridade` continua
    // controlando só o rate-limit em narrar(), não se corta o áudio em andamento.
    pararNarracaoAtual();
    if (!blob.size) throw new Error('O motor de voz gerou áudio vazio.');

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = 0.92;
    audioNarracaoRef.current = audio;
    urlAudioNarracaoRef.current = url;
    audio.onended = () => {
      if (audioNarracaoRef.current === audio) audioNarracaoRef.current = null;
      if (urlAudioNarracaoRef.current === url) {
        URL.revokeObjectURL(url);
        urlAudioNarracaoRef.current = null;
      }
    };
    await audio.play();
  };

  const narrarComPiper = async (frase: string, prioridade = false) => {
    const resposta = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: frase, engine: 'local' })
    });
    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => null);
      throw new Error(erro?.error || `Piper retornou HTTP ${resposta.status}`);
    }
    const blob = await resposta.blob();
    await tocarAudioDaNarracao(blob, prioridade);
  };

  const narrarComSupertonic = async (frase: string, voz: 'F1' | 'M1', prioridade = false) => {
    const resposta = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: frase, engine: 'supertonic', supertonicVoice: voz })
    });
    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => null);
      throw new Error(erro?.error || `Voz natural retornou HTTP ${resposta.status}`);
    }
    if (resposta.headers.get('X-TTS-Mode') === 'piper-fallback') {
      onNotification('A voz natural não pôde ser carregada agora; o Piper assumiu esta fala. Confira a internet no primeiro uso.', 'info');
    }
    const blob = await resposta.blob();
    await tocarAudioDaNarracao(blob, prioridade);
  };

  const narrarComElevenLabs = async (frase: string, prioridade = false) => {
    const validacaoChave = validarChaveElevenLabsParaUso(elevenLabsApiKey);
    if (!validacaoChave.ok) {
      throw new Error(validacaoChave.message);
    }
    const resposta = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: frase,
        engine: 'elevenlabs',
        elevenLabsApiKey: validacaoChave.key,
        elevenLabsVoiceId: elevenLabsVoiceId || '',
        elevenLabsStability,
        elevenLabsSimilarityBoost,
        elevenLabsStyle,
        elevenLabsSpeakerBoost,
        elevenLabsModel
      })
    });
    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => null);
      throw new Error(erro?.error || `ElevenLabs retornou HTTP ${resposta.status}`);
    }
    const blob = await resposta.blob();
    await tocarAudioDaNarracao(blob, prioridade);
  };

  const nomeDoMotorNarracao = (motor: MotorNarracaoCowork) =>
    motor === 'piper' ? 'Piper'
      : motor === 'elevenlabs' ? 'ElevenLabs'
      : motor === 'supertonic-masculina' ? 'Voz natural masculina'
      : 'Voz natural feminina';

  const motorIndisponivel = (motor: MotorNarracaoCowork) =>
    motor === 'piper' ? piperIndisponivelRef.current
      : motor === 'elevenlabs' ? elevenLabsIndisponivelRef.current
      : supertonicIndisponivelRef.current;

  const marcarMotorIndisponivel = (motor: MotorNarracaoCowork) => {
    if (motor === 'piper') piperIndisponivelRef.current = true;
    else if (motor === 'elevenlabs') elevenLabsIndisponivelRef.current = true;
    else supertonicIndisponivelRef.current = true;
  };

  const narrarComMotor = (motor: MotorNarracaoCowork, frase: string, prioridade = false) =>
    motor === 'piper' ? narrarComPiper(frase, prioridade)
      : motor === 'elevenlabs' ? narrarComElevenLabs(frase, prioridade)
      : narrarComSupertonic(frase, motor === 'supertonic-masculina' ? 'M1' : 'F1', prioridade);

  const narrar = (
    texto: string,
    prioridade = false,
    forcar = false,
    motorPreferido: MotorNarracaoCowork = motorNarracao
  ) => {
    if (!forcar && !comNarracao) return;
    const frase = limparTextoParaVoz(texto).slice(0, 190).replace(/([^.!?…])$/, '$1.');
    if (!frase) return;
    if (!prioridade && Date.now() - ultimaNarracaoRef.current < 2200) return;
    ultimaNarracaoRef.current = Date.now();

    const reservas: MotorNarracaoCowork[] = motorPreferido === 'elevenlabs'
      ? ['supertonic-feminina', 'piper']
      : motorPreferido === 'piper'
        ? ['supertonic-feminina', 'elevenlabs']
        : ['piper', 'elevenlabs'];
    const motores = [motorPreferido, ...reservas].filter(
      (motor): motor is MotorNarracaoCowork => !motorIndisponivel(motor)
    );

    if (!motores.length) return;

    void (async () => {
      let ultimoErro: unknown = null;
      for (const motor of motores) {
        try {
          await narrarComMotor(motor, frase, prioridade);
          return;
        } catch (erro) {
          ultimoErro = erro;
          marcarMotorIndisponivel(motor);
          console.warn(`[COWORK] ${nomeDoMotorNarracao(motor)} indisponível para narração:`, erro);
        }
      }
      onNotification(
        `Narração do COWORK sem áudio: voz natural, Piper e ElevenLabs não responderam (${ultimoErro instanceof Error ? ultimoErro.message : 'erro desconhecido'}).`,
        'error'
      );
    })();
  };

  const trocarMotorNarracao = (motor: MotorNarracaoCowork) => {
    salvarMotorNarracao(motor);
    setMotorNarracao(motor);
    if (motor === 'piper') piperIndisponivelRef.current = false;
    if (motor === 'elevenlabs') elevenLabsIndisponivelRef.current = false;
    if (motor.startsWith('supertonic')) supertonicIndisponivelRef.current = false;
    if (motor.startsWith('supertonic')) {
      onNotification('Voz natural selecionada. No primeiro uso, o OSONE prepara cerca de 400 MB uma única vez; depois ela funciona localmente e sem cota.', 'info');
    }
    narrar(
      motor === 'piper'
        ? 'Vou usar a voz local Piper enquanto trabalho no COWORK.'
        : motor === 'elevenlabs'
          ? 'Vou usar ElevenLabs para narrar o guia do COWORK.'
          : `Vou usar a voz natural ${motor === 'supertonic-masculina' ? 'masculina' : 'feminina'} enquanto trabalho no COWORK.`,
      true,
      true,
      motor
    );
  };

  const testarNarracao = () => {
    narrar('Pronto. Este é o teste da narração do COWORK usando o motor de voz selecionado.', true, true);
  };
  const alternarNarracao = () => {
    const novo = !comNarracao;
    definirNarracao(novo);
    setComNarracao(novo);
    if (!novo) {
      pararNarracaoAtual();
    } else {
      narrar('Narração do COWORK ativada.', true, true);
    }
  };

  // ====== O RELATÓRIO AO VIVO ======
  const voltas = relatoDoAgente?.voltas || [];

  /**
   * CADA AÇÃO SOA, E CADA TIPO DE AÇÃO SOA DIFERENTE.
   *
   * O relato de uso foi "chega na tela do YouTube e fica tudo em silêncio". Com a tela dele
   * separada da sua, o silêncio é o estado normal de quem está noutra aba — e trabalhando e
   * travado ficam idênticos. O som devolve a diferença sem exigir que você olhe.
   *
   * O disparo é preso ao TAMANHO da lista, e não a cada renderização: o React redesenha por vários
   * motivos, e tocar a cada redesenho encheria a tarefa de bipes repetidos da mesma ação.
   */
  const voltasJaSoadasRef = useRef(0);
  useEffect(() => {
    if (voltas.length <= voltasJaSoadasRef.current) {
      // A lista zerou (tarefa nova): o contador precisa voltar junto, senão a tarefa seguinte
      // começa muda até passar do tamanho da anterior.
      voltasJaSoadasRef.current = voltas.length;
      return;
    }
    for (let i = voltasJaSoadasRef.current; i < voltas.length; i++) {
      const v = voltas[i];
      if (v.acao === 'concluir' || v.acao === 'desistir') continue; // o fim tem som próprio
      tocar(v.ok ? notaDaAcao(v.acao) : 'falha');
      narrar(fraseDaVolta(v));
    }
    voltasJaSoadasRef.current = voltas.length;
  }, [voltas.length, comNarracao]);

  /**
   * Enquanto ele trabalha, um toque baixinho de tempos em tempos.
   *
   * É para a espera longa — uma página pesada, o modelo pensando. Sem isso, o intervalo entre duas
   * ações é silêncio puro, indistinguível de ter travado; com isso, o silêncio volta a significar
   * "parou", que é a informação que se quer.
   */
  useEffect(() => {
    if (!trabalhando) return;
    return baterPonto();
  }, [trabalhando]);
  const fimDoRelato = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Acompanhar o agente exige ver a ÚLTIMA linha; sem rolar sozinho, quem está assistindo passa
    // a tarefa inteira arrastando a barra.
    fimDoRelato.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [voltas.length]);

  /**
   * O que aparece no quadro: a tela do agente ao vivo, quando ela existe; senão, a última foto que
   * ele tirou ao agir. As duas são honestas sobre o que são — uma é "agora", a outra é "o que ele
   * viu no último passo" — e a legenda abaixo do quadro diz qual das duas está ali.
   */
  const ultimaFotoDoTrabalho = [...voltas].reverse().find(v => v.foto)?.foto;
  const ultimaFoto = trabalhando
    ? (ultimaFotoDoTrabalho || fotoDaArea)
    : (fotoDaArea || ultimaFotoDoTrabalho);

  const comecar = async (texto?: string) => {
    const alvo = (texto ?? objetivo).trim();
    if (!alvo || trabalhando) return;
    /**
     * COMEÇAR SEM JANELA DEIXOU DE SER ERRO.
     *
     * A exigência fazia sentido quando a única coisa que o agente sabia fazer era mexer na tela:
     * sem janela, não havia onde agir. Depois que ele passou a pesquisar e ler páginas, a mesma
     * regra virou uma parede na frente do caso mais comum — "pesquisa isso e me traz" não precisa
     * de janela nenhuma, e mesmo assim o botão ficava desligado e a mensagem mandava escolher uma
     * tela que a tarefa não usaria. A capacidade existia e não tinha por onde ser pedida.
     *
     * Quem decide agora é o próprio agente, que é informado no contexto de que não tem janela: se
     * a tarefa for de pesquisa, ele pesquisa; se exigir clicar, ele desiste dizendo o que falta.
     */
    if (!janelaDeTrabalho && !areaParalela?.ligada) {
      onNotification('Sem janela escolhida — vou trabalhar só pesquisando e lendo páginas.', 'info');
    }
    if (motorParado) onRetomar();

    setTrabalhando(true);
    setRelatorio(null);
    // O som de partida também é o que "acorda" o áudio do navegador: ele só libera som depois de
    // um gesto da pessoa, e este clique é o gesto. Tocar aqui garante que os bipes seguintes,
    // que não vêm de clique nenhum, já encontrem o caminho aberto.
    tocar('inicio');
    narrar(`COWORK iniciado. Vou olhar a tela e agir passo a passo.`, true);
    try {
      const resultado = await onTrabalhar(alvo, janelaDeTrabalho, aoCapturar);
      setRelatorio(resultado);

      const deuErro = !!(resultado as any)?.error;
      const desfecho = deuErro ? 'erro' as const : desfechoDoMotivo((resultado as any).motivo);
      const texto = deuErro ? String((resultado as any).error) : String((resultado as any).resumo || '');

      setHistorico(guardarNoHistorico({
        id: Math.random().toString(36).slice(2, 10),
        tarefa: alvo,
        quando: Date.now(),
        desfecho,
        detalhe: texto,
        voltas: (resultado as any)?.voltas?.length,
        janela: janelaDeTrabalho?.titulo || (areaParalela?.ligada ? 'Tela do agente' : undefined),
        aprendida: desfecho === 'concluida' && Array.isArray((resultado as any)?.voltas) && (resultado as any).voltas.some((v: any) => v.ok && ['abrir', 'clicar', 'clique_direito', 'digitar', 'tecla', 'rolar', 'trocar_janela'].includes(v.acao))
      }));

      /**
       * O SOM DE DESLIGAMENTO — o mais importante dos três.
       *
       * É ele que responde "ele ainda está trabalhando ou já acabou?" sem você voltar à aba. Os
       * três desfechos soam diferentes de propósito: terminou, você mandou parar, ou empacou. Um
       * som só para os três obrigaria a olhar justamente para saber o que aconteceu.
       */
      tocar(
        (resultado as any)?.motivo === 'acao-recusada' ? 'recusa'
          : desfecho === 'concluida' ? 'concluido'
          : desfecho === 'parada' ? 'parado'
          : 'falha'
      );
      /**
       * A lista de fontes fica na TELA, e fora da narração.
       *
       * Ela é o que dá procedência à resposta escrita, e por isso é impressa junto dela. Falada,
       * vira o oposto: "Fontes: um endereço, um endereço, um endereço" — porque a limpeza para voz
       * troca toda URL por "um endereço", e o que sobra é ruído que enterra a resposta de verdade,
       * dita nos primeiros segundos.
       */
      narrar((texto || 'Tarefa finalizada.').split('\n\nFontes:')[0], true);
      onNotification(texto || 'Tarefa finalizada.',
        desfecho === 'concluida' ? 'success' : desfecho === 'parada' ? 'info' : 'error');
    } finally {
      setTrabalhando(false);
    }
  };

  const iconeDaVolta = (v: VoltaDoAgente) => {
    if (v.acao === 'concluir') return <Check className="w-4 h-4 text-emerald-400" />;
    if (!v.ok) return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    return <CornerDownRight className="w-3.5 h-3.5 text-her-muted" />;
  };

  /**
   * O aviso passou a separar as DUAS metades do que esta aba faz.
   *
   * Dizer "esta aba só funciona no app instalado" virou meia verdade quando o agente aprendeu a
   * pesquisar e ler páginas: isso funciona em qualquer lugar, porque não toca no computador de
   * ninguém. O que exige o app instalado é a outra metade — clicar, digitar, rolar. Uma frase que
   * bloqueia as duas faz a pessoa nem tentar a que funcionaria.
   */
  const avisoDeDisponibilidade =
    disponibilidade === 'web'
      ? 'Pelo navegador ele PESQUISA e LÊ páginas normalmente. O que não funciona aqui é mexer no seu computador (clicar, digitar, rolar): isso é bloqueado de propósito — nenhum servidor na nuvem opera a sua máquina. Para essa parte, use o OSONE instalado.'
      : disponibilidade === 'sem-agente'
        ? 'O Agente Local não respondeu, então ele não consegue mexer no seu computador agora — mas PESQUISAR e LER páginas continua funcionando. Para operar a máquina, abra o OSONE instalado e confira o Token do Agente Local nas Configurações.'
        : '';

  const respostaFinal = relatorio && !(relatorio as any).error ? String((relatorio as any).resumo || '') : '';
  const concluiu = relatorio && (relatorio as any).motivo === 'concluido';

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
            Diga o objetivo. Ele olha a janela, decide o que fazer, faz — e vai contando tudo aqui.
          </p>
        </div>
        <button
          onClick={alternarSom}
          title={comSom ? 'Desligar os sons do agente' : 'Ligar os sons do agente (saber o que ele faz sem olhar)'}
          className={cn(
            "p-2.5 rounded-full border shrink-0 transition-colors",
            comSom ? "border-indigo-500/25 text-indigo-300 bg-indigo-500/[0.06] hover:bg-indigo-500/10"
                   : "border-white/10 text-her-muted hover:bg-white/[0.04]"
          )}
        >
          {comSom ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
        <button
          onClick={alternarNarracao}
          title={comNarracao ? 'Desligar a narração por voz do COWORK' : 'Ligar a narração por voz do COWORK'}
          className={cn(
            "px-3 py-2.5 rounded-full border shrink-0 transition-colors text-[10px] uppercase tracking-[0.18em]",
            comNarracao ? "border-cyan-500/25 text-cyan-200 bg-cyan-500/[0.06] hover:bg-cyan-500/10"
                        : "border-white/10 text-her-muted hover:bg-white/[0.04]"
          )}
        >
          Voz {comNarracao ? 'on' : 'off'}
        </button>
        <div className="hidden xl:flex items-center gap-2 shrink-0">
          <select
            value={motorNarracao}
            onChange={e => trocarMotorNarracao(e.target.value as MotorNarracaoCowork)}
            title="Escolher o motor da narração do COWORK"
            className="max-w-[190px] h-9 rounded-full border border-cyan-500/20 bg-cyan-500/[0.06] px-3 text-[11px] text-cyan-100 outline-none hover:bg-cyan-500/10 focus:border-cyan-500/40"
          >
            <option value="supertonic-feminina">Natural local · feminina</option>
            <option value="supertonic-masculina">Natural local · masculina</option>
            <option value="piper">Piper local</option>
            <option value="elevenlabs">ElevenLabs</option>
          </select>
          <button
            onClick={testarNarracao}
            className="h-9 px-3 rounded-full border border-white/10 text-[10px] uppercase tracking-[0.16em] text-her-muted hover:bg-white/[0.04] hover:text-cyan-200"
            title="Ouvir um teste curto da narração"
          >
            Testar
          </button>
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
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4 text-xs text-amber-200/90 font-light leading-relaxed max-w-6xl">
          <ShieldAlert size={16} className="shrink-0 mt-0.5 text-amber-400" />
          <span>{avisoDeDisponibilidade}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-6 max-w-6xl">
        {/* ====== ESQUERDA: O PEDIDO, A JANELA, O HISTÓRICO ====== */}
        <div className="flex flex-col gap-6 min-w-0">
          <div className={cn(CAIXA, "p-5")}>
            <label className="text-[10px] uppercase tracking-[0.2em] text-her-muted">O que você quer que ele faça</label>
            <textarea
              value={objetivo}
              onChange={e => setObjetivo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) comecar(); }}
              // O exemplo agora mostra os DOIS caminhos que o agente sabe seguir: operar o
              // computador e trazer dado da internet. Uma capacidade que não aparece em lugar
              // nenhum da tela é, na prática, uma capacidade que ninguém descobre que existe.
              placeholder={'Ex: pesquisa os preços dos concorrentes e me traz uma tabela com as fontes — ou: entra no meu canal do YouTube, abre as análises e me diz o que o gráfico mostra'}
              rows={3}
              disabled={trabalhando}
              className="mt-3 w-full bg-transparent border border-white/[0.06] rounded-2xl px-4 py-3 text-sm
                         text-her-ink/90 font-light placeholder:text-her-muted/50 outline-none
                         focus:border-indigo-500/30 resize-none disabled:opacity-50"
            />

            {trabalhando ? (
              motorParado ? (
                <button
                  onClick={onRetomar}
                  className="mt-3 w-full py-3 rounded-2xl text-sm font-light bg-emerald-500/10 text-emerald-300
                             border border-emerald-500/25 hover:bg-emerald-500/15 flex items-center justify-center gap-2"
                >
                  <Play size={14} /> Retomar
                </button>
              ) : (
                <button
                  onClick={onParar}
                  className="mt-3 w-full py-3 rounded-2xl text-sm font-light bg-red-500/10 text-red-300
                             border border-red-500/25 hover:bg-red-500/15 flex items-center justify-center gap-2"
                >
                  <Square size={14} /> Parar agora
                </button>
              )
            ) : (
              <button
                onClick={() => comecar()}
                // Só o objetivo é obrigatório. Janela e Agente Local viraram requisito DA TAREFA,
                // não da aba: pesquisar e ler não precisam de nenhum dos dois, e é o agente que
                // avisa, com o motivo escrito, quando o que foi pedido exige a tela.
                disabled={!objetivo.trim()}
                className="mt-3 w-full py-3 rounded-2xl text-sm font-light transition-all
                           bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 hover:bg-indigo-500/15
                           disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Play size={14} /> Começar
              </button>
            )}
            <p className="mt-2 text-[10px] text-her-muted/70 font-light leading-relaxed">
              Ele decide cada ação olhando a tela — se aparecer um login, um aviso de cookies ou um botão fora do lugar,
              ele resolve e segue. Você pode parar a qualquer momento.
            </p>
          </div>

          <CoworkTeachingPanel
            objetivo={objetivo}
            bloqueado={trabalhando || disponibilidade === 'web'}
            chaveGemini={chaveGemini}
            modeloGemini={modeloGemini}
            onNotification={onNotification}
          />

          {/* ====== A TELA DELE, OU A SUA ====== */}
          <div className={cn(
            "rounded-3xl border p-5",
            areaParalela?.ligada ? "border-emerald-500/25 bg-emerald-500/[0.04]" : "border-white/[0.06] bg-white/[0.02]"
          )}>
            <div className="flex items-center gap-2 mb-2">
              <MonitorPlay size={14} className={areaParalela?.ligada ? "text-emerald-400" : "text-her-muted"} />
              <p className="text-[10px] uppercase tracking-[0.2em] text-her-muted flex-1">Onde ele trabalha</p>
            </div>

            <p className="text-sm text-her-ink/85 font-light leading-snug">
              {areaParalela?.ligada
                ? 'Ele tem uma tela só dele.'
                : areaParalela?.suportada === false
                  ? 'Ele trabalha na sua tela.'
                  : 'Ele trabalha na sua tela.'}
            </p>
            <p className="mt-1 text-[11px] text-her-muted/80 font-light leading-relaxed">
              {areaParalela?.ligada
                ? `Tela de ${areaParalela.largura}×${areaParalela.altura} na memória, sem monitor. As janelas que ele abrir nascem lá; seu mouse, seu teclado e suas janelas não são tocados.`
                : areaParalela?.suportada === false
                  ? (areaParalela.explicacao || 'Este sistema não oferece uma tela separada.')
                  : 'Isso significa que ele traz a janela dele para frente para agir — mouse e teclado agem sobre o que está na frente, em qualquer sistema. Com a tela dele ligada, isso deixa de acontecer.'}
            </p>

            {areaParalela?.suportada !== false && (
              <button
                onClick={alternarArea}
                disabled={mexendoNaArea || trabalhando || disponibilidade !== 'ok'}
                className={cn(
                  "mt-3 w-full py-2.5 rounded-2xl text-sm font-light transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed",
                  areaParalela?.ligada
                    ? "bg-white/[0.03] text-her-ink/70 border border-white/10 hover:bg-white/[0.06]"
                    : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/15"
                )}
              >
                {mexendoNaArea
                  ? <><Loader2 size={14} className="animate-spin" /> Um instante...</>
                  : areaParalela?.ligada
                    ? 'Desligar a tela dele (voltar a trabalhar na minha)'
                    : 'Dar uma tela só para ele'}
              </button>
            )}
            {areaParalela?.ligada && !areaParalela.gerenciadorDeJanelas && (
              <p className="mt-2 text-[10px] text-amber-400/80 font-light leading-relaxed">
                Sem gerenciador de janelas instalado, as janelas dele abrem sem moldura. Funciona, mas fica mais cru —
                instalar <code className="text-her-ink/60">openbox</code> deixa a tela dele igual a uma de verdade.
              </p>
            )}
          </div>

          {/* ====== A JANELA DE TRABALHO ====== */}
          <div className={cn(CAIXA, "p-5")}>
            <div className="flex items-center gap-2 mb-3">
              <AppWindow size={14} className="text-her-muted" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-her-muted flex-1">
                {areaParalela?.ligada ? 'Janelas na tela dele' : 'Janela em que ele trabalha'}
              </p>
              <button
                onClick={atualizarJanelas}
                disabled={carregandoJanelas || disponibilidade !== 'ok'}
                title="Atualizar a lista de janelas"
                className="p-1.5 rounded-lg hover:bg-white/[0.05] text-her-muted disabled:opacity-30"
              >
                <RefreshCw size={14} className={cn(carregandoJanelas && "animate-spin")} />
              </button>
            </div>

            {erroDasJanelas && !janelas.length ? (
              <p className="text-xs text-her-muted/70 font-light">{erroDasJanelas}</p>
            ) : (
              <div className="space-y-1 max-h-[26vh] overflow-y-auto custom-scrollbar pr-1">
                {janelas.map(j => {
                  const escolhida = janelaDeTrabalho?.id === j.id;
                  return (
                    <button
                      key={j.id}
                      onClick={() => definirJanela(j)}
                      disabled={trabalhando}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-xl border transition-colors disabled:opacity-50",
                        escolhida ? "border-indigo-500/30 bg-indigo-500/[0.07]" : "border-white/[0.04] hover:bg-white/[0.03]"
                      )}
                    >
                      <p className={cn("text-sm font-light leading-tight truncate", escolhida ? "text-indigo-200" : "text-her-ink/80")}>
                        {j.titulo}
                      </p>
                      <p className="text-[10px] text-her-muted/70 mt-0.5">
                        {j.app} · {j.width}×{j.height}
                        {j.ativa && ' · na frente agora'}
                        {ehJanelaDoOsone(j) && ' · é o próprio OSONE'}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            <p className="mt-3 text-[10px] text-her-muted/70 font-light leading-relaxed">
              Ele começa nesta janela e <strong className="text-her-ink/60">muda sozinho</strong> quando abrir outra coisa —
              você não precisa escolher de novo. Para agir, ele traz a janela dele para frente: mouse e teclado
              sempre agem sobre o que está na frente, em qualquer sistema.
            </p>
          </div>

          {/* ====== HISTÓRICO ====== */}
          <div className={cn(CAIXA, "p-5")}>
            <div className="flex items-center gap-2 mb-3">
              <History size={14} className="text-her-muted" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-her-muted flex-1">Tarefas já pedidas</p>
              {historico.length > 0 && (
                <button
                  onClick={() => { limparHistorico(); setHistorico([]); }}
                  title="Limpar o histórico e os aprendizados automáticos; treinamentos ensinados são apagados no card deles"
                  className="p-1.5 rounded-lg hover:bg-white/[0.05] text-her-muted"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {historico.length === 0 ? (
              <p className="text-xs text-her-muted/70 font-light">
                Quando uma tarefa rodar, ela aparece aqui — repetir é um clique, e ele refaz o caminho olhando a tela de hoje.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[26vh] overflow-y-auto custom-scrollbar pr-1">
                {historico.map(item => (
                  <div key={item.id} className="flex items-start gap-3 px-3 py-2 rounded-xl border border-white/[0.04] hover:bg-white/[0.02]">
                    <span className={cn(
                      "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                      item.desfecho === 'concluida' ? "bg-emerald-400" : item.desfecho === 'parada' ? "bg-amber-400" : "bg-red-400"
                    )} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-her-ink/85 font-light leading-tight truncate">{item.tarefa}</p>
                      <p className="text-[10px] text-her-muted/70 mt-0.5">
                        {item.voltas ? `${item.voltas} ação(ões) · ` : ''}
                        {new Date(item.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {item.desfecho !== 'concluida' && ` · ${item.desfecho === 'parada' ? 'parada' : 'não concluiu'}`}
                        {item.aprendida && ' · automação aprendida com segurança'}
                      </p>
                    </div>
                    <button
                      onClick={() => { setObjetivo(item.tarefa); comecar(item.tarefa); }}
                      disabled={trabalhando || (!janelaDeTrabalho && !areaParalela?.ligada)}
                      title="Pedir de novo (ele refaz o caminho olhando a tela de agora)"
                      className="p-1.5 rounded-lg hover:bg-indigo-500/10 text-indigo-300 disabled:opacity-30 shrink-0"
                    >
                      <Play size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ====== DIREITA: O QUE ELE ESTÁ FAZENDO ====== */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* A RESPOSTA, em destaque — é o que a pessoa pediu, não um detalhe do registro. */}
          <AnimatePresence>
            {relatorio && !trabalhando && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "rounded-3xl border p-5",
                  concluiu ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-amber-500/25 bg-amber-500/[0.04]"
                )}
              >
                <p className="text-[10px] uppercase tracking-[0.2em] text-her-muted mb-2">
                  {concluiu ? 'Resultado' : 'Como terminou'}
                </p>
                <p className="text-sm text-her-ink/90 font-light leading-relaxed whitespace-pre-wrap">
                  {(relatorio as any).error || respostaFinal}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* O QUE ELE ESTÁ VENDO */}
          <div className={cn(CAIXA, "p-5")}>
            <div className="flex items-center gap-2 mb-3">
              <Eye size={14} className="text-her-muted" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-her-muted flex-1">
                {areaParalela?.ligada ? 'A tela dele, ao vivo' : 'O que ele está vendo'}
                {!areaParalela?.ligada && janelaDeTrabalho && (
                  <span className="normal-case tracking-normal text-her-muted/60"> · {janelaDeTrabalho.titulo}</span>
                )}
              </p>
              {areaParalela?.ligada && (
                <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> ao vivo
                </span>
              )}
              {frameAtual && !areaParalela?.ligada && (
                <span className="text-[9px] text-emerald-400" title={frameAtual.captureId}>
                  frame atual confirmado · {new Date(frameAtual.capturedAt).toLocaleTimeString('pt-BR')}
                </span>
              )}
            </div>
            <div className="relative rounded-2xl overflow-hidden border border-white/[0.06] bg-black aspect-video">
              {ultimaFoto ? (
                <img src={ultimaFoto} alt="A janela em que o agente trabalha" className="w-full h-full object-contain" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-her-muted">
                  <Monitor size={28} className="opacity-40" />
                  <span className="text-xs font-light">
                    {areaParalela?.ligada ? 'A tela dele está vazia — ele ainda não abriu nada' : 'A foto aparece quando ele começar a trabalhar'}
                  </span>
                </div>
              )}
            </div>
            <p className="mt-2 text-[10px] text-her-muted/70 font-light leading-relaxed">
              {areaParalela?.ligada
                ? 'Esta é a tela dele agora, atualizando sozinha. Seu mouse e seu teclado continuam seus — fique em qualquer aba ou programa.'
                : 'A imagem é do último passo que ele deu. Ligue a tela dele para acompanhar ao vivo sem sair daqui.'}
            </p>
          </div>

          {/* O RELATÓRIO AO VIVO */}
          <div className={cn(CAIXA, "p-5 flex-1 min-h-0")}>
            <div className="flex items-center gap-2 mb-3">
              {trabalhando
                ? <Loader2 size={14} className="animate-spin text-her-accent" />
                : <MousePointerClick size={14} className="text-her-muted" />}
              <p className="text-[10px] uppercase tracking-[0.2em] text-her-muted flex-1">
                {trabalhando ? `Trabalhando — ação ${voltas.length + 1}` : `Relatório${voltas.length ? ` · ${voltas.length} ação(ões)` : ''}`}
              </p>
            </div>

            {voltas.length === 0 ? (
              <p className="text-xs text-her-muted/70 font-light">
                Aqui aparece cada coisa que ele faz, com o motivo — o que ele viu na tela e por que agiu assim.
              </p>
            ) : (
              <div className="space-y-2 max-h-[46vh] overflow-y-auto custom-scrollbar pr-1">
                {voltas.map((v, i) => (
                  <div key={i} className={cn(
                    "flex items-start gap-3 px-3 py-2 rounded-xl border",
                    v.acao === 'concluir' ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                      : !v.ok ? "border-amber-500/20 bg-amber-500/[0.03]"
                      : "border-white/[0.04]"
                  )}>
                    <div className="mt-0.5 shrink-0">{iconeDaVolta(v)}</div>
                    <div className="min-w-0 flex-1">
                      {/* O PENSAMENTO vem primeiro: é o que ele viu e por que decidiu assim. Sem
                          isso o relatório vira uma lista de cliques sem explicação nenhuma. */}
                      <p className="text-[13px] text-her-ink/85 font-light leading-snug">{v.pensamento}</p>
                      {/*
                        O RELATO VAI CORTADO NA TELA — e inteiro só para o modelo.
                        Uma leitura de página traz a página inteira no relato (o modelo precisa
                        dela para decidir). Jogar isso cru aqui enterrava o relatório: uma volta
                        virava um paredão de texto e as outras sumiam do campo de visão. Quem lê
                        esta lista quer saber O QUE ele fez, e para isso o começo basta.
                      */}
                      <p className={cn("text-[11px] mt-0.5 leading-snug whitespace-pre-wrap break-words", v.ok ? "text-her-muted/80" : "text-amber-400/90")}>
                        {v.relato.length > 400 ? `${v.relato.slice(0, 400)}… (${v.relato.length} caracteres lidos)` : v.relato}
                      </p>
                      <p className="text-[9px] text-her-muted/50 mt-0.5">
                        {v.acao} · {(v.duracaoMs / 1000).toFixed(1)}s
                        {v.mudancaDaTela > 0 && ` · tela mudou ${Math.round(v.mudancaDaTela * 100)}%`}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={fimDoRelato} />
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-[11px] text-her-muted leading-relaxed font-light space-y-2">
            <p><strong className="text-her-ink/70">Onde ele para sozinho:</strong></p>
            <p>• <strong className="text-her-ink/60">Dinheiro, nunca.</strong> Chegando numa tela de pagamento, compra, PIX ou cartão, ele para e devolve o controle. Quem paga é você.</p>
            <p>• Apagar, mover ou renomear arquivo e rodar comando de terminal não entram no laço automático.</p>
            <p>• Se repetir a mesma ação sem a tela avançar, se falhar duas vezes seguidas, ou se passar de 40 ações ou 8 minutos, ele para e conta até onde chegou.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
