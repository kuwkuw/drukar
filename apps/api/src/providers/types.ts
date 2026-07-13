import type { GenOptions, MeshFormat } from '@drukar/shared';

export interface GenerationResult {
  meshPath: string;
  format: MeshFormat;
}

export interface GenerationProvider {
  /** `signal` aborts in-flight work (e.g. the SSE client disconnected) — stop and throw. */
  generate(prompt: string, options: GenOptions, signal?: AbortSignal): Promise<GenerationResult>;
}
