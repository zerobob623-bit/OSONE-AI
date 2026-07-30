import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * CONTROLE POR VISÃO — usa a câmera para rastrear a mão do usuário (MediaPipe HandLandmarker,
 * roda inteiramente no navegador via WASM, sem custo de API) e move o cursor real do sistema
 * operacional através do Agente Local (src/localAgentService.ts), permitindo controlar o PC
 * com gestos: apontar move o cursor, pinça (polegar + indicador) clica ou arrasta.
 *
 * Requer o Agente Local rodando e configurado (mesmo token usado para as outras integrações
 * de PC). Sem o Agente Local, o rastreamento funciona mas não há como mover o cursor real —
 * o navegador não tem permissão para isso por conta própria.
 */

const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.0/wasm';
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// Índices dos pontos de referência (landmarks) da mão retornados pelo MediaPipe.
const LM_THUMB_TIP = 4;
const LM_INDEX_TIP = 8;

const PINCH_ON_THRESHOLD = 0.055; // distância normalizada polegar-indicador para considerar "pinçando"
const PINCH_OFF_THRESHOLD = 0.08; // um pouco maior que o "on" para evitar oscilação na borda (histerese)
const DRAG_MOVE_THRESHOLD_PX = 12; // deslocamento mínimo em tela real para virar arrasto em vez de clique
const CURSOR_SMOOTHING = 0.35; // fator de suavização (EMA) da posição do cursor: 0=parado, 1=sem suavização
const MOVE_SEND_INTERVAL_MS = 25; // taxa máxima de envio de /mouse/move (~40x/s)

export type VisionControlStatus = 'idle' | 'starting' | 'tracking' | 'no_hand' | 'error';

interface ScreenInfo {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export function useVisionControl(getLocalAgentToken: () => string) {
  const [status, setStatus] = useState<VisionControlStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isPinching, setIsPinching] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const screenInfoRef = useRef<ScreenInfo | null>(null);

  const smoothedPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastMoveSentAtRef = useRef(0);
  const wasPinchingRef = useRef(false);
  const pinchStartScreenPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef(false);

  const agentFetch = useCallback(async (path: string, init?: RequestInit) => {
    const token = (getLocalAgentToken() || '').trim();
    if (!token) throw new Error("Agente Local não configurado. Insira o token do Agente Local nas Configurações do OSONE.");
    const res = await fetch(`/api/agent${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(init?.headers || {})
      }
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || `Erro HTTP ${res.status} no Agente Local.`);
    }
    return data;
  }, [getLocalAgentToken]);

  const sendMouseMove = useCallback((x: number, y: number) => {
    const now = performance.now();
    if (now - lastMoveSentAtRef.current < MOVE_SEND_INTERVAL_MS) return;
    lastMoveSentAtRef.current = now;
    agentFetch('/mouse/move', { method: 'POST', body: JSON.stringify({ x, y }) }).catch(() => {
      // Falha isolada de um frame não deve interromper o rastreamento contínuo.
    });
  }, [agentFetch]);

  const sendMouseButton = useCallback((action: 'down' | 'up', button: 'left' | 'right' = 'left') => {
    agentFetch('/mouse/button', { method: 'POST', body: JSON.stringify({ action, button }) }).catch(() => {});
  }, [agentFetch]);

  const drawOverlay = (landmarks: any[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks || landmarks.length === 0) return;

    ctx.fillStyle = 'rgba(0, 220, 255, 0.85)';
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const thumb = landmarks[LM_THUMB_TIP];
    const index = landmarks[LM_INDEX_TIP];
    if (thumb && index) {
      ctx.strokeStyle = wasPinchingRef.current ? 'rgba(255, 60, 60, 0.9)' : 'rgba(0, 255, 140, 0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(thumb.x * canvas.width, thumb.y * canvas.height);
      ctx.lineTo(index.x * canvas.width, index.y * canvas.height);
      ctx.stroke();
    }
  };

  const detectLoop = useCallback(() => {
    if (!activeRef.current) return;
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    const screenInfo = screenInfoRef.current;

    if (video && landmarker && video.readyState >= 2) {
      const result = landmarker.detectForVideo(video, performance.now());
      const hand = result?.landmarks?.[0];

      if (hand && screenInfo) {
        setStatus('tracking');
        drawOverlay(hand);

        const indexTip = hand[LM_INDEX_TIP];
        const thumbTip = hand[LM_THUMB_TIP];

        // Espelha o eixo X: a prévia da câmera é exibida como espelho (mais natural), então
        // mover a mão para a direita (do ponto de vista do usuário) move o cursor para a direita.
        const mirroredX = 1 - indexTip.x;
        const targetX = screenInfo.offsetX + mirroredX * screenInfo.width;
        const targetY = screenInfo.offsetY + indexTip.y * screenInfo.height;

        if (!smoothedPosRef.current) {
          smoothedPosRef.current = { x: targetX, y: targetY };
        } else {
          smoothedPosRef.current.x += (targetX - smoothedPosRef.current.x) * CURSOR_SMOOTHING;
          smoothedPosRef.current.y += (targetY - smoothedPosRef.current.y) * CURSOR_SMOOTHING;
        }
        const pos = smoothedPosRef.current;
        sendMouseMove(pos.x, pos.y);

        const dx = mirroredX - (1 - thumbTip.x);
        const dy = indexTip.y - thumbTip.y;
        const pinchDist = Math.sqrt(dx * dx + dy * dy);
        const currentlyPinching = wasPinchingRef.current
          ? pinchDist < PINCH_OFF_THRESHOLD
          : pinchDist < PINCH_ON_THRESHOLD;

        if (currentlyPinching && !wasPinchingRef.current) {
          wasPinchingRef.current = true;
          hasDraggedRef.current = false;
          pinchStartScreenPosRef.current = { x: pos.x, y: pos.y };
          setIsPinching(true);
          sendMouseButton('down');
        } else if (currentlyPinching && wasPinchingRef.current) {
          const start = pinchStartScreenPosRef.current;
          if (start) {
            const moved = Math.hypot(pos.x - start.x, pos.y - start.y);
            if (moved > DRAG_MOVE_THRESHOLD_PX) hasDraggedRef.current = true;
          }
        } else if (!currentlyPinching && wasPinchingRef.current) {
          wasPinchingRef.current = false;
          pinchStartScreenPosRef.current = null;
          setIsPinching(false);
          sendMouseButton('up');
        }
      } else {
        setStatus('no_hand');
        drawOverlay([]);
        if (wasPinchingRef.current) {
          // Mão saiu do quadro no meio de uma pinça: solta o botão para não deixar o mouse
          // "preso" apertado no sistema.
          wasPinchingRef.current = false;
          pinchStartScreenPosRef.current = null;
          setIsPinching(false);
          sendMouseButton('up');
        }
      }
    }

    rafRef.current = requestAnimationFrame(detectLoop);
  }, [sendMouseMove, sendMouseButton]);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    setErrorMessage('');
    setStatus('starting');
    try {
      const info = await agentFetch('/screen-info', { method: 'GET' });
      screenInfoRef.current = { width: info.width, height: info.height, offsetX: info.offsetX || 0, offsetY: info.offsetY || 0 };

      const visionModule = await import('@mediapipe/tasks-vision');
      const { FilesetResolver, HandLandmarker } = visionModule;
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
      landmarkerRef.current = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      smoothedPosRef.current = null;
      wasPinchingRef.current = false;
      hasDraggedRef.current = false;
      activeRef.current = true;
      setStatus('no_hand');
      rafRef.current = requestAnimationFrame(detectLoop);
    } catch (err: any) {
      activeRef.current = false;
      setStatus('error');
      setErrorMessage(err?.message || 'Falha ao iniciar o Controle por Visão.');
    }
  }, [agentFetch, detectLoop]);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (wasPinchingRef.current) {
      // Segurança: nunca deixa o botão do mouse "preso" ao parar o rastreamento.
      sendMouseButton('up');
      wasPinchingRef.current = false;
    }
    setIsPinching(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close?.();
    landmarkerRef.current = null;
    setStatus('idle');
  }, [sendMouseButton]);

  useEffect(() => {
    return () => { stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, errorMessage, isPinching, videoRef, canvasRef, start, stop };
}
