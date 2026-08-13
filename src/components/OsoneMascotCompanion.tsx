import React, { useCallback, useEffect, useRef, useState } from 'react';

const estados = ['idle', 'speak', 'point-right', 'walk', 'point-up', 'jump', 'point-down', 'look'] as const;
type EstadoDoMascote = typeof estados[number];
export type AtividadeDoMascote = 'idle' | 'listening' | 'thinking' | 'speaking' | 'summoned' | 'error';

type EstadoDoCerebroDoMascote = {
  atividade: AtividadeDoMascote;
  alvo?: string;
};

type OsoneMascotCompanionProps = {
  brain: EstadoDoCerebroDoMascote;
};

/* Comandos que o OSONE dispara para o mascote. Os pontos vem normalizados
   (0 a 1 da tela) para valer igual na pagina e no overlay em tela cheia. */
export const EVENTO_DE_COMANDO_DO_MASCOTE = 'osone-mascote-comando';

export type AcaoDoMascote = 'andar' | 'apontar' | 'tchau' | 'pular' | 'olhar' | 'parar';

export type ComandoDoMascote = {
  acao: AcaoDoMascote;
  x?: number;
  y?: number;
  fala?: string;
};

const FALAS_PADRAO: Record<AcaoDoMascote, string> = {
  andar: '',
  apontar: 'Olha ali!',
  tchau: 'Tchau!',
  pular: 'Oba!',
  olhar: '',
  parar: ''
};

/* Quanto tempo o mascote segura o gesto antes de voltar a passear sozinho. */
const DURACAO_DO_GESTO: Record<AcaoDoMascote, number> = {
  andar: 2600,
  apontar: 6000,
  tchau: 3200,
  pular: 3000,
  olhar: 4000,
  parar: 0
};

const entre = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));

const STORAGE_KEY = 'osone_mascot_active';

/* Passeio: o mascote caminha pela tela inteira. O eixo Y e usado como profundidade,
   entao quem esta mais ao fundo aparece um pouco menor. */
const VELOCIDADE_DO_PASSEIO = 130; // pixels por segundo
const FATIA_DE_PROFUNDIDADE = 0.42; // quanto da altura da tela ele percorre
const REDUCAO_NO_FUNDO = 0.3; // o quanto ele encolhe no ponto mais distante
const DURACAO_MINIMA = 1200;
const DURACAO_MAXIMA = 12000;

const preferReduzirMovimento = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/* Reacao ao mouse. O mascote nao captura o ponteiro: ele passeia por cima da
   interface e roubar o clique dos botoes seria pior que nao reagir. Entao a
   gente escuta o mouse na janela e compara com onde ele esta. */
const RAIO_DO_CORPO = 0.34; // fatia da largura do mascote que conta como "em cima"
const ALCANCE_DO_OLHAR = 280; // ate onde os olhos seguem o cursor, em pixels
const DESVIO_DA_PUPILA = 4.5; // deslocamento maximo da pupila, em unidades do SVG
const SAUDACOES = ['Oi!', 'Oi, oi!', 'Tô aqui!', 'Precisa de mim?'];

/* Arte do mascote: bolinha fofa e carismatica, com olhos grandes, sobrancelhas
   expressivas, bracinhos de macarrao e pezinhos arredondados. */
function ArteDoMascote() {
  return (
    <svg className="osone-mascot-svg" viewBox="0 0 200 210" role="presentation" focusable="false">
      <defs>
        <radialGradient id="osoneCorpo" cx="34%" cy="26%" r="82%">
          <stop offset="0%" stopColor="#FFD693" />
          <stop offset="30%" stopColor="#FDB054" />
          <stop offset="68%" stopColor="#F58824" />
          <stop offset="100%" stopColor="#DB620F" />
        </radialGradient>
        <radialGradient id="osoneVolume" cx="38%" cy="30%" r="74%">
          <stop offset="60%" stopColor="#8C3A00" stopOpacity="0" />
          <stop offset="100%" stopColor="#8C3A00" stopOpacity="0.4" />
        </radialGradient>
        <linearGradient id="osoneMembro" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#FDB761" />
          <stop offset="100%" stopColor="#E06B12" />
        </linearGradient>
        <radialGradient id="osoneOlho" cx="42%" cy="32%" r="74%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F7E4C6" />
        </radialGradient>
        <radialGradient id="osoneChao" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse className="osone-mascot-shadow" cx="100" cy="194" rx="56" ry="10" fill="url(#osoneChao)" />

      <g className="osone-mascot-figura">
        <g className="osone-mascot-leg osone-mascot-leg-left">
          <rect x="77" y="120" width="21" height="58" rx="10.5" fill="url(#osoneMembro)" />
          <ellipse cx="81" cy="177" rx="16" ry="10" fill="url(#osoneMembro)" />
        </g>
        <g className="osone-mascot-leg osone-mascot-leg-right">
          <rect x="102" y="120" width="21" height="58" rx="10.5" fill="url(#osoneMembro)" />
          <ellipse cx="119" cy="177" rx="16" ry="10" fill="url(#osoneMembro)" />
        </g>

        <g className="osone-mascot-arm osone-mascot-arm-left">
          <rect x="40" y="96" width="19" height="50" rx="9.5" fill="url(#osoneMembro)" />
          <ellipse cx="49.5" cy="145" rx="12" ry="11" fill="url(#osoneMembro)" />
          <ellipse className="osone-mascot-finger" cx="49.5" cy="157" rx="5.4" ry="7.4" fill="url(#osoneMembro)" />
        </g>
        <g className="osone-mascot-arm osone-mascot-arm-right">
          <rect x="141" y="96" width="19" height="50" rx="9.5" fill="url(#osoneMembro)" />
          <ellipse cx="150.5" cy="145" rx="12" ry="11" fill="url(#osoneMembro)" />
          <ellipse className="osone-mascot-finger" cx="150.5" cy="157" rx="5.4" ry="7.4" fill="url(#osoneMembro)" />
        </g>

        <g className="osone-mascot-cabeca">
          <circle cx="100" cy="92" r="60" fill="url(#osoneCorpo)" />
          <circle cx="100" cy="92" r="60" fill="url(#osoneVolume)" />
          <ellipse cx="84" cy="47" rx="18" ry="8" fill="#FFFFFF" opacity="0.26" transform="rotate(-18 84 47)" />
          <ellipse className="osone-mascot-cheek" cx="58" cy="107" rx="12" ry="7.5" fill="#F0501B" opacity="0.2" />
          <ellipse className="osone-mascot-cheek" cx="142" cy="107" rx="12" ry="7.5" fill="#F0501B" opacity="0.2" />

          <g className="osone-mascot-eye osone-mascot-eye-left">
            <ellipse cx="79" cy="80" rx="19" ry="21.5" fill="url(#osoneOlho)" stroke="#B4712F" strokeWidth="1.4" strokeOpacity="0.45" />
            <g className="osone-mascot-pupil">
              <circle cx="81" cy="84" r="10.6" fill="#7C4519" />
              <circle cx="81" cy="84" r="6.6" fill="#241209" />
              <circle cx="77.6" cy="80" r="3.6" fill="#FFFFFF" opacity="0.95" />
              <circle cx="84.4" cy="87.6" r="1.8" fill="#FFFFFF" opacity="0.6" />
            </g>
          </g>
          <g className="osone-mascot-eye osone-mascot-eye-right">
            <ellipse cx="121" cy="80" rx="19" ry="21.5" fill="url(#osoneOlho)" stroke="#B4712F" strokeWidth="1.4" strokeOpacity="0.45" />
            <g className="osone-mascot-pupil">
              <circle cx="119" cy="84" r="10.6" fill="#7C4519" />
              <circle cx="119" cy="84" r="6.6" fill="#241209" />
              <circle cx="115.6" cy="80" r="3.6" fill="#FFFFFF" opacity="0.95" />
              <circle cx="122.4" cy="87.6" r="1.8" fill="#FFFFFF" opacity="0.6" />
            </g>
          </g>

          <path className="osone-mascot-brow osone-mascot-brow-left" d="M65 54 Q80 45 95 52" />
          <path className="osone-mascot-brow osone-mascot-brow-right" d="M105 52 Q120 45 135 54" />

          <path className="osone-mascot-mouth" d="M85 111 Q100 126 115 111" />
          <g className="osone-mascot-mouth-open">
            <ellipse cx="100" cy="117" rx="15" ry="12.5" fill="#46200C" />
            <ellipse cx="100" cy="126" rx="8.5" ry="5.5" fill="#FF8080" />
          </g>
        </g>
      </g>
    </svg>
  );
}

const estaNoElectron = () => {
  if (typeof navigator === 'undefined') return false;
  return /Electron/i.test(navigator.userAgent);
};

const estadoVisualDoCerebro = (brain: EstadoDoCerebroDoMascote): { pose: EstadoDoMascote; fala: string } => {
  switch (brain.atividade) {
    case 'speaking':
      return { pose: 'speak', fala: 'Estou falando agora.' };
    case 'thinking':
      return { pose: 'look', fala: 'Estou pensando no proximo passo.' };
    case 'listening':
      return { pose: 'look', fala: 'Estou te ouvindo.' };
    case 'summoned':
      return { pose: 'point-right', fala: brain.alvo ? `Estou sintonizado em ${brain.alvo}.` : 'Estou olhando essa area.' };
    case 'error':
      return { pose: 'point-down', fala: 'Algo falhou aqui. Vou te mostrar.' };
    default:
      return { pose: 'idle', fala: '' };
  }
};

export function OsoneMascotCompanion({ brain }: OsoneMascotCompanionProps) {
  const [ativo, setAtivo] = useState(false);
  const [overlayExterno, setOverlayExterno] = useState(false);
  const [apiExternaDisponivel, setApiExternaDisponivel] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [estado, setEstado] = useState<EstadoDoMascote>('idle');
  const [fala, setFala] = useState('');
  const [espelhado, setEspelhado] = useState(false);
  const [mouseEmCima, setMouseEmCima] = useState(false);
  const [saudacao, setSaudacao] = useState('');
  const [gesto, setGesto] = useState<'nenhum' | 'apontando' | 'acenando'>('nenhum');
  const [sobComando, setSobComando] = useState(false);
  const andarilhoRef = useRef<HTMLDivElement | null>(null);
  const posicaoRef = useRef({ x: 0, y: 0 });
  const espelhadoRef = useRef(false);
  const timersDoComandoRef = useRef<number[]>([]);

  useEffect(() => {
    const salvo = localStorage.getItem(STORAGE_KEY) === '1';
    setAtivo(salvo);
    if (!estaNoElectron()) {
      setOverlayExterno(false);
      setApiExternaDisponivel(false);
      return;
    }

    let cancelado = false;
    fetch('/api/mascote/estado')
      .then(res => res.ok ? res.json() : null)
      .then(async (dados) => {
        if (cancelado || !dados) return;
        const externo = Boolean(dados.externo && dados.suportado);
        setOverlayExterno(externo);
        setApiExternaDisponivel(externo);
        if (salvo && externo) {
          await fetch('/api/mascote/ativar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ativo: true })
          }).catch(() => null);
        }
      })
      .catch(() => {
        setOverlayExterno(false);
        setApiExternaDisponivel(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const areaDoPasseio = useCallback(() => {
    const largura = andarilhoRef.current?.offsetWidth || 156;
    return {
      largura: Math.max(0, window.innerWidth - largura - 24),
      profundidade: Math.max(0, window.innerHeight * FATIA_DE_PROFUNDIDADE - 60)
    };
  }, []);

  const escalaDaProfundidade = useCallback((y: number) => {
    const { profundidade } = areaDoPasseio();
    if (profundidade <= 0) return 1;
    return 1 - REDUCAO_NO_FUNDO * Math.min(1, y / profundidade);
  }, [areaDoPasseio]);

  const posicionar = useCallback((x: number, y: number, duracao: number) => {
    const el = andarilhoRef.current;
    if (!el) return;
    posicaoRef.current = { x, y };
    el.style.transitionDuration = `${duracao}ms`;
    el.style.transform = `translate3d(${x}px, ${-y}px, 0) scale(${escalaDaProfundidade(y)})`;
  }, [escalaDaProfundidade]);

  /* Para o passeio onde o mascote estiver agora, sem teletransporte, quando o
     OSONE assume o controle (falando, ouvindo, apontando algo). */
  const congelarPasseio = useCallback(() => {
    const el = andarilhoRef.current;
    if (!el || typeof DOMMatrixReadOnly === 'undefined') return;
    const matriz = new DOMMatrixReadOnly(window.getComputedStyle(el).transform);
    if (!Number.isFinite(matriz.m41) || !Number.isFinite(matriz.m42)) return;
    posicaoRef.current = { x: matriz.m41, y: -matriz.m42 };
    el.style.transitionDuration = '0ms';
    el.style.transform = matriz.toString();
  }, []);

  useEffect(() => {
    if (!ativo || overlayExterno) return;
    if (brain.atividade !== 'idle' || mouseEmCima || sobComando || preferReduzirMovimento()) {
      congelarPasseio();
      return;
    }

    let vivo = true;
    let timer = 0;

    const passear = () => {
      if (!vivo) return;
      const { largura, profundidade } = areaDoPasseio();
      const destino = {
        x: Math.random() * largura,
        y: Math.random() * profundidade
      };
      const distancia = Math.hypot(destino.x - posicaoRef.current.x, destino.y - posicaoRef.current.y);
      const duracao = Math.min(DURACAO_MAXIMA, Math.max(DURACAO_MINIMA, (distancia / VELOCIDADE_DO_PASSEIO) * 1000));

      espelhadoRef.current = destino.x < posicaoRef.current.x;
      setEspelhado(espelhadoRef.current);
      posicionar(destino.x, destino.y, duracao);
      setEstado('walk');
      setFala('');

      timer = window.setTimeout(() => {
        if (!vivo) return;
        setEstado('idle');
        timer = window.setTimeout(passear, 1800 + Math.random() * 3400);
      }, duracao);
    };

    timer = window.setTimeout(passear, 800);
    return () => {
      vivo = false;
      window.clearTimeout(timer);
      congelarPasseio();
    };
  }, [ativo, overlayExterno, brain.atividade, mouseEmCima, sobComando, areaDoPasseio, posicionar, congelarPasseio]);

  /* Comandos do OSONE: andar ate um ponto, apontar para qualquer lugar da tela,
     dar tchau, pular. Enquanto o gesto dura, o passeio livre fica suspenso. */
  const limparTimersDoComando = useCallback(() => {
    timersDoComandoRef.current.forEach(window.clearTimeout);
    timersDoComandoRef.current = [];
  }, []);

  const soltarOComando = useCallback((espera: number) => {
    const timer = window.setTimeout(() => {
      setGesto('nenhum');
      setSobComando(false);
      setFala('');
    }, espera);
    timersDoComandoRef.current.push(timer);
  }, []);

  /* Gira o braco no angulo exato do alvo e vira o mascote de frente para ele. */
  const apontarPara = useCallback((alvoX: number, alvoY: number) => {
    const el = andarilhoRef.current;
    if (!el) return;
    const caixa = el.getBoundingClientRect();
    if (!caixa.width) return;

    const paraEsquerda = alvoX < caixa.left + caixa.width / 2;
    espelhadoRef.current = paraEsquerda;
    setEspelhado(paraEsquerda);

    // O braco que aponta e sempre o direito da arte; espelhado ele troca de lado.
    const ombroX = caixa.left + caixa.width * (paraEsquerda ? 0.245 : 0.755);
    const ombroY = caixa.top + caixa.height * 0.495;
    const dx = (alvoX - ombroX) * (paraEsquerda ? -1 : 1);
    const dy = alvoY - ombroY;
    const angulo = (Math.atan2(-dx, dy) * 180) / Math.PI;
    el.style.setProperty('--osone-braco', `${angulo.toFixed(1)}deg`);

    const olhar = Math.atan2(alvoY - (caixa.top + caixa.height * 0.44), alvoX - (caixa.left + caixa.width / 2));
    el.style.setProperty('--osone-pupila-x', `${(Math.cos(olhar) * DESVIO_DA_PUPILA * (paraEsquerda ? -1 : 1)).toFixed(2)}px`);
    el.style.setProperty('--osone-pupila-y', `${(Math.sin(olhar) * DESVIO_DA_PUPILA).toFixed(2)}px`);
  }, []);

  const executarComando = useCallback((comando: ComandoDoMascote) => {
    const acao = comando.acao;
    if (!acao || !(acao in DURACAO_DO_GESTO)) return;

    limparTimersDoComando();
    setFala(comando.fala || FALAS_PADRAO[acao]);

    if (acao === 'parar') {
      setGesto('nenhum');
      setEstado('idle');
      setSobComando(false);
      return;
    }

    setSobComando(true);

    if (acao === 'andar') {
      const { largura, profundidade } = areaDoPasseio();
      const destino = {
        x: entre(comando.x ?? 0.5, 0, 1) * largura,
        y: (1 - entre(comando.y ?? 0.95, 0, 1)) * profundidade
      };
      const distancia = Math.hypot(destino.x - posicaoRef.current.x, destino.y - posicaoRef.current.y);
      const duracao = Math.min(DURACAO_MAXIMA, Math.max(DURACAO_MINIMA, (distancia / VELOCIDADE_DO_PASSEIO) * 1000));

      espelhadoRef.current = destino.x < posicaoRef.current.x;
      setEspelhado(espelhadoRef.current);
      setGesto('nenhum');
      setEstado('walk');
      posicionar(destino.x, destino.y, duracao);
      timersDoComandoRef.current.push(window.setTimeout(() => {
        setEstado('idle');
        soltarOComando(DURACAO_DO_GESTO.andar);
      }, duracao));
      return;
    }

    if (acao === 'apontar' || acao === 'olhar') {
      apontarPara(entre(comando.x ?? 0.5, 0, 1) * window.innerWidth, entre(comando.y ?? 0.5, 0, 1) * window.innerHeight);
      setGesto(acao === 'apontar' ? 'apontando' : 'nenhum');
      setEstado(acao === 'apontar' ? 'idle' : 'look');
      soltarOComando(DURACAO_DO_GESTO[acao]);
      return;
    }

    if (acao === 'tchau') {
      setGesto('acenando');
      setEstado('idle');
      soltarOComando(DURACAO_DO_GESTO.tchau);
      return;
    }

    setGesto('nenhum');
    setEstado('jump');
    soltarOComando(DURACAO_DO_GESTO.pular);
  }, [areaDoPasseio, posicionar, apontarPara, limparTimersDoComando, soltarOComando]);

  useEffect(() => {
    if (!ativo) return;
    const aoReceberComando = (evento: Event) => {
      const comando = (evento as CustomEvent<ComandoDoMascote>).detail;
      if (!comando || typeof comando.acao !== 'string') return;

      if (overlayExterno && apiExternaDisponivel) {
        fetch('/api/mascote/sinal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ atividade: brain.atividade, comando })
        }).catch(() => null);
        return;
      }
      executarComando(comando);
    };

    window.addEventListener(EVENTO_DE_COMANDO_DO_MASCOTE, aoReceberComando);
    return () => {
      window.removeEventListener(EVENTO_DE_COMANDO_DO_MASCOTE, aoReceberComando);
      limparTimersDoComando();
    };
  }, [ativo, overlayExterno, apiExternaDisponivel, brain.atividade, executarComando, limparTimersDoComando]);

  /* Os olhos seguem o cursor de longe; de perto, ele para e cumprimenta. */
  useEffect(() => {
    if (!ativo || overlayExterno) return;
    let quadro = 0;

    const aoMover = (evento: MouseEvent) => {
      if (quadro) return;
      quadro = window.requestAnimationFrame(() => {
        quadro = 0;
        const el = andarilhoRef.current;
        if (!el) return;
        const caixa = el.getBoundingClientRect();
        if (!caixa.width) return;
        const centro = { x: caixa.left + caixa.width / 2, y: caixa.top + caixa.height * 0.44 };
        const dx = evento.clientX - centro.x;
        const dy = evento.clientY - centro.y;
        const distancia = Math.hypot(dx, dy);

        setMouseEmCima(distancia <= caixa.width * RAIO_DO_CORPO);

        const forca = Math.min(1, distancia / ALCANCE_DO_OLHAR);
        const angulo = Math.atan2(dy, dx);
        const desvioX = Math.cos(angulo) * DESVIO_DA_PUPILA * forca * (espelhadoRef.current ? -1 : 1);
        const desvioY = Math.sin(angulo) * DESVIO_DA_PUPILA * forca;
        el.style.setProperty('--osone-pupila-x', `${desvioX.toFixed(2)}px`);
        el.style.setProperty('--osone-pupila-y', `${desvioY.toFixed(2)}px`);
      });
    };

    const aoSair = () => setMouseEmCima(false);

    window.addEventListener('mousemove', aoMover, { passive: true });
    window.addEventListener('mouseleave', aoSair);
    return () => {
      window.removeEventListener('mousemove', aoMover);
      window.removeEventListener('mouseleave', aoSair);
      if (quadro) window.cancelAnimationFrame(quadro);
      setMouseEmCima(false);
    };
  }, [ativo, overlayExterno]);

  /* Se a janela encolher, o mascote nao pode ficar preso fora da tela. */
  useEffect(() => {
    if (!ativo || overlayExterno) return;
    const aoRedimensionar = () => {
      const { largura, profundidade } = areaDoPasseio();
      const { x, y } = posicaoRef.current;
      const dentro = { x: Math.min(x, largura), y: Math.min(y, profundidade) };
      if (dentro.x === x && dentro.y === y) return;
      posicionar(dentro.x, dentro.y, 400);
    };
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, [ativo, overlayExterno, areaDoPasseio, posicionar]);

  useEffect(() => {
    if (!ativo) return;
    const visual = estadoVisualDoCerebro(brain);
    setEstado(visual.pose);
    setFala(visual.fala);
    if (!overlayExterno || !apiExternaDisponivel) return;
    fetch('/api/mascote/sinal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        atividade: brain.atividade,
        pose: visual.pose,
        fala: visual.fala,
        alvo: brain.alvo || ''
      })
    }).then((res) => {
      if (res.status === 404) {
        setOverlayExterno(false);
        setApiExternaDisponivel(false);
      }
    }).catch(() => null);
  }, [ativo, overlayExterno, apiExternaDisponivel, brain.atividade, brain.alvo]);

  /* So cumprimenta quando esta livre: se o OSONE estiver falando ou apontando
     algo, a pose dele manda. */
  const cumprimentando = mouseEmCima && brain.atividade === 'idle' && !sobComando && !overlayExterno;

  useEffect(() => {
    if (!cumprimentando) return;
    setEstado('idle');
    setSaudacao(SAUDACOES[Math.floor(Math.random() * SAUDACOES.length)]);
    return () => setSaudacao('');
  }, [cumprimentando]);

  /* A fala do OSONE manda; a saudacao do mouse so preenche o silencio. */
  const textoDoBalao = fala || saudacao;

  const alternarMascote = async () => {
    const proximo = !ativo;
    setAtivo(proximo);
    localStorage.setItem(STORAGE_KEY, proximo ? '1' : '0');
    setSincronizando(true);
    if (!apiExternaDisponivel) {
      setSincronizando(false);
      return;
    }
    try {
      const resposta = await fetch('/api/mascote/ativar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: proximo })
      });
      if (resposta.ok) {
        const dados = await resposta.json();
        setOverlayExterno(Boolean(dados.externo && dados.suportado));
        if (typeof dados.ativo === 'boolean') {
          setAtivo(dados.ativo || (!dados.externo && proximo));
          localStorage.setItem(STORAGE_KEY, dados.ativo || (!dados.externo && proximo) ? '1' : '0');
        }
      }
    } catch (_) {
      setOverlayExterno(estaNoElectron());
    } finally {
      setSincronizando(false);
    }
  };

  const mostrarMascoteNaPagina = ativo && !overlayExterno;

  return (
    <>
      <button
        type="button"
        onClick={alternarMascote}
        className={`osone-mascot-toggle ${ativo ? 'osone-mascot-toggle-active' : ''}`}
        title={ativo ? 'Ocultar mascote do OSONE' : 'Ativar mascote controlado pelo OSONE'}
        aria-pressed={ativo}
        disabled={sincronizando}
      >
        <span className="osone-mascot-toggle-face" />
      </button>

      {mostrarMascoteNaPagina && (
        <div className="osone-mascot-web-layer" aria-hidden="true">
          <div className="osone-mascot-andarilho" ref={andarilhoRef}>
            <div
              className={`osone-mascot osone-mascot-${estado} ${textoDoBalao ? 'osone-mascot-has-message' : ''} ${espelhado ? 'osone-mascot-espelhado' : ''} ${cumprimentando ? 'osone-mascot-cumprimentando' : ''} ${gesto === 'apontando' ? 'osone-mascot-apontando' : ''} ${gesto === 'acenando' ? 'osone-mascot-acenando' : ''}`}
            >
              <div className="osone-mascot-bubble">{textoDoBalao}</div>
              <ArteDoMascote />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
