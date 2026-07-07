import { DoubleSide, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { CheckResult, MeshRegion } from '@drukar/shared';
import type { RawMesh } from './raw.js';
import { bbox, bboxDims, faceCentroid, faceNormal, faceVerts, triCount } from './raw.js';
import type { EdgeTopology } from './topology.js';
import { toBufferGeometry } from './three.js';
import { computeOverhangs } from './orient.js';

const MAX_REGIONS = 20;
/** Nudge the ray origin off the surface so it doesn't immediately self-intersect. */
const RAY_EPS_MM = 1e-3;

export function manifoldCheck(
  topology: EdgeTopology,
  orientable: boolean,
  signedVolumeMm3: number,
): CheckResult {
  const watertight = topology.boundaryEdgeCount === 0;
  const manifold = watertight && topology.nonManifoldEdgeCount === 0 && orientable;
  const pass = manifold && signedVolumeMm3 > 0;
  const warnings: string[] = [];
  if (!watertight) {
    warnings.push(
      `${topology.boundaryLoops.length} open boundary loop(s) (${topology.boundaryEdgeCount} boundary edge(s)).`,
    );
  }
  if (topology.nonManifoldEdgeCount > 0) {
    warnings.push(`${topology.nonManifoldEdgeCount} non-manifold edge(s).`);
  }
  if (!orientable) {
    warnings.push('Mesh has a non-orientable region; winding could not be made fully consistent.');
  }
  if (manifold && signedVolumeMm3 <= 0) {
    warnings.push('Mesh encloses zero or negative volume.');
  }
  return {
    id: 'manifold',
    label: 'Manifold & watertight',
    pass,
    metrics: {
      boundaryEdges: topology.boundaryEdgeCount,
      nonManifoldEdges: topology.nonManifoldEdgeCount,
      boundaryLoops: topology.boundaryLoops.length,
      orientable,
    },
    details: pass
      ? 'Mesh is watertight, manifold and consistently oriented.'
      : 'Mesh has topology issues that affect printability.',
    warnings,
  };
}

/**
 * Minimum wall thickness, measured by casting a ray from each face centroid
 * along its inward normal and taking the distance to the nearest opposing
 * surface — the standard "shoot-through" thickness estimate.
 */
export function wallThicknessCheck(mesh: RawMesh, minWallMm: number): CheckResult {
  const tris = triCount(mesh);
  if (tris === 0) {
    return {
      id: 'wall_thickness',
      label: 'Minimum wall thickness',
      pass: false,
      metrics: {},
      details: 'Mesh has no triangles.',
      warnings: [],
    };
  }

  const bvh = new MeshBVH(toBufferGeometry(mesh));
  let minThicknessMm = Infinity;
  const thin: { region: MeshRegion; thicknessMm: number }[] = [];

  for (let t = 0; t < tris; t++) {
    const [a, b, c] = faceVerts(mesh, t);
    const n = faceNormal(a, b, c);
    if (!n) continue;
    const centroid = faceCentroid(a, b, c);
    const origin = new Vector3(
      centroid[0] - n[0] * RAY_EPS_MM,
      centroid[1] - n[1] * RAY_EPS_MM,
      centroid[2] - n[2] * RAY_EPS_MM,
    );
    const direction = new Vector3(-n[0], -n[1], -n[2]);
    const hit = bvh.raycastFirst(new Ray(origin, direction), DoubleSide);
    if (!hit) continue;
    const thicknessMm = hit.distance;
    if (thicknessMm < minThicknessMm) minThicknessMm = thicknessMm;
    if (thicknessMm < minWallMm) {
      thin.push({ region: { location: centroid, faceIndices: [t], value: thicknessMm }, thicknessMm });
    }
  }

  const measured = Number.isFinite(minThicknessMm);
  thin.sort((x, y) => x.thicknessMm - y.thicknessMm);
  const regions = thin.slice(0, MAX_REGIONS).map((x) => x.region);
  const pass = measured ? minThicknessMm >= minWallMm : true; // open mesh: the manifold check owns that failure
  const warnings: string[] = [];
  if (!measured) warnings.push('Could not measure wall thickness (no opposing surface found for any face).');

  return {
    id: 'wall_thickness',
    label: 'Minimum wall thickness',
    pass,
    metrics: {
      minThicknessMm: measured ? Number(minThicknessMm.toFixed(3)) : -1,
      thresholdMm: minWallMm,
      thinFaceCount: thin.length,
    },
    details: measured
      ? `Thinnest measured wall is ${minThicknessMm.toFixed(2)}mm (minimum ${minWallMm}mm).`
      : 'No opposing surfaces detected to measure wall thickness.',
    warnings,
    regions: regions.length > 0 ? regions : undefined,
  };
}

export function overhangsCheck(mesh: RawMesh, overhangDeg: number, overhangMaxRatio: number): CheckResult {
  const { overhangRatio, overhangFaceIndices } = computeOverhangs(mesh, overhangDeg);
  const pass = overhangRatio <= overhangMaxRatio;
  const regions: MeshRegion[] = overhangFaceIndices.slice(0, MAX_REGIONS).map((t) => {
    const [a, b, c] = faceVerts(mesh, t);
    return { location: faceCentroid(a, b, c), faceIndices: [t] };
  });
  return {
    id: 'overhangs',
    label: 'Unsupported overhangs',
    pass,
    metrics: {
      overhangAreaRatio: Number(overhangRatio.toFixed(3)),
      maxRatio: overhangMaxRatio,
      overhangFaceCount: overhangFaceIndices.length,
      thresholdDeg: overhangDeg,
    },
    details: pass
      ? `${(overhangRatio * 100).toFixed(1)}% of surface area needs support (limit ${(overhangMaxRatio * 100).toFixed(0)}%).`
      : `${(overhangRatio * 100).toFixed(1)}% of surface area needs support, above the ${(overhangMaxRatio * 100).toFixed(0)}% limit.`,
    warnings: [],
    regions: regions.length > 0 ? regions : undefined,
  };
}

export function buildVolumeCheck(mesh: RawMesh, buildVolumeMm: [number, number, number]): CheckResult {
  const dims = bboxDims(bbox(mesh));
  const [w, d, h] = buildVolumeMm;
  const fits = dims[0] <= w && dims[1] <= d && dims[2] <= h;
  const dimsText = `${dims[0].toFixed(1)}x${dims[1].toFixed(1)}x${dims[2].toFixed(1)}mm`;
  return {
    id: 'build_volume',
    label: 'Build volume',
    pass: fits,
    metrics: {
      xMm: Number(dims[0].toFixed(2)),
      yMm: Number(dims[1].toFixed(2)),
      zMm: Number(dims[2].toFixed(2)),
      buildVolumeMm: `${w}x${d}x${h}`,
    },
    details: fits
      ? `Model is ${dimsText}, fits the ${w}x${d}x${h}mm build volume.`
      : `Model is ${dimsText}, exceeds the ${w}x${d}x${h}mm build volume.`,
    warnings: [],
  };
}
