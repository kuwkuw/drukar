import type { RawMesh } from './raw.js';
import { bbox, faceArea, faceNormal, faceVerts, rotationMatrixDeg, transformMesh, triCount } from './raw.js';

const CANDIDATE_ANGLES_DEG = [0, 90, 180, 270];
/** Faces whose normal.z is within this of zero are treated as vertical, never an overhang. */
const OVERHANG_NORMAL_EPS = 1e-6;
/** Faces whose vertices sit within this of the lowest point rest on the bed, not "floating". */
const BED_EPSILON_MM = 1e-3;

export interface OverhangMetrics {
  /** Area-weighted share of the surface that needs support (0..1). */
  overhangRatio: number;
  overhangFaceIndices: number[];
}

/** Angle of a face's plane from vertical: 0° = vertical wall, 90° = horizontal. */
export function tiltFromVerticalDeg(normalZ: number): number {
  const angleFromUp = (Math.acos(Math.min(1, Math.max(-1, normalZ))) * 180) / Math.PI;
  return Math.abs(90 - angleFromUp);
}

/**
 * Area-weighted ratio of downward-facing surface that is tilted more than
 * `overhangDeg` from vertical and doesn't rest directly on the bed (the
 * bed itself supports whatever touches it — that's not an overhang).
 */
export function computeOverhangs(mesh: RawMesh, overhangDeg: number): OverhangMetrics {
  const { min } = bbox(mesh);
  let totalArea = 0;
  let overhangArea = 0;
  const overhangFaceIndices: number[] = [];
  for (let t = 0; t < triCount(mesh); t++) {
    const [a, b, c] = faceVerts(mesh, t);
    const area = faceArea(a, b, c);
    totalArea += area;
    const n = faceNormal(a, b, c);
    if (!n || n[2] >= -OVERHANG_NORMAL_EPS) continue; // not downward-facing
    const onBed =
      a[2] - min[2] <= BED_EPSILON_MM &&
      b[2] - min[2] <= BED_EPSILON_MM &&
      c[2] - min[2] <= BED_EPSILON_MM;
    if (onBed) continue;
    if (tiltFromVerticalDeg(n[2]) > overhangDeg) {
      overhangArea += area;
      overhangFaceIndices.push(t);
    }
  }
  return { overhangRatio: totalArea > 0 ? overhangArea / totalArea : 0, overhangFaceIndices };
}

/** Surface area of faces resting on the bed (lowest point of the bbox). */
export function bedContactAreaMm2(mesh: RawMesh): number {
  const { min } = bbox(mesh);
  let area = 0;
  for (let t = 0; t < triCount(mesh); t++) {
    const [a, b, c] = faceVerts(mesh, t);
    if (
      a[2] - min[2] <= BED_EPSILON_MM &&
      b[2] - min[2] <= BED_EPSILON_MM &&
      c[2] - min[2] <= BED_EPSILON_MM
    ) {
      area += faceArea(a, b, c);
    }
  }
  return area;
}

export interface AutoOrientResult {
  mesh: RawMesh;
  rotationDeg: [number, number, number];
  overhangRatio: number;
  bedContactAreaMm2: number;
}

/**
 * Search the 24 axis-aligned cube rotations for the build pose that
 * minimizes area-weighted overhang, breaking ties by maximum bed contact
 * area. A full continuous search is out of scope for MVP — generated
 * meshes are typically already close to a sane pose.
 */
export function autoOrient(mesh: RawMesh, overhangDeg: number): AutoOrientResult {
  let best: AutoOrientResult | null = null;
  for (const rx of CANDIDATE_ANGLES_DEG) {
    for (const ry of CANDIDATE_ANGLES_DEG) {
      for (const rz of CANDIDATE_ANGLES_DEG) {
        const candidate = transformMesh(mesh, rotationMatrixDeg(rx, ry, rz));
        const { overhangRatio } = computeOverhangs(candidate, overhangDeg);
        const contact = bedContactAreaMm2(candidate);
        const better =
          !best ||
          overhangRatio < best.overhangRatio - 1e-9 ||
          (Math.abs(overhangRatio - best.overhangRatio) <= 1e-9 && contact > best.bedContactAreaMm2);
        if (better) {
          best = { mesh: candidate, rotationDeg: [rx, ry, rz], overhangRatio, bedContactAreaMm2: contact };
        }
      }
    }
  }
  return best!;
}
