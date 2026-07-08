---
id: FR
type: requirement-register
category: functional
title: Functional requirements
status: living
updated: 2026-07-08
---

# Functional requirements

What the system must *do*. Each requirement has a stable `FR-NNN` id, a MoSCoW **priority**, a
**status** (`met` · `partial` · `planned` · `dropped`), and trace links: **Satisfied by** the
feature(s) that implement it, **Traces to** the business idea(s) that motivate it. See
[index.md](../index.md) for the record conventions.

### FR-001 — Accept a plain-text object description
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-004](../features/F-004-agent-loop-sse.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- The user describes the object they want to print in natural language via the chat interface.

### FR-002 — Clarify missing constraints before generating
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-004](../features/F-004-agent-loop-sse.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- For functional parts (must fit/mate with something real), the agent asks for concrete dimensions
  and **never invents them**. Encoded in the system prompt and the `functional` gen option.

### FR-003 — Generate a 3D mesh from the prompt
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-002](../features/F-002-generation-provider-abstraction.md) · **Traces to:** [B-003](../business/B-003-delegate-generation-own-trust.md)
- Produce a mesh from the (optimized) prompt via the configured provider — the offline `mock`
  provider or the real Tripo3D `text_to_model` API (`DRUKAR_PROVIDER=tripo`).

### FR-004 — Validate printability
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-001](../features/F-001-printability-pipeline.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- Check manifold/watertight topology, minimum wall thickness, unsupported-overhang ratio, and
  build-volume fit, each as a pass/fail `CheckResult`.

### FR-005 — Apply light repair
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-001](../features/F-001-printability-pipeline.md) · **Traces to:** [B-002](../business/B-002-regenerate-over-repair.md)
- Weld coincident vertices, drop degenerate/dangling faces, make winding consistent, fill holes
  below the light-repair vertex limit.

### FR-006 — Auto-orient for minimal supports
- **Priority:** Should · **Status:** met
- **Satisfied by:** [F-001](../features/F-001-printability-pipeline.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- Rotate the model to minimize unsupported-overhang surface area before export.

### FR-007 — Rescale to target dimensions
- **Priority:** Should · **Status:** met
- **Satisfied by:** [F-001](../features/F-001-printability-pipeline.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- When the user constrains one or more axes, uniformly rescale to match; unset axes keep the
  generator's proportions.

### FR-008 — Regenerate when unrepairable
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-004](../features/F-004-agent-loop-sse.md), [F-001](../features/F-001-printability-pipeline.md) · **Traces to:** [B-002](../business/B-002-regenerate-over-repair.md)
- If a mesh is not cheaply repairable, the agent adjusts the prompt and regenerates, up to
  `DRUKAR_MAX_REGENERATIONS`; on exhaustion the job fails with a clear reason.

### FR-009 — Produce a printability report
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-001](../features/F-001-printability-pipeline.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- Every run yields a `PrintabilityReport` (per-check results, applied fixes, warnings, orientation,
  stats) — the customer's trust signal, viewable in the UI.

### FR-010 — Export print-ready files
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-001](../features/F-001-printability-pipeline.md), [F-004](../features/F-004-agent-loop-sse.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- Write a print-ready `model.stl` and a `preview.glb`, downloadable/servable per job.

### FR-011 — Stream agent progress to the client
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-004](../features/F-004-agent-loop-sse.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- Stream the agent's text, tool activity, and job updates to the browser over SSE as they happen.

### FR-012 — Persist and expose jobs + artifacts
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-004](../features/F-004-agent-loop-sse.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- Persist job state + artifacts (JSON snapshots under `DRUKAR_DATA_DIR`), survive restart, and
  expose `GET /api/jobs/:id` and its artifact endpoints.

### FR-013 — Standalone pipeline CLI
- **Priority:** Could · **Status:** met
- **Satisfied by:** [F-001](../features/F-001-printability-pipeline.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- Run the printability pipeline over a local mesh file without the rest of the app
  (`pnpm pipeline:run <mesh>`).

### FR-014 — Client-facing product description
- **Priority:** Should · **Status:** planned
- **Satisfied by:** — · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- A landing page explaining the value proposition for first-time visitors. See `TODO(landing-page)`
  in `apps/web/src/App.tsx`.

### FR-015 — Manage session and job lifecycle
- **Priority:** Should · **Status:** met
- **Satisfied by:** [F-004](../features/F-004-agent-loop-sse.md) · **Traces to:** [B-001](../business/B-001-first-try-print-guarantee.md)
- The user can start a new chat (reset the conversation + drop its server transcript), delete an
  individual job with its artifacts, and clear all jobs. Backed by `DELETE /api/chat/:chatId`,
  `DELETE /api/jobs/:id`, and `DELETE /api/jobs`.

_Next id: `FR-016`._
