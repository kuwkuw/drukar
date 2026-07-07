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

**Current state**: this is an early-stage scaffold. `packages/shared` (zod schemas/types) is
built out. `apps/api/src/mesh/` (mesh I/O + topology repair primitives) exists but is untracked
and not yet wired to anything. There is no `apps/api/src/index.ts`, no routes, no agent loop, no
providers, and no printability pipeline assembly yet — and no `apps/web/src` at all. Scripts
referenced in `package.json` (`dev`, `pipeline:run`) will not run until those entry points exist.
Don't assume code described in the README exists — check the file tree first.

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
Test files live under `apps/api/test/**/*.test.ts` (see `apps/api/vitest.config.ts`); the test
directory doesn't exist yet at time of writing.

Docker (production-shaped, api on :3000, web on :8080):

```bash
docker compose up
```

`cp .env.example .env` before running anything live — defaults run fully offline via the mock
generation provider and require zero API keys. Set `ANTHROPIC_API_KEY` for real agent runs, and
`DRUKAR_PROVIDER=tripo` + `TRIPO_API_KEY` for real 3D generation.

## Architecture

Three-package pnpm workspace:

- **`packages/shared`** — zod schemas + inferred TS types, the contract between api and web.
  Ships TS source directly (no build step needed for consumption; `tsup` in `apps/api` bundles it
  with `noExternal`). Every cross-boundary shape lives here: `Job`/`JobStatus` (job.ts),
  `PrintabilityReport`/`CheckResult` (printability.ts), `GenOptions`/provider ids (provider.ts),
  `ChatRequest`/`AgentEvent` — the SSE event union the agent loop yields (chat.ts). Read these
  files first when touching any cross-cutting feature; they define the vocabulary the rest of the
  system uses.
- **`apps/api`** — Fastify (Node 22) service intended to hold: SSE chat route driving an
  Anthropic-SDK-based agent loop (async generator yielding `AgentEvent`s), a
  `GenerationProvider` abstraction (`mock` | `tripo`, one interface in
  `apps/api/src/providers/types.ts` per the README — not yet created) swappable via
  `DRUKAR_PROVIDER`, the printability pipeline, and a `JobStore` (in-memory + JSON snapshots under
  `DRUKAR_DATA_DIR`).
- **`apps/web`** — React 19 SPA (Vite, no SSR, no router): chat UI consuming the SSE stream, a
  react-three-fiber GLB preview, and a printability report view polled via TanStack Query. Not
  yet scaffolded (`src/` doesn't exist).

### Mesh pipeline (`apps/api/src/mesh`)

Low-level mesh primitives, independent of Fastify/agent/provider code — this is the layer the
printability pipeline (not yet assembled) will be built on:

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
- `samples.ts` — programmatically generated test/mock fixtures (`clean` = watertight torus knot,
  `holed` = cube missing one triangle, `broken` = open-ended cylinder with holes too large to fill).
  These exist so the whole pipeline runs offline with zero binary fixtures and zero API keys —
  `broken` specifically stands in for hopeless generator output the agent should regenerate
  instead of repair.

### Provider abstraction (planned, per README)

`GenerationProvider` is meant to be one interface:

```ts
interface GenerationProvider {
  generate(prompt: string, options: GenOptions): Promise<{ meshPath: string; format: 'glb' | 'stl' | 'obj' }>;
}
```

selected by `DRUKAR_PROVIDER` (`mock` | `tripo`, `python` planned for later heavy mesh repair via
a separate FastAPI/trimesh service, same interface, no other module changes). When adding a
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
