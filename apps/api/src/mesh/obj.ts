import type { RawMesh } from './raw.js';
import { dropDegenerateFaces } from './raw.js';

/** Minimal Wavefront OBJ reader: `v` and `f` records, fan-triangulated. */
export function readObj(text: string): RawMesh {
  const positions: number[] = [];
  const indices: number[] = [];

  const resolveIndex = (token: string): number => {
    const raw = Number(token.split('/')[0]);
    const vertCount = positions.length / 3;
    return raw < 0 ? vertCount + raw : raw - 1;
  };

  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v' && parts.length >= 4) {
      positions.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    } else if (parts[0] === 'f' && parts.length >= 4) {
      const face = parts.slice(1).map(resolveIndex);
      for (let i = 1; i < face.length - 1; i++) {
        indices.push(face[0]!, face[i]!, face[i + 1]!);
      }
    }
  }
  return dropDegenerateFaces({
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  });
}
