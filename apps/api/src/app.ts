import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { AgentLoopDeps } from './agent/loop.js';
import { registerChatRoute } from './routes/chat.js';
import { registerJobsRoute } from './routes/jobs.js';

export type AppDeps = AgentLoopDeps;

export interface RateLimitOptions {
  /** Per-IP request cap for all routes per window (except /healthz). */
  max: number;
  /** Stricter per-IP cap for POST /api/chat — each call can spend LLM + generation credits. */
  chatMax: number;
  timeWindowMs: number;
}

export interface AppOptions {
  /** Fastify logger config. Off by default so tests (app.inject) stay quiet; the dev/prod
   * bootstrap in index.ts turns it on to stream request + startup logs to the console. */
  logger?: FastifyServerOptions['logger'];
  /** Directory with the built web SPA (index.html + assets). When set and present, the API
   * serves it with an SPA fallback — one process serves UI + API, same-origin by construction
   * (the single-service deploy; locally the Vite dev server is used instead). */
  webDist?: string;
  /** Trust X-Forwarded-For from a reverse proxy (Render, nginx) so rate limiting keys on the
   * real client IP instead of the proxy's. Only enable when actually behind a proxy. */
  trustProxy?: boolean;
  /** Per-IP rate limiting. Off by default (tests build bare apps); the index.ts bootstrap
   * always enables it — the live API has no auth, so this is the only spend brake. */
  rateLimit?: RateLimitOptions;
}

export async function buildApp(deps: AppDeps, options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, trustProxy: options.trustProxy ?? false });
  await app.register(cors);
  if (options.rateLimit) {
    await app.register(rateLimit, {
      max: options.rateLimit.max,
      timeWindow: options.rateLimit.timeWindowMs,
    });
  }

  // Exempt from rate limiting: the host's healthcheck polls this.
  app.get('/healthz', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

  registerChatRoute(app, deps, {
    rateLimit: options.rateLimit
      ? { max: options.rateLimit.chatMax, timeWindowMs: options.rateLimit.timeWindowMs }
      : undefined,
  });
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
