import type { GenerationProviderId } from '@drukar/shared';
import { MockProvider } from './mock.js';
import { TripoProvider } from './tripo.js';
import type { GenerationProvider } from './types.js';

export function createProvider(id: GenerationProviderId): GenerationProvider {
  switch (id) {
    case 'mock':
      return new MockProvider();
    case 'tripo':
      return new TripoProvider();
  }
}

export * from './types.js';
