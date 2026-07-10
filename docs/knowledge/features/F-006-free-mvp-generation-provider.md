---
id: F-006
type: feature
title: Free generation provider for MVP
status: implemented
tags: [providers, generation, cost, mvp]
related: [B-003, F-002]
links:
  - apps/api/src/providers/hf.ts
  - apps/api/src/providers/index.ts
  - apps/api/test/providers/hf.test.ts
updated: 2026-07-10
---

### Summary

Decision record, now executed. Drukar's paid generation dependency is Tripo3D
([F-002](F-002-generation-provider-abstraction.md)). For the MVP we wanted a **free** text-to-3D
backend. This entry captures the realistic options and their tradeoffs so the choice is durable
and revisitable. **Built**: the `hf` provider
([hf.ts](../../../apps/api/src/providers/hf.ts)) per the recommendation below — a Hugging Face
gradio Space client, defaulting to `hysts/Shap-E`, zero keys required.

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

- `implemented` — `DRUKAR_PROVIDER=hf` selects
  [hf.ts](../../../apps/api/src/providers/hf.ts), which drives the gradio 5 call protocol
  (POST `/gradio_api/call/<api_name>` → `event_id` → SSE result stream → file download), mirroring
  the fetch-injected `tripo.ts` shape. Unit-tested
  ([hf.test.ts](../../../apps/api/test/providers/hf.test.ts)) and **live-verified 2026-07-10**: an
  anonymous call to `hysts/Shap-E` returned a coffee-mug GLB (~165k triangles) in **6.8s**, and the
  mesh loads through the pipeline's `loadMesh`.
- **Why Shap-E over Hunyuan3D-2**: `hysts/Shap-E` is the only surveyed Space with a *named*, stable
  gradio endpoint (`api_name="text-to-3d"`, single prompt input, `gr.Model3D` GLB output). The
  official `tencent/Hunyuan3D-2` Space declares no `api_name`s and its text tab is conditional on
  the Space's runtime config — brittle to call programmatically.
- `DRUKAR_HF_SPACE_URL` + the provider's `apiName` option let it target any compatible Space, so a
  better free Space (e.g. a Hunyuan3D fork exposing a named endpoint) is a config change, not code.
- Remaining risks, accepted for MVP: free ZeroGPU quota is small for anonymous callers (an
  `HF_TOKEN` raises it; errors surface a retry/token hint), the Space can go down or change its
  signature, and Shap-E quality is low — fine per [B-003](../business/B-003-delegate-generation-own-trust.md),
  since the printability layer is the product. `mock` stays the default; `tripo` stays the paid
  "good" tier. Revisit self-hosting when volume or reliability matters.
