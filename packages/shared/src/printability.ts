import { z } from 'zod';

export const CheckIdSchema = z.enum(['manifold', 'wall_thickness', 'overhangs', 'build_volume']);
export type CheckId = z.infer<typeof CheckIdSchema>;

/** A problematic area on the mesh, e.g. a thin-wall patch. */
export const MeshRegionSchema = z.object({
  /** Approximate centre of the region in model space (mm). */
  location: z.tuple([z.number(), z.number(), z.number()]),
  /** Indices of the affected triangles. */
  faceIndices: z.array(z.number().int()),
  /** Check-specific measurement, e.g. local thickness in mm. */
  value: z.number().optional(),
});
export type MeshRegion = z.infer<typeof MeshRegionSchema>;

export const CheckResultSchema = z.object({
  id: CheckIdSchema,
  label: z.string(),
  pass: z.boolean(),
  /** Flat scalar metrics shown in the report, e.g. { minThicknessMm: 0.9 }. */
  metrics: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  /** Human-readable explanation of the result. */
  details: z.string().optional(),
  warnings: z.array(z.string()).default([]),
  regions: z.array(MeshRegionSchema).optional(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const AppliedFixSchema = z.object({
  kind: z.enum([
    'merge_vertices',
    'drop_degenerate_faces',
    'fix_winding',
    'fill_holes',
    'rescale',
    'reorient',
  ]),
  description: z.string(),
});
export type AppliedFix = z.infer<typeof AppliedFixSchema>;

export const MeshStatsSchema = z.object({
  vertices: z.number().int(),
  triangles: z.number().int(),
  bboxMm: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
  }),
  volumeMm3: z.number().optional(),
});
export type MeshStats = z.infer<typeof MeshStatsSchema>;

export const OrientationResultSchema = z.object({
  /** Euler rotation (degrees, XYZ order) applied before export. */
  rotationDeg: z.tuple([z.number(), z.number(), z.number()]),
  overhangRatio: z.number(),
  bedContactAreaMm2: z.number(),
});
export type OrientationResult = z.infer<typeof OrientationResultSchema>;

/** The product's trust signal: every check, every fix, every remaining warning. */
export const PrintabilityReportSchema = z.object({
  pass: z.boolean(),
  /** When pass=false: whether light repair could plausibly fix it. false → regenerate. */
  repairable: z.boolean(),
  checks: z.array(CheckResultSchema),
  appliedFixes: z.array(AppliedFixSchema),
  warnings: z.array(z.string()),
  orientation: OrientationResultSchema.optional(),
  stats: MeshStatsSchema,
  generatedAt: z.string(),
});
export type PrintabilityReport = z.infer<typeof PrintabilityReportSchema>;
