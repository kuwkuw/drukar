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
