import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { PrintMetrics } from '@drukar/shared';
import type { FastifyInstance } from 'fastify';
import type { JobStore } from '../jobs/store.js';

const FeedbackBodySchema = z.object({ printed: z.boolean() });

const ARTIFACT_CONTENT_TYPES: Record<string, string> = {
  'model.stl': 'model/stl',
  'preview.glb': 'model/gltf-binary',
};

/** Newest jobs the list endpoint returns; the dashboard needs recency, not an archive. */
const JOB_LIST_LIMIT = 200;

export function registerJobsRoute(app: FastifyInstance, deps: { jobStore: JobStore }): void {
  // Recent jobs, newest first — the dashboard's data source.
  app.get('/api/jobs', async () => {
    return deps.jobStore
      .list()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, JOB_LIST_LIMIT);
  });

  app.get('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = deps.jobStore.get(id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    return job;
  });

  // Wipe all jobs + artifacts (housekeeping). Registered before :id so it isn't shadowed.
  app.delete('/api/jobs', async (_request, reply) => {
    await deps.jobStore.clear();
    return reply.code(204).send();
  });

  app.delete('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existed = await deps.jobStore.delete(id);
    if (!existed) return reply.code(404).send({ error: 'Job not found' });
    return reply.code(204).send();
  });

  // "Did it print?" — the user-reported outcome behind the north-star metric (NFR-003).
  // Re-reporting overwrites: a misclick shouldn't be permanent.
  app.post('/api/jobs/:id/feedback', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = FeedbackBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const job = deps.jobStore.get(id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    if (job.status !== 'done') {
      return reply.code(409).send({ error: 'Feedback applies only to completed jobs' });
    }

    return deps.jobStore.update(id, {
      feedback: { printed: parsed.data.printed, reportedAt: new Date().toISOString() },
    });
  });

  // Aggregate print outcomes — the "% of first-try successful prints" readout (NFR-003).
  app.get('/api/metrics', async (): Promise<PrintMetrics> => {
    const done = deps.jobStore.list().filter((job) => job.status === 'done');
    const reported = done.filter((job) => job.feedback);
    const printed = reported.filter((job) => job.feedback?.printed);
    return {
      jobsDone: done.length,
      reported: reported.length,
      printed: printed.length,
      successRate: reported.length > 0 ? printed.length / reported.length : null,
    };
  });

  app.get('/api/jobs/:id/artifacts/:name', async (request, reply) => {
    const { id, name } = request.params as { id: string; name: string };
    const contentType = ARTIFACT_CONTENT_TYPES[name];
    if (!deps.jobStore.get(id) || !contentType) {
      return reply.code(404).send({ error: 'Artifact not found' });
    }

    const dir = await deps.jobStore.dataDirFor(id);
    try {
      const data = await readFile(join(dir, name));
      return reply.header('content-type', contentType).send(data);
    } catch {
      return reply.code(404).send({ error: 'Artifact not found' });
    }
  });
}
