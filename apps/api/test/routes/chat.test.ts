import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { SessionStore } from '../../src/chat/session-store.js';
import { JobStore } from '../../src/jobs/store.js';
import { MockProvider } from '../../src/providers/mock.js';
import { testPrintabilityConfig } from '../helpers/config.js';
import { ScriptedLlmClient } from '../helpers/scripted-llm-client.js';

function parseSse(payload: string): { type: string; [key: string]: unknown }[] {
  return payload
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.replace(/^data: /, '')));
}

describe('POST /api/chat', () => {
  let dataDir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'drukar-chat-route-'));
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('streams SSE events through a full generate cycle', async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ id: 't1', name: 'generate_model', input: { prompt: 'a clean vase' } }] },
      {},
    ]);
    app = await buildApp({
      llm,
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

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = parseSse(res.payload);
    expect(events.some((e) => e.type === 'tool_finished' && e.ok === true)).toBe(true);
    expect(events.some((e) => e.type === 'job_update')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('rejects an invalid body with 400', async () => {
    app = await buildApp({
      llm: new ScriptedLlmClient([{}]),
      provider: new MockProvider(),
      jobStore: new JobStore(dataDir),
      sessionStore: new SessionStore(),
      config: testPrintabilityConfig,
      maxAttempts: 3,
    });

    const res = await app.inject({ method: 'POST', url: '/api/chat', payload: { chatId: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('deletes a chat session', async () => {
    const sessionStore = new SessionStore();
    sessionStore.save('chat-x', { history: [{ role: 'user', content: 'hi' }] });
    app = await buildApp({
      llm: new ScriptedLlmClient([{}]),
      provider: new MockProvider(),
      jobStore: new JobStore(dataDir),
      sessionStore,
      config: testPrintabilityConfig,
      maxAttempts: 3,
    });

    const res = await app.inject({ method: 'DELETE', url: '/api/chat/chat-x' });
    expect(res.statusCode).toBe(204);
    expect(sessionStore.get('chat-x').history).toHaveLength(0);
  });
});
