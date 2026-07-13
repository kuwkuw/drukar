import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentEvent } from '@drukar/shared';
import type { AgentLoopDeps } from '../../src/agent/loop.js';
import { runAgentLoop } from '../../src/agent/loop.js';
import { SessionStore } from '../../src/chat/session-store.js';
import { JobStore } from '../../src/jobs/store.js';
import { MockProvider } from '../../src/providers/mock.js';
import { ScriptedLlmClient } from '../helpers/scripted-llm-client.js';
import { testPrintabilityConfig } from '../helpers/config.js';

async function collect(events: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

/** Fails the first N streamMessage calls with an API-shaped error, then delegates. */
class FlakyLlmClient extends ScriptedLlmClient {
  private failures: number;

  constructor(turns: ConstructorParameters<typeof ScriptedLlmClient>[0], failures: number, private status: number) {
    super(turns);
    this.failures = failures;
  }

  override async *streamMessage(params: Parameters<ScriptedLlmClient['streamMessage']>[0]) {
    if (this.failures > 0) {
      this.failures--;
      throw Object.assign(new Error(`${this.status} status code (no body)`), { status: this.status });
    }
    yield* super.streamMessage(params);
  }
}

describe('runAgentLoop', () => {
  let dataDir: string;
  let deps: Omit<AgentLoopDeps, 'llm'>;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'drukar-loop-'));
    deps = {
      provider: new MockProvider(),
      jobStore: new JobStore(dataDir),
      sessionStore: new SessionStore(),
      config: testPrintabilityConfig,
      maxAttempts: 3,
    };
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('generates a clean model in one tool call', async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ id: 't1', name: 'generate_model', input: { prompt: 'a clean vase' } }] },
      {},
    ]);

    const events = await collect(runAgentLoop({ chatId: 'c1', message: 'make me a vase' }, { ...deps, llm }));

    const started = events.find((e) => e.type === 'tool_started');
    const finished = events.find((e) => e.type === 'tool_finished');
    const jobUpdate = events.find((e) => e.type === 'job_update');
    const done = events.find((e) => e.type === 'done');

    expect(started).toBeDefined();
    expect(finished).toMatchObject({ type: 'tool_finished', ok: true });
    expect(jobUpdate).toMatchObject({ type: 'job_update', job: { status: 'done' } });
    expect(done).toBeDefined();
    expect(events.some((e) => e.type === 'question_for_user')).toBe(false);
  });

  it('regenerates after an unrepairable attempt and finishes done on the second try', async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ id: 't1', name: 'generate_model', input: { prompt: 'a broken cylinder' } }] },
      { toolCalls: [{ id: 't2', name: 'generate_model', input: { prompt: 'a clean vase instead' } }] },
      {},
    ]);

    const events = await collect(runAgentLoop({ chatId: 'c2', message: 'make me a vase' }, { ...deps, llm }));

    const jobUpdates = events.filter((e) => e.type === 'job_update');
    expect(jobUpdates).toHaveLength(2);
    const last = jobUpdates.at(-1);
    expect(last).toMatchObject({ type: 'job_update', job: { status: 'done', attempt: 2 } });
  });

  it('bounces malformed tool input back as a tool error without creating a job', async () => {
    const llm = new ScriptedLlmClient([
      // First call is missing the required prompt; the corrected retry succeeds.
      { toolCalls: [{ id: 't1', name: 'generate_model', input: { functional: 'yes please' } }] },
      { toolCalls: [{ id: 't2', name: 'generate_model', input: { prompt: 'a clean vase' } }] },
      {},
    ]);

    const events = await collect(runAgentLoop({ chatId: 'c4', message: 'make me a vase' }, { ...deps, llm }));

    const finished = events.filter((e) => e.type === 'tool_finished');
    expect(finished[0]).toMatchObject({ type: 'tool_finished', ok: false });
    expect((finished[0] as { summary: string }).summary).toContain('Invalid generate_model input');
    expect(finished[1]).toMatchObject({ type: 'tool_finished', ok: true });

    // The failed call must not have produced a job; only the retry does.
    const jobUpdates = events.filter((e) => e.type === 'job_update');
    expect(jobUpdates).toHaveLength(1);
    expect(jobUpdates[0]).toMatchObject({ type: 'job_update', job: { status: 'done', attempt: 1 } });
  });

  it('retries a rate-limited LLM call with backoff and completes normally', async () => {
    const llm = new FlakyLlmClient(
      [{ toolCalls: [{ id: 't1', name: 'generate_model', input: { prompt: 'a clean vase' } }] }, {}],
      2, // first two calls 429, third succeeds
      429,
    );

    const events = await collect(
      runAgentLoop({ chatId: 'c5', message: 'make me a vase' }, { ...deps, llm, retryDelaysMs: [1, 1, 1] }),
    );

    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.find((e) => e.type === 'job_update')).toMatchObject({ type: 'job_update', job: { status: 'done' } });
  });

  it('fails the stuck job with a friendly message when LLM retries are exhausted', async () => {
    const llm = new (class extends ScriptedLlmClient {
      private calls = 0;
      override async *streamMessage(params: Parameters<ScriptedLlmClient['streamMessage']>[0]) {
        // First step works (creates a non-terminal job via the broken sample); second step 429s forever.
        if (this.calls++ > 0) throw Object.assign(new Error('429 status code (no body)'), { status: 429 });
        yield* super.streamMessage(params);
      }
    })([{ toolCalls: [{ id: 't1', name: 'generate_model', input: { prompt: 'a broken cylinder' } }] }]);

    const events = await collect(
      runAgentLoop({ chatId: 'c6', message: 'make me a vase' }, { ...deps, llm, retryDelaysMs: [1] }),
    );

    const error = events.find((e) => e.type === 'error');
    expect(error).toMatchObject({ type: 'error' });
    expect((error as { message: string }).message).toContain('rate-limiting');

    // The job must end terminal so the UI stops polling it.
    const lastUpdate = events.filter((e) => e.type === 'job_update').at(-1);
    expect(lastUpdate).toMatchObject({ type: 'job_update', job: { status: 'failed' } });
    expect((lastUpdate as { job: { error: string } }).job.error).toContain('Agent interrupted');

    // The transcript survives the failure so the user's retry has context.
    expect(deps.sessionStore.get('c6').history.length).toBeGreaterThan(0);
  });

  it('asks a clarifying question when the model calls no tool', async () => {
    const llm = new ScriptedLlmClient([{ text: 'What material should I use?' }]);

    const events = await collect(runAgentLoop({ chatId: 'c3', message: 'make me a thing' }, { ...deps, llm }));

    const question = events.find((e) => e.type === 'question_for_user');
    expect(question).toMatchObject({ type: 'question_for_user', text: 'What material should I use?' });
    const done = events.find((e) => e.type === 'done');
    expect(done).toMatchObject({ type: 'done', jobId: undefined });
    expect(events.some((e) => e.type === 'tool_started')).toBe(false);
  });
});
