import type { FastifyInstance } from 'fastify';
import { ChatRequestSchema } from '@drukar/shared';
import type { AgentLoopDeps } from '../agent/loop.js';
import { runAgentLoop } from '../agent/loop.js';

export function registerChatRoute(app: FastifyInstance, deps: AgentLoopDeps): void {
  app.post('/api/chat', async (request, reply) => {
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

    for await (const event of runAgentLoop(parsed.data, deps)) {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    reply.raw.end();
  });

  // Drop a chat's server-side transcript (used by "new chat").
  app.delete('/api/chat/:chatId', async (request, reply) => {
    const { chatId } = request.params as { chatId: string };
    deps.sessionStore.delete(chatId);
    return reply.code(204).send();
  });
}
