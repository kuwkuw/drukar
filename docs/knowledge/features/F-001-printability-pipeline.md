---
id: F-001
type: feature
title: Printability pipeline
status: implemented
tags: [mesh, validation, repair, ip]
related: [B-001, B-002]
links:
  - apps/api/src/mesh/pipeline.ts
  - apps/api/src/mesh/checks.ts
  - apps/api/src/mesh/topology.ts
  - apps/api/src/mesh/orient.ts
  - apps/api/src/cli/run-pipeline.ts
  - packages/shared/src/printability.ts
updated: 2026-07-08
---

### Summary

The product's IP: a pure function that takes a raw mesh and returns the finished mesh plus a
`PrintabilityReport` — validating manifoldness, wall thickness, overhangs and build volume,
applying light repair and auto-orientation along the way. Runs standalone, offline, with zero
API keys.

### How it works

`runPrintabilityPipeline(mesh, options, config)` in
[pipeline.ts](../../../apps/api/src/mesh/pipeline.ts) runs a fixed sequence:

1. **Normalize** — weld coincident vertices, drop degenerate faces.
2. **De-fin** — remove dangling triangles that masquerade as boundary.
3. **Orient** — make winding consistent per shell (BFS over face adjacency); flip globally
   inverted meshes (negative signed volume).
4. **Decide repairability** — from topology ([topology.ts](../../../apps/api/src/mesh/topology.ts)):
   `repairable = no non-manifold edges AND every boundary loop ≤ MAX_FILL_LOOP_VERTS`. If
   repairable, fan-fill small holes; otherwise leave them and record a warning.
5. **Rescale** to requested target dimensions (uniform, averaged across constrained axes).
6. **Auto-orient** ([orient.ts](../../../apps/api/src/mesh/orient.ts)) to minimize unsupported
   overhang area.
7. **Check** ([checks.ts](../../../apps/api/src/mesh/checks.ts)) — manifold/watertight, min wall
   thickness (BVH ray shoot-through), overhang ratio, build-volume fit — into `CheckResult`s.

The report shape (`PrintabilityReport`, `CheckResult`, `AppliedFix`, ...) lives in
[packages/shared](../../../packages/shared/src/printability.ts) so api and web share one contract.
[run-pipeline.ts](../../../apps/api/src/cli/run-pipeline.ts) exposes it as `pnpm pipeline:run`.

### Rationale

This layer is where [B-001](../business/B-001-first-try-print-guarantee.md) (the guarantee) and
[B-002](../business/B-002-regenerate-over-repair.md) (regenerate over repair) become concrete. The
`repairable` flag *is* the regenerate-vs-repair decision, computed once and consumed by the agent.
Keeping the pipeline a pure, framework-free function makes it independently testable and reusable
(CLI, agent, future batch tooling) — it depends on no Fastify/agent/provider code.

### Status & gaps

- Implemented and covered by `apps/api/test/pipeline.test.ts` (clean/holed/broken samples,
  rescale, build-volume, thin-wall).
- Light repair only. Heavy repair (voxel remeshing) is deliberately out of scope — the fallback is
  regeneration, and a future `TODO(python)` service would slot in if the success metric demands it.
- Thresholds (`MAX_FILL_LOOP_VERTS`, overhang degrees, min wall) are config/const, not yet tuned
  against real generator output.
