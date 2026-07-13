# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Drukar (друкар, Ukrainian for "printer/printmaker") is an AI agent that turns a plain-text
description into a print-ready 3D model file. The product bet is not generation quality
(delegated to external APIs) but a guarantee that output prints successfully on the first try:

**requirement clarification → generation → automated printability validation → light repair → export.**

If a mesh can't be cheaply fixed, the agent regenerates with an adjusted prompt rather than
attempting heavy repair — regeneration is cheaper than surgery. See [README.md](README.md) for the
full architecture diagram.

**Current state**: the full MVP loop is built and deployed. All three packages are implemented:
shared schemas, the API (routes, agent loop, providers, printability pipeline, job/session
stores), and the web SPA. The live deployment is a single Render container serving UI + API
same-origin (see `render.yaml` for the deployed posture and its caveats). Still out of scope:
auth, queues, heavy (Python) repair — see the `TODO` markers convention below.

## Commands

Run from the repo root (pnpm workspace, Node >=22):

```bash
pnpm install
pnpm dev                     # runs @drukar/api and @drukar/web dev servers in parallel
pnpm build                   # builds all workspace packages
pnpm test                    # runs tests in all workspace packages
pnpm lint                    # eslint .
pnpm format                  # prettier --write .
pnpm pipeline:run <mesh>     # standalone printability pipeline CLI (apps/api)
```

Per-package (from `apps/api`, `apps/web`, or `packages/shared`):

```bash
pnpm test                    # apps/api: vitest run; apps/web and packages/shared have no unit tests (stubbed)
pnpm test:watch              # apps/api only
pnpm typecheck               # apps/api: tsc -p tsconfig.json (noEmit)
```

To run a single test file in `apps/api`, use vitest directly: `pnpm --filter @drukar/api exec vitest run test/foo.test.ts`.
Test files live under `apps/api/test/**/*.test.ts` (see `apps/api/vitest.config.ts`).

Docker (api on :3000, web on :8080 — note production is instead ONE container: the api image
builds the SPA and serves it via `DRUKAR_WEB_DIST`, see `render.yaml`):

```bash
docker compose up
```

`cp .env.example .env` before running anything live — defaults run fully offline via the mock
generation provider and require zero API keys. For real runs set an LLM
(`ANTHROPIC_API_KEY`, or `DRUKAR_LLM_PROVIDER=openai` + base URL/key for any
chat-completions-compatible server — Ollama, OpenRouter, Gemini compat) and a 3D generator
(`DRUKAR_PROVIDER=tripo` + `TRIPO_API_KEY`, or `DRUKAR_PROVIDER=hf` for the free HF Space,
zero keys).

## Architecture

Three-package pnpm workspace:

- **`packages/shared`** — zod schemas + inferred TS types, the contract between api and web.
  Ships TS source directly (no build step needed for consumption; `tsup` in `apps/api` bundles it
  with `noExternal`). Every cross-boundary shape lives here: `Job`/`JobStatus` (job.ts),
  `PrintabilityReport`/`CheckResult` (printability.ts), `GenOptions`/provider ids (provider.ts),
  `ChatRequest`/`AgentEvent` — the SSE event union the agent loop yields (chat.ts). Read these
  files first when touching any cross-cutting feature; they define the vocabulary the rest of the
  system uses.
- **`apps/api`** — Fastify (Node 22) service. `app.ts` builds the app from injected deps (tests
  run the whole app via `app.inject` with fakes); `index.ts` is the env-driven bootstrap. Holds:
  the SSE chat route (`routes/chat.ts`) driving the agent loop (`agent/loop.ts`, async generator
  yielding `AgentEvent`s, one `generate_model` tool, capped at 8 steps/turn), job + artifact
  routes (`routes/jobs.ts`), the printability pipeline (`mesh/`), a `JobStore` (in-memory +
  `job.json` snapshots under `DRUKAR_DATA_DIR`, rehydrated on boot) and a memory-only
  `SessionStore` for chat transcripts (lost on restart — jobs survive, conversations don't).
  Two independent provider axes, each one env-selected switch: the LLM driving the conversation
  (`agent/llm-factory.ts`: `anthropic` | `openai`-compatible, via `DRUKAR_LLM_PROVIDER`) and the
  3D generator (`providers/index.ts`, via `DRUKAR_PROVIDER`). When `DRUKAR_WEB_DIST` is set,
  also serves the built SPA with an SPA fallback (the single-container production shape).
- **`apps/web`** — React 19 SPA (Vite, no SSR, no router — hash routing via `useRoute`): chat UI
  consuming the SSE stream (`useChat`), a react-three-fiber GLB preview (`ModelViewer`), and a
  printability report view polled via TanStack Query (`useJob`).

### Mesh pipeline (`apps/api/src/mesh`)

Low-level mesh primitives, independent of Fastify/agent/provider code, assembled into the
printability pipeline in `pipeline.ts`:

- `raw.ts` — `RawMesh` (flat `positions`/`indices` typed arrays) plus transform/scale helpers.
- `io.ts` — format dispatch by extension; `loadMesh`/`saveStl`/`saveGlb`.
- `stl.ts`, `obj.ts`, `glb.ts`, `three.ts` — per-format readers/writers and a `RawMesh ↔
  three.js BufferGeometry` bridge (used to build sample meshes with three.js primitives).
- `topology.ts` — manifoldness analysis and light repair: `analyzeEdges` (boundary/non-manifold
  edge detection, boundary loop extraction via half-edge chaining), `dropDanglingFaces` (removes
  triangle "fins"), `orientConsistently` (BFS over face adjacency to make winding consistent,
  reports non-orientable meshes), `fillHoles` (fan-triangulates boundary loops up to a max vertex
  count — larger holes are left unfilled, which is what pushes a job toward `repairable: false` →
  regenerate rather than repair).
- `checks.ts`, `orient.ts` — the four printability checks (manifold, wall thickness, overhangs,
  build volume; thresholds from `config.ts` env vars) and support-minimizing auto-orientation.
- `pipeline.ts` — `runPrintabilityPipeline`: weld → drop fins → fix winding → flip inverted →
  fill small holes → rescale to target dimensions → auto-orient → run checks, returning the
  finished mesh + `PrintabilityReport`. `MAX_FILL_LOOP_VERTS` is the concrete
  regenerate-vs-repair policy: loops bigger than it are left open and flip `repairable: false`.
- `samples.ts` — programmatically generated test/mock fixtures (`clean` = watertight torus knot,
  `holed` = cube missing one triangle, `broken` = open-ended cylinder with holes too large to fill).
  These exist so the whole pipeline runs offline with zero binary fixtures and zero API keys —
  `broken` specifically stands in for hopeless generator output the agent should regenerate
  instead of repair.

### Provider abstraction

`GenerationProvider` is one interface (`apps/api/src/providers/types.ts`):

```ts
interface GenerationProvider {
  generate(prompt: string, options: GenOptions): Promise<{ meshPath: string; format: MeshFormat }>;
}
```

selected by `DRUKAR_PROVIDER`: `mock` (offline sample meshes), `tripo` (paid Tripo3D API), `hf`
(free Gradio Space, default hysts/Shap-E). `python` is planned for later heavy mesh repair via a
separate FastAPI/trimesh service — same interface, no other module changes. When adding a
provider, implement only this interface — don't leak provider-specific types into the agent loop
or routes.

## Conventions

- `moduleResolution: bundler`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true` —
  all imports use explicit `.js` extensions on relative paths (see `mesh/io.ts` imports) even
  though source is `.ts`; array/map index access must be treated as possibly-`undefined`.
- ESLint enforces `consistent-type-imports` and errors on unused vars (prefix with `_` to allow).
- `TODO(python)` / `TODO` markers mark where out-of-scope-for-MVP functionality (Python repair
  backend, auth, payments, print-farm integration, G-code slicing, 3MF export, Redis/queues,
  WebSockets) is meant to plug in later — don't build these speculatively.
