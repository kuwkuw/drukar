import type Anthropic from '@anthropic-ai/sdk';

export interface ChatSession {
  history: Anthropic.MessageParam[];
  jobId?: string;
}

/** In-memory per-chat transcript + associated job id; lost on restart (no queue/Redis in MVP). */
export class SessionStore {
  private readonly sessions = new Map<string, ChatSession>();

  get(chatId: string): ChatSession {
    return this.sessions.get(chatId) ?? { history: [] };
  }

  save(chatId: string, session: ChatSession): void {
    this.sessions.set(chatId, session);
  }

  /** Drops a chat's transcript so "new chat" doesn't leave it lingering until restart. */
  delete(chatId: string): void {
    this.sessions.delete(chatId);
  }
}
