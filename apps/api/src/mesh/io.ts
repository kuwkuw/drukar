import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { MeshFormat } from '@drukar/shared';
import type { RawMesh } from './raw.js';
import { readStl, writeBinaryStl } from './stl.js';
import { readObj } from './obj.js';
import { readGlb, writeGlb } from './glb.js';

export function formatFromPath(path: string): MeshFormat {
  const ext = extname(path).toLowerCase();
  if (ext === '.stl') return 'stl';
  if (ext === '.obj') return 'obj';
  if (ext === '.glb' || ext === '.gltf') return 'glb';
  throw new Error(`Unsupported mesh format: ${ext || '(none)'} — expected .stl, .obj or .glb`);
}

export async function loadMesh(path: string): Promise<RawMesh> {
  const format = formatFromPath(path);
  const data = await readFile(path);
  switch (format) {
    case 'stl':
      return readStl(data);
    case 'obj':
      return readObj(data.toString('utf8'));
    case 'glb':
      return readGlb(new Uint8Array(data));
  }
}

export async function saveStl(path: string, mesh: RawMesh): Promise<void> {
  await writeFile(path, writeBinaryStl(mesh));
}

export async function saveGlb(path: string, mesh: RawMesh): Promise<void> {
  await writeFile(path, await writeGlb(mesh));
}
