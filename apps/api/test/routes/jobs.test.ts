import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AgentEvent } from '@drukar/shared';
import { buildApp } from '../../src/app.js';
import { SessionStore } from '../../src/chat/session-store.js';
import { JobStore } from '../../src/jobs/store.js';
import { MockProvider } from '../../src/providers/mock.js';
import { testPrintabilityConfig } from '../helpers/config.js';
import { ScriptedLlmClient } from '../helpers/scripted-llm-client.js';

function parseSse(payload: string): AgentEvent[] {
  return payload
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.replace(/^data: /, '')));
}

describe('GET /api/jobs/:id', () => {
  let dataDir: string;
  let app: FastifyInstance;
  let jobId: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'drukar-jobs-route-'));
    app = await buildApp({
      llm: new ScriptedLlmClient([
        { toolCalls: [{ id: 't1', name: 'generate_model', input: { prompt: 'a clean vase' } }] },
        {},
      ]),
      provider: new MockProvider(),
      jobStore: new JobStore(dataDir),
      sessionStore: new SessionStore(),
      config: testPrintabilityConfig,
      maxAttempts: 3,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { chatId: 'chat-1', message: 'make me a vase' },
    });
    const jobUpdate = parseSse(res.payload).find((e) => e.type === 'job_update');
    if (jobUpdate?.type !== 'job_update') throw new Error('expected a job_update event in the SSE stream');
    jobId = jobUpdate.job.id;
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('returns the job', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: jobId, status: 'done' });
  });

  it('returns 404 for an unknown job', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/jobs/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });

  it('serves the model.stl and preview.glb artifacts', async () => {
    const stl = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}/artifacts/model.stl` });
    expect(stl.statusCode).toBe(200);
    expect(stl.headers['content-type']).toBe('model/stl');

    const glb = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}/artifacts/preview.glb` });
    expect(glb.statusCode).toBe(200);
    expect(glb.headers['content-type']).toBe('model/gltf-binary');
  });

  it('returns 404 for an unknown artifact name', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}/artifacts/nope.txt` });
    expect(res.statusCode).toBe(404);
  });

  it('deletes a single job', async () => {
    const del = await app.inject({ method: 'DELETE', url: `/api/jobs/${jobId}` });
    expect(del.statusCode).toBe(204);
    const get = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
    expect(get.statusCode).toBe(404);
  });

  it('returns 404 when deleting an unknown job', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/jobs/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });

  it('clears all jobs', async () => {
    const del = await app.inject({ method: 'DELETE', url: '/api/jobs' });
    expect(del.statusCode).toBe(204);
    const get = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
    expect(get.statusCode).toBe(404);
  });
});

describe('print feedback and metrics', () => {
  let dataDir: string;
  let app: FastifyInstance;
  let jobStore: JobStore;

  const seedJob = async (status: 'done' | 'failed'): Promise<string> => {
    const job = await jobStore.create({
      userRequest: 'a vase',
      generationPrompt: 'a vase',
      options: { printerType: 'fdm', material: 'pla', functional: false },
      maxAttempts: 3,
    });
    await jobStore.update(job.id, { status });
    return job.id;
  };

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'drukar-feedback-route-'));
    jobStore = new JobStore(dataDir);
    app = await buildApp({
      llm: new ScriptedLlmClient([]),
      provider: new MockProvider(),
      jobStore,
      sessionStore: new SessionStore(),
      config: testPrintabilityConfig,
      maxAttempts: 3,
    });
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('records feedback on a done job and allows re-reporting', async () => {
    const id = await seedJob('done');

    const yes = await app.inject({ method: 'POST', url: `/api/jobs/${id}/feedback`, payload: { printed: true } });
    expect(yes.statusCode).toBe(200);
    expect(yes.json()).toMatchObject({ feedback: { printed: true } });

    const no = await app.inject({ method: 'POST', url: `/api/jobs/${id}/feedback`, payload: { printed: false } });
    expect(no.json()).toMatchObject({ feedback: { printed: false } });
  });

  it('rejects feedback on a non-done job with 409', async () => {
    const id = await seedJob('failed');
    const res = await app.inject({ method: 'POST', url: `/api/jobs/${id}/feedback`, payload: { printed: true } });
    expect(res.statusCode).toBe(409);
  });

  it('rejects an invalid body with 400 and an unknown job with 404', async () => {
    const id = await seedJob('done');
    const bad = await app.inject({ method: 'POST', url: `/api/jobs/${id}/feedback`, payload: { printed: 'yep' } });
    expect(bad.statusCode).toBe(400);

    const missing = await app.inject({ method: 'POST', url: '/api/jobs/nope/feedback', payload: { printed: true } });
    expect(missing.statusCode).toBe(404);
  });

  it('aggregates outcomes in GET /api/metrics', async () => {
    const a = await seedJob('done');
    const b = await seedJob('done');
    await seedJob('done'); // done but never reported
    await seedJob('failed'); // failed jobs don't count toward jobsDone

    await app.inject({ method: 'POST', url: `/api/jobs/${a}/feedback`, payload: { printed: true } });
    await app.inject({ method: 'POST', url: `/api/jobs/${b}/feedback`, payload: { printed: false } });

    const res = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ jobsDone: 3, reported: 2, printed: 1, successRate: 0.5 });
  });

  it('lists jobs newest-first via GET /api/jobs', async () => {
    const a = await seedJob('done');
    // createdAt has millisecond resolution; guarantee distinct timestamps.
    await new Promise((r) => setTimeout(r, 5));
    const b = await seedJob('failed');

    const res = await app.inject({ method: 'GET', url: '/api/jobs' });
    expect(res.statusCode).toBe(200);
    const jobs = res.json() as { id: string }[];
    expect(jobs.map((j) => j.id)).toHaveLength(2);
    // b was created last, so it comes first.
    expect(jobs[0]?.id).toBe(b);
    expect(jobs[1]?.id).toBe(a);
  });

  it('reports a null success rate before any feedback exists', async () => {
    await seedJob('done');
    const res = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(res.json()).toMatchObject({ jobsDone: 1, reported: 0, printed: 0, successRate: null });
  });
});
