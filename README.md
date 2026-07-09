# Drukar

> _Drukar_ (друкар, Ukrainian) — "printer / printmaker".

An AI agent that turns a plain-text description into a **print-ready** 3D model file.

The differentiator is not generation quality (generation is delegated to external APIs) but the
guarantee that the output prints successfully on the first try:

**requirement clarification → generation → automated printability validation → light repair → export.**

If a mesh cannot be fixed cheaply, the agent regenerates with an adjusted prompt instead of
attempting heavy repair — regeneration is cheaper than surgery.

## Architecture

```mermaid
flowchart LR
    subgraph web["apps/web — React SPA (Vite, nginx)"]
        Chat[Chat UI] --> SSE[SSE consumer]
        Preview["3D preview (R3F, GLB)"]
        Report[Printability report]
    end

    subgraph api["apps/api — Fastify (Node 22)"]
        Routes["/api/chat (SSE)<br>/api/jobs/:id (+artifacts)"]
        Agent["Agent loop<br>(async generator, Anthropic SDK)"]
        Providers["GenerationProvider<br>mock | tripo | (future: python)"]
        Pipeline["Printability pipeline<br>manifold-3d + three-mesh-bvh"]
        Jobs["JobStore<br>in-memory + JSON snapshots"]
    end

    SSE -->|POST /api/chat| Routes
    Preview -->|GET preview.glb| Routes
    Report -->|TanStack Query polling| Routes
    Routes --> Agent
    Agent -->|generate_model| Providers
    Agent -->|validate / repair / finalize| Pipeline
    Agent --> Jobs
    Providers -.->|Tripo3D API| Internet[(Tripo3D)]
    Agent -.->|Claude| Anthropic[(Anthropic API)]
    Jobs --> Data[("/data volume<br>state.json + meshes")]
    Pipeline --> Data
```

## Quick start

```bash
pnpm install
cp .env.example .env       # defaults run fully offline (mock provider)
pnpm dev                   # api on :3000, web on :5173
```

Or with Docker:

```bash
docker compose up          # web on :8080, api on :3000
```

For live runs set `ANTHROPIC_API_KEY` (agent) and optionally `DRUKAR_PROVIDER=tripo` +
`TRIPO_API_KEY` (real 3D generation) in `.env`.

## CI & deployment

CI (`.github/workflows/ci.yml`) runs lint + typecheck + test + build on every push/PR.

Hosted deploy is a [Render Blueprint](render.yaml): the API as a Docker web service and the web as
a static site whose `/api/*` rewrite keeps the SPA same-origin (mirroring `apps/web/nginx.conf`).
One-time setup: Render dashboard → New → Blueprint → connect this repo, and set a **spend-capped**
`ANTHROPIC_API_KEY` (the public demo has no auth or rate limiting). Every push to `main` then
auto-deploys. Demo posture: real LLM, mock generation (`DRUKAR_PROVIDER=mock`) — canned meshes,
zero generation spend. Free-tier caveats: cold start after ~15 min idle; job history resets on
restart (ephemeral disk). Decision analysis:
[F-007](docs/knowledge/features/F-007-ci-cd-and-deployment.md).

## Printability pipeline standalone

The pipeline is the product's IP and runs without the rest of the app:

```bash
pnpm pipeline:run path/to/mesh.stl     # also accepts .glb / .obj
```

It prints a per-check report (manifold, wall thickness, overhangs, build volume), applies light
repair and auto-orientation, and writes `model.stl` + `preview.glb` next to the input.

## Swapping generation providers

Set `DRUKAR_PROVIDER=mock|tripo`. Providers implement one interface
(`apps/api/src/providers/types.ts`):

```ts
interface GenerationProvider {
  generate(prompt: string, options: GenOptions): Promise<{ meshPath: string; format: 'glb' | 'stl' | 'obj' }>;
}
```

## Swapping LLM providers

Set `DRUKAR_LLM_PROVIDER=anthropic|openai`. The agent loop only depends on the `LlmClient`
interface (`apps/api/src/agent/llm-client.ts`); implementations are selected by
`createLlmClient()` in `apps/api/src/agent/llm-factory.ts`. The `openai` provider speaks the
chat-completions protocol, so with `DRUKAR_LLM_BASE_URL` it covers OpenAI, Ollama (local),
OpenRouter, Groq, Mistral and Gemini's compat endpoint:

```bash
DRUKAR_LLM_PROVIDER=openai
DRUKAR_LLM_BASE_URL=http://localhost:11434/v1   # Ollama
DRUKAR_MODEL=qwen3:8b
```

### Where Python / local inference plugs in later

If the "% of first-try successful prints" metric degrades due to weak mesh repair, a
`drukar-mesh` service (FastAPI + trimesh) is added as **another implementation of the same
interface** — an HTTP provider/repair backend behind `DRUKAR_PROVIDER=python`. No other module
changes. See `TODO(python)` markers in `apps/api/src/providers/index.ts`.

## Repository layout

- `apps/web` — React SPA: chat, 3D preview, report (no SSR, no router)
- `apps/api` — Fastify: agent loop, providers, printability pipeline, jobs, SSE
- `packages/shared` — zod schemas + TS types shared by both
- `docs/knowledge` — the *why*: business ideas and technical features as an
  [open-knowledge-format catalog](docs/knowledge/index.md) (one Markdown record each)

## Tests

```bash
pnpm test
```

Everything runs offline: the printability pipeline uses programmatically generated meshes (no
binary fixtures), the agent loop uses a scripted mock LLM client and the mock provider.

## Out of scope for MVP

Auth, payments, print-farm integration, G-code slicing, 3MF export, heavy mesh repair (voxel
remeshing), Redis/queues, WebSockets. `TODO` markers sit where they would plug in.
