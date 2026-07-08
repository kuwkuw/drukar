import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { JobStore } from '../jobs/store.js';

const ARTIFACT_CONTENT_TYPES: Record<string, string> = {
  'model.stl': 'model/stl',
  'preview.glb': 'model/gltf-binary',
};

export function registerJobsRoute(app: FastifyInstance, deps: { jobStore: JobStore }): void {
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
