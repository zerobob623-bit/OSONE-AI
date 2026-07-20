import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { OrbStyle } from '../types';
import { VolumeX } from 'lucide-react';

const NeuralConstellationCanvas = ({ 
  active, 
  speaking, 
  thinking = false, 
  searching = false 
}: { 
  active: boolean; 
  speaking: boolean; 
  thinking?: boolean; 
  searching?: boolean; 
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const userRmsRef = React.useRef(0);
  const animationRef = React.useRef<number | null>(null);
  
  React.useEffect(() => {
    const handleUserVoice = (e: any) => {
      userRmsRef.current = active ? e.detail.rms : 0;
    };
    window.addEventListener('osone_user_voice', handleUserVoice);
    return () => {
      window.removeEventListener('osone_user_voice', handleUserVoice);
    };
  }, [active]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina/high-res support
    const dpr = window.devicePixelRatio || 1;
    const width = 230;
    const height = 230;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const cx = width / 2;
    const cy = height / 2;

    // --- GEOMETRIC DUAL DEFINITIONS ---
    const phi = (1 + Math.sqrt(5)) / 2;

    // Dodecahedron (20 vertices)
    const dodecahedronRaw = [
      [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
      [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
      [0, 1/phi, phi], [0, 1/phi, -phi], [0, -1/phi, phi], [0, -1/phi, -phi],
      [1/phi, phi, 0], [1/phi, -phi, 0], [-1/phi, phi, 0], [-1/phi, -phi, 0],
      [phi, 0, 1/phi], [phi, 0, -1/phi], [-phi, 0, 1/phi], [-phi, 0, -1/phi],
    ];
    const dodecahedron = dodecahedronRaw.map(([x, y, z]) => {
      const len = Math.hypot(x, y, z);
      return { x: x / len, y: y / len, z: z / len };
    });

    // Icosahedron (12 vertices)
    const icosahedronRaw = [
      [0, 1, phi], [0, 1, -phi], [0, -1, phi], [0, -1, -phi],
      [1, phi, 0], [1, -phi, 0], [-1, phi, 0], [-1, -phi, 0],
      [phi, 0, 1], [phi, 0, -1], [-phi, 0, 1], [-phi, 0, -1],
    ];
    const icosahedron = icosahedronRaw.map(([x, y, z]) => {
      const len = Math.hypot(x, y, z);
      return { x: x / len, y: y / len, z: z / len };
    });

    // Match each Dodecahedron vertex with nearest Icosahedron vertex
    const dodecaToIcosaMap = dodecahedron.map((dVertex) => {
      let bestIdx = 0;
      let maxDot = -Infinity;
      icosahedron.forEach((iVertex, idx) => {
        const dot = dVertex.x * iVertex.x + dVertex.y * iVertex.y + dVertex.z * iVertex.z;
        if (dot > maxDot) {
          maxDot = dot;
          bestIdx = idx;
        }
      });
      return bestIdx;
    });

    // Solve edges of Dodecahedron (normalized unit distance is < 0.75)
    const dodecaEdges: { u: number; v: number }[] = [];
    for (let i = 0; i < dodecahedron.length; i++) {
      for (let j = i + 1; j < dodecahedron.length; j++) {
        const dx = dodecahedron[i].x - dodecahedron[j].x;
        const dy = dodecahedron[i].y - dodecahedron[j].y;
        const dz = dodecahedron[i].z - dodecahedron[j].z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 0.75) {
          dodecaEdges.push({ u: i, v: j });
        }
      }
    }

    // Solve face lists of Dodecahedron (each centered on one icosahedron vertex)
    const dodecaFaces: number[][] = icosahedron.map((iVertex) => {
      const withDistance = dodecahedron.map((dVertex, idx) => {
        const dist = Math.hypot(dVertex.x - iVertex.x, dVertex.y - iVertex.y, dVertex.z - iVertex.z);
        return { idx, dist };
      });
      withDistance.sort((a, b) => a.dist - b.dist);
      return withDistance.slice(0, 5).map(item => item.idx);
    });

    // --- INITIALIZE DENSE PARTICLE CLOUD WITH GEOMETRICAL COGNITIVE SCAFFOLDING ---
    interface CloudParticle {
      dx: number;
      dy: number;
      dz: number;
      ix: number;
      iy: number;
      iz: number;
      phaseOffset: number;
      speedMult: number;
      size: number;
      colorType: 'cyan' | 'blue' | 'white';
      cloudFuzz: { x: number; y: number; z: number };
    }

    const cloudParticles: CloudParticle[] = [];
    const PARTICLE_COUNT = 3500;

    for (let k = 0; k < PARTICLE_COUNT; k++) {
      const typeRand = Math.random();
      let dx = 0, dy = 0, dz = 0;
      let ix = 0, iy = 0, iz = 0;
      let colorType: 'cyan' | 'blue' | 'white' = 'blue';
      let size = 0.4 + Math.random() * 0.7;

      if (typeRand < 0.25) {
        // Vertex clusters (Glowing structural core knots of the neural network)
        const vIdx = Math.floor(Math.random() * 20);
        const dVert = dodecahedron[vIdx];
        const iVert = icosahedron[dodecaToIcosaMap[vIdx]];

        const fuzzScale = 0.08;
        const fx = (Math.random() - 0.5) * fuzzScale;
        const fy = (Math.random() - 0.5) * fuzzScale;
        const fz = (Math.random() - 0.5) * fuzzScale;

        dx = dVert.x + fx;
        dy = dVert.y + fy;
        dz = dVert.z + fz;

        ix = iVert.x + fx;
        iy = iVert.y + fy;
        iz = iVert.z + fz;

        colorType = Math.random() < 0.45 ? 'white' : 'cyan';
        size = 0.6 + Math.random() * 0.8;
      } else if (typeRand < 0.65) {
        // Edge tubes (forms the beautiful continuous threads of the cloud)
        if (dodecaEdges.length > 0) {
          const edge = dodecaEdges[Math.floor(Math.random() * dodecaEdges.length)];
          const weight = Math.random();

          const dU = dodecahedron[edge.u];
          const dV = dodecahedron[edge.v];
          const dX_base = dU.x * (1 - weight) + dV.x * weight;
          const dY_base = dU.y * (1 - weight) + dV.y * weight;
          const dZ_base = dU.z * (1 - weight) + dV.z * weight;

          const iU = icosahedron[dodecaToIcosaMap[edge.u]];
          const iV = icosahedron[dodecaToIcosaMap[edge.v]];
          const iX_base = iU.x * (1 - weight) + iV.x * weight;
          const iY_base = iU.y * (1 - weight) + iV.y * weight;
          const iZ_base = iU.z * (1 - weight) + iV.z * weight;

          const fuzzScale = 0.12;
          const fx = (Math.random() - 0.5) * fuzzScale;
          const fy = (Math.random() - 0.5) * fuzzScale;
          const fz = (Math.random() - 0.5) * fuzzScale;

          dx = dX_base + fx;
          dy = dY_base + fy;
          dz = dZ_base + fz;

          ix = iX_base + fx;
          iy = iY_base + fy;
          iz = iZ_base + fz;

          colorType = Math.random() < 0.5 ? 'cyan' : 'blue';
          size = 0.4 + Math.random() * 0.5;
        } else {
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          dz = (Math.random() - 0.5) * 2;
          ix = dx; iy = dy; iz = dz;
        }
      } else {
        // Face volume panels (soft ambient background gas/cluster filling)
        if (dodecaFaces.length > 0) {
          const faceIdx = Math.floor(Math.random() * dodecaFaces.length);
          const faceVertIds = dodecaFaces[faceIdx];

          const rawWeights = Array.from({ length: 5 }, () => Math.random());
          const sumWeights = rawWeights.reduce((a, b) => a + b, 0);
          const weights = rawWeights.map(w => w / sumWeights);

          let fx_d = 0, fy_d = 0, fz_d = 0;
          let fx_i = 0, fy_i = 0, fz_i = 0;

          for (let i = 0; i < 5; i++) {
            const dV = dodecahedron[faceVertIds[i]];
            const iV = icosahedron[dodecaToIcosaMap[faceVertIds[i]]];
            const w = weights[i];

            fx_d += dV.x * w;
            fy_d += dV.y * w;
            fz_d += dV.z * w;

            fx_i += iV.x * w;
            fy_i += iV.y * w;
            fz_i += iV.z * w;
          }

          const fuzzScale = 0.18;
          const fx = (Math.random() - 0.5) * fuzzScale;
          const fy = (Math.random() - 0.5) * fuzzScale;
          const fz = (Math.random() - 0.5) * fuzzScale;

          dx = fx_d + fx;
          dy = fy_d + fy;
          dz = fz_d + fz;

          ix = fx_i + fx;
          iy = fy_i + fy;
          iz = fz_i + fz;

          colorType = Math.random() < 0.15 ? 'white' : (Math.random() < 0.6 ? 'cyan' : 'blue');
          size = 0.3 + Math.random() * 0.4;
        } else {
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          dz = (Math.random() - 0.5) * 2;
          ix = dx; iy = dy; iz = dz;
        }
      }

      cloudParticles.push({
        dx, dy, dz,
        ix, iy, iz,
        phaseOffset: Math.random() * Math.PI * 2,
        speedMult: 0.8 + Math.random() * 0.4,
        size,
        colorType,
        cloudFuzz: {
          x: (Math.random() - 0.5) * 0.04,
          y: (Math.random() - 0.5) * 0.04,
          z: (Math.random() - 0.5) * 0.04,
        }
      });
    }

    let frameId = 0;
    const activeSparks = new Map<number, number>(); // particleIdx -> lifetime (20 down to 0)

    const triggerSpark = () => {
      const idx = Math.floor(Math.random() * PARTICLE_COUNT);
      activeSparks.set(idx, 20); // 20 frames spike
    };

    let lastTime = performance.now();
    const fpsTarget = 60;
    const fpsInterval = 1000 / fpsTarget;
    let smoothSpeak = 0;
    let smoothThinking = 0;

    const render = (currentTime: number = performance.now()) => {
      animationRef.current = requestAnimationFrame(render);

      const elapsed = currentTime - lastTime;
      if (elapsed < fpsInterval) {
        return;
      }

      // Adjust lastTime while mitigating latency drift
      lastTime = currentTime - (elapsed % fpsInterval);

      frameId++;
      
      // Clear canvas to stay fully transparent
      ctx.clearRect(0, 0, width, height);

      const time = frameId * 0.025;
      const currentRms = userRmsRef.current;
      const speakIntensity = speaking ? 1.0 : (currentRms * 12.0);
      const isAudiblyActive = speaking || currentRms > 0.015;

      // Update synaptic spark lifetime
      activeSparks.forEach((life, idx) => {
        if (life <= 1) {
          activeSparks.delete(idx);
        } else {
          activeSparks.set(idx, life - 1);
        }
      });

      if (thinking || searching) {
        if (Math.random() < 0.42) {
          triggerSpark();
        }
      } else if (isAudiblyActive && Math.random() < 0.28) {
        triggerSpark();
        triggerSpark();
      } else if (Math.random() < 0.03) {
        triggerSpark();
      }

      // Smoothly interpolate the speaker intensity to eliminate abrupt snaps or noise jumps (with soft damping)
      smoothSpeak += (speakIntensity - smoothSpeak) * 0.07;

      // Smoothly interpolate thinking state for galaxy transitions
      const targetThinking = (thinking || searching) ? 1.0 : 0.0;
      smoothThinking += (targetThinking - smoothThinking) * 0.08;

      // Very slow, deeply resting breathing multiplier when idle (almost static, no jerky motion)
      const restingBreathing = 1.0 + 0.03 * Math.sin(time * 0.3);
      // Precise universe expansion: expands and contracts directly and exclusively with voice energy (reduced magnitude)
      const expansionVolume = 1.0 + smoothSpeak * 0.12;
      // Contraction scale factor
      const scaleFactor = 1.0 - smoothThinking * 0.65; // contracts by 65% towards the center

      // 1. Calculate morph factor: smooth, graceful base shape morphing combined with voice reactions
      const baseMorph = 0.5 + 0.3 * Math.sin(time * 0.4);
      const morphFactor = active 
        ? Math.max(0, Math.min(1, baseMorph + smoothSpeak * 0.12)) 
        : baseMorph;

      // 2. Compute 3D unrotated positions with universe expansion, contraction and galactic spiral winding
      const coords3D = cloudParticles.map((p) => {
        // Interpolating coordinates
        let x = (1 - morphFactor) * p.dx + morphFactor * p.ix;
        let y = (1 - morphFactor) * p.dy + morphFactor * p.iy;
        let z = (1 - morphFactor) * p.dz + morphFactor * p.iz;

        // Apply galactic flattening along Z axis (from sphere shell to thin disk)
        z = z * (1.0 - smoothThinking * 0.88);

        // Apply galactic spiral arm twist in the X-Y plane
        if (smoothThinking > 0.01) {
          const r = Math.hypot(x, y) || 0.001;
          const twistAngle = smoothThinking * (4.5 * Math.exp(-r * 1.5) + (1.3 * r));
          const cosT = Math.cos(twistAngle);
          const sinT = Math.sin(twistAngle);
          const tx = x * cosT - y * sinT;
          const ty = x * sinT + y * cosT;
          x = tx;
          y = ty;
        }

        // Micro-vibrational living movement + rapid thinking tremor/vibration
        const microTime = time * p.speedMult * 1.5 + p.phaseOffset;
        const tremor = smoothThinking * 0.025 * Math.sin(frameId * 0.7); // high speed computing tremor
        x += Math.sin(microTime) * 0.015 + p.cloudFuzz.x + tremor * (Math.random() - 0.5);
        y += Math.cos(microTime * 0.9) * 0.015 + p.cloudFuzz.y + tremor * (Math.random() - 0.5);
        z += Math.sin(microTime * 1.3) * 0.015 + p.cloudFuzz.z + tremor * (Math.random() - 0.5);

        const d = Math.hypot(x, y, z) || 0.001;
        
        // Neuroplastic undulation: structured waving that propagates through the core coordinates
        const waveSpeed = 1.4;
        const waveFrequency = 14.0;
        const waveOffset = Math.sin((x + y + z) * waveFrequency + time * waveSpeed) * (1.1 + smoothSpeak * 2.8);
        
        // Core density contraction (pulls inner bulge particles even closer to make dense nucleus)
        const coreContractionMultiplier = 1.0 - smoothThinking * 0.25 * Math.exp(-Math.hypot(x, y) * 2.0);

        const radiusMultiplier = ((72.0 * restingBreathing * expansionVolume) + waveOffset) * scaleFactor * coreContractionMultiplier;
        
        return {
          x: (x / d) * radiusMultiplier,
          y: (y / d) * radiusMultiplier,
          z: (z / d) * radiusMultiplier,
        };
      });

      // 4. Smooth continuous 3D rotation angles (driven smoothly by smoothSpeak to prevent snaps)
      // When thinking/searching, rotate fast around Z (perpendicular to disk plane) and slow down other axes
      const rotX = time * 0.15 * (1.0 - smoothThinking * 0.6) + smoothSpeak * 0.10;
      const rotY = time * 0.22 * (1.0 - smoothThinking * 0.6) + smoothSpeak * 0.08;
      const rotZ = time * 0.08 + (frameId * 0.045) * smoothThinking;

      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

      // Helper function to rotate and project a 3D point to 2D screen space with perspective
      const rotateAndProject = (cx_val: number, cy_val: number, cz_val: number) => {
        let y1 = cy_val * cosX - cz_val * sinX;
        let z1 = cy_val * sinX + cz_val * cosX;

        let x2 = cx_val * cosY + z1 * sinY;
        let z2 = -cx_val * sinY + z1 * cosY;

        let x3 = x2 * cosZ - y1 * sinZ;
        let y3 = x2 * sinZ + y1 * cosZ;

        const perspective = 1 / (1 - (z2 / 240)); 
        const screenX = cx + x3 * perspective;
        const screenY = cy + y3 * perspective;

        return { x: screenX, y: screenY, z: z2 };
      };

      // 5. Rotate and project all neural particles
      interface ProjectedNode {
        x: number;
        y: number;
        z: number;
        size: number;
        rgba: string;
        flashScale: number;
      }

      const projected: ProjectedNode[] = coords3D.map((c, idx) => {
        const p = cloudParticles[idx];

        const proj = rotateAndProject(c.x, c.y, c.z);

        const dFactor = (proj.z + 85) / 170; // Map depth factor normalized range
        const perspective = 1 / (1 - (proj.z / 240)); 

        const isSparkNow = activeSparks.has(idx);
        const sparkLife = activeSparks.get(idx) || 0;
        const flashScale = isSparkNow ? (sparkLife / 20) : 0;

        const baseAlpha = Math.max(0.12, Math.min(1.0, (0.35 + dFactor * 0.65)));
        const alpha = isAudiblyActive ? baseAlpha * 1.25 : baseAlpha;

        let color = '';
        if (p.colorType === 'white') {
          color = `rgba(255, 250, 240, ${Math.min(1, alpha * 0.95)})`;
        } else if (p.colorType === 'cyan') {
          color = `rgba(249, 115, 22, ${Math.min(0.85, alpha * 0.8)})`;
        } else {
          color = `rgba(234, 88, 12, ${Math.min(0.75, alpha * 0.6)})`;
        }

        return {
          x: proj.x,
          y: proj.y,
          z: proj.z,
          size: p.size * perspective,
          rgba: color,
          flashScale
        };
      });

      // --- RENDERING PHASE (Particles depth-sorted for a stunning 3D cloud effect) ---
      const sortedIndices = Array.from({ length: projected.length }, (_, i) => i)
        .sort((a, b) => projected[a].z - projected[b].z);

      sortedIndices.forEach((idx) => {
        const node = projected[idx];

        ctx.beginPath();
        if (node.flashScale > 0) {
          // Glow and active shadow blur for synaptic flashes
          const sizeBonus = node.size * (1.1 + node.flashScale * 3.0);
          ctx.arc(node.x, node.y, Math.max(1.0, sizeBonus), 0, Math.PI * 2);
          ctx.shadowBlur = Math.round(14 * node.flashScale);
          ctx.shadowColor = '#f97316';
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1.0, node.flashScale * 1.5)})`;
          ctx.fill();
          ctx.shadowBlur = 0; // reset optimization
        } else {
          const finalSize = Math.max(0.25, node.size * (isAudiblyActive ? 1.15 : 1.0));
          ctx.arc(node.x, node.y, finalSize, 0, Math.PI * 2);
          ctx.fillStyle = node.rgba;
          ctx.fill();
        }
      });
    };

    // Start FPS controlled loop
    animationRef.current = requestAnimationFrame(render);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [speaking, active, thinking, searching]);

  return (
    <div className="relative w-44 h-44 md:w-56 md:h-56 flex items-center justify-center bg-transparent overflow-visible">
      <div className="absolute inset-0 rounded-full bg-orange-500/5 blur-[55px] pointer-events-none" />
      <canvas 
        ref={canvasRef} 
        className="overflow-visible" 
      />
    </div>
  );
};

export const InfinityLogo = ({ 
  active, 
  speaking, 
  style = 'neural',
  thinking = false,
  searching = false,
  size = 100
}: { 
  active: boolean; 
  speaking: boolean; 
  style?: OrbStyle;
  thinking?: boolean;
  searching?: boolean;
  size?: number;
}) => {
  const [userRms, setUserRms] = React.useState(0);

  React.useEffect(() => {
    const handleUserVoice = (e: any) => {
      if (active) {
        setUserRms(e.detail.rms);
      } else {
        setUserRms(0);
      }
    };
    window.addEventListener('osone_user_voice', handleUserVoice);
    return () => {
      window.removeEventListener('osone_user_voice', handleUserVoice);
    };
  }, [active]);

  const isUserSpeaking = active && userRms > 0.015;
  const combinedSpeaking = speaking || isUserSpeaking;

  const renderStyle = () => {
    switch (style) {
      case 'wave': {
        // Esfera Simples e Elegante Alabastro/Branca - Modelo Prímula Recomendado para IAs
        // Uma única esfera circular 3D perfeita branca/perolada com reflexos metálicos suaves e refração realista.
        // Reage à voz em tempo real de forma física e concisa: deforma-se suavemente como metal líquido e vibra com limites mais estritos.
        const rmsOffset = isUserSpeaking ? Math.min(userRms * 1.5, 0.15) : 0;
        const pulseScale = speaking 
          ? [0.96, 1.05, 0.98, 1.04, 0.97, 1.02, 0.96] 
          : isUserSpeaking
            ? [1 - rmsOffset * 0.4, 1 + rmsOffset * 0.6, 1 - rmsOffset * 0.2, 1 + rmsOffset * 0.4, 1]
            : active 
              ? [1, 1.015, 0.99, 1.01, 1] 
              : [1, 1];

        // Soft, organic liquid mercury border radius deformations
        const frameBorderRadius = combinedSpeaking
          ? [
              "50% 50% 50% 50% / 50% 50% 50% 50%",
              "46% 54% 48% 52% / 49% 47% 53% 51%",
              "54% 46% 52% 48% / 51% 53% 47% 49%",
              "48% 52% 46% 54% / 52% 48% 52% 48%",
              "50% 50% 50% 50% / 50% 50% 50% 50%"
            ]
          : "50% 50% 50% 50% / 50% 50% 50% 50%";

        // Physical sound vibration translation offsets (x, y) - tightly controlled and kept concise
        const vibeMultiplier = isUserSpeaking ? Math.min(userRms * 15, 4) : 0.8;
        const vibrationX = combinedSpeaking ? [0, -1.2 * vibeMultiplier, 1.6 * vibeMultiplier, -0.8 * vibeMultiplier, 1.2 * vibeMultiplier, -0.4 * vibeMultiplier, 0] : 0;
        const vibrationY = combinedSpeaking ? [0, 1.6 * vibeMultiplier, -2.0 * vibeMultiplier, 0.8 * vibeMultiplier, -1.6 * vibeMultiplier, 1.2 * vibeMultiplier, 0] : 0;

        return (
          <div className="relative flex items-center justify-center overflow-visible w-full h-full">
            {/* Esfera de Luz de Fundo White/Opaline Glow */}
            <div className="absolute w-24 h-24 rounded-full bg-white/10 blur-[18px] opacity-50 animate-pulse pointer-events-none select-none" />
            <div className="absolute w-28 h-28 rounded-full bg-slate-300/5 blur-[35px] opacity-20 pointer-events-none select-none" />

            <motion.div
              animate={{
                scale: pulseScale,
                borderRadius: frameBorderRadius,
                x: vibrationX,
                y: vibrationY,
                rotate: combinedSpeaking ? [0, -1.5, 2, -1, 0] : 0,
              }}
              transition={{
                scale: { duration: combinedSpeaking ? 1.0 : 4, repeat: Infinity, ease: "easeInOut" },
                borderRadius: { duration: combinedSpeaking ? 1.4 : 3, repeat: Infinity, ease: "easeInOut" },
                x: { duration: 0.22, repeat: Infinity, ease: "linear" },
                y: { duration: 0.24, repeat: Infinity, ease: "linear" },
                rotate: { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
              }}
              className="relative w-24 h-24 md:w-30 md:h-30 flex items-center justify-center overflow-hidden border border-white/30 shadow-[inset_0_0_18px_rgba(255,255,255,0.8),0_10px_25px_rgba(255,255,255,0.15)] bg-slate-100"
              style={{
                // 3D Metallic Alabaster/Glass White Sphere Gradient
                background: "radial-gradient(circle at 35% 25%, #ffffff 0%, #fcfcfd 30%, #f1f5f9 65%, #cbd5e1 90%, #94a3b8 100%)",
              }}
            >
              {/* Internal mercury reflections (moving in reverse for rich parallax and depth) */}
              <motion.div
                animate={{
                  y: combinedSpeaking ? [10, -10, 10] : [1, -1, 1],
                  x: combinedSpeaking ? [-10, 10, -10] : [-1, 1, -1],
                  opacity: combinedSpeaking ? [0.4, 0.6, 0.4] : 0.3,
                }}
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 mix-blend-color-dodge bg-[radial-gradient(circle_at_70%_70%,#ffffff_0%,transparent_50%)]"
              />
              <motion.div
                animate={{
                  y: combinedSpeaking ? [-8, 8, -8] : [-1.5, 1.5, -1.5],
                  x: combinedSpeaking ? [8, -8, 8] : [1.5, -1.5, 1.5],
                  opacity: combinedSpeaking ? [0.3, 0.5, 0.3] : 0.2,
                }}
                transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                className="absolute inset-0 mix-blend-screen bg-[radial-gradient(circle_at_25%_75%,#ffffff_0%,transparent_60%)]"
              />

              {/* White High-Energy Core representing local power & voice modulation */}
              <motion.div
                animate={{
                  scale: combinedSpeaking ? [0.9, 1.15, 0.95, 1.1, 0.9] : [1, 1.03, 1],
                  opacity: combinedSpeaking ? [0.6, 0.95, 0.7, 0.9, 0.6] : 0.4
                }}
                transition={{ duration: combinedSpeaking ? 0.9 : 3.5, repeat: Infinity, ease: "easeInOut" }}
                className="w-8 h-8 rounded-full bg-white/45 blur-[5px] mix-blend-overlay flex items-center justify-center md:w-10 md:h-10"
              />
              
              {/* Inner ambient shadows and occlusion supporting glass look */}
              <div 
                className="absolute inset-0 rounded-full shadow-[inset_0_4px_10px_rgba(255,255,255,0.95),inset_0_-4px_10px_rgba(15,23,42,0.15)] mix-blend-overlay"
              />

              {/* Glossy top glass lens reflection overlay */}
              <div className="absolute top-1 left-4 right-4 h-8 bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px]" />
            </motion.div>
          </div>
        );
      }

      case 'jarvis':
        return (
          <div className="relative flex items-center justify-center perspective-[1000px] overflow-visible w-full h-full">
            {/* Holographic 3D Floating & Oscillating Core Container */}
            <motion.div
              animate={{
                scale: speaking ? [1, 1.05, 0.98, 1.03, 1] : 1,
                y: [0, -6, 2, -4, 4, 0],
                x: [0, 4, -2, 3, -1, 0],
                rotateX: active ? [20, -20, 20] : 15,
                rotateY: active ? [0, 360] : 0,
              }}
              transition={{
                scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
                y: { duration: 8, repeat: Infinity, ease: "easeInOut" },
                x: { duration: 10, repeat: Infinity, ease: "easeInOut" },
                rotateX: { duration: 12, repeat: Infinity, ease: "easeInOut" },
                rotateY: { duration: 25, repeat: Infinity, ease: "linear" },
              }}
              className="relative w-44 h-44 md:w-56 md:h-56 preserve-3d flex items-center justify-center"
            >
              {/* Backglow layer */}
              <div className="absolute w-36 h-36 rounded-full bg-cyan-950/10 blur-[30px] opacity-40 mix-blend-screen" />

              {/* HUD Grid Overlay and Radar Scan */}
              <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full overflow-visible pointer-events-none opacity-90 mix-blend-screen select-none">
                <defs>
                  <radialGradient id="jarvisGlowRad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
                    <stop offset="70%" stopColor="#0891b2" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#000" stopOpacity="0" />
                  </radialGradient>
                  <filter id="jarvisGlow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Concentric Radar Circles with high-precision dash arrays */}
                <circle cx="100" cy="100" r="90" fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.15" />
                <circle cx="100" cy="100" r="75" fill="none" stroke="#22d3ee" strokeWidth="0.75" strokeOpacity="0.2" strokeDasharray="4 8" />
                <circle cx="100" cy="100" r="50" fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.1" />
                
                {/* Crosshairs & Angle ticks */}
                <line x1="100" y1="2" x2="100" y2="198" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.2" strokeDasharray="2 6" />
                <line x1="2" y1="100" x2="198" y2="100" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.2" strokeDasharray="2 6" />

                {/* Degree angles markings */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
                  const rad = (angle * Math.PI) / 180;
                  const x1 = 100 + Math.cos(rad) * 85;
                  const y1 = 100 + Math.sin(rad) * 85;
                  const x2 = 100 + Math.cos(rad) * 92;
                  const y2 = 100 + Math.sin(rad) * 92;
                  return (
                    <line
                      key={`tick-${i}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#22d3ee"
                      strokeWidth="1"
                      strokeOpacity="0.4"
                    />
                  );
                })}

                {/* Oscillating Web / Line Connectors that ripple according to speaking */}
                {[...Array(16)].map((_, i) => {
                  const angle = (i * 22.5 * Math.PI) / 180;
                  const startR = 45;
                  const endR = speaking ? 75 : 65;
                  
                  return (
                    <motion.path
                      key={`radar-spoke-${i}`}
                      d={`M ${100 + Math.cos(angle) * startR} ${100 + Math.sin(angle) * startR} L ${100 + Math.cos(angle) * endR} ${100 + Math.sin(angle) * endR}`}
                      stroke="#22d3ee"
                      strokeWidth={speaking ? "0.8" : "0.5"}
                      strokeOpacity={speaking ? "0.6" : "0.3"}
                      animate={{
                        d: speaking
                          ? [
                              `M ${100 + Math.cos(angle) * startR} ${100 + Math.sin(angle) * startR} L ${100 + Math.cos(angle) * (endR + Math.random() * 20)} ${100 + Math.sin(angle) * (endR + Math.random() * 20)}`,
                              `M ${100 + Math.cos(angle) * startR} ${100 + Math.sin(angle) * startR} L ${100 + Math.cos(angle) * (endR - Math.random() * 12)} ${100 + Math.sin(angle) * (endR - Math.random() * 12)}`,
                              `M ${100 + Math.cos(angle) * startR} ${100 + Math.sin(angle) * startR} L ${100 + Math.cos(angle) * endR} ${100 + Math.sin(angle) * endR}`
                            ]
                          : `M ${100 + Math.cos(angle) * startR} ${100 + Math.sin(angle) * startR} L ${100 + Math.cos(angle) * endR} ${100 + Math.sin(angle) * endR}`
                      }}
                      transition={{ duration: 0.35, repeat: Infinity }}
                    />
                  );
                })}
              </svg>

              {/* Side levels/oscillators (HUD Equalizer columns) */}
              <div className="absolute inset-x-4 flex justify-between items-center pointer-events-none select-none">
                {/* Left side level indicator */}
                <div className="flex flex-col gap-1 items-start">
                  {[...Array(5)].map((_, idx) => (
                    <motion.div
                      key={`jarvis-l-eq-${idx}`}
                      animate={{
                        width: speaking ? [4, 16, 4] : [4, 8, 4],
                        opacity: speaking ? [0.4, 1, 0.4] : 0.6
                      }}
                      transition={{ duration: 0.2 + idx * 0.08, repeat: Infinity }}
                      className="h-1 bg-cyan-400 rounded-sm w-4"
                    />
                  ))}
                </div>
                {/* Right side level indicator */}
                <div className="flex flex-col gap-1 items-end">
                  {[...Array(5)].map((_, idx) => (
                    <motion.div
                      key={`jarvis-r-eq-${idx}`}
                      animate={{
                        width: speaking ? [4, 16, 4] : [4, 8, 4],
                        opacity: speaking ? [0.4, 1, 0.4] : 0.6
                      }}
                      transition={{ duration: 0.2 + idx * 0.08, repeat: Infinity }}
                      className="h-1 bg-cyan-400 rounded-sm w-4"
                    />
                  ))}
                </div>
              </div>

              {/* Beautiful 3D Orbiting Gimbal Rings */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ transformStyle: 'preserve-3d' }}>
                {/* X-Axis Core ring */}
                <div className="absolute w-36 h-36 border border-cyan-400/20 rounded-full" style={{ transform: 'rotateX(72deg) rotateY(15deg)', transformStyle: 'preserve-3d' }}>
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="w-full h-full rounded-full border border-t-cyan-300 border-b-transparent border-l-transparent border-r-transparent shadow-[0_0_10px_rgba(34,211,238,0.4)]"
                  />
                </div>

                {/* Y-Axis Core ring */}
                <div className="absolute w-40 h-40 border border-cyan-300/10 rounded-full" style={{ transform: 'rotateX(20deg) rotateY(72deg)', transformStyle: 'preserve-3d' }}>
                  <motion.div 
                    animate={{ rotate: -360 }}
                    transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
                    className="w-full h-full rounded-full border border-dashed border-cyan-400/40"
                  />
                </div>

                {/* Diagnostic circle frame with tracking information */}
                <div className="absolute w-44 h-44 rounded-full" style={{ transform: 'rotateX(35deg) rotateY(-40deg)', transformStyle: 'preserve-3d' }}>
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                    className="w-full h-full rounded-full border border-cyan-400/15 flex items-center justify-center"
                  >
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[6px] text-cyan-300/80 font-mono tracking-[0.15em] bg-black/85 px-1 py-0.5 border border-cyan-400/30 rounded-sm select-none uppercase">
                      SYS_SEC_LOCK
                    </div>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[6px] text-cyan-300/80 font-mono tracking-[0.15em] bg-black/85 px-1 py-0.5 border border-cyan-400/30 rounded-sm select-none uppercase">
                      HOLOGR_ON
                    </div>
                  </motion.div>
                </div>
              </div>

              {/* The reactor center core (Singularity Eye) */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  animate={{
                    scale: speaking ? [1, 1.25, 0.9, 1.15, 1] : [1, 1.05, 1],
                    rotate: active ? [0, 360] : 0
                  }}
                  transition={{ 
                    scale: { duration: speaking ? 1.2 : 5, repeat: Infinity, ease: "easeInOut" },
                    rotate: { duration: 15, repeat: Infinity, ease: "linear" }
                  }}
                  className="w-20 h-20 rounded-full border border-cyan-400/40 flex items-center justify-center relative bg-cyan-950/20 shadow-[0_0_35px_rgba(34,211,238,0.25)]"
                >
                  {/* Rotating aperture hexagon shape */}
                  <svg viewBox="0 0 100 100" className="w-16 h-16 absolute text-cyan-300/30">
                    <polygon points="50,10 85,30 85,70 50,90 15,70 15,30" fill="none" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 4" />
                  </svg>
                  
                  {/* Core glowing nucleus */}
                  <div className="w-10 h-10 rounded-full bg-cyan-300/10 border border-cyan-400/50 flex items-center justify-center relative">
                    {/* Pulsing micro arcs */}
                    <motion.div
                      animate={{
                        scale: speaking ? [0.6, 1.35, 0.6] : [0.95, 1.05, 0.95],
                        opacity: speaking ? [0.5, 1, 0.5] : [0.8, 1, 0.8]
                      }}
                      transition={{ duration: 0.6, repeat: Infinity }}
                      className="absolute w-5 h-5 rounded-full border-2 border-dashed border-cyan-300"
                    />
                    <div className="w-4 h-4 rounded-full bg-cyan-200 shadow-[0_0_15px_#22d3ee,0_0_30px_#22d3ee] flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        );

      case 'superintelligence':
      case 'smoke': {
        const rmsOffset = isUserSpeaking ? Math.min(userRms * 1.8, 0.25) : 0;
        
        // Smoke wave puffing: gentle deep breaths (leaps in and out) with higher action when speaking
        const smokeScale = speaking 
          ? [0.92, 1.14, 0.88, 1.18, 0.94, 1.08, 0.92] 
          : isUserSpeaking
            ? [1 - rmsOffset * 0.5, 1 + rmsOffset * 0.7, 1 - rmsOffset * 0.3, 1 + rmsOffset * 0.5, 1]
            : [1.02, 1.09, 0.96, 1.05, 1.02]; // Soft pulsating breathing leaps

        // Liquid, organic smoke boundary morphing keys
        const smokeBorderRadius1 = [
          "45% 55% 40% 60% / 55% 45% 55% 45%",
          "52% 48% 55% 45% / 42% 58% 48% 52%",
          "40% 60% 48% 52% / 50% 50% 45% 55%",
          "55% 45% 50% 50% / 45% 55% 52% 48%",
          "45% 55% 40% 60% / 55% 45% 55% 45%"
        ];

        const smokeBorderRadius2 = [
          "50% 50% 55% 45% / 45% 55% 40% 60%",
          "42% 58% 45% 55% / 52% 48% 55% 45%",
          "55% 45% 50% 50% / 40% 60% 48% 52%",
          "48% 52% 55% 45% / 50% 50% 45% 55%",
          "50% 50% 55% 45% / 45% 55% 40% 60%"
        ];

        const smokeBorderRadius3 = [
          "40% 60% 50% 50% / 55% 45% 45% 55%",
          "55% 45% 45% 55% / 42% 58% 50% 50%",
          "48% 52% 55% 45% / 52% 48% 40% 60%",
          "42% 58% 40% 60% / 50% 50% 55% 45%",
          "40% 60% 50% 50% / 55% 45% 45% 55%"
        ];

        return (
          <div className="relative flex items-center justify-center overflow-visible w-full h-full">
            {/* Background Smoky Dreamy Volumetric Glow */}
            <div className="absolute w-32 h-32 rounded-full bg-orange-500/5 mix-blend-screen blur-[30px] opacity-40 select-none pointer-events-none" />
            <div className={`absolute w-36 h-36 rounded-full bg-stone-300/10 mix-blend-color-dodge blur-[40px] transition-opacity duration-1000 ${active ? 'opacity-30' : 'opacity-10'} select-none pointer-events-none`} />

            {/* Layer 1: Outermost Translucent Smoke Wisp */}
            <motion.div
              animate={{
                scale: smokeScale,
                borderRadius: smokeBorderRadius1,
                rotate: [0, 80, 160, 240, 360],
              }}
              transition={{
                scale: { duration: combinedSpeaking ? 1.1 : 6.5, repeat: Infinity, ease: "easeInOut" },
                borderRadius: { duration: 9, repeat: Infinity, ease: "easeInOut" },
                rotate: { duration: 32, repeat: Infinity, ease: "linear" }
              }}
              className="absolute w-28 h-28 md:w-34 md:h-34 bg-stone-400/[0.08] dark:bg-stone-300/[0.06] border border-stone-200/5 shadow-[inset_0_0_20px_rgba(255,255,255,0.06),0_15px_30px_rgba(0,0,0,0.15)] backdrop-blur-md"
              style={{ filter: "blur(6px)" }}
            />

            {/* Layer 2: Main Middle Nebula/Gas Layer (Glowing Orange-Tinted Ember) */}
            <motion.div
              animate={{
                scale: speaking ? [0.95, 1.1, 0.9, 1.15, 0.95] : [1.04, 0.97, 1.08, 1.01, 1.04],
                borderRadius: smokeBorderRadius2,
                rotate: [360, 270, 180, 90, 0],
              }}
              transition={{
                scale: { duration: combinedSpeaking ? 1.3 : 5.5, repeat: Infinity, ease: "easeInOut" },
                borderRadius: { duration: 7.5, repeat: Infinity, ease: "easeInOut" },
                rotate: { duration: 25, repeat: Infinity, ease: "linear" }
              }}
              className="absolute w-24 h-24 md:w-28 md:h-28 bg-gradient-to-tr from-orange-500/[0.06] via-stone-400/[0.04] to-orange-400/[0.08] border border-orange-500/10 shadow-[inset_0_0_15px_rgba(249,115,22,0.1),0_8px_20px_rgba(249,115,22,0.04)]"
              style={{ filter: "blur(3px)" }}
            />

            {/* Layer 3: Central Dense Liquid Core (Fluctuates heavily like smoke rings) */}
            <motion.div
              animate={{
                scale: speaking ? [0.9, 1.25, 0.85, 1.2, 0.9] : [1.0, 1.06, 0.94, 1.02, 1.0],
                borderRadius: smokeBorderRadius3,
                rotate: [45, 135, 225, 315, 405],
              }}
              transition={{
                scale: { duration: combinedSpeaking ? 0.95 : 4.5, repeat: Infinity, ease: "easeInOut" },
                borderRadius: { duration: 6, repeat: Infinity, ease: "easeInOut" },
                rotate: { duration: 18, repeat: Infinity, ease: "linear" }
              }}
              className="absolute w-18 h-18 md:w-22 md:h-22 bg-gradient-to-bl from-white/[0.85] via-stone-200/[0.5] to-orange-450/[0.3] shadow-[inset_0_4px_12px_rgba(255,255,255,1),inset_0_-4px_12px_rgba(249,115,22,0.15),0_0_15px_rgba(255,255,255,0.4)]"
            >
              {/* Internal Refraction Wisp */}
              <motion.div
                animate={{
                  scale: [0.8, 1.1, 0.8],
                  opacity: [0.4, 0.8, 0.4],
                }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-[3px] rounded-full bg-gradient-to-br from-orange-400/20 to-transparent mix-blend-overlay blur-[2px]"
              />
              <div className="absolute inset-0 rounded-full shadow-[inset_0_2px_6px_rgba(255,255,255,0.95)]" style={{ mixBlendMode: 'overlay' }} />
            </motion.div>

            {/* Intermittent orbiting micro-wisps (floating gas particles spinning around) */}
            {[...Array(4)].map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  rotate: [i * 90 + 0, i * 90 + 360],
                  scale: speaking ? [0.7, 1.2, 0.7] : [0.9, 1.1, 0.9]
                }}
                transition={{
                  rotate: { duration: 8 + i * 4, repeat: Infinity, ease: "linear" },
                  scale: { duration: 3 + i, repeat: Infinity, ease: "easeInOut" }
                }}
                className="absolute w-12 h-12"
                style={{ originX: '52%', originY: '48%' }}
              >
                <motion.div
                  animate={{
                    x: [18, 38, 18],
                    y: [-10, 10, -10],
                    opacity: [0.3, 0.7, 0.3]
                  }}
                  transition={{ duration: 4 + i * 1.5, repeat: Infinity, ease: "easeInOut" }}
                  className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-white to-orange-400/50"
                  style={{ filter: 'blur(1px)' }}
                />
              </motion.div>
            ))}
          </div>
        );
      }

      case 'neural':
        return (
          <div className="relative flex items-center justify-center overflow-visible w-full h-full">
            <NeuralConstellationCanvas 
              active={active} 
              speaking={speaking} 
              thinking={thinking}
              searching={searching}
            />
          </div>
        );

      case 'shadow':
        return (
          <div className="relative flex items-center justify-center">
            {/* Neural Siege: The Red Eye - Technological and Hostile */}
            <motion.div
              animate={{
                scale: speaking ? [1, 1.15, 1] : active ? [1, 1.05, 1] : 1,
                rotate: speaking ? [-0.5, 0.5, -0.5] : 0
              }}
              transition={{ 
                duration: speaking ? 0.8 : 4, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
              className={cn(
                "w-40 h-40 md:w-64 md:h-64 rounded-full border-4 border-red-600/60 flex items-center justify-center relative bg-black overflow-hidden shadow-[0_0_100px_rgba(255,0,0,0.3)]",
                (active || speaking) && "border-red-500 shadow-[0_0_150px_rgba(255,0,0,0.6)]"
              )}
            >
              {/* Pulsing Red Core Background */}
              <motion.div 
                animate={{
                  opacity: speaking ? [0.3, 0.6, 0.3] : [0.15, 0.3, 0.15],
                  scale: speaking ? [1, 1.3, 1] : 1
                }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,0,0,0.2)_0%,transparent_70%)]"
              />

              {/* Aggressive Eye Veins / Lines */}
              {[...Array(24)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    opacity: speaking ? [0.2, 0.5, 0.2] : [0.1, 0.25, 0.1],
                    scaleX: speaking ? [1, 1.3, 1] : [1, 1.05, 1]
                  }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.08 }}
                  className="absolute w-full h-[2px] bg-red-500/30"
                  style={{ transform: `rotate(${i * 7.5}deg)` }}
                />
              ))}

              {/* The Pupil (Void Pupil) */}
              <motion.div
                animate={{
                  scale: speaking ? [1, 0.85, 1.15, 1] : [1, 0.95, 1.05, 1],
                  boxShadow: speaking ? "0 0 40px rgba(255,0,0,0.8)" : "0 0 20px rgba(255,0,0,0.4)"
                }}
                transition={{ duration: speaking ? 1 : 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-20 h-20 md:w-32 md:h-32 rounded-full bg-red-950 flex items-center justify-center relative border-2 border-red-500/50"
              >
                {/* Slit with inner fire */}
                <motion.div 
                  animate={{
                    height: speaking ? ["50%", "90%", "50%"] : ["65%", "75%", "65%"],
                    width: speaking ? ["8px", "12px", "8px"] : "10px",
                    backgroundColor: speaking ? ["#000", "#990000", "#000"] : "#000"
                  }}
                  transition={{ duration: speaking ? 0.5 : 2, repeat: Infinity, ease: "easeInOut" }}
                  className="w-[10px] h-3/4 bg-black rounded-full shadow-[0_0_15px_rgba(255,0,0,1)]"
                />
                
                {/* Neural static / glitched effect inside pupil */}
                {speaking && (
                   <motion.div
                    animate={{ opacity: [0, 0.3, 0] }}
                    transition={{ duration: 0.15, repeat: Infinity }}
                    className="absolute inset-0 bg-red-500/10 mix-blend-overlay"
                   />
                )}
              </motion.div>

              {/* Dynamic Energy Rings */}
              <AnimatePresence>
                {speaking && (
                  [...Array(2)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 2.5, opacity: 0.3 }}
                      exit={{ scale: 3, opacity: 0 }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
                      className="absolute inset-0 border-[2px] border-red-600/50 rounded-full"
                    />
                  ))
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        );

      default:
        return (
          <div className="relative flex items-center justify-center">
            {/* The Sphere Atmosphere */}
            <AnimatePresence>
              {(active || speaking) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1.2 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute inset-0 bg-her-accent/10 rounded-full blur-3xl animate-pulse"
                />
              )}
            </AnimatePresence>

            {/* Main Glass Sphere Body */}
            <motion.div
              animate={{
                scale: active ? [1, 1.02, 1] : 1,
                rotate: active ? [0, 360] : 0
              }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className={cn(
                "relative w-24 h-24 md:w-36 md:h-36 rounded-full border border-white/20 overflow-hidden flex items-center justify-center transition-all duration-1000",
                "backdrop-blur-xl shadow-[inset_0_0_30px_rgba(255,255,255,0.1),0_0_40px_rgba(0,0,0,0.1)]",
                (active || speaking) ? "bg-white/10 border-her-accent/40 shadow-[0_0_60px_rgba(255,78,0,0.2)]" : "bg-white/5 border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
              )}
            >
              {/* Internal Refraction / "Conscious Currents" */}
              {[0, 1].map((i) => (
                <motion.div
                  key={i}
                  animate={{
                    rotate: i === 0 ? 360 : -360,
                    scale: active ? [1, 1.2, 1] : 1
                  }}
                  transition={{ 
                    duration: i === 0 ? 15 : 20, 
                    repeat: Infinity, 
                    ease: "linear" 
                  }}
                  className={cn(
                    "absolute inset-0 opacity-30",
                    i === 0 ? "bg-[radial-gradient(circle_at_30%_30%,#fff_0%,transparent_60%)]" : "bg-[radial-gradient(circle_at_70%_70%,var(--color-her-accent)_0%,transparent_60%)]"
                  )}
                />
              ))}

              {/* Central Core (The "Ego") */}
              <motion.div 
                animate={{
                  scale: speaking ? [1, 1.4, 1] : active ? [1, 1.1, 1] : 1,
                  boxShadow: speaking 
                    ? ["0 0 20px rgba(255,100,0,0.6)", "0 0 60px rgba(255,100,0,0.9)", "0 0 20px rgba(255,100,0,0.6)"] 
                    : active ? "0 0 30px rgba(255,255,255,0.4)" : "0 0 10px rgba(255,255,255,0.1)"
                }}
                transition={{ duration: speaking ? 1 : 4, repeat: Infinity, ease: "easeInOut" }}
                className={cn(
                  "w-4 h-4 md:w-6 md:h-6 rounded-full z-10 transition-all duration-1000",
                  (active || speaking) ? "bg-white" : "bg-white/40"
                )} 
              />
            </motion.div>

            {/* Orbiting Neural Rings */}
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{
                  rotate: i * 120 + (active ? 360 : 0),
                  scale: combinedSpeaking ? [1, 1.15, 1] : 1,
                  opacity: active ? [0.4, 0.7, 0.4] : 0.2
                }}
                transition={{
                  duration: active ? (8 - i * 2) : 10,
                  repeat: Infinity,
                  ease: "linear"
                }}
                className={cn(
                  "absolute rounded-full border border-her-accent/20 transition-all duration-1000",
                  i === 0 ? "w-28 h-28 md:w-44 md:h-44" : i === 1 ? "w-32 h-32 md:w-52 md:h-52" : "w-36 h-36 md:w-60 md:h-60"
                )}
              />
            ))}
          </div>
        );
    }
  };

  const scale = size / 100;

  return (
    <div 
      style={{
        transform: `scale(${scale})`,
        transformOrigin: 'center center'
      }}
      className={cn(
        "relative w-48 h-48 md:w-64 md:h-64 flex items-center justify-center cursor-pointer group transition-all",
        !active && "opacity-60 saturate-50 scale-95"
      )}
    >
      {/* Outer Glow */}
      <div className={cn(
        "absolute inset-0 transition-all duration-1000",
        style === 'wave' ? "rounded-3xl" : "rounded-full",
        (active || combinedSpeaking) ? (
          (style === 'superintelligence' || style === 'smoke') ? "bg-orange-500/10 blur-[100px] scale-110" : 
          style === 'jarvis' ? "bg-cyan-500/15 blur-[120px] scale-110" :
          style === 'wave' ? "bg-cyan-500/10 blur-[110px] scale-110" :
          "bg-her-accent/10 blur-[100px] scale-110"
        ) : "bg-transparent"
      )} />
      
      {renderStyle()}

      {/* Rotating Rings (only for classic) */}
      {style === 'classic' && (
        <>
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 border border-white/[0.03] rounded-full"
          />
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            className="absolute inset-6 border border-white/[0.02] rounded-full border-dashed"
          />
        </>
      )}

      {/* Smoke and Superintelligence Rings */}
      {(style === 'superintelligence' || style === 'smoke') && (active || combinedSpeaking) && (
        <motion.div
          animate={{ rotate: [0, 360], scale: [1, 1.1, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 border border-orange-400/10 rounded-full"
        />
      )}

      {/* Jarvis Decorative Cyber Ring */}
      {style === 'jarvis' && (active || combinedSpeaking) && (
        <motion.div
          animate={{ rotate: [-0, -360], scale: combinedSpeaking ? [1, 1.05, 1] : 1 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute -inset-4 border border-cyan-500/10 rounded-full border-dashed p-1"
        >
          <div className="w-full h-full border border-cyan-400/5 rounded-full" />
        </motion.div>
      )}
      
      {/* Speaking rings */}
      {combinedSpeaking && active && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: [0, 0.3, 0], scale: [0.8, 1.5, 2] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.5,
                ease: "easeOut"
              }}
              className={cn(
                "absolute w-full h-full border",
                style === 'wave' 
                  ? "border-cyan-400/25 rounded-full" // Clean pristine circular ripple
                  : (style === 'superintelligence' || style === 'smoke') 
                    ? "border-orange-400/30 rounded-full" 
                    : style === 'jarvis' 
                      ? "border-cyan-400/30 rounded-full" 
                      : "border-her-accent/30 rounded-full"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
};
