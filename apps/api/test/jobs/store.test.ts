import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GenOptionsSchema } from '@drukar/shared';
import { JobStore } from '../../src/jobs/store.js';

const options = GenOptionsSchema.parse({});

describe('JobStore', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'drukar-jobstore-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('creates, updates and retrieves a job, persisting a JSON snapshot', async () => {
    const store = new JobStore(dataDir);
    const job = await store.create({
      userRequest: 'a small vase',
      generationPrompt: 'a small vase',
      options,
      maxAttempts: 3,
    });
    expect(job.status).toBe('generating');
    expect(job.attempt).toBe(1);

    const updated = await store.update(job.id, { status: 'done', attempt: 2 });
    expect(updated.status).toBe('done');
    expect(updated.attempt).toBe(2);
    expect(store.get(job.id)).toEqual(updated);

    const dir = await store.dataDirFor(job.id);
    expect(dir).toContain(job.id);
  });

  it('hydrates jobs written by a previous instance from disk', async () => {
    const first = new JobStore(dataDir);
    const created = await first.create({
      userRequest: 'a bracket',
      generationPrompt: 'a bracket',
      options,
      maxAttempts: 3,
    });
    const job = await first.update(created.id, { status: 'done' });

    const second = new JobStore(dataDir);
    expect(second.get(job.id)).toBeUndefined();
    await second.hydrate();
    expect(second.get(job.id)).toEqual(job);
  });

  it('hydrate fails jobs left non-terminal by a crash — nothing is running after boot', async () => {
    const first = new JobStore(dataDir);
    const job = await first.create({ userRequest: 'a fox', generationPrompt: 'a fox', options, maxAttempts: 3 });
    expect(job.status).toBe('generating');

    const second = new JobStore(dataDir);
    await second.hydrate();
    const rehydrated = second.get(job.id);
    expect(rehydrated).toMatchObject({ status: 'failed', error: 'Interrupted by a server restart' });

    // The flip is persisted, not just in-memory.
    const third = new JobStore(dataDir);
    await third.hydrate();
    expect(third.get(job.id)?.status).toBe('failed');
  });

  it('hydrate is a no-op when the data dir does not exist yet', async () => {
    const store = new JobStore(join(dataDir, 'does-not-exist'));
    await expect(store.hydrate()).resolves.toBeUndefined();
  });

  it('deletes a single job from memory and disk', async () => {
    const store = new JobStore(dataDir);
    const job = await store.create({ userRequest: 'x', generationPrompt: 'x', options, maxAttempts: 3 });

    expect(await store.delete(job.id)).toBe(true);
    expect(store.get(job.id)).toBeUndefined();

    const rehydrated = new JobStore(dataDir);
    await rehydrated.hydrate();
    expect(rehydrated.get(job.id)).toBeUndefined();
  });

  it('delete returns false for an unknown job', async () => {
    const store = new JobStore(dataDir);
    expect(await store.delete('nope')).toBe(false);
  });

  it('clear wipes all jobs from memory and disk', async () => {
    const store = new JobStore(dataDir);
    const a = await store.create({ userRequest: 'a', generationPrompt: 'a', options, maxAttempts: 3 });
    const b = await store.create({ userRequest: 'b', generationPrompt: 'b', options, maxAttempts: 3 });

    await store.clear();
    expect(store.get(a.id)).toBeUndefined();
    expect(store.get(b.id)).toBeUndefined();

    const rehydrated = new JobStore(dataDir);
    await rehydrated.hydrate();
    expect(rehydrated.get(a.id)).toBeUndefined();
    expect(rehydrated.get(b.id)).toBeUndefined();
  });
});
