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
  private analyserNode: AnalyserNode | null = null;
  private nextStartTime: number = 0;
  private onActivityChange?: (active: boolean) => void;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private animFrameId: number | null = null;
  public modulation: { pitch: number; rate: number; distortion: number } = { pitch: 1.0, rate: 1.0, distortion: 0 };

  constructor(onActivityChange?: (active: boolean) => void) {
    this.onActivityChange = onActivityChange;
    this.initAudioContext();
  }

  private initAudioContext() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      this.audioContext = new AudioContextClass({ sampleRate: 24000 });
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 64;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.analyserNode.connect(this.audioContext.destination);
    }
  }

  private startLevelMonitoring() {
    if (this.animFrameId !== null) return;
    const monitor = () => {
      if (this.activeSources.size > 0 && this.analyserNode) {
        const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
        this.analyserNode.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const level = sum / (dataArray.length * 255);
        window.dispatchEvent(new CustomEvent('osone_assistant_voice', { detail: { level } }));
      }
      this.animFrameId = requestAnimationFrame(monitor);
    };
    this.animFrameId = requestAnimationFrame(monitor);
  }

  private stopLevelMonitoring() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
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
      if (pcmData.length === 0) return;

      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 32768.0;
      }
  
      const buffer = this.audioContext.createBuffer(1, floatData.length, 24000);
      buffer.getChannelData(0).set(floatData);
  
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      
      // Apply modulation
      const effectiveRate = Math.max(0.5, Math.min(2.0, this.modulation.pitch * this.modulation.rate));
      source.playbackRate.value = effectiveRate;

      // Anti-pop Gain Envelope Node
      const gainNode = this.audioContext.createGain();

      if (this.modulation.distortion > 0) {
        const distort = this.audioContext.createWaveShaper();
        distort.curve = this.createDistortionCurve(this.modulation.distortion);
        distort.oversample = '4x';
        source.connect(gainNode);
        gainNode.connect(distort);
        distort.connect(this.analyserNode || this.audioContext.destination);
      } else {
        source.connect(gainNode);
        gainNode.connect(this.analyserNode || this.audioContext.destination);
      }
  
      const currentTime = this.audioContext.currentTime;
      // Jitter buffer management: if nextStartTime is behind currentTime or starting fresh, add 50ms buffer
      if (this.nextStartTime < currentTime + 0.02) {
        this.nextStartTime = currentTime + 0.05;
      }
  
      const startTime = this.nextStartTime;
      const adjustedDuration = buffer.duration / effectiveRate;

      // Apply smooth micro ramps (1.5ms) at chunk boundaries to eliminate clicks/pops
      const rampTime = Math.min(0.0015, adjustedDuration / 4);
      gainNode.gain.setValueAtTime(0.001, startTime);
      gainNode.gain.linearRampToValueAtTime(1.0, startTime + rampTime);
      gainNode.gain.setValueAtTime(1.0, Math.max(startTime + rampTime, startTime + adjustedDuration - rampTime));
      gainNode.gain.linearRampToValueAtTime(0.001, startTime + adjustedDuration);

      source.start(startTime);
      this.nextStartTime += adjustedDuration;

      this.activeSources.add(source);
      if (this.activeSources.size === 1) {
        this.onActivityChange?.(true);
        this.startLevelMonitoring();
      }

      source.onended = () => {
        this.activeSources.delete(source);
        if (this.activeSources.size === 0) {
          this.stopLevelMonitoring();
          this.onActivityChange?.(false);
        }
      };
    } catch (err) {
      console.error("Erro ao reproduzir chunk de áudio:", err);
    }
  }

  stop() {
    this.stopLevelMonitoring();
    this.activeSources.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    this.activeSources.clear();
    this.audioContext?.close();
    this.initAudioContext();
    this.nextStartTime = 0;
    this.onActivityChange?.(false);
  }
}
