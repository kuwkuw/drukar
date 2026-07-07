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
});
