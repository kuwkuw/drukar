import { BoxGeometry, CylinderGeometry, TorusKnotGeometry } from 'three';
import type { RawMesh } from './raw.js';
import { scaleMesh, transformMesh, rotationMatrixDeg } from './raw.js';
import { fromBufferGeometry } from './three.js';

/**
 * Programmatic sample meshes, built with three.js primitives. Used by the
 * MockProvider and by tests so the whole product runs offline with zero keys.
 */

/** Clean, watertight, prints fine: a ~40mm torus knot. */
export function makeCleanSample(): RawMesh {
  const geometry = new TorusKnotGeometry(14, 4.5, 128, 24);
  // three's torus knot is Z-towards-viewer; lay it down for a sane print pose.
  const mesh = fromBufferGeometry(geometry);
  return transformMesh(mesh, rotationMatrixDeg(90, 0, 0));
}

/** Plain 30mm cube — trivially printable, useful in tests. */
export function makeCube(sizeMm = 30): RawMesh {
  return scaleMesh(fromBufferGeometry(new BoxGeometry(1, 1, 1)), [sizeMm, sizeMm, sizeMm]);
}

/** Cube with one triangle removed: a small hole, fixable by light repair. */
export function makeHoledSample(sizeMm = 30): RawMesh {
  const cube = makeCube(sizeMm);
  // Drop the last triangle to open a 3-vertex hole.
  return { positions: cube.positions, indices: cube.indices.slice(0, cube.indices.length - 3) };
}

/**
 * Open-ended cylinder with large boundary loops (96 verts each). Boundary
 * loops above the light-repair fill limit ⇒ not repairable ⇒ the agent must
 * regenerate. Stands in for hopeless generator output.
 */
export function makeBrokenSample(): RawMesh {
  const geometry = new CylinderGeometry(15, 15, 40, 96, 1, true);
  return fromBufferGeometry(geometry);
}

export type SampleKind = 'clean' | 'holed' | 'broken';

export function makeSample(kind: SampleKind): RawMesh {
  switch (kind) {
    case 'clean':
      return makeCleanSample();
    case 'holed':
      return makeHoledSample();
    case 'broken':
      return makeBrokenSample();
  }
}
