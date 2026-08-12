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
            <div className="osone-mascot-shadow" />
            <div className="osone-mascot-body">
              <span className="osone-mascot-brow osone-mascot-brow-left" />
              <span className="osone-mascot-brow osone-mascot-brow-right" />
              <span className="osone-mascot-eye osone-mascot-eye-left">
                <span />
              </span>
              <span className="osone-mascot-eye osone-mascot-eye-right">
                <span />
              </span>
              <span className="osone-mascot-mouth" />
              <span className="osone-mascot-arm osone-mascot-arm-left" />
              <span className="osone-mascot-arm osone-mascot-arm-right" />
              <span className="osone-mascot-leg osone-mascot-leg-left" />
              <span className="osone-mascot-leg osone-mascot-leg-right" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
