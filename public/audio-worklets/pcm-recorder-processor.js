// Substitui o antigo ScriptProcessorNode (depreciado) na captura de áudio do microfone para o
// Gemini Live. Roda em sua própria thread de áudio (AudioWorkletGlobalScope) — sem acesso a
// window/DOM, então só acumula amostras e repassa o bloco pronto para a thread principal via
// port.postMessage, onde o RMS e a conversão para PCM16/base64 acontecem (audio.ts).
class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkSize = 4096; // mesmo tamanho de bloco usado pelo antigo createScriptProcessor(4096, 1, 1)
    this.buffer = new Float32Array(this.chunkSize);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (channel && channel.length > 0) {
      let offset = 0;
      while (offset < channel.length) {
        const spaceLeft = this.chunkSize - this.bufferIndex;
        const toCopy = Math.min(spaceLeft, channel.length - offset);
        this.buffer.set(channel.subarray(offset, offset + toCopy), this.bufferIndex);
        this.bufferIndex += toCopy;
        offset += toCopy;

        if (this.bufferIndex >= this.chunkSize) {
          this.port.postMessage(this.buffer.slice(0, this.chunkSize));
          this.bufferIndex = 0;
        }
      }
    }
    // Mantém o processor vivo enquanto o nó estiver conectado.
    return true;
  }
}

registerProcessor('pcm-recorder-processor', PCMRecorderProcessor);
