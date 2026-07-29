export interface VideoGenerationParams {
  mode: 'text-to-video' | 'image-to-video';
  prompt: string;
  motionPrompt?: string;
  inputImageUrl?: string;
  durationSeconds?: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

export interface VideoGenerationResult {
  id: string;
  fileUrl: string;
  filename: string;
  durationSeconds: number;
  prompt: string;
  createdAt: number;
  providerName: string;
  estimatedCostUsd: number;
}

export interface VideoProvider {
  id: string;
  name: string;
  modelName: string;
  estimatedCostPerSecondUsd: number;
  /**
   * Generates video with explicit confirmation flag for cost safety.
   */
  generateVideo(
    params: VideoGenerationParams, 
    apiKey?: string, 
    confirmed?: boolean
  ): Promise<VideoGenerationResult>;
}
