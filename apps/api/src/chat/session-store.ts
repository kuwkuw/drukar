import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';

export interface ChatSession {
  history: Anthropic.MessageParam[];
  jobId?: string;
}

/** On-disk snapshot shape; carries chatId because the filename is a hash of it. */
interface SessionSnapshot extends ChatSession {
  chatId: string;
  updatedAt: string;
}

/**
 * Per-chat transcript + associated job id. In-memory map, optionally backed by one
 * `<hash(chatId)>.json` snapshot per chat under `dataDir` (hydrated at boot), so
 * conversations survive restarts/deploys the same way jobs do. Memory mutations are
 * synchronous; disk writes are best-effort async — a failed write costs at most one
 * turn of one transcript after a crash.
 */
export class SessionStore {
  private readonly sessions = new Map<string, ChatSession>();

  /** Without `dataDir` the store is memory-only (tests, or explicitly ephemeral setups). */
  constructor(private readonly dataDir?: string) {}

  get(chatId: string): ChatSession {
    return this.sessions.get(chatId) ?? { history: [] };
  }

  async save(chatId: string, session: ChatSession): Promise<void> {
    this.sessions.set(chatId, session);
    if (!this.dataDir) return;
    const snapshot: SessionSnapshot = { chatId, ...session, updatedAt: new Date().toISOString() };
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.fileFor(chatId), JSON.stringify(snapshot, null, 2));
  }

  /** Drops a chat's transcript so "new chat" doesn't leave it lingering until restart. */
  async delete(chatId: string): Promise<void> {
    this.sessions.delete(chatId);
    if (this.dataDir) await rm(this.fileFor(chatId), { force: true });
  }

  /** Repopulates the in-memory map from disk snapshots; call once at startup. */
  async hydrate(): Promise<void> {
    if (!this.dataDir) return;
    let entries: string[];
    try {
      entries = await readdir(this.dataDir);
    } catch {
      return; // no sessions persisted yet
    }
    for (const entry of entries) {
      try {
        const raw = await readFile(join(this.dataDir, entry), 'utf8');
        const snapshot = JSON.parse(raw) as SessionSnapshot;
        if (typeof snapshot.chatId !== 'string' || !Array.isArray(snapshot.history)) continue;
        this.sessions.set(snapshot.chatId, { history: snapshot.history, jobId: snapshot.jobId });
      } catch {
        // not a session snapshot, or a corrupt one — skip it
      }
    }
  }

  /** chatId is client-supplied; hashing it keeps arbitrary input (`../`, unicode) out of paths. */
  private fileFor(chatId: string): string {
    const name = createHash('sha256').update(chatId).digest('hex').slice(0, 32);
    return join(this.dataDir!, `${name}.json`);
  }
}
