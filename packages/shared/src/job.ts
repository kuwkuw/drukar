import { z } from 'zod';
import { GenOptionsSchema } from './provider.js';
import { PrintabilityReportSchema } from './printability.js';

export const JobStatusSchema = z.enum([
  'queued',
  'clarifying',
  'generating',
  'validating',
  'repairing',
  'done',
  'failed',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ['done', 'failed'];

export function isTerminalStatus(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

/** User-reported physical print outcome — the raw datum behind the north-star
 * "% of first-try successful prints" metric (NFR-003). */
export const PrintFeedbackSchema = z.object({
  printed: z.boolean(),
  reportedAt: z.string(),
});
export type PrintFeedback = z.infer<typeof PrintFeedbackSchema>;

/** Aggregate print-outcome metrics, served by GET /api/metrics. */
export const PrintMetricsSchema = z.object({
  jobsDone: z.number().int(),
  reported: z.number().int(),
  printed: z.number().int(),
  /** printed / reported — the north-star metric; null until any feedback exists. */
  successRate: z.number().nullable(),
});
export type PrintMetrics = z.infer<typeof PrintMetricsSchema>;

/** Paths are relative to the job's data directory. */
export const JobArtifactsSchema = z.object({
  sourceMesh: z.string().optional(),
  stl: z.string().optional(),
  previewGlb: z.string().optional(),
  report: z.string().optional(),
});
export type JobArtifacts = z.infer<typeof JobArtifactsSchema>;

export const JobSchema = z.object({
  id: z.string(),
  chatId: z.string().optional(),
  status: JobStatusSchema,
  /** The original user request, verbatim. */
  userRequest: z.string(),
  /** The latest optimized generation prompt sent to the provider. */
  generationPrompt: z.string(),
  options: GenOptionsSchema,
  /** 1-based generation attempt counter. attempt-1 = regenerations so far. */
  attempt: z.number().int().min(1),
  maxAttempts: z.number().int().min(1),
  report: PrintabilityReportSchema.optional(),
  feedback: PrintFeedbackSchema.optional(),
  error: z.string().optional(),
  artifacts: JobArtifactsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof JobSchema>;
