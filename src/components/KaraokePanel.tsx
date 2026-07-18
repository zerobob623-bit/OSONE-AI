import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Play, Pause, RotateCcw, Volume2, Music, Mic, 
  Sparkles, Sliders, Settings, Music4, Check, Info, AlertCircle
} from 'lucide-react';

interface KaraokePanelProps {
  lyrics: { title?: string; content: string } | null;
  onClose: () => void;
  isSinging: boolean;
  setIsSinging: (singing: boolean) => void;
}

export const KaraokePanel: React.FC<KaraokePanelProps> = ({
  lyrics,
  onClose,
  isSinging,
  setIsSinging
}) => {
  const [phrases, setPhrases] = useState<string[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState<number>(-1);
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(-1);
  const [words, setWords] = useState<string[]>([]);
  const [playbackState, setPlaybackState] = useState<'idle' | 'playing' | 'paused' | 'completed'>('idle');
  const [beatGenre, setBeatGenre] = useState<'cyber' | 'lofi' | 'ambient' | 'none'>('cyber');
  const [vocalStyle, setVocalStyle] = useState<'soprano' | 'tenor' | 'vocoder' | 'cosmic'>('vocoder');
  const [beatVolume, setBeatVolume] = useState<number>(0.25);
  const [harmonyVolume, setHarmonyVolume] = useState<number>(0.35);
  const [muteVocalGuide, setMuteVocalGuide] = useState<boolean>(false); // Enabled by default so the AI sings out loud immediately!
  const [voiceRate, setVoiceRate] = useState<number>(0.92); // slightly slower is better for singing cadence
  const [systemMessage, setSystemMessage] = useState<string>('');

  // Voices available
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('');

  // Web Audio Refs for backing track and harmony
  const audioCtxRef = useRef<AudioContext | null>(null);
  const beatTimerRef = useRef<any>(null);
  const currentOscillatorsRef = useRef<OscillatorNode[]>([]);
  const currentGainsRef = useRef<GainNode[]>([]);
  const lineTimeoutRef = useRef<any>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Parse lyrics into clean printable lines
  useEffect(() => {
    if (lyrics && lyrics.content) {
      const parsedLines = lyrics.content
        .split('\n')
        .map(line => line.replace(/[\[\]\*\_\#\-]/g, '').trim())
        .filter(line => line.length > 0);
      setPhrases(parsedLines);
      setCurrentLineIndex(-1);
      setCurrentWordIndex(-1);
      setWords([]);
      setPlaybackState('idle');
    }
  }, [lyrics]);

  // Auto-start playback as soon as lyrics are received and parsed
  useEffect(() => {
    if (phrases.length > 0 && playbackState === 'idle') {
      const timer = setTimeout(() => {
        handleStartPlayback();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [phrases]);

  // Load voices
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const load = () => {
        const voices = window.speechSynthesis.getVoices();
        setAvailableVoices(voices);
        
        // Auto-select best Portuguese voice or high quality fallback
        const ptVoice = voices.find(v => v.lang.startsWith('pt-BR') || v.lang.startsWith('pt'));
        const googlePt = voices.find(v => v.name.includes('Google') && v.lang.startsWith('pt'));
        const targetVoice = googlePt || ptVoice || voices[0];
        if (targetVoice) {
          setSelectedVoiceName(targetVoice.name);
        }
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
  }, []);

  // Initialize Audio Context lazy
  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtxRef.current = new AudioCtxClass();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  // Canvas visualizer loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const particles: Array<{ x: number; y: number; r: number; speedY: number; speedX: number; color: string; alpha: number }> = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 3 + 1,
        speedY: -Math.random() * 0.4 - 0.2,
        speedX: Math.random() * 0.4 - 0.2,
        color: i % 2 === 0 ? 'rgba(236,72,153,' : 'rgba(139,92,246,',
        alpha: Math.random() * 0.5 + 0.3
      });
    }

    // Sine waves
    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Gradient background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#020205');
      bgGrad.addColorStop(0.5, '#05030d');
      bgGrad.addColorStop(1, '#020202');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Procedural sound waves in background
      phase += 0.02;
      const waveCount = 3;
      for (let w = 0; w < waveCount; w++) {
        ctx.beginPath();
        ctx.strokeStyle = w === 0 
          ? 'rgba(244,63,94,0.08)'  // Pink
          : w === 1 
            ? 'rgba(168,85,247,0.06)' // Purple
            : 'rgba(59,130,246,0.05)'; // Blue

        ctx.lineWidth = 3 - w * 0.5;
        const speedMultiplier = 1 + w * 0.5;
        const amplitude = (playbackState === 'playing' ? 35 : 10) * (3 - w) * 0.4;
        const frequency = 0.005 + w * 0.002;

        for (let x = 0; x <= width; x += 5) {
          const y = height / 2 + Math.sin(x * frequency + phase * speedMultiplier) * amplitude 
                    + Math.cos(x * 0.003 - phase * speedMultiplier * 0.5) * (amplitude * 0.4);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Particles
      particles.forEach(p => {
        p.y += p.speedY * (playbackState === 'playing' ? 2 : 0.5);
        p.x += p.speedX;
        
        if (p.y < 0) p.y = height;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (playbackState === 'playing' ? 1.5 : 1.0), 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.fill();
      });

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [playbackState]);

  // Backing beat scheduling
  const startBackingBeat = () => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    if (beatTimerRef.current) clearInterval(beatTimerRef.current);
    if (beatGenre === 'none') return;

    let beatIndex = 0;

    const runBeatStep = () => {
      const now = ctx.currentTime;
      
      // KICK DRUM (rhythmic bass sweep)
      if (beatIndex % 2 === 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);
        
        gain.gain.setValueAtTime(0.4 * beatVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.35);
      }

      // RETRO HI-HAT / BURST (shimmery cyber feel)
      if (beatIndex % 2 === 1 && beatGenre === 'cyber') {
        const oscNode = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscNode.type = 'triangle';
        oscNode.frequency.setValueAtTime(10000, now);
        
        gainNode.gain.setValueAtTime(0.02 * beatVolume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        
        oscNode.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscNode.start(now);
        oscNode.stop(now + 0.1);
      }

      // RETRO CHIPTUNE DECORATION (retro cyber arpeggio)
      if (beatGenre === 'cyber' && beatIndex % 4 === 1) {
        const frequencies = [523.25, 587.33, 659.25, 783.99]; // C5, D5, E5, G5
        const f = frequencies[Math.floor(Math.random() * frequencies.length)];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);
        
        gain.gain.setValueAtTime(0.02 * beatVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
      }

      // LOFI SNARL / COMPLEMENT (deep rhodes chord pad)
      if (beatGenre === 'lofi' && beatIndex % 8 === 0) {
        // Play soft nostalgic lo-fi chord
        const notes = [130.81, 164.81, 196.00, 246.94]; // C3, E3, G3, B3
        notes.forEach(noteF => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(noteF, now);
          
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.03 * beatVolume, now + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.start(now);
          osc.stop(now + 2.0);
        });
      }

      beatIndex++;
    };

    // run once immediately
    runBeatStep();

    // Loop interval based on style
    const intervalMs = beatGenre === 'lofi' ? 600 : 450;
    beatTimerRef.current = setInterval(runBeatStep, intervalMs);
  };

  const stopAudioTracks = () => {
    if (beatTimerRef.current) {
      clearInterval(beatTimerRef.current);
      beatTimerRef.current = null;
    }

    currentOscillatorsRef.current.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    currentOscillatorsRef.current = [];

    currentGainsRef.current.forEach(g => {
      try { g.disconnect(); } catch (e) {}
    });
    currentGainsRef.current = [];
  };

  const stopAllSinging = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (lineTimeoutRef.current) {
      clearTimeout(lineTimeoutRef.current);
      lineTimeoutRef.current = null;
    }
    stopAudioTracks();
  };

  // Harmonizing synthesizer that triggers with each line!
  // This gives the "Vocoder / Sing beautifully" Auto-tune effect!
  const playHarmonyScale = (lineIndex: number, textLength: number) => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // Clean previous line's oscillators
    currentOscillatorsRef.current.forEach(o => { try { o.stop(); } catch(e){} });
    currentOscillatorsRef.current = [];

    if (harmonyVolume === 0) return;

    // Pentatonic scale notes to always sound perfectly in harmorny
    const scaleBase = [220.00, 246.94, 277.18, 329.63, 369.99, 440.00]; // A3, B3, C#4, E4, F#4, A4 (beautiful ethereal scale)
    const baseFreq = scaleBase[lineIndex % scaleBase.length];

    const now = ctx.currentTime;
    const duration = Math.max(3.0, Math.min(6.5, textLength * 0.12));

    const synthType = vocalStyle === 'cosmic' ? 'triangle' : 'sine';

    // 1. Root Oscillator
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = synthType;
    osc1.frequency.setValueAtTime(baseFreq, now);
    
    // Add micro vocal-vibrato
    osc1.frequency.linearRampToValueAtTime(baseFreq * 1.015, now + 0.3);
    osc1.frequency.linearRampToValueAtTime(baseFreq * 0.985, now + 0.6);
    osc1.frequency.linearRampToValueAtTime(baseFreq * 1.01, now + 0.9);
    osc1.frequency.linearRampToValueAtTime(baseFreq, now + 1.2);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.08 * harmonyVolume, now + 0.25);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + duration + 0.2);
    currentOscillatorsRef.current.push(osc1);

    // 2. Harmony (Third or Fifth)
    const intervalFactor = lineIndex % 2 === 0 ? 1.25 : 1.5; // major third or perfect fifth
    const harmonyFreq = baseFreq * intervalFactor;

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(harmonyFreq, now);

    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.05 * harmonyVolume, now + 0.45);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + duration - 0.2);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + duration + 0.2);
    currentOscillatorsRef.current.push(osc2);
  };

  // Determine pitch per word to create a real wavy singing melody!
  const getPitchForWord = (wordIdx: number, lineIdx: number): number => {
    // Elegant pitch sequences designed to sound like structured scales
    const pitchMelody = [0.95, 1.15, 1.35, 1.25, 1.45, 1.3, 1.05, 1.2, 1.4, 1.1];
    const pitchIdx = (lineIdx * 2 + wordIdx * 3) % pitchMelody.length;
    let basePitch = pitchMelody[pitchIdx];

    if (vocalStyle === 'soprano') {
      return Math.min(2.0, basePitch + 0.3);
    }
    if (vocalStyle === 'tenor') {
      return Math.max(0.5, basePitch - 0.25);
    }
    if (vocalStyle === 'cosmic') {
      return wordIdx % 2 === 0 ? 1.7 : 0.6;
    }
    // vocoder/default
    return basePitch;
  };

  // Play a beautiful, filtered musical synthesizer note corresponding to each syllable/word uttered!
  // This physically blends the synthesized robotic speech with actual tonal music (Vocoder / Auto-Tune effect).
  const playWordHarmonyNote = (wordIdx: number, lineIdx: number, wordLength: number) => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    if (harmonyVolume === 0) return;

    // Harmonious major pentatonic scale across octaves
    const pentatonic = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];
    const noteIdx = (lineIdx * 2 + wordIdx) % pentatonic.length;
    const baseFreq = pentatonic[noteIdx];

    const now = ctx.currentTime;
    const duration = Math.max(0.35, Math.min(0.9, wordLength * 0.12));

    const waveType = (vocalStyle === 'vocoder') 
      ? 'sawtooth' 
      : (vocalStyle === 'cosmic' ? 'triangle' : 'sine');

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = waveType;
    osc.frequency.setValueAtTime(baseFreq, now);

    // Warm synthesizer vibrato
    const vibratoSpeed = 7; 
    const vibratoDepth = baseFreq * 0.012; 
    osc.frequency.linearRampToValueAtTime(baseFreq + vibratoDepth, now + duration * 0.3);
    osc.frequency.linearRampToValueAtTime(baseFreq - vibratoDepth, now + duration * 0.65);
    osc.frequency.linearRampToValueAtTime(baseFreq, now + duration);

    // Filter curves to smooth out sawtooth highs, giving a rich retro vocoder finish
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    if (vocalStyle === 'vocoder') {
      filter.frequency.exponentialRampToValueAtTime(450, now + duration);
      filter.Q.setValueAtTime(6, now);
    }

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.14 * harmonyVolume, now + 0.04);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.15);

    currentOscillatorsRef.current.push(osc);
  };

  // Synchronous word-by-word singer queue
  const playWordAtIndex = (wordIndex: number, lineIndex: number, lineWords: string[]) => {
    if (wordIndex >= lineWords.length) {
      // Finished all words of current verse, breathe before jumping to next verse!
      const breathMs = 850 + Math.random() * 300;
      lineTimeoutRef.current = setTimeout(() => {
        playPhraseAtIndex(lineIndex + 1);
      }, breathMs);
      return;
    }

    setCurrentWordIndex(wordIndex);
    const word = lineWords[wordIndex];

    // Trigger matching synthesizer voice assist note (Vocoder harmony notes)
    playWordHarmonyNote(wordIndex, lineIndex, word.length);

    // We advance automatically after a pleasant word reading duration in perfect sync with the backing melody/synthesizer tracks!
    // This creates a magnificent visual karaoke tracker with only the backing instruments, allowing Gemini/Live to sing without duplicate basic TTS voices.
    const wordDuration = Math.max(220, Math.min(650, word.length * 95));
    const gap = 80;
    lineTimeoutRef.current = setTimeout(() => {
      playWordAtIndex(wordIndex + 1, lineIndex, lineWords);
    }, wordDuration + gap);
  };

  // Main Singing engine queue
  const playPhraseAtIndex = (index: number) => {
    if (index >= phrases.length) {
      setPlaybackState('completed');
      setCurrentLineIndex(-1);
      setCurrentWordIndex(-1);
      setWords([]);
      stopAudioTracks();
      return;
    }

    setCurrentLineIndex(index);
    const text = phrases[index];

    // Speak the entire phrase to actually "sing" it out loud!
    if (!muteVocalGuide && typeof window !== 'undefined' && window.speechSynthesis) {
      // Cancel previous speaking to start this line fresh
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      // slightly slower rate is beautiful for singing cadence
      utterance.rate = voiceRate;
      
      // Determine modulated pitch to create beautiful auto-tune/singing effect
      utterance.pitch = getPitchForWord(0, index);

      // Find the selected voice
      if (selectedVoiceName) {
        const voice = availableVoices.find(v => v.name === selectedVoiceName);
        if (voice) {
          utterance.voice = voice;
        }
      }

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }

    // Split sentence into individual words for real rhythmic Auto-Tune!
    const lineWords = text.split(/\s+/).filter(w => w.length > 0);
    setWords(lineWords);
    setCurrentWordIndex(0);

    // Large pads accompany for the entire line to lay a thick chord base
    playHarmonyScale(index, text.length);

    // Begin word vocal queue
    playWordAtIndex(0, index, lineWords);
  };

  const handleStartPlayback = () => {
    initAudio();
    stopAllSinging();
    setPlaybackState('playing');
    startBackingBeat();
    // Start queue if we have phrases
    if (phrases.length > 0) {
      playPhraseAtIndex(0);
    }
  };

  const handlePausePlayback = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.pause();
    }
    setPlaybackState('paused');
    if (beatTimerRef.current) {
      clearInterval(beatTimerRef.current);
      beatTimerRef.current = null;
    }
  };

  const handleResumePlayback = () => {
    initAudio();
    setPlaybackState('playing');
    startBackingBeat();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      } else {
        // Redo from current line to avoid stuck state
        playPhraseAtIndex(currentLineIndex === -1 ? 0 : currentLineIndex);
      }
    }
  };

  const handleRestartPlayback = () => {
    stopAllSinging();
    initAudio();
    setCurrentLineIndex(0);
    setCurrentWordIndex(0);
    setPlaybackState('playing');
    startBackingBeat();
    playPhraseAtIndex(0);
  };

  // Clean on unmount
  useEffect(() => {
    return () => {
      stopAllSinging();
    };
  }, []);

  // Update beat style in real-time
  useEffect(() => {
    if (playbackState === 'playing') {
      startBackingBeat();
    }
  }, [beatGenre, beatVolume]);

  const toggleBackingBeat = () => {
    const nextGenres: Record<'cyber' | 'lofi' | 'ambient' | 'none', 'cyber' | 'lofi' | 'ambient' | 'none'> = {
      cyber: 'lofi',
      lofi: 'ambient',
      ambient: 'none',
      none: 'cyber'
    };
    setBeatGenre(nextGenres[beatGenre]);
  };

  const toggleVocalStyle = () => {
    const nextStyles: Record<'soprano' | 'tenor' | 'vocoder' | 'cosmic', 'soprano' | 'tenor' | 'vocoder' | 'cosmic'> = {
      vocoder: 'soprano',
      soprano: 'tenor',
      tenor: 'cosmic',
      cosmic: 'vocoder'
    };
    setVocalStyle(nextStyles[vocalStyle]);
  };

  return (
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-between p-6 select-none overflow-hidden pb-12">
      {/* Background Canvas Particle FX and sound waves */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full -z-10 block pointer-events-none"
      />

      {/* Top action row */}
      <div className="w-full max-w-4xl flex items-center justify-between shrink-0 z-10 p-2.5 bg-black/40 backdrop-blur-md rounded-2xl border border-white/5">
        <div className="flex items-center gap-3 pl-2">
          <div className="p-2 bg-pink-500/10 rounded-xl border border-pink-500/20 text-pink-400">
            <Mic className="animate-pulse" size={16} />
          </div>
          <div className="text-left font-sans">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              {lyrics?.title || "Letra Ativa"}
            </h3>
            <span className="text-[9px] text-[#888] font-mono tracking-widest uppercase block mt-0.5">
              MICRO-SINTETIZADOR SÍNCRONO OSONE
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Vocal Selection */}
          <button
            onClick={toggleVocalStyle}
            title="Escolher Voz de Canto"
            className="p-2 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 text-xs text-zinc-300 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 px-3"
          >
            <Sparkles size={13} className="text-pink-400" />
            <span className="font-mono text-[9px] uppercase tracking-wider">Canto: {vocalStyle}</span>
          </button>

          {/* Backing Beat Genre Toggle */}
          <button
            onClick={toggleBackingBeat}
            title="Mudar Ritmo de Fundo"
            className="p-2 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 text-xs text-zinc-300 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 px-3"
          >
            <Music4 size={13} className="text-purple-400" />
            <span className="font-mono text-[9px] uppercase tracking-wider">RITMO: {beatGenre}</span>
          </button>

          {/* Vocal Guide Toggle */}
          <button
            onClick={() => {
              const nextMute = !muteVocalGuide;
              setMuteVocalGuide(nextMute);
              if (nextMute && typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
              } else if (!nextMute && playbackState === 'playing') {
                // If unmuted and playing, re-speak current line to get audio immediately
                playPhraseAtIndex(currentLineIndex === -1 ? 0 : currentLineIndex);
              }
            }}
            title="Ativar/Desativar Voz Cantada do OSONE"
            className={`p-2 border text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 px-3 ${
              !muteVocalGuide 
                ? "bg-pink-500/10 border-pink-500/25 text-pink-300 shadow-[0_0_15px_rgba(244,63,94,0.15)]" 
                : "bg-white/[0.02] border-white/5 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Volume2 size={13} className={!muteVocalGuide ? "text-pink-400 animate-pulse" : "text-zinc-500"} />
            <span className="font-mono text-[9px] uppercase tracking-wider font-bold">
              CANTOR: {!muteVocalGuide ? "LIGADO" : "MUDO"}
            </span>
          </button>

          {/* Close Karaoke */}
          <button 
            onClick={() => {
              stopAllSinging();
              onClose();
            }}
            className="p-2.5 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Center Display: Interactive "One phrase at a time" scrolling screen */}
      <div className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center p-4 relative min-h-0">
        
        {playbackState === 'idle' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-4 max-w-md bg-white/[0.01] border border-white/[0.03] p-8 rounded-3xl backdrop-blur-md"
          >
            <div className="w-14 h-14 bg-gradient-to-tr from-pink-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto text-white shadow-[0_0_25px_rgba(244,63,94,0.3)]">
              <Mic size={24} />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white uppercase tracking-wider">Música Pronta para Canto</h2>
              <p className="text-xs text-[#888] font-sans leading-relaxed">
                Clique em Iniciar para ativar o sintetizador de voz. O OSONE modulará as frequências do sintetizador em tempo real, acompanhado por acordes analógicos e beats gerados em loop!
              </p>
            </div>

            <button
              onClick={handleStartPlayback}
              className="px-6 py-3.5 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-[0_4px_16px_rgba(244,63,94,0.2)] flex items-center gap-2.5 mx-auto"
            >
              <Play size={13} fill="currentColor" />
              Iniciar Canto / Karaoke
            </button>
          </motion.div>
        )}

        {playbackState === 'completed' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-4 max-w-md bg-white/[0.01] border border-white/[0.03] p-8 rounded-3xl backdrop-blur-md"
          >
            <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(52,211,153,0.15)]">
              <Check size={24} />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white uppercase tracking-wider">Apresentação Finalizada!</h2>
              <p className="text-xs text-[#888] font-sans">
                O OSONE concluiu com êxito as modulações e tons neurais da canção. Excelente sincronia acústica!
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={handleRestartPlayback}
                className="px-5 py-3.5 bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] text-white text-xs font-mono font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center gap-2"
              >
                <RotateCcw size={12} />
                Cantar Novamente
              </button>
            </div>
          </motion.div>
        )}

        {/* Live Active scrolling phrases "uma frase por vez" */}
        {(playbackState === 'playing' || playbackState === 'paused') && phrases.length > 0 && (
          <div className="w-full flex flex-col items-center gap-8 justify-center h-full min-h-0">
            
            {/* Lyrics Queue layout */}
            <div className="w-full flex-1 flex flex-col justify-center items-center gap-6 overflow-hidden max-h-[70%] select-text">
              
              {/* Previous line (Semi faded) */}
              <div className="h-10 shrink-0 overflow-hidden flex items-center justify-center text-center opacity-30 select-none">
                <AnimatePresence mode="wait">
                  {currentLineIndex > 0 && (
                    <motion.p
                      key={currentLineIndex - 1}
                      initial={{ y: 15, opacity: 0 }}
                      animate={{ y: 0, opacity: 0.4 }}
                      exit={{ y: -15, opacity: 0 }}
                      className="text-sm md:text-base font-medium font-sans italic text-zinc-400"
                    >
                      {phrases[currentLineIndex - 1]}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Main ACTIVE karaoke line (Big, glowing, highlighted) */}
              <div className="min-h-[110px] flex flex-col items-center justify-center text-center px-4 w-full relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentLineIndex}
                    initial={{ y: 25, opacity: 0, scale: 0.96 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: -25, opacity: 0, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 100, damping: 15 }}
                    className="flex flex-col items-center gap-6 w-full"
                  >
                    <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-2.5 max-w-3xl">
                      {words.length > 0 ? (
                        words.map((w, wIdx) => {
                          const isActive = wIdx === currentWordIndex;
                          const isPast = wIdx < currentWordIndex;
                          return (
                            <motion.span
                              key={`${currentLineIndex}-${wIdx}`}
                              animate={{
                                scale: isActive ? 1.18 : 1.0,
                                color: isActive 
                                  ? "#f43f5e" 
                                  : isPast 
                                    ? "#f472b6" 
                                    : "#ffffff",
                                textShadow: isActive 
                                  ? "0 0 25px rgba(244,63,94,0.8), 0 0 10px rgba(244,63,94,0.4)" 
                                  : "none",
                                opacity: isActive ? 1.0 : isPast ? 0.7 : 0.9
                              }}
                              transition={{ duration: 0.1 }}
                              className="text-2xl md:text-4xl font-black italic tracking-tight uppercase select-none font-sans"
                            >
                              {w}
                            </motion.span>
                          );
                        })
                      ) : (
                        <span className="text-xl italic text-zinc-500 font-mono tracking-widest animate-pulse">
                          AQUECENDO PRESET DE CANTO...
                        </span>
                      )}
                    </div>

                    {/* Animated Neon Tracking Progress Sweep below the phrase */}
                    <div className="w-56 h-1 bg-white/[0.05] rounded-full overflow-hidden relative mt-1">
                      <motion.div 
                        initial={{ x: "-100%" }}
                        animate={{ x: "100%" }}
                        transition={{ 
                          duration: Math.max(3.0, (phrases[currentLineIndex]?.length || 10) * 0.11),
                          repeat: Infinity,
                          ease: "linear"
                        }}
                        className="absolute inset-0 bg-gradient-to-r from-pink-500 to-purple-500"
                      />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Next line (Faded) */}
              <div className="h-10 shrink-0 overflow-hidden flex items-center justify-center text-center opacity-40 select-none">
                <AnimatePresence mode="wait">
                  {currentLineIndex < phrases.length - 1 && (
                    <motion.p
                      key={currentLineIndex + 1}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 0.5 }}
                      exit={{ y: -20, opacity: 0 }}
                      className="text-sm md:text-base font-medium font-sans text-zinc-400"
                    >
                      {phrases[currentLineIndex + 1]}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

            </div>

            {/* Micro progress indicator */}
            {phrases.length > 0 && currentLineIndex >= 0 && (
              <div className="w-full max-w-md bg-white/[0.02] border border-white/[0.04] p-3 rounded-2xl flex items-center justify-between font-mono text-[9px] text-[#666] shrink-0">
                <span className="uppercase tracking-wider">VERSO {currentLineIndex + 1} / {phrases.length}</span>
                <span className="text-pink-400 uppercase tracking-widest animate-pulse font-bold">EM ANDAMENTO</span>
                <span>{Math.round(((currentLineIndex + 1) / phrases.length) * 100)}%</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dynamic Settings and Controls deck */}
      <div className="w-full max-w-4xl bg-black/50 backdrop-blur-xl border border-white/10 rounded-3xl p-5 shrink-0 z-10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          
          {/* Deck panel 1: Media Control buttons */}
          <div className="md:col-span-4 flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4">
            <div className="flex items-center gap-4">
              {playbackState === 'playing' ? (
                <button
                  onClick={handlePausePlayback}
                  className="w-12 h-12 rounded-2xl bg-white text-black hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-lg"
                >
                  <Pause size={18} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={playbackState === 'paused' ? handleResumePlayback : handleStartPlayback}
                  className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-500 text-white hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-lg shadow-pink-500/20"
                >
                  <Play size={18} fill="currentColor" stroke="none" className="ml-1" />
                </button>
              )}

              <button
                onClick={handleRestartPlayback}
                title="Recomeçar do Início"
                className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/5 hover:bg-white/[0.08] hover:border-white/10 text-white transition-all flex items-center justify-center cursor-pointer"
              >
                <RotateCcw size={15} />
              </button>
            </div>

            {/* Quick guide voice status */}
            <div className="text-center md:text-left font-sans text-[10px] text-zinc-400">
              <span className="font-semibold block text-pink-400">Voz Síncrona: Gemini Live 🌟</span>
              <p className="text-[9px] text-zinc-500 leading-normal">
                Cantando em tempo real com harmonias e acordes sintetizados!
              </p>
            </div>
          </div>

          {/* Deck panel 2: Sourcing volume controls */}
          <div className="md:col-span-8 grid grid-cols-2 gap-6 select-none leading-none">
            
            {/* Audio Beat Track scale */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[9px] font-mono text-[#888] tracking-wider uppercase font-bold">
                <span className="flex items-center gap-1.5">
                  <Music size={10} className="text-purple-400" />
                  Bateria / Ritmo
                </span>
                <span>{Math.round(beatVolume * 100)}%</span>
              </div>
              <input 
                type="range"
                min="0"
                max="0.8"
                step="0.05"
                value={beatVolume}
                onChange={(e) => setBeatVolume(parseFloat(e.target.value))}
                className="w-full accent-purple-500 bg-white/[0.05] h-1.5 rounded-full cursor-pointer hover:accent-purple-400"
              />
            </div>

            {/* Vocal Analog Synth volume scale */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[9px] font-mono text-[#888] tracking-wider uppercase font-bold">
                <span className="flex items-center gap-1.5">
                  <Mic size={10} className="text-pink-400" />
                  Harmonia / Vocoder
                </span>
                <span>{Math.round(harmonyVolume * 100)}%</span>
              </div>
              <input 
                type="range"
                min="0"
                max="0.8"
                step="0.05"
                value={harmonyVolume}
                onChange={(e) => setHarmonyVolume(parseFloat(e.target.value))}
                className="w-full accent-pink-500 bg-white/[0.05] h-1.5 rounded-full cursor-pointer hover:accent-pink-400"
              />
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};
