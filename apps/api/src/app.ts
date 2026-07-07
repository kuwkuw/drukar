import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AgentLoopDeps } from './agent/loop.js';
import { registerChatRoute } from './routes/chat.js';
import { registerJobsRoute } from './routes/jobs.js';

export type AppDeps = AgentLoopDeps;

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(cors);

  app.get('/healthz', async () => ({ status: 'ok' }));

  registerChatRoute(app, deps);
  registerJobsRoute(app, deps);

  return app;
}
