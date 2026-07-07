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
    const job = await first.create({
      userRequest: 'a bracket',
      generationPrompt: 'a bracket',
      options,
      maxAttempts: 3,
    });

    const second = new JobStore(dataDir);
    expect(second.get(job.id)).toBeUndefined();
    await second.hydrate();
    expect(second.get(job.id)).toEqual(job);
  });

  it('hydrate is a no-op when the data dir does not exist yet', async () => {
    const store = new JobStore(join(dataDir, 'does-not-exist'));
    await expect(store.hydrate()).resolves.toBeUndefined();
  });
});
