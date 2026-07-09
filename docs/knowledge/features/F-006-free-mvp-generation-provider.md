---
id: F-006
type: feature
title: Free generation provider for MVP
status: idea
tags: [providers, generation, cost, mvp]
related: [B-003, F-002]
links:
  - apps/api/src/providers/index.ts
  - apps/api/src/providers/tripo.ts
updated: 2026-07-09
---

### Summary

Decision record. Drukar's paid generation dependency is Tripo3D ([F-002](F-002-generation-provider-abstraction.md)).
For the MVP we want a **free** text-to-3D backend. This entry captures the realistic options and
their tradeoffs so the choice is durable and revisitable — no code committed yet.

The framing that makes this easy: generation quality is explicitly *not* the differentiator
([B-003](../business/B-003-delegate-generation-own-trust.md)); the trust/printability layer is. So
the MVP backend only needs to emit *some* prompt-shaped mesh cheaply — Tripo-grade output is not
required. Swapping backends is a one-file provider plus one enum entry
([types.ts](../../../apps/api/src/providers/types.ts) contract,
[provider.ts](../../../packages/shared/src/provider.ts) id); nothing in the agent loop or pipeline
changes.

### Options considered

| Option | Cost | Infra | Quality | Effort |
|---|---|---|---|---|
| Keep `mock` (current default) | $0 | none | ignores prompt | 0 — already shipped |
| **HF Space API** (Hunyuan3D-2 / Shap-E via gradio/HTTP) | $0, rate-limited | none | decent→good | new `tripo.ts`-style fetch provider |
| **Self-host open model** (Shap-E MIT, or Hunyuan3D) | $0 *if* GPU owned | Python/FastAPI service + GPU | Shap-E low / Hunyuan3D high | new service; fills the planned `python` slot |
| **Tripo free tier** | free credits, then paid | none | high | 0 code — just a free-tier key |
| **Replicate / fal.ai** | small free credits, then paid | none | high | fetch provider, not *durably* free |

Notes:
- **HF Space API** is the lowest-friction genuinely-free path and fits the existing fetch-based
  provider pattern (create → poll → download GLB), but free Spaces rate-limit and occasionally go
  down — acceptable for a demo/MVP, not for paying users.
- **Self-hosting Shap-E** (MIT-licensed, text-to-3D, outputs manifold-ish meshes directly) reuses
  the `python` provider slot already anticipated in [F-002](F-002-generation-provider-abstraction.md)
  and the README `TODO(python)`. Reliable and free, but needs a GPU (slow on CPU) and adds a service
  to operate.
- **Tripo's own free tier** is the cheapest change (no code), but keeps a paid vendor load-bearing.

### Recommendation

For an MVP that stays free with **zero new infrastructure**: add an `hf` provider backed by a
Hugging Face Space (Hunyuan3D-2 or Shap-E), keep `mock` as the default/offline path, and leave
`tripo` as the paid "good" tier. Revisit toward self-hosting (durable, GPU-backed) once generation
volume or reliability matters. The real fork is infra: no GPU → HF Space; GPU available →
self-hosted Shap-E/Hunyuan3D.

### Status & gaps

- `idea` — analysis only, nothing implemented. When chosen, promote to `planned`/`partial`, add the
  provider id to [provider.ts](../../../packages/shared/src/provider.ts) + the
  [factory](../../../apps/api/src/providers/index.ts), and document the new backend in F-002.
- Reliability of free HF Spaces is unverified; the self-host path's GPU requirement is the main
  constraint to confirm before committing.
