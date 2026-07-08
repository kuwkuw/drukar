---
id: B-001
type: business
title: First-try print guarantee is the product
status: hypothesis
tags: [positioning, differentiator, trust]
related: [B-002, B-003, F-001]
links:
  - README.md
  - CLAUDE.md
updated: 2026-07-08
---

### Summary

Drukar's value is not that it generates a 3D model — it's that the model it hands you **prints
successfully on the first try**. The guarantee, not the generation, is what a customer pays for.

### Problem

Text-to-3D generators are improving fast, but their output is routinely un-printable: non-manifold
meshes, holes, walls thinner than the nozzle, unsupported overhangs, wrong scale. The person who
just wanted "a bracket that fits a 25mm pipe" burns an evening slicing, failing, re-orienting, and
patching — or a spool of filament on a print that peels off the bed. The gap between "a mesh" and
"a mesh that prints" is where the frustration lives.

### Bet

We can own that gap as a product surface: **requirement clarification → generation → automated
printability validation → light repair → export**, with a per-check report that tells the user
exactly why the result is trustworthy. Generation quality is a rising tide we ride (see
[B-003](B-003-delegate-generation-own-trust.md)); the defensible work is the validation + repair +
regeneration loop ([F-001](../features/F-001-printability-pipeline.md)).

### Why it matters

- **Differentiation** — competitors sell "look what it made"; we sell "it will print." That's a
  different, stickier promise.
- **Trust is measurable** — the printability report is a concrete artifact the customer can point
  to, and "% of first-try successful prints" is a metric we can optimize and market.
- **Defensibility** — mesh-topology and manufacturability expertise compounds; raw generation is a
  commodity API call.

### Risks & open questions

- Is "% first-try success" high enough with *light* repair alone, or does it force us into heavy
  repair / a Python remeshing backend sooner than planned? (See `TODO(python)` in the README.)
- How much does clarification (asking for dimensions on functional parts) actually move success
  vs. annoy users who want one-shot results?
- Willingness to pay: is the guarantee worth a subscription, or only a per-export fee?
