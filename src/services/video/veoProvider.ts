import { VideoProvider, VideoGenerationParams, VideoGenerationResult } from './types';

export class VeoVideoProvider implements VideoProvider {
  id = 'veo-lite';
  name = 'Google Veo (veo-3.1-lite)';
  modelName = 'veo-3.1-lite';
  estimatedCostPerSecondUsd = 0.03;

  async generateVideo(
    params: VideoGenerationParams, 
    apiKey?: string, 
    confirmed?: boolean
  ): Promise<VideoGenerationResult> {
    if (confirmed !== true) {
      throw new Error("TRAVA DE SEGURANÇA: A geração de vídeo requer confirmação manual antes de ser disparada.");
    }

    const response = await fetch('/api/audiovisual/generate-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        confirmed: true,
        mode: params.mode,
        prompt: params.prompt,
        motionPrompt: params.motionPrompt,
        inputImageUrl: params.inputImageUrl,
        durationSeconds: params.durationSeconds || 5,
        provider: this.id,
        clientApiKey: apiKey
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erro HTTP ${response.status} ao solicitar vídeo.`);
    }

    const data = await response.json();
    if (!data.success || !data.item) {
      throw new Error(data.error || "Resposta do provedor de vídeo inválida.");
    }

    const item = data.item;
    return {
      id: item.id,
      fileUrl: item.fileUrl,
      filename: item.filename,
      durationSeconds: item.durationSeconds || params.durationSeconds || 5,
      prompt: item.prompt,
      createdAt: item.createdAt,
      providerName: item.providerName || this.name,
      estimatedCostUsd: item.estimatedCostUsd || ((params.durationSeconds || 5) * this.estimatedCostPerSecondUsd)
    };
  }
}
