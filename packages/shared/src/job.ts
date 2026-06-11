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
  error: z.string().optional(),
  artifacts: JobArtifactsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof JobSchema>;
