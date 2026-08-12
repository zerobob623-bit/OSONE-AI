import React, { useEffect, useState } from 'react';

const estados = ['idle', 'speak', 'point-right', 'walk', 'point-up', 'jump', 'point-down', 'look'] as const;
const falas = [
  'Estou olhando junto.',
  'Esse canto merece atenção.',
  'Posso apontar o próximo passo.',
  'Quando precisar, eu venho ate voce.',
  'No app instalado eu fico fora da janela.'
];

type EstadoDoMascote = typeof estados[number];
const STORAGE_KEY = 'osone_mascot_active';

const estaNoElectron = () => {
  if (typeof navigator === 'undefined') return false;
  return /Electron/i.test(navigator.userAgent);
};

export function OsoneMascotCompanion() {
  const [ativo, setAtivo] = useState(false);
  const [overlayExterno, setOverlayExterno] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [estado, setEstado] = useState<EstadoDoMascote>('idle');
  const [fala, setFala] = useState(falas[0]);

  useEffect(() => {
    const salvo = localStorage.getItem(STORAGE_KEY) === '1';
    setAtivo(salvo);

    let cancelado = false;
    fetch('/api/mascote/estado')
      .then(res => res.ok ? res.json() : null)
      .then(async (dados) => {
        if (cancelado || !dados) return;
        const externo = Boolean(dados.externo && dados.suportado);
        setOverlayExterno(externo);
        if (salvo) {
          await fetch('/api/mascote/ativar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ativo: true })
          }).catch(() => null);
        }
      })
      .catch(() => setOverlayExterno(estaNoElectron()));
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!ativo) return;
    let indice = 0;
    const timer = window.setInterval(() => {
      indice += 1;
      setEstado(estados[indice % estados.length]);
      setFala(falas[indice % falas.length]);
    }, 3800);
    return () => window.clearInterval(timer);
  }, [ativo]);

  const alternarMascote = async () => {
    const proximo = !ativo;
    setAtivo(proximo);
    localStorage.setItem(STORAGE_KEY, proximo ? '1' : '0');
    setSincronizando(true);
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
        title={ativo ? 'Ocultar mascote do OSONE' : 'Ativar mascote do OSONE'}
        aria-pressed={ativo}
        disabled={sincronizando}
      >
        <span className="osone-mascot-toggle-face" />
      </button>

      {mostrarMascoteNaPagina && (
        <div className="osone-mascot-web-layer" aria-hidden="true">
          <div className={`osone-mascot osone-mascot-${estado}`}>
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
