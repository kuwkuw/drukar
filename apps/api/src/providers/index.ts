import type { GenerationProviderId } from '@drukar/shared';
import { MockProvider } from './mock.js';
import { TripoProvider } from './tripo.js';
import type { GenerationProvider } from './types.js';

export interface ProviderOptions {
  tripoApiKey?: string;
  tripoModelVersion?: string;
}

export function createProvider(id: GenerationProviderId, options: ProviderOptions = {}): GenerationProvider {
  switch (id) {
    case 'mock':
      return new MockProvider();
    case 'tripo':
      return new TripoProvider({ apiKey: options.tripoApiKey, modelVersion: options.tripoModelVersion });
  }
}

export * from './types.js';
