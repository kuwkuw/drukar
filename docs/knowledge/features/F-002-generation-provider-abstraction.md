---
id: F-002
type: feature
title: Generation provider abstraction
status: implemented
tags: [providers, generation, extensibility]
related: [B-003, F-004]
links:
  - apps/api/src/providers/types.ts
  - apps/api/src/providers/index.ts
  - apps/api/src/providers/mock.ts
  - apps/api/src/providers/tripo.ts
  - apps/api/src/providers/hf.ts
updated: 2026-07-10
---

### Summary

3D generation sits behind one interface, `GenerationProvider`, selected at boot by
`DRUKAR_PROVIDER` (`mock` | `tripo` | `hf`). Adding a backend means implementing one method;
nothing in the agent loop or routes leaks provider-specific types.

### How it works

[types.ts](../../../apps/api/src/providers/types.ts):

```ts
interface GenerationProvider {
  generate(prompt: string, options: GenOptions): Promise<{ meshPath: string; format: MeshFormat }>;
}
```

`createProvider(id)` in [index.ts](../../../apps/api/src/providers/index.ts) is a one-switch
factory. Implementations:

- **`mock`** ([mock.ts](../../../apps/api/src/providers/mock.ts)) — keyword-picks a programmatic
  sample mesh (clean / holed / broken), writes it to a temp STL. Runs fully offline, zero keys, and
  lets tests/demos deterministically exercise the regenerate-on-failure path (a "broken" prompt
  yields an unrepairable mesh).
- **`tripo`** ([tripo.ts](../../../apps/api/src/providers/tripo.ts)) — real Tripo3D client: creates
  a `text_to_model` task, polls until success, downloads the resulting GLB to a temp file. Requires
  `TRIPO_API_KEY`.
- **`hf`** ([hf.ts](../../../apps/api/src/providers/hf.ts)) — free text-to-3D via a Hugging Face
  gradio Space (default `hysts/Shap-E`), zero keys required; see
  [F-006](F-006-free-mvp-generation-provider.md). Uses the gradio call protocol
  (POST `/gradio_api/call/<api_name>` → SSE result stream → file download). `DRUKAR_HF_SPACE_URL`
  can point it at any Space with a compatible text→Model3D endpoint; optional `HF_TOKEN` raises the
  free ZeroGPU quota.

### Rationale

This is [B-003](../business/B-003-delegate-generation-own-trust.md) in code: generation is a
swappable commodity behind a thin seam, so external model improvements land for free and no vendor
is load-bearing. The mock provider also realizes the offline/zero-key strategy — the whole product
is demoable and testable without any paid API.

### Status & gaps

- Interface, factory, mock, Tripo3D, and HF Space providers: implemented and tested
  (`apps/api/test/providers/mock.test.ts`, `tripo.test.ts`, `hf.test.ts` — the latter two drive
  their HTTP flows with an injected `fetch`).
- A future `python` provider (FastAPI + trimesh, for heavy repair) plugs in via the same interface;
  see the README and `TODO(python)`.
