export class ElevenLabsQueuePlayer {
  private audioCtx: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  private queue: AudioBuffer[] = [];
  private onStateChange: (speaking: boolean) => void;
  private activeSources: any[] = [];
  public onQueueDrained: (() => void) | null = null;
  public isStreamFinished: boolean = false;

  constructor(onStateChange: (speaking: boolean) => void) {
    this.onStateChange = onStateChange;
  }

  public resetStreamState() {
    this.isStreamFinished = false;
  }

  public markStreamFinished() {
    this.isStreamFinished = true;
    if (!this.isPlaying && this.activeSources.length === 0 && this.queue.length === 0) {
      setTimeout(() => {
        if (!this.isPlaying && this.activeSources.length === 0 && this.queue.length === 0) {
          if (this.onQueueDrained) {
            this.onQueueDrained();
          }
        }
      }, 350);
    }
  }

  private async initAudio() {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (_) {}
    }
  }

  public async addChunk(base64Data: string) {
    await this.initAudio();
    if (!this.audioCtx) return;

    try {
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      if (len === 0) return;

      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      let audioBuffer: AudioBuffer | null = null;

      if (len % 2 === 0) {
        try {
          const int16Array = new Int16Array(bytes.buffer);
          const float32Array = new Float32Array(int16Array.length);
          for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
          }
          audioBuffer = this.audioCtx.createBuffer(1, float32Array.length, 24000);
          audioBuffer.getChannelData(0).set(float32Array);
        } catch (_) {}
      }

      if (!audioBuffer) {
        try {
          audioBuffer = await this.audioCtx.decodeAudioData(bytes.buffer.slice(0));
        } catch (_) {}
      }

      if (audioBuffer) {
        this.queue.push(audioBuffer);
        this.processQueue();
      }
    } catch (e) {
      console.warn("Soft warning: failed to decode an individual audio chunk:", e);
    }
  }

  private processQueue() {
    if (!this.audioCtx) return;

    const currentTime = this.audioCtx.currentTime;
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime;
    }

    while (this.queue.length > 0) {
      const chunk = this.queue.shift();
      if (!chunk) break;

      const source = this.audioCtx.createBufferSource();
      source.buffer = chunk;
      source.connect(this.audioCtx.destination);
      this.activeSources.push(source);

      source.start(this.nextPlayTime);
      this.nextPlayTime += chunk.duration;
      this.isPlaying = true;
      this.onStateChange(true);

      source.onended = () => {
        this.activeSources = this.activeSources.filter(s => s !== source);
        if (this.activeSources.length === 0 && this.queue.length === 0) {
          setTimeout(() => {
            if (this.activeSources.length === 0 && this.queue.length === 0) {
              this.isPlaying = false;
              this.onStateChange(false);
              if (this.isStreamFinished && this.onQueueDrained) {
                this.onQueueDrained();
              }
            }
          }, 350);
        }
      };
    }
  }

  public stop() {
    this.queue = [];
    this.isPlaying = false;
    this.isStreamFinished = false;
    this.nextPlayTime = 0;
    
    this.activeSources.forEach(s => {
      try { s.stop(); } catch (_) {}
    });
    this.activeSources = [];

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch (_) {}
      this.audioCtx = null;
    }
    this.onStateChange(false);
  }
}
