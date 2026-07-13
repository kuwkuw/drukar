import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GenOptions } from '@drukar/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { SessionStore } from '../../src/chat/session-store.js';
import { JobStore } from '../../src/jobs/store.js';
import type { GenerationProvider, GenerationResult } from '../../src/providers/types.js';
import { testPrintabilityConfig } from '../helpers/config.js';
import { ScriptedLlmClient } from '../helpers/scripted-llm-client.js';

/** Hangs until aborted, so the test can disconnect mid-generation and observe the abort. */
class HangingProvider implements GenerationProvider {
  started: Promise<void>;
  aborted: Promise<void>;
  private onStart!: () => void;
  private onAbort!: () => void;

  constructor() {
    this.started = new Promise((resolve) => (this.onStart = resolve));
    this.aborted = new Promise((resolve) => (this.onAbort = resolve));
  }

  generate(_prompt: string, _options: GenOptions, signal?: AbortSignal): Promise<GenerationResult> {
    this.onStart();
    return new Promise((_resolve, reject) => {
      signal?.addEventListener(
        'abort',
        () => {
          this.onAbort();
          reject(new Error('aborted'));
        },
        { once: true },
      );
    });
  }
}

describe('POST /api/chat client disconnect', () => {
  let dataDir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'drukar-chat-disconnect-'));
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('aborts the in-flight generation when the client goes away', async () => {
    const provider = new HangingProvider();
    const jobStore = new JobStore(dataDir);
    app = await buildApp({
      llm: new ScriptedLlmClient([
        { toolCalls: [{ id: 't1', name: 'generate_model', input: { prompt: 'a slow vase' } }] },
        {},
      ]),
      provider,
      jobStore,
      sessionStore: new SessionStore(),
      config: testPrintabilityConfig,
      maxAttempts: 3,
    });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    // Fire the chat request over a real socket, then sever it once generation is in flight.
    const req = request(`${address}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    req.on('error', () => {}); // socket destruction is the point, not a failure
    req.end(JSON.stringify({ chatId: 'chat-1', message: 'make me a vase' }));

    await provider.started;
    req.destroy();

    // The route's close handler must abort the provider's signal.
    await expect(
      Promise.race([
        provider.aborted,
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('provider was never aborted')), 5000)),
      ]),
    ).resolves.toBeUndefined();
  });
});
