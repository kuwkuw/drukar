import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { AgentLoopDeps } from './agent/loop.js';
import { registerChatRoute } from './routes/chat.js';
import { registerJobsRoute } from './routes/jobs.js';

export type AppDeps = AgentLoopDeps;

export interface AppOptions {
  /** Fastify logger config. Off by default so tests (app.inject) stay quiet; the dev/prod
   * bootstrap in index.ts turns it on to stream request + startup logs to the console. */
  logger?: FastifyServerOptions['logger'];
  /** Directory with the built web SPA (index.html + assets). When set and present, the API
   * serves it with an SPA fallback — one process serves UI + API, same-origin by construction
   * (the single-service deploy; locally the Vite dev server is used instead). */
  webDist?: string;
}

export async function buildApp(deps: AppDeps, options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  await app.register(cors);

  app.get('/healthz', async () => ({ status: 'ok' }));

  registerChatRoute(app, deps);
  registerJobsRoute(app, deps);

  const webDist = options.webDist ? resolve(options.webDist) : undefined;
  if (webDist && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    // SPA fallback: any unknown GET outside /api serves index.html (hash routing does the rest).
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ message: `Route ${req.method}:${req.url} not found` });
    });
  }

  return app;
}
