import type { GenOptions, MeshFormat } from '@drukar/shared';

export interface GenerationResult {
  meshPath: string;
  format: MeshFormat;
}

export interface GenerationProvider {
  generate(prompt: string, options: GenOptions): Promise<GenerationResult>;
}
