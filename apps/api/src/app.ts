import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { AgentLoopDeps } from './agent/loop.js';
import { registerChatRoute } from './routes/chat.js';
import { registerJobsRoute } from './routes/jobs.js';

export type AppDeps = AgentLoopDeps;

export interface AppOptions {
  /** Fastify logger config. Off by default so tests (app.inject) stay quiet; the dev/prod
   * bootstrap in index.ts turns it on to stream request + startup logs to the console. */
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(deps: AppDeps, options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  await app.register(cors);

  app.get('/healthz', async () => ({ status: 'ok' }));

  registerChatRoute(app, deps);
  registerJobsRoute(app, deps);

  return app;
}
