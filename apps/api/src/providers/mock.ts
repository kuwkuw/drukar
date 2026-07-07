import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GenOptions } from '@drukar/shared';
import { saveStl } from '../mesh/io.js';
import { makeSample, type SampleKind } from '../mesh/samples.js';
import type { GenerationProvider, GenerationResult } from './types.js';

/** Keyword cues so demos/tests can exercise the regenerate-on-failure path on demand. */
function pickSampleKind(prompt: string): SampleKind {
  const p = prompt.toLowerCase();
  if (/\b(broken|bad|impossible|hopeless)\b/.test(p)) return 'broken';
  if (/\b(hole|holed|crack|cracked|damaged)\b/.test(p)) return 'holed';
  return 'clean';
}

export class MockProvider implements GenerationProvider {
  async generate(prompt: string, _options: GenOptions): Promise<GenerationResult> {
    const kind = pickSampleKind(prompt);
    const mesh = makeSample(kind);
    const meshPath = join(tmpdir(), `drukar-mock-${randomUUID()}.stl`);
    await saveStl(meshPath, mesh);
    return { meshPath, format: 'stl' };
  }
}
