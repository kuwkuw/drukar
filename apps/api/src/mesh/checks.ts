import { DoubleSide, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { CheckResult, MeshRegion } from '@drukar/shared';
import type { RawMesh, Vec3 } from './raw.js';
import { bbox, bboxDims, dot, faceArea, faceCentroid, faceNormal, faceVerts, triCount } from './raw.js';
import type { EdgeTopology } from './topology.js';
import { toBufferGeometry } from './three.js';
import { computeOverhangs } from './orient.js';

const MAX_REGIONS = 20;
/** Nudge the ray origin off the surface so it doesn't immediately self-intersect. */
const RAY_EPS_MM = 1e-3;
/** Hits closer than this are coincident-surface artifacts (doubled faces), not walls. */
const MIN_MEASURABLE_WALL_MM = 0.01;

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
 * Wall thickness, measured by casting a ray from each face centroid along its
 * inward normal to the surface where the ray *exits* the solid (a back-facing
 * hit). Front-facing hits are interior junk (doubled shells, floating fins) and
 * near-coincident hits are duplicated-surface artifacts; both are skipped, so
 * neither can zero the measurement.
 *
 * Pass/fail is decided by the *area share* of thin faces, not the absolute
 * minimum: tapering features (ear tips, sharp creases) legitimately measure
 * near zero at their rims yet print fine, so the mesh fails only when faces
 * thinner than `minWallMm` cover more than `thinAreaMaxRatio` of its surface.
 */
export function wallThicknessCheck(mesh: RawMesh, minWallMm: number, thinAreaMaxRatio: number): CheckResult {
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
  let totalAreaMm2 = 0;
  let thinAreaMm2 = 0;
  const thin: { region: MeshRegion; thicknessMm: number }[] = [];

  for (let t = 0; t < tris; t++) {
    const [a, b, c] = faceVerts(mesh, t);
    const n = faceNormal(a, b, c);
    if (!n) continue;
    const areaMm2 = faceArea(a, b, c);
    totalAreaMm2 += areaMm2;

    const centroid = faceCentroid(a, b, c);
    const inward: Vec3 = [-n[0], -n[1], -n[2]];
    const origin = new Vector3(
      centroid[0] + inward[0] * RAY_EPS_MM,
      centroid[1] + inward[1] * RAY_EPS_MM,
      centroid[2] + inward[2] * RAY_EPS_MM,
    );
    const hits = bvh
      .raycast(new Ray(origin, new Vector3(...inward)), DoubleSide)
      .sort((h1, h2) => h1.distance - h2.distance);

    let thicknessMm: number | undefined;
    for (const hit of hits) {
      if (hit.distance < MIN_MEASURABLE_WALL_MM) continue; // coincident-surface artifact
      if (hit.faceIndex != null) {
        const hitNormal = faceNormal(...faceVerts(mesh, hit.faceIndex));
        // Front-facing hit: the ray runs into another outside, not out through a wall.
        if (hitNormal && dot(hitNormal, inward) <= 0) continue;
      }
      thicknessMm = hit.distance;
      break;
    }
    if (thicknessMm === undefined) continue;

    if (thicknessMm < minThicknessMm) minThicknessMm = thicknessMm;
    if (thicknessMm < minWallMm) {
      thinAreaMm2 += areaMm2;
      thin.push({ region: { location: centroid, faceIndices: [t], value: thicknessMm }, thicknessMm });
    }
  }

  const measured = Number.isFinite(minThicknessMm);
  const thinAreaRatio = totalAreaMm2 > 0 ? thinAreaMm2 / totalAreaMm2 : 0;
  thin.sort((x, y) => x.thicknessMm - y.thicknessMm);
  const regions = thin.slice(0, MAX_REGIONS).map((x) => x.region);
  const pass = measured ? thinAreaRatio <= thinAreaMaxRatio : true; // open mesh: the manifold check owns that failure
  const thinPct = (thinAreaRatio * 100).toFixed(1);
  const limitPct = (thinAreaMaxRatio * 100).toFixed(0);

  const warnings: string[] = [];
  if (!measured) warnings.push('Could not measure wall thickness (no opposing surface found for any face).');
  if (measured && pass && thin.length > 0) {
    warnings.push(
      `${thinPct}% of the surface measures under ${minWallMm}mm (thinnest ${minThicknessMm.toFixed(2)}mm) — ` +
        'tapering tips and edges usually print, but can be fragile.',
    );
  }

  return {
    id: 'wall_thickness',
    label: 'Minimum wall thickness',
    pass,
    metrics: {
      minThicknessMm: measured ? Number(minThicknessMm.toFixed(3)) : -1,
      thresholdMm: minWallMm,
      thinFaceCount: thin.length,
      thinAreaRatio: Number(thinAreaRatio.toFixed(4)),
      thinAreaMaxRatio,
    },
    details: measured
      ? pass
        ? `Thinnest measured wall is ${minThicknessMm.toFixed(2)}mm; ${thinPct}% of the surface is under the ${minWallMm}mm minimum (limit ${limitPct}%).`
        : `${thinPct}% of the surface is thinner than ${minWallMm}mm, above the ${limitPct}% limit (thinnest ${minThicknessMm.toFixed(2)}mm).`
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
