import type { GenerationProviderId } from '@drukar/shared';
import { HfSpaceProvider } from './hf.js';
import { MockProvider } from './mock.js';
import { TripoProvider } from './tripo.js';
import type { GenerationProvider } from './types.js';

export interface ProviderOptions {
  tripoApiKey?: string | undefined;
  tripoModelVersion?: string | undefined;
  hfSpaceUrl?: string | undefined;
  hfToken?: string | undefined;
}

export function createProvider(id: GenerationProviderId, options: ProviderOptions = {}): GenerationProvider {
  switch (id) {
    case 'mock':
      return new MockProvider();
    case 'tripo':
      return new TripoProvider({ apiKey: options.tripoApiKey, modelVersion: options.tripoModelVersion });
    case 'hf':
      return new HfSpaceProvider({ spaceUrl: options.hfSpaceUrl, hfToken: options.hfToken });
  }
}

export * from './types.js';
