---
id: B-002
type: business
title: Regenerate over repair
status: validated
tags: [economics, pipeline-policy]
related: [B-001, F-001, F-004]
links:
  - apps/api/src/mesh/pipeline.ts
  - apps/api/src/agent/loop.ts
updated: 2026-07-08
---

### Summary

When a generated mesh can't be fixed cheaply, the agent **regenerates with an adjusted prompt**
rather than attempting heavy mesh surgery. Regeneration is cheaper, more reliable, and higher
quality than voxel-remeshing a hopeless mesh.

### Problem

There are two ways to turn a broken generated mesh into a printable one: repair it, or make a new
one. Heavy repair (voxel remeshing, hole-filling large boundaries, re-topologizing) is expensive
compute, often degrades the shape, and still fails on genuinely bad input. Endlessly repairing
garbage is a losing trade.

### Bet

A cheap **light-repair** pass (weld vertices, drop degenerate/dangling faces, fix winding, fill
*small* holes, rescale, auto-orient) fixes the common near-misses. Anything worse is a signal that
the *generation* was wrong, not the mesh — so the right move is to adjust the prompt and try again.
The pipeline encodes this as a `repairable` boolean: holes above a vertex limit or non-manifold
edges flip it to `false`, and the agent treats `false` as "regenerate," not "repair harder."

### Why it matters

- **Cost & latency** — a second generation call is bounded and predictable; unbounded repair is
  not.
- **Quality** — a fresh clean mesh beats a heavily-patched one.
- **Clean architecture** — the policy lives in one place (`repairable` in the pipeline) and the
  agent loop just reacts to it, keeping the decision auditable.

### Risks & open questions

- Regeneration isn't free — a hard cap (`DRUKAR_MAX_REGENERATIONS`) prevents runaway loops, but the
  right default is unproven.
- If a generator reliably produces *almost*-printable meshes with large-but-simple holes, a
  slightly stronger repair might beat regeneration. The `MAX_FILL_LOOP_VERTS` threshold is the dial.
- This is "validated" in the sense that the pipeline + agent implement and prove the loop offline;
  the *economic* claim (cheaper at scale) still needs real provider-cost data.
