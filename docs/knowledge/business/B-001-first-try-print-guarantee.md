---
id: B-001
type: business
title: First-try print guarantee is the product
status: hypothesis
tags: [positioning, differentiator, trust]
related: [B-002, B-003, F-001, F-005]
links:
  - README.md
  - CLAUDE.md
  - apps/web/src/components/Landing.tsx
updated: 2026-07-09
---

### Summary

Drukar's value is not that it generates a 3D model — it's that the model it hands you **prints
successfully on the first try**. The guarantee, not the generation, is what a customer pays for, and
the per-check [printability report](../features/F-001-printability-pipeline.md) is the evidence that
makes that guarantee legible rather than a marketing claim.

### Problem

Text-to-3D generators are improving fast, but their output is routinely un-printable: non-manifold
meshes, holes, walls thinner than the nozzle, unsupported overhangs, wrong scale. The person who
just wanted "a bracket that fits a 25mm pipe" burns an evening slicing, failing, re-orienting, and
patching — or a spool of filament on a print that peels off the bed. The gap between "a mesh" and
"a mesh that prints" is where the frustration lives, and it is invisible until the print has already
failed. Nothing in a generator's preview tells you the wall is 0.3mm too thin.

### Bet

We can own that gap as a product surface — a pipeline the user never has to think about:

> **clarify → generate → validate → light repair → (regenerate) → export**

Every export carries a report scoring the checks that decide printability — manifold/watertight,
minimum wall thickness, overhang ratio, build-volume fit ([F-001](../features/F-001-printability-pipeline.md))
— so "it will print" is a claim we can *show*, not just assert. When a mesh is beyond cheap repair
the agent regenerates with an adjusted prompt instead of shipping a patched-over result
([B-002](B-002-regenerate-over-repair.md)); generation quality itself is a rising tide we ride
([B-003](B-003-delegate-generation-own-trust.md)). The defensible work is the validation + repair +
regeneration loop, not the model behind it.

### Why it matters

- **Differentiation** — competitors sell "look what it made"; we sell "it will print." That's a
  different, stickier promise, aimed at people who want an object, not a modelling hobby.
- **Trust is measurable** — the printability report is a concrete artifact the customer can point
  to, and "% of first-try successful prints" is a metric we can optimize and market. It is defined
  as the north-star ([NFR-003](../requirements/non-functional.md#nfr-003--first-try-print-success-is-the-north-star-metric))
  but **not yet instrumented** — until it is, the core claim is asserted, not proven.
- **Articulated up front** — the promise is stated to the visitor before they spend anything, via
  the [landing page](../features/F-005-landing-page.md) (F-005), so the pitch and the product tell
  the same story.
- **Defensibility** — mesh-topology and manufacturability expertise compounds; raw generation is a
  commodity API call that improves without us.

### Risks & open questions

- Is "% first-try success" high enough with *light* repair alone, or does it force us into heavy
  repair / a Python remeshing backend sooner than planned? The [regenerate-over-repair](B-002-regenerate-over-repair.md)
  bet assumes light repair covers the common near-misses — unproven against real generator output.
- How much does clarification (asking for dimensions on functional parts) actually move success
  vs. annoy users who want one-shot results?
- The guarantee is only as credible as the metric behind it, and the metric isn't wired up yet
  (NFR-003) — we can't yet quote a number, only a process.
- Willingness to pay: is the guarantee worth a subscription, or only a per-export fee?
