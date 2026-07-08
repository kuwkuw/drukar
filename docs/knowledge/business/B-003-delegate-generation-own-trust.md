---
id: B-003
type: business
title: Delegate generation, own the trust layer
status: hypothesis
tags: [positioning, buy-vs-build, moat]
related: [B-001, F-002, F-003]
links:
  - apps/api/src/providers/types.ts
  - apps/api/src/agent/llm-factory.ts
updated: 2026-07-08
---

### Summary

Don't compete on 3D generation or LLM quality — **buy both as swappable commodities** and invest
everything in the printability/trust layer on top.

### Problem

Building a competitive text-to-3D generator (or a frontier LLM) is a capital-intensive arms race
we would lose. But those capabilities are available as APIs that improve every quarter without our
effort. Owning the wrong layer means burning money to stay level; owning the right layer means the
external arms race works *for* us.

### Bet

Both the 3D generator and the LLM sit behind one-method interfaces
([F-002](../features/F-002-generation-provider-abstraction.md),
[F-003](../features/F-003-llm-provider-abstraction.md)), selected by env var. As external models
get better, our first-try success rate rises for free. Our durable work — clarification,
validation, repair, orientation, the report ([B-001](B-001-first-try-print-guarantee.md)) — is
where the manufacturability expertise compounds and where switching cost accrues.

### Why it matters

- **Ride the tide** — every improvement in Tripo3D / Claude / open models improves our metric with
  zero engineering.
- **Cost control & optionality** — the same abstraction that lets us swap providers lets us run
  fully offline (mock provider + local LLM via Ollama) for demos, tests, and cost-sensitive
  segments, with zero API keys.
- **Negotiating leverage** — no single vendor lock-in.

### Risks & open questions

- If the trust layer turns out to be *easy* to replicate, the moat is thin — how much of first-try
  success is genuinely hard mesh work vs. a thin wrapper?
- Provider APIs can change pricing or terms; multi-provider mitigates but doesn't eliminate this.
- A generator good enough to be printable *without* our layer would collapse the thesis — but that
  also implies clarification/validation still add value, just less.
