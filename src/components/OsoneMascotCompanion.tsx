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

const estaNoElectron = () => {
  if (typeof navigator === 'undefined') return false;
  return /Electron/i.test(navigator.userAgent);
};

export function OsoneMascotCompanion() {
  const [visivelNoNavegador, setVisivelNoNavegador] = useState(false);
  const [estado, setEstado] = useState<EstadoDoMascote>('idle');
  const [fala, setFala] = useState(falas[0]);

  useEffect(() => {
    setVisivelNoNavegador(!estaNoElectron());
  }, []);

  useEffect(() => {
    if (!visivelNoNavegador) return;
    let indice = 0;
    const timer = window.setInterval(() => {
      indice += 1;
      setEstado(estados[indice % estados.length]);
      setFala(falas[indice % falas.length]);
    }, 3800);
    return () => window.clearInterval(timer);
  }, [visivelNoNavegador]);

  if (!visivelNoNavegador) return null;

  return (
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
  );
}
