import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../../src/app.js';
import { SessionStore } from '../../src/chat/session-store.js';
import { JobStore } from '../../src/jobs/store.js';
import { MockProvider } from '../../src/providers/mock.js';
import { testPrintabilityConfig } from '../helpers/config.js';
import { ScriptedLlmClient } from '../helpers/scripted-llm-client.js';

describe('rate limiting', () => {
  let dataDir: string;
  let app: FastifyInstance;

  const deps = (turns: number): AppDeps => ({
    // One text-only turn per allowed chat call.
    llm: new ScriptedLlmClient(Array.from({ length: turns }, () => ({ text: 'ok' }))),
    provider: new MockProvider(),
    jobStore: new JobStore(dataDir),
    sessionStore: new SessionStore(),
    config: testPrintabilityConfig,
    maxAttempts: 3,
  });

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'drukar-rate-limit-'));
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('caps requests per IP and window, except /healthz', async () => {
    app = await buildApp(deps(0), { rateLimit: { max: 2, chatMax: 1, timeWindowMs: 60_000 } });

    expect((await app.inject({ method: 'GET', url: '/api/jobs/nope' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/jobs/nope' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/jobs/nope' })).statusCode).toBe(429);

    // Healthchecks poll this endpoint; it must never be limited.
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
  });

  it('applies the stricter chat cap to POST /api/chat', async () => {
    app = await buildApp(deps(1), { rateLimit: { max: 100, chatMax: 1, timeWindowMs: 60_000 } });

    const payload = { chatId: 'chat-1', message: 'hello' };
    expect((await app.inject({ method: 'POST', url: '/api/chat', payload })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/chat', payload })).statusCode).toBe(429);
  });

  it('is fully disabled when no rateLimit option is given', async () => {
    app = await buildApp(deps(0));
    for (let i = 0; i < 5; i++) {
      expect((await app.inject({ method: 'GET', url: '/api/jobs/nope' })).statusCode).toBe(404);
    }
  });
});
