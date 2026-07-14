import { describe, expect, it } from 'vitest';
import { wallThicknessCheck } from '../src/mesh/checks.js';
import type { RawMesh, Vec3 } from '../src/mesh/raw.js';
import { scaleMesh } from '../src/mesh/raw.js';
import { makeCube } from '../src/mesh/samples.js';

const MIN_WALL = 1.2;
const MAX_THIN_RATIO = 0.05;

/** Append loose triangles (given as vertex coordinate triples) to a mesh. */
function withExtraTriangles(mesh: RawMesh, tris: [Vec3, Vec3, Vec3][]): RawMesh {
  const positions = new Float32Array(mesh.positions.length + tris.length * 9);
  positions.set(mesh.positions);
  const indices = new Uint32Array(mesh.indices.length + tris.length * 3);
  indices.set(mesh.indices);
  let vert = mesh.positions.length / 3;
  let p = mesh.positions.length;
  let i = mesh.indices.length;
  for (const tri of tris) {
    for (const v of tri) {
      positions.set(v, p);
      p += 3;
      indices[i++] = vert++;
    }
  }
  return { positions, indices };
}

/** Concatenate two meshes into one (two shells). */
function merge(a: RawMesh, b: RawMesh): RawMesh {
  const positions = new Float32Array(a.positions.length + b.positions.length);
  positions.set(a.positions);
  positions.set(b.positions, a.positions.length);
  const offset = a.positions.length / 3;
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices);
  for (let k = 0; k < b.indices.length; k++) indices[a.indices.length + k] = b.indices[k]! + offset;
  return { positions, indices };
}

function translated(mesh: RawMesh, [dx, dy, dz]: Vec3): RawMesh {
  const positions = new Float32Array(mesh.positions.length);
  for (let k = 0; k < positions.length; k += 3) {
    positions[k] = mesh.positions[k]! + dx;
    positions[k + 1] = mesh.positions[k + 1]! + dy;
    positions[k + 2] = mesh.positions[k + 2]! + dz;
  }
  return { positions, indices: mesh.indices };
}

describe('wallThicknessCheck', () => {
  it('measures a solid cube at its full extent', () => {
    const check = wallThicknessCheck(makeCube(30), MIN_WALL, MAX_THIN_RATIO);
    expect(check.pass).toBe(true);
    expect(check.metrics['minThicknessMm']).toBeCloseTo(30, 0);
    expect(check.metrics['thinAreaRatio']).toBe(0);
  });

  it('ignores a coincident duplicated face instead of reading ~0mm', () => {
    const cube = makeCube(30);
    // Duplicate the first triangle verbatim: same vertices, same winding, distance ~0 apart.
    const dup = withExtraTriangles(cube, [
      [
        [cube.positions[cube.indices[0]! * 3]!, cube.positions[cube.indices[0]! * 3 + 1]!, cube.positions[cube.indices[0]! * 3 + 2]!],
        [cube.positions[cube.indices[1]! * 3]!, cube.positions[cube.indices[1]! * 3 + 1]!, cube.positions[cube.indices[1]! * 3 + 2]!],
        [cube.positions[cube.indices[2]! * 3]!, cube.positions[cube.indices[2]! * 3 + 1]!, cube.positions[cube.indices[2]! * 3 + 2]!],
      ],
    ]);

    const check = wallThicknessCheck(dup, MIN_WALL, MAX_THIN_RATIO);
    expect(check.pass).toBe(true);
    expect(check.metrics['minThicknessMm']).toBeCloseTo(30, 0);
  });

  it('skips interior junk whose front faces the wall (not an opposing surface)', () => {
    // A quad floating 1mm inside the cube's z=-15 wall, wound so its normal faces that wall.
    // The old first-hit measurement read ~1mm from the whole bottom face; the exit-face rule
    // must shoot through to the real opposite wall instead.
    const cube = makeCube(30);
    const withFin = withExtraTriangles(cube, [
      [
        [-14, -14, -14],
        [14, 14, -14],
        [14, -14, -14],
      ],
      [
        [-14, -14, -14],
        [-14, 14, -14],
        [14, 14, -14],
      ],
    ]);

    const check = wallThicknessCheck(withFin, MIN_WALL, MAX_THIN_RATIO);
    expect(check.pass).toBe(true);
    expect(check.metrics['minThicknessMm'] as number).toBeGreaterThan(25);
    expect(check.metrics['thinAreaRatio']).toBe(0);
  });

  it('passes with a warning when only a small feature is thin (tapering ears, tips)', () => {
    // 30mm cube + a separate 4x4x0.5mm plate: genuinely thin, but a sliver of total area.
    const plate = translated(scaleMesh(makeCube(1), [4, 4, 0.5]), [40, 0, 0]);
    const mesh = merge(makeCube(30), plate);

    const check = wallThicknessCheck(mesh, MIN_WALL, MAX_THIN_RATIO);
    expect(check.pass).toBe(true);
    expect(check.metrics['minThicknessMm']).toBeCloseTo(0.5, 1);
    expect(check.warnings).toHaveLength(1);
    expect(check.warnings[0]).toContain('can be fragile');
  });

  it('still fails when thin faces dominate the surface', () => {
    // 30x30x0.5mm slab: the two dominant faces both measure 0.5mm.
    const slab = scaleMesh(makeCube(1), [30, 30, 0.5]);
    const check = wallThicknessCheck(slab, MIN_WALL, MAX_THIN_RATIO);
    expect(check.pass).toBe(false);
    expect(check.metrics['thinAreaRatio'] as number).toBeGreaterThan(0.9);
  });
});
