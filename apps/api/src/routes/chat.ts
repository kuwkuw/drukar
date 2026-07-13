import type { FastifyInstance } from 'fastify';
import { ChatRequestSchema } from '@drukar/shared';
import type { AgentLoopDeps } from '../agent/loop.js';
import { runAgentLoop } from '../agent/loop.js';

export interface ChatRouteOptions {
  /** Per-route rate limit for POST /api/chat (the spendable route: LLM + generation per call).
   * Requires the @fastify/rate-limit plugin to be registered; ignored otherwise. */
  rateLimit?: { max: number; timeWindowMs: number };
}

export function registerChatRoute(app: FastifyInstance, deps: AgentLoopDeps, options: ChatRouteOptions = {}): void {
  const chatRouteConfig = options.rateLimit
    ? { config: { rateLimit: { max: options.rateLimit.max, timeWindow: options.rateLimit.timeWindowMs } } }
    : {};

  app.post('/api/chat', chatRouteConfig, async (request, reply) => {
    const parsed = ChatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    // A close before we end the response means the client disconnected: abort so the
    // in-flight LLM stream / generation call stops instead of burning spend for nobody.
    const abort = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableEnded) abort.abort();
    });

    for await (const event of runAgentLoop(parsed.data, deps, abort.signal)) {
      if (abort.signal.aborted) break;
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    if (!reply.raw.writableEnded) reply.raw.end();
  });

  // Drop a chat's server-side transcript (used by "new chat").
  app.delete('/api/chat/:chatId', async (request, reply) => {
    const { chatId } = request.params as { chatId: string };
    deps.sessionStore.delete(chatId);
    return reply.code(204).send();
  });
}
