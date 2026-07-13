import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionStore } from '../../src/chat/session-store.js';

describe('SessionStore', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'drukar-sessions-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('persists sessions across instances via hydrate', async () => {
    const store = new SessionStore(dataDir);
    await store.save('chat-1', { history: [{ role: 'user', content: 'hi' }], jobId: 'job-1' });

    const reborn = new SessionStore(dataDir);
    await reborn.hydrate();
    expect(reborn.get('chat-1')).toEqual({ history: [{ role: 'user', content: 'hi' }], jobId: 'job-1' });
  });

  it('delete removes the snapshot from disk too', async () => {
    const store = new SessionStore(dataDir);
    await store.save('chat-1', { history: [{ role: 'user', content: 'hi' }] });
    await store.delete('chat-1');

    expect(await readdir(dataDir)).toHaveLength(0);
    const reborn = new SessionStore(dataDir);
    await reborn.hydrate();
    expect(reborn.get('chat-1').history).toHaveLength(0);
  });

  it('keeps hostile chatIds inside the data dir', async () => {
    const store = new SessionStore(dataDir);
    // Would escape dataDir if the raw id were used as a filename.
    await store.save('../../evil', { history: [{ role: 'user', content: 'x' }] });

    const files = await readdir(dataDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{32}\.json$/);

    const reborn = new SessionStore(dataDir);
    await reborn.hydrate();
    expect(reborn.get('../../evil').history).toHaveLength(1);
  });

  it('hydrate skips corrupt snapshots', async () => {
    const store = new SessionStore(dataDir);
    await store.save('chat-ok', { history: [{ role: 'user', content: 'hi' }] });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dataDir, 'garbage.json'), 'not json');

    const reborn = new SessionStore(dataDir);
    await reborn.hydrate();
    expect(reborn.get('chat-ok').history).toHaveLength(1);
  });

  it('works memory-only without a dataDir', async () => {
    const store = new SessionStore();
    await store.save('chat-1', { history: [{ role: 'user', content: 'hi' }] });
    expect(store.get('chat-1').history).toHaveLength(1);
    await store.hydrate(); // no-op, must not throw
  });
});
