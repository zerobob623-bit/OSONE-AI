import { VideoProvider } from './types';
import { VeoVideoProvider } from './veoProvider';

export * from './types';
export * from './veoProvider';

// Registry of available video providers
export const registeredVideoProviders: Record<string, VideoProvider> = {
  'veo-lite': new VeoVideoProvider()
};

// Default provider selection
export const defaultVideoProvider = registeredVideoProviders['veo-lite'];

export function getVideoProvider(providerId?: string): VideoProvider {
  if (providerId && registeredVideoProviders[providerId]) {
    return registeredVideoProviders[providerId];
  }
  return defaultVideoProvider;
}
