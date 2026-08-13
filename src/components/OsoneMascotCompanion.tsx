import React, { useEffect, useState } from 'react';

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

const STORAGE_KEY = 'osone_mascot_active';

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
          <ellipse cx="58" cy="107" rx="12" ry="7.5" fill="#F0501B" opacity="0.2" />
          <ellipse cx="142" cy="107" rx="12" ry="7.5" fill="#F0501B" opacity="0.2" />

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

  useEffect(() => {
    if (!ativo || brain.atividade !== 'idle') return;
    let indice = 0;
    const timer = window.setInterval(() => {
      indice += 1;
      setEstado(indice % 3 === 0 ? 'walk' : 'idle');
      setFala('');
    }, 5200);
    return () => window.clearInterval(timer);
  }, [ativo, brain.atividade]);

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
          <div className={`osone-mascot osone-mascot-${estado} ${fala ? 'osone-mascot-has-message' : ''}`}>
            <div className="osone-mascot-bubble">{fala}</div>
            <ArteDoMascote />
          </div>
        </div>
      )}
    </>
  );
}
