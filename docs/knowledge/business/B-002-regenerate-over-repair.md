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
  - apps/api/src/agent/system-prompt.ts
  - apps/api/src/mesh/samples.ts
updated: 2026-07-09
---

### Summary

When a generated mesh can't be fixed cheaply, the agent **regenerates with an adjusted prompt**
rather than attempting heavy mesh surgery. Regeneration is cheaper, more reliable, and higher
quality than voxel-remeshing a hopeless mesh — a bad mesh is a symptom of a bad *generation*, and
the fix belongs at that level.

### Problem

There are two ways to turn a broken generated mesh into a printable one: repair it, or make a new
one. Heavy repair (voxel remeshing, hole-filling large boundaries, re-topologizing) is expensive
compute, often degrades the shape, and still fails on genuinely bad input. Endlessly repairing
garbage is a losing trade — and worse, an unbounded one: there is no natural stopping point to
"repair harder."

### Bet

A cheap **light-repair** pass (weld vertices, drop degenerate/dangling faces, fix winding, fill
*small* holes, rescale, auto-orient) fixes the common near-misses. Anything worse is a signal that
the *generation* was wrong, not the mesh — so the right move is to adjust the prompt and try again.

The policy is one computed boolean, decided in
[pipeline.ts](../../../apps/api/src/mesh/pipeline.ts): `repairable = no non-manifold edges AND
every boundary loop ≤ MAX_FILL_LOOP_VERTS` (currently 24 vertices). Everything downstream just
reacts to it:

- the pipeline fan-fills holes only when `repairable`, otherwise leaves them open and records a
  warning ([F-001](../features/F-001-printability-pipeline.md));
- the [agent loop](../../../apps/api/src/agent/loop.ts) maps the outcome to job status — pass →
  `done`, attempts exhausted → `failed`, else → regenerate ([F-004](../features/F-004-agent-loop-sse.md));
- the [system prompt](../../../apps/api/src/agent/system-prompt.ts) instructs the model to address
  the *specific* failure in the adjusted prompt (thicken thin walls, simplify unrepairable
  topology) rather than retry verbatim;
- `DRUKAR_MAX_REGENERATIONS` (default 2, so 3 attempts total) caps the loop.

### Why it matters

- **Cost & latency** — a second generation call is bounded and predictable; unbounded repair is
  not. The attempt cap turns worst-case cost into a known constant per job.
- **Quality** — a fresh clean mesh beats a heavily-patched one; heavy repair trades away exactly
  the surface fidelity the user asked for.
- **Clean architecture** — the policy lives in one place (`repairable` in the pipeline) and the
  agent loop just reacts to it, keeping the decision auditable in the report and the event stream.
- **Guarantee coherence** — shipping a patched-over mesh would undermine the first-try promise
  ([B-001](B-001-first-try-print-guarantee.md)); regeneration keeps every export something the
  report can honestly vouch for.

### Risks & open questions

- Regeneration isn't free — the hard cap (`DRUKAR_MAX_REGENERATIONS`) prevents runaway loops, but
  the right default is unproven; 2 is a guess, not a measurement.
- If a generator reliably produces *almost*-printable meshes with large-but-simple holes, a
  slightly stronger repair might beat regeneration. The `MAX_FILL_LOOP_VERTS` threshold (24) is the
  dial, and it has not been tuned against real generator output.
- Does prompt adjustment actually *converge*? The system prompt asks the model to fix the named
  defect, but whether generators respond to "thicker walls" instructions is unmeasured.
- "Validated" means the pipeline + agent implement and prove the loop offline — the `broken`
  [sample](../../../apps/api/src/mesh/samples.ts) (holes above the fill limit) deterministically
  drives the regenerate path in tests. The *economic* claim (cheaper at scale) still needs real
  provider-cost data.
