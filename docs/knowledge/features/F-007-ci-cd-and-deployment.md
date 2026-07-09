---
id: F-007
type: feature
title: CI/CD and deployment
status: idea
tags: [ci, cd, deployment, ops, cost]
related: [B-003, F-004]
links:
  - .github/
  - docker-compose.yml
  - apps/api/Dockerfile
  - apps/web/Dockerfile
  - apps/web/nginx.conf
updated: 2026-07-09
---

### Summary

Decision record. There is no CI today (`.github/` is empty) and no hosted deployment. This entry
captures how to add both — optimising for free/low-cost tiers at the MVP stage — and the
constraints that narrow the field. Analysis only — no workflow or deploy config committed yet.

Satisfies (when built) [NFR-011](../requirements/non-functional.md) (CI) and advances
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

- `idea` — nothing committed. When built: add `.github/workflows/ci.yml`, then the chosen deploy
  config (`render.yaml` / `fly.toml`), and flip NFR-007 → met / NFR-011 → met.
- `docker compose up` itself is still unverified end-to-end (see NFR-007) — worth confirming before
  leaning on the same images for hosted deploy.
- Ephemeral-disk hosts reset job state on restart; only the Fly.io path avoids this for free.
