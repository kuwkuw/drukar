---
id: F-008
type: feature
title: Abuse and spend protection
status: implemented
tags: [security, cost, rate-limiting, sse, ops]
related: [B-003, F-004, F-007]
links:
  - apps/api/src/app.ts
  - apps/api/src/routes/chat.ts
  - apps/api/src/agent/loop.ts
  - apps/api/test/routes/rate-limit.test.ts
  - apps/api/test/routes/chat-disconnect.test.ts
updated: 2026-07-13
---

### Summary

The live demo (F-007) runs real, spendable LLM + generation keys with no auth. This feature adds
the two cheapest brakes on unbounded spend: **per-IP rate limiting** and **cancellation of
in-flight work when the SSE client disconnects**. Satisfies
[NFR-012](../requirements/non-functional.md).

### How it works

**Rate limiting** — `@fastify/rate-limit`, enabled by the `index.ts` bootstrap (off in bare
`buildApp()` so tests are unaffected). Two tiers, env-tunable (`.env.example`):

- global per-IP cap (`DRUKAR_RATE_LIMIT_MAX`, default 300/min) — generous enough for the SPA's
  job polling; `/healthz` is exempt because the host's healthcheck polls it;
- a much stricter cap on `POST /api/chat` (`DRUKAR_CHAT_RATE_LIMIT_MAX`, default 10/min) — the
  spendable route, where one request can trigger LLM calls plus up to `maxAttempts` generations.

`DRUKAR_RATE_LIMIT_MAX=0` disables limiting. `DRUKAR_TRUST_PROXY=true` (set on Render) makes
Fastify trust `X-Forwarded-For`, so limits key on the real client IP rather than the proxy's —
without it, one abuser exhausts the shared proxy-IP budget for everyone.

**Disconnect cancellation** — the chat route creates an `AbortController` and aborts it when the
response socket closes before completion. The signal threads through the whole chain:
`runAgentLoop` (stops between steps) → `LlmClient.streamMessage` (Anthropic/OpenAI SDKs abort the
HTTP request) → `GenerationProvider.generate` (Tripo aborts fetches and its poll sleep; HF
combines the signal with its own timeout via `AbortSignal.any`). An abandoned browser tab no
longer burns a full generation; the affected job fails with `Cancelled: client disconnected`.

### Rationale

Auth/payments stay out of MVP scope (`TODO` convention), but leaving keys uncapped behind a
public URL made spend the single biggest operational risk after going live. Rate limiting plus
cancellation bound the worst case without adding any user-facing friction, and both live behind
existing seams (app options, the provider/LLM interfaces) — no route or agent logic changed shape.

### Status & gaps

- `implemented` — covered by `rate-limit.test.ts` (caps, chat tier, healthz exemption, off by
  default) and `chat-disconnect.test.ts` (real-socket disconnect aborts the provider signal).
- The in-memory rate-limit store resets on restart/deploy — fine for one container, revisit if
  the service ever scales horizontally.
- Rate limiting is per-IP, not per-key spend accounting; a distributed abuser can still spend.
  Real auth (out of scope for MVP) is the durable fix.
