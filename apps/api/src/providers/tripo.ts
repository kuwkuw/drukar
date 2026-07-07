import type { GenOptions } from '@drukar/shared';
import type { GenerationProvider, GenerationResult } from './types.js';

// TODO(tripo): implement against the Tripo3D platform API (https://platform.tripo3d.ai) once
// TRIPO_API_KEY is available to verify request/response shapes against the live service.
export class TripoProvider implements GenerationProvider {
  async generate(_prompt: string, _options: GenOptions): Promise<GenerationResult> {
    throw new Error('Tripo3D provider is not yet implemented — set DRUKAR_PROVIDER=mock');
  }
}
