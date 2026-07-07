import type { AppliedFix, GenOptions, PrintabilityReport } from '@drukar/shared';
import type { PrintabilityConfig } from '../config.js';
import type { RawMesh } from './raw.js';
import { flipWinding, meshStats, scaleMesh, signedVolume, triCount, vertCount, weldVertices } from './raw.js';
import { analyzeEdges, dropDanglingFaces, fillHoles, orientConsistently } from './topology.js';
import { autoOrient } from './orient.js';
import { buildVolumeCheck, manifoldCheck, overhangsCheck, wallThicknessCheck } from './checks.js';

/** Boundary loops with more vertices than this are left open — too risky to fan-fill cheaply. */
const MAX_FILL_LOOP_VERTS = 24;

export interface PipelineResult {
  mesh: RawMesh;
  report: PrintabilityReport;
}

/**
 * Validate → light repair → auto-orient → validate again. Mutates nothing;
 * returns the finished mesh alongside the report that describes it.
 */
export function runPrintabilityPipeline(
  inputMesh: RawMesh,
  options: GenOptions,
  config: PrintabilityConfig,
): PipelineResult {
  const appliedFixes: AppliedFix[] = [];
  const warnings: string[] = [];

  // 1. Normalize: weld coincident vertices, drop degenerate faces.
  const preWeldVerts = vertCount(inputMesh);
  const preWeldTris = triCount(inputMesh);
  let mesh = weldVertices(inputMesh);
  if (vertCount(mesh) !== preWeldVerts) {
    appliedFixes.push({
      kind: 'merge_vertices',
      description: `merged ${preWeldVerts - vertCount(mesh)} coincident vertex/vertices`,
    });
  }
  if (triCount(mesh) !== preWeldTris) {
    appliedFixes.push({
      kind: 'drop_degenerate_faces',
      description: `dropped ${preWeldTris - triCount(mesh)} degenerate triangle(s)`,
    });
  }

  // 2. Remove dangling "fin" triangles that would otherwise masquerade as boundary.
  const preDangling = triCount(mesh);
  mesh = dropDanglingFaces(mesh);
  if (triCount(mesh) !== preDangling) {
    appliedFixes.push({
      kind: 'drop_degenerate_faces',
      description: `dropped ${preDangling - triCount(mesh)} dangling triangle(s)`,
    });
  }

  // 3. Make winding consistent within each shell.
  const consistency = orientConsistently(mesh);
  mesh = consistency.mesh;
  if (consistency.flippedFaces > 0) {
    appliedFixes.push({
      kind: 'fix_winding',
      description: `realigned winding on ${consistency.flippedFaces} face(s)`,
    });
  }
  if (!consistency.orientable) {
    warnings.push('Mesh has a non-orientable region; winding could not be made fully consistent.');
  }

  // 4. A globally inverted mesh has negative signed volume; flip it outright.
  let volume = signedVolume(mesh);
  if (volume < 0) {
    mesh = flipWinding(mesh);
    volume = signedVolume(mesh);
    appliedFixes.push({ kind: 'fix_winding', description: 'flipped inverted mesh (normals pointed inward)' });
  }

  // 5. Decide repairability from topology, then fill what's safe to fill.
  const topology = analyzeEdges(mesh);
  const repairable =
    topology.nonManifoldEdgeCount === 0 &&
    topology.boundaryLoops.every((loop) => loop.length <= MAX_FILL_LOOP_VERTS);

  if (topology.boundaryLoops.length > 0) {
    if (repairable) {
      const fill = fillHoles(mesh, MAX_FILL_LOOP_VERTS);
      mesh = fill.mesh;
      if (fill.filled > 0) {
        appliedFixes.push({ kind: 'fill_holes', description: `filled ${fill.filled} hole(s)` });
      }
    } else {
      const oversized = topology.boundaryLoops.filter((loop) => loop.length > MAX_FILL_LOOP_VERTS).length;
      warnings.push(
        `${oversized} hole(s) exceed the ${MAX_FILL_LOOP_VERTS}-vertex light-repair limit and were left open.`,
      );
    }
  }
  if (topology.nonManifoldEdgeCount > 0) {
    warnings.push(`${topology.nonManifoldEdgeCount} non-manifold edge(s) cannot be safely repaired.`);
  }
  // Re-analyze: fillHoles (if it ran) closed loops, so the manifold check must
  // see post-fill topology rather than the pre-fill snapshot above.
  const finalTopology = topology.boundaryLoops.length > 0 ? analyzeEdges(mesh) : topology;

  // 6. Rescale to the user's target dimensions, if given. Uniform scale only —
  // stretching a generated shape non-uniformly distorts it more than it helps,
  // so unset axes keep the generator's proportions and set axes are averaged
  // into a single factor.
  const target = options.targetDimensionsMm;
  if (target) {
    const dims = meshStats(mesh).bboxMm;
    const currentDims: [number, number, number] = [
      dims.max[0] - dims.min[0],
      dims.max[1] - dims.min[1],
      dims.max[2] - dims.min[2],
    ];
    const ratios: number[] = [];
    if (target.xMm && currentDims[0] > 0) ratios.push(target.xMm / currentDims[0]);
    if (target.yMm && currentDims[1] > 0) ratios.push(target.yMm / currentDims[1]);
    if (target.zMm && currentDims[2] > 0) ratios.push(target.zMm / currentDims[2]);
    if (ratios.length > 0) {
      const factor = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
      if (Math.abs(factor - 1) > 1e-3) {
        mesh = scaleMesh(mesh, [factor, factor, factor]);
        appliedFixes.push({
          kind: 'rescale',
          description: `scaled ${factor.toFixed(2)}x to match requested dimensions`,
        });
      }
    }
  }

  // 7. Auto-orient for minimal support needs.
  const oriented = autoOrient(mesh, config.overhangDeg);
  mesh = oriented.mesh;
  const [rx, ry, rz] = oriented.rotationDeg;
  if (rx !== 0 || ry !== 0 || rz !== 0) {
    appliedFixes.push({
      kind: 'reorient',
      description: `rotated ${rx}°,${ry}°,${rz}° (X,Y,Z) to reduce unsupported overhangs`,
    });
  }

  // 8. Checks against the final mesh.
  const minWallMm = config.minWallMmByPrinterType[options.printerType];
  const checks = [
    manifoldCheck(finalTopology, consistency.orientable, volume),
    wallThicknessCheck(mesh, minWallMm),
    overhangsCheck(mesh, config.overhangDeg, config.overhangMaxRatio),
    buildVolumeCheck(mesh, config.buildVolumeMm),
  ];

  const report: PrintabilityReport = {
    pass: checks.every((c) => c.pass),
    repairable,
    checks,
    appliedFixes,
    warnings,
    orientation: {
      rotationDeg: oriented.rotationDeg,
      overhangRatio: oriented.overhangRatio,
      bedContactAreaMm2: Number(oriented.bedContactAreaMm2.toFixed(2)),
    },
    stats: meshStats(mesh),
    generatedAt: new Date().toISOString(),
  };

  return { mesh, report };
}
