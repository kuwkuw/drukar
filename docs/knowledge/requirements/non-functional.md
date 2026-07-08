---
id: NFR
type: requirement-register
category: non-functional
title: Non-functional requirements
status: living
updated: 2026-07-08
---

# Non-functional requirements

Qualities and constraints — *how well*, not *what*. Each has a stable `NFR-NNN` id, a MoSCoW
**priority**, a **status** (`met` · `partial` · `planned` · `dropped`), and trace links. See
[index.md](../index.md) for the record conventions.

### NFR-001 — Offline-first, zero-key default
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-002](../features/F-002-generation-provider-abstraction.md), [F-003](../features/F-003-llm-provider-abstraction.md) · **Traces to:** [B-003](../business/B-003-delegate-generation-own-trust.md)
- The whole product runs with no API keys: mock generation provider + a local LLM (Ollama). Tests
  and demos require zero paid services.

### NFR-002 — Provider-agnostic backends
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-002](../features/F-002-generation-provider-abstraction.md), [F-003](../features/F-003-llm-provider-abstraction.md) · **Traces to:** [B-003](../business/B-003-delegate-generation-own-trust.md)
- Both 3D generation and the LLM are swappable via env var behind one-method interfaces; adding a
  backend touches no agent/route code.

### NFR-003 — First-try print success is the north-star metric
- **Priority:** Must · **Status:** planned
- **Satisfied by:** [F-001](../features/F-001-printability-pipeline.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- "% of first-try successful prints" is the metric the system optimizes. **Not yet instrumented**;
  target value TBD.

### NFR-004 — Deterministic, testable core
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-001](../features/F-001-printability-pipeline.md), [F-004](../features/F-004-agent-loop-sse.md) · **Traces to:** [B-002](../business/B-002-regenerate-over-repair.md)
- The pipeline is a pure function; the agent loop runs against a scripted `LlmClient`; samples are
  generated programmatically (no binary fixtures). Everything is unit-testable offline.

### NFR-005 — Type-safe cross-boundary contracts
- **Priority:** Must · **Status:** met
- **Satisfied by:** — (`packages/shared`) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- Every api↔web shape (`Job`, `AgentEvent`, `PrintabilityReport`, `GenOptions`, ...) is a zod schema
  with inferred TS types in `packages/shared` — one source of truth, validated at the boundary.

### NFR-006 — Interactive latency
- **Priority:** Should · **Status:** partial
- **Satisfied by:** [F-001](../features/F-001-printability-pipeline.md), [F-004](../features/F-004-agent-loop-sse.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- The pipeline processes a single mesh in seconds; large outputs are streamed to avoid timeouts.
  End-to-end latency depends on the (external) generator/LLM and is not yet budgeted or measured.

### NFR-007 — Portable, container-deployable
- **Priority:** Should · **Status:** partial
- **Satisfied by:** — (Dockerfiles, `docker-compose.yml`) · **Traces to:** [B-003](../business/B-003-delegate-generation-own-trust.md)
- Node >=22 pnpm workspace; production-shaped Docker images (api :3000, web :8080 via nginx).
  **`docker compose up` has not been verified end-to-end.**

### NFR-008 — Observability
- **Priority:** Should · **Status:** met
- **Satisfied by:** [F-004](../features/F-004-agent-loop-sse.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- The API logs incoming requests and a startup summary (provider, model, data dir) to the console.
  Health endpoint at `/healthz`.

### NFR-009 — Secret hygiene
- **Priority:** Must · **Status:** met
- **Satisfied by:** — (`.env`, `.gitignore`) · **Traces to:** [B-003](../business/B-003-delegate-generation-own-trust.md)
- API keys are supplied via env / `.env` only, never committed; `.env.example` documents every var
  with safe offline defaults.

### NFR-010 — Cost control
- **Priority:** Should · **Status:** met
- **Satisfied by:** [F-002](../features/F-002-generation-provider-abstraction.md), [F-003](../features/F-003-llm-provider-abstraction.md) · **Traces to:** [B-003](../business/B-003-delegate-generation-own-trust.md)
- Mock + local-LLM paths make demos, development and cost-sensitive use free; provider choice bounds
  per-run spend.

_Next id: `NFR-011`._
