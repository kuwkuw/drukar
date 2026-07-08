---
id: F-002
type: feature
title: Generation provider abstraction
status: partial
tags: [providers, generation, extensibility]
related: [B-003, F-004]
links:
  - apps/api/src/providers/types.ts
  - apps/api/src/providers/index.ts
  - apps/api/src/providers/mock.ts
  - apps/api/src/providers/tripo.ts
updated: 2026-07-08
---

### Summary

3D generation sits behind one interface, `GenerationProvider`, selected at boot by
`DRUKAR_PROVIDER` (`mock` | `tripo`). Adding a backend means implementing one method; nothing in
the agent loop or routes leaks provider-specific types.

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
- **`tripo`** ([tripo.ts](../../../apps/api/src/providers/tripo.ts)) — stub that throws until wired
  to the Tripo3D API (`TODO(tripo)`).

### Rationale

This is [B-003](../business/B-003-delegate-generation-own-trust.md) in code: generation is a
swappable commodity behind a thin seam, so external model improvements land for free and no vendor
is load-bearing. The mock provider also realizes the offline/zero-key strategy — the whole product
is demoable and testable without any paid API.

### Status & gaps

- Interface, factory, and mock provider: implemented and tested
  (`apps/api/test/providers/mock.test.ts`).
- **Tripo3D provider: not implemented** — the real text→mesh path is still a stub, so live runs
  only ever return the three sample meshes. This is the main gap between "demo" and "product."
- A future `python` provider (FastAPI + trimesh, for heavy repair) plugs in via the same interface;
  see the README and `TODO(python)`.
