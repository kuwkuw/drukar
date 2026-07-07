import { BufferAttribute, BufferGeometry } from 'three';
import type { RawMesh } from './raw.js';
import { weldVertices } from './raw.js';

export function toBufferGeometry(mesh: RawMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions.slice(), 3));
  geometry.setIndex(new BufferAttribute(mesh.indices.slice(), 1));
  return geometry;
}

/**
 * Convert a three.js geometry to RawMesh. three primitives duplicate vertices
 * along normal/uv seams, so positions are welded to recover shared topology.
 */
export function fromBufferGeometry(geometry: BufferGeometry, weldToleranceMm = 1e-4): RawMesh {
  const pos = geometry.getAttribute('position');
  const positions = new Float32Array(pos.array as ArrayLike<number>);
  const index = geometry.getIndex();
  let indices: Uint32Array;
  if (index) {
    indices = new Uint32Array(index.array as ArrayLike<number>);
  } else {
    indices = new Uint32Array(pos.count);
    for (let i = 0; i < pos.count; i++) indices[i] = i;
  }
  return weldVertices({ positions, indices }, weldToleranceMm);
}
