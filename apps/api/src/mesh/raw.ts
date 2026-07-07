import type { MeshStats } from '@drukar/shared';

/** Minimal indexed triangle mesh. Positions are x,y,z triples in millimetres. */
export interface RawMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export type Vec3 = [number, number, number];

export function triCount(mesh: RawMesh): number {
  return mesh.indices.length / 3;
}

export function vertCount(mesh: RawMesh): number {
  return mesh.positions.length / 3;
}

export function getVert(mesh: RawMesh, i: number): Vec3 {
  return [mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!];
}

export function faceVerts(mesh: RawMesh, tri: number): [Vec3, Vec3, Vec3] {
  return [
    getVert(mesh, mesh.indices[tri * 3]!),
    getVert(mesh, mesh.indices[tri * 3 + 1]!),
    getVert(mesh, mesh.indices[tri * 3 + 2]!),
  ];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

/** Unit normal of triangle a-b-c, or null when degenerate. */
export function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 | null {
  const n = cross(sub(b, a), sub(c, a));
  const len = length(n);
  if (len < 1e-12) return null;
  return [n[0] / len, n[1] / len, n[2] / len];
}

export function faceArea(a: Vec3, b: Vec3, c: Vec3): number {
  return length(cross(sub(b, a), sub(c, a))) / 2;
}

export function faceCentroid(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
}

export interface Bbox {
  min: Vec3;
  max: Vec3;
}

export function bbox(mesh: RawMesh): Bbox {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = p[i + a]!;
      if (v < min[a]!) min[a as 0 | 1 | 2] = v;
      if (v > max[a]!) max[a as 0 | 1 | 2] = v;
    }
  }
  return { min, max };
}

export function bboxDims(b: Bbox): Vec3 {
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
}

/** Signed volume via divergence theorem. Negative ⇒ inverted winding. */
export function signedVolume(mesh: RawMesh): number {
  let vol = 0;
  for (let t = 0; t < triCount(mesh); t++) {
    const [a, b, c] = faceVerts(mesh, t);
    vol += dot(a, cross(b, c)) / 6;
  }
  return vol;
}

export function totalArea(mesh: RawMesh): number {
  let area = 0;
  for (let t = 0; t < triCount(mesh); t++) {
    const [a, b, c] = faceVerts(mesh, t);
    area += faceArea(a, b, c);
  }
  return area;
}

export function meshStats(mesh: RawMesh): MeshStats {
  const b = bbox(mesh);
  return {
    vertices: vertCount(mesh),
    triangles: triCount(mesh),
    bboxMm: { min: b.min, max: b.max },
    volumeMm3: Math.abs(signedVolume(mesh)),
  };
}

export function flipWinding(mesh: RawMesh): RawMesh {
  const indices = new Uint32Array(mesh.indices.length);
  for (let t = 0; t < mesh.indices.length; t += 3) {
    indices[t] = mesh.indices[t]!;
    indices[t + 1] = mesh.indices[t + 2]!;
    indices[t + 2] = mesh.indices[t + 1]!;
  }
  return { positions: mesh.positions.slice(), indices };
}

/** Apply a row-major 3x3 matrix to every vertex. */
export function transformMesh(mesh: RawMesh, m: readonly number[]): RawMesh {
  const p = mesh.positions;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!;
    const y = p[i + 1]!;
    const z = p[i + 2]!;
    out[i] = m[0]! * x + m[1]! * y + m[2]! * z;
    out[i + 1] = m[3]! * x + m[4]! * y + m[5]! * z;
    out[i + 2] = m[6]! * x + m[7]! * y + m[8]! * z;
  }
  return { positions: out, indices: mesh.indices.slice() };
}

export function translateMesh(mesh: RawMesh, t: Vec3): RawMesh {
  const p = mesh.positions;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    out[i] = p[i]! + t[0];
    out[i + 1] = p[i + 1]! + t[1];
    out[i + 2] = p[i + 2]! + t[2];
  }
  return { positions: out, indices: mesh.indices.slice() };
}

export function scaleMesh(mesh: RawMesh, s: Vec3): RawMesh {
  const p = mesh.positions;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    out[i] = p[i]! * s[0];
    out[i + 1] = p[i + 1]! * s[1];
    out[i + 2] = p[i + 2]! * s[2];
  }
  return { positions: out, indices: mesh.indices.slice() };
}

/** Row-major rotation matrix from XYZ-order Euler angles in degrees. */
export function rotationMatrixDeg(rx: number, ry: number, rz: number): number[] {
  const r = (d: number) => (d * Math.PI) / 180;
  const [cx, sx] = [Math.cos(r(rx)), Math.sin(r(rx))];
  const [cy, sy] = [Math.cos(r(ry)), Math.sin(r(ry))];
  const [cz, sz] = [Math.cos(r(rz)), Math.sin(r(rz))];
  // Rz * Ry * Rx (apply X first)
  return [
    cz * cy,
    cz * sy * sx - sz * cx,
    cz * sy * cx + sz * sx,
    sz * cy,
    sz * sy * sx + cz * cx,
    sz * sy * cx - cz * sx,
    -sy,
    cy * sx,
    cy * cx,
  ];
}

/**
 * Merge vertices closer than `toleranceMm` and drop triangles that became
 * degenerate (repeated indices or near-zero area).
 */
export function weldVertices(mesh: RawMesh, toleranceMm = 1e-4): RawMesh {
  const inv = 1 / toleranceMm;
  const map = new Map<string, number>();
  const remap = new Uint32Array(vertCount(mesh));
  const newPositions: number[] = [];
  for (let v = 0; v < vertCount(mesh); v++) {
    const x = mesh.positions[v * 3]!;
    const y = mesh.positions[v * 3 + 1]!;
    const z = mesh.positions[v * 3 + 2]!;
    const key = `${Math.round(x * inv)}_${Math.round(y * inv)}_${Math.round(z * inv)}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = newPositions.length / 3;
      map.set(key, idx);
      newPositions.push(x, y, z);
    }
    remap[v] = idx;
  }
  const newIndices: number[] = [];
  for (let t = 0; t < triCount(mesh); t++) {
    const a = remap[mesh.indices[t * 3]!]!;
    const b = remap[mesh.indices[t * 3 + 1]!]!;
    const c = remap[mesh.indices[t * 3 + 2]!]!;
    if (a === b || b === c || a === c) continue;
    newIndices.push(a, b, c);
  }
  const positions = new Float32Array(newPositions);
  const indices = new Uint32Array(newIndices);
  return dropDegenerateFaces({ positions, indices });
}

/** Remove triangles with near-zero area. */
export function dropDegenerateFaces(mesh: RawMesh, minArea = 1e-10): RawMesh {
  const kept: number[] = [];
  for (let t = 0; t < triCount(mesh); t++) {
    const [a, b, c] = faceVerts(mesh, t);
    const ia = mesh.indices[t * 3]!;
    const ib = mesh.indices[t * 3 + 1]!;
    const ic = mesh.indices[t * 3 + 2]!;
    if (ia === ib || ib === ic || ia === ic) continue;
    if (faceArea(a, b, c) < minArea) continue;
    kept.push(ia, ib, ic);
  }
  if (kept.length === mesh.indices.length) return mesh;
  return { positions: mesh.positions, indices: new Uint32Array(kept) };
}
