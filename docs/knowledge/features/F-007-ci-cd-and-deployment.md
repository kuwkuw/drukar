---
id: F-007
type: feature
title: CI/CD and deployment
status: partial
tags: [ci, cd, deployment, ops, cost]
related: [B-003, F-004]
links:
  - .github/workflows/ci.yml
  - render.yaml
  - docker-compose.yml
  - apps/api/Dockerfile
  - apps/web/Dockerfile
  - apps/web/nginx.conf
updated: 2026-07-09
---

### Summary

Decision record, now partially executed. Captures how to add CI and a hosted deployment —
optimising for free/low-cost tiers at the MVP stage — and the constraints that narrow the field.
**Built so far**: [ci.yml](../../../.github/workflows/ci.yml) (lint + typecheck + test + build on
every push/PR) and [render.yaml](../../../render.yaml) (the Render blueprint per the recommendation
below). Remaining: the one-time Render dashboard connect, and post-deploy verification.

Satisfies [NFR-011](../requirements/non-functional.md) (CI) and advances
[NFR-007](../requirements/non-functional.md) (container-deployable, currently partial).

### Constraints that narrow the host choices

Three properties of the app decide everything:

1. **SSE / long-lived streaming** — the chat route streams `AgentEvent`s
   ([F-004](F-004-agent-loop-sse.md), [routes/chat.ts](../../../apps/api/src/routes/chat.ts)).
   Serverless-function hosts (Vercel/Netlify Functions, 10–60s caps) can't hold the connection.
   They're fine for the *static web*, wrong for the *streaming API*.
2. **Stateful local disk** — the API writes job snapshots + mesh artifacts to `DRUKAR_DATA_DIR`
   ([jobs/store.ts](../../../apps/api/src/jobs/store.ts)). Most free tiers have **ephemeral** disks,
   so jobs reset on restart/sleep. Only Fly.io offers a free persistent volume.
3. **Same-origin coupling** — [nginx.conf](../../../apps/web/nginx.conf) reverse-proxies `/api` to
   the API and the SPA fetches relative `/api/...` paths
   ([client.ts](../../../apps/web/src/api/client.ts)). Split web/API across hosts and you must add
   CORS to the API *or* use host-level `/api/*` rewrites to keep same-origin + SSE.

### CI — GitHub Actions

The obvious free choice (unlimited minutes for public repos, 2,000 min/mo private). One workflow on
push/PR: `pnpm install --frozen-lockfile → lint → typecheck → test → build`. The pieces already
exist as root scripts (`pnpm lint`, `pnpm -r test`, `pnpm build`) plus `pnpm --filter @drukar/api
typecheck`. Optionally also build the Docker images to catch Dockerfile drift.

### Deployment options for the API (Docker, SSE, stateful)

Ranked by free/low-cost tier, since that's the MVP priority:

| Host | Free tier | SSE | Persistent disk | Sleeps | Notes |
|---|---|---|---|---|---|
| **Render** | 750 h/mo | yes | no (paid) | 15 min idle | easiest; `render.yaml` blueprint, static-site `/api/*` rewrites |
| **Fly.io** | allowance | yes | yes (small vol) | scale-to-zero | best for stateful; needs flyctl + card |
| **Cloud Run** | generous | yes | no (ephemeral) | scale-to-zero | strong perf; needs GCP account |
| **HF Spaces** (Docker) | yes | yes | limited | no | thematic fit with the [F-006](F-006-free-mvp-generation-provider.md) HF direction |

Web (static SPA): Cloudflare Pages / GitHub Pages / Netlify — all free and adequate.

### Recommendation

- **CI**: GitHub Actions running lint + typecheck + test + build on every push/PR.
- **Deploy (MVP)**: a **Render blueprint** (`render.yaml`) — API as a Docker web service + web as a
  static site with `/api/*` and `/healthz` rewrites to the API. One file, auto-deploys from GitHub
  on push (that's the CD), same-origin preserved, SSE works. Trade-off: `/data` is ephemeral and the
  API cold-starts after idle — acceptable for an MVP. If job persistence matters more than
  simplicity, use **Fly.io with a volume** instead.

### Status & gaps

- `partial` — CI workflow and `render.yaml` are committed. The demo posture chosen for the public
  MVP is **real LLM + mock generation** (`DRUKAR_PROVIDER=mock`, `DRUKAR_LLM_PROVIDER=anthropic`,
  cheap Haiku model): conversation/validation/report are real, meshes are canned samples. The API
  has **no auth or rate limiting**, so the `ANTHROPIC_API_KEY` set in the Render dashboard must be
  spend-capped — anything on that server is spendable by anyone.
- Remaining manual steps: connect the repo as a Blueprint in the Render dashboard, set
  `ANTHROPIC_API_KEY`, then verify after first deploy that (a) the API hostname matches the
  `/api/*` rewrite destination (Render may suffix it on name collision) and (b) SSE streams
  through the static-site rewrite proxy without buffering.
- `docker compose up` itself is still unverified end-to-end (see NFR-007) — worth confirming before
  leaning on the same images for hosted deploy.
- Ephemeral-disk hosts reset job state on restart; only the Fly.io path avoids this for free.
  Upgrade path if the demo sticks: Fly.io + volume, or a paid Render disk.
