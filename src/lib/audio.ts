/**
 * Audio processing utilities for Gemini Live API
 */

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  async startRecording(onAudioData: (base64Data: string, rms: number) => void) {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("Seu navegador não suporta a API de Áudio.");
      }

      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      if (!this.audioContext || !this.stream) {
        return; 
      }
      
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        if (!this.processor) return;
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate RMS to detect user voice volume
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        
        // Dispatch CustomEvent on window for components to react to user speaking volume
        const voiceEvent = new CustomEvent('osone_user_voice', { detail: { rms } });
        window.dispatchEvent(voiceEvent);
        
        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        // Convert to base64 safely without using spread operator to avoid 'Maximum call stack size exceeded' errors
        const uint8Bytes = new Uint8Array(pcmData.buffer);
        let binary = "";
        const len = uint8Bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8Bytes[i]);
        }
        const base64Data = btoa(binary);
        onAudioData(base64Data, rms);
      };
  
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
    } catch (error: any) {
      const isPermissionDenied = error?.name === 'NotAllowedError' || 
                                 error?.message?.includes('Permission denied') || 
                                 error?.message?.includes('not-allowed');
      if (isPermissionDenied) {
        console.warn("Aviso: Gravação de áudio indisponível por falta de permissão:", error.message || error);
      } else {
        console.error("Erro ao iniciar gravação de áudio:", error);
      }
      this.stopRecording();
      if (isPermissionDenied) {
        const enhancedError = new Error("Permissão de microfone negada. Clique no cadeado (URL) para habilitar, ou abra o OSONE em uma nova aba para contornar restrições de iframe.");
        (enhancedError as any).name = 'NotAllowedError';
        throw enhancedError;
      }
      throw error;
    }
  }

  stopRecording() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();
    
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.audioContext = null;
  }
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private onActivityChange?: (active: boolean) => void;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  public modulation: { pitch: number; rate: number; distortion: number } = { pitch: 1.0, rate: 1.0, distortion: 0 };

  constructor(onActivityChange?: (active: boolean) => void) {
    this.onActivityChange = onActivityChange;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      this.audioContext = new AudioContextClass({ sampleRate: 24000 });
    }
  }

  private createDistortionCurve(amount: number) {
    const k = amount * 100;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  playChunk(base64Data: string) {
    if (!this.audioContext || this.audioContext.state === 'closed') return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(err => console.error("Erro ao resumir AudioContext no playChunk:", err));
    }

    try {
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      const pcmData = new Int16Array(bytes.buffer);
      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 0x7FFF;
      }
  
      const buffer = this.audioContext.createBuffer(1, floatData.length, 24000);
      buffer.getChannelData(0).set(floatData);
  
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      
      // Apply modulation
      const effectiveRate = this.modulation.pitch * this.modulation.rate;
      source.playbackRate.value = effectiveRate;

      if (this.modulation.distortion > 0) {
        const distort = this.audioContext.createWaveShaper();
        distort.curve = this.createDistortionCurve(this.modulation.distortion);
        distort.oversample = '4x';
        source.connect(distort);
        distort.connect(this.audioContext.destination);
      } else {
        source.connect(this.audioContext.destination);
      }
  
      const currentTime = this.audioContext.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }
  
      const startTime = this.nextStartTime;
      source.start(startTime);
      
      // Calculate duration adjusted by playback rate
      const adjustedDuration = buffer.duration / effectiveRate;
      this.nextStartTime += adjustedDuration;

      this.activeSources.add(source);
      if (this.activeSources.size === 1) {
        this.onActivityChange?.(true);
      }

      source.onended = () => {
        this.activeSources.delete(source);
        if (this.activeSources.size === 0) {
          this.onActivityChange?.(false);
        }
      };
    } catch (err) {
      console.error("Erro ao reproduzir chunk de áudio:", err);
    }
  }

  stop() {
    this.activeSources.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    this.activeSources.clear();
    this.audioContext?.close();
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      this.audioContext = new AudioContextClass({ sampleRate: 24000 });
    }
    this.nextStartTime = 0;
    this.onActivityChange?.(false);
  }
}
