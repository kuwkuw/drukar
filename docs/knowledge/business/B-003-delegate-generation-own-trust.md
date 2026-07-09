---
id: B-003
type: business
title: Delegate generation, own the trust layer
status: hypothesis
tags: [positioning, buy-vs-build, moat]
related: [B-001, F-002, F-003, F-006]
links:
  - apps/api/src/providers/types.ts
  - apps/api/src/providers/index.ts
  - apps/api/src/agent/llm-factory.ts
updated: 2026-07-09
---

### Summary

Don't compete on 3D generation or LLM quality — **buy both as swappable commodities** and invest
everything in the printability/trust layer on top. The seam is deliberately thin: each capability
is a one-method interface behind an env var, so no vendor is ever load-bearing.

### Problem

Building a competitive text-to-3D generator (or a frontier LLM) is a capital-intensive arms race
we would lose. But those capabilities are available as APIs that improve every quarter without our
effort. Owning the wrong layer means burning money to stay level; owning the right layer means the
external arms race works *for* us.

### Bet

Both commodities sit behind one-method interfaces selected at boot:

- **3D generation** — `GenerationProvider.generate()`
  ([types.ts](../../../apps/api/src/providers/types.ts)), chosen by `DRUKAR_PROVIDER` via a
  one-switch [factory](../../../apps/api/src/providers/index.ts). Adding Tripo3D was one file and
  one enum entry, with zero changes to the agent loop or routes
  ([F-002](../features/F-002-generation-provider-abstraction.md)) — evidence the seam holds.
- **LLM** — `LlmClient` behind `DRUKAR_LLM_PROVIDER`
  ([llm-factory.ts](../../../apps/api/src/agent/llm-factory.ts)): Anthropic, or any
  chat-completions-compatible server (OpenAI, Ollama, OpenRouter, Groq) via one base-URL env var
  ([F-003](../features/F-003-llm-provider-abstraction.md)).

As external models get better, our first-try success rate rises for free. Our durable work —
clarification, validation, repair, orientation, the report
([B-001](B-001-first-try-print-guarantee.md)) — is where the manufacturability expertise compounds
and where switching cost accrues.

### Why it matters

- **Ride the tide** — every improvement in Tripo3D / Claude / open models improves our metric with
  zero engineering.
- **Cost control & optionality** — the same abstraction lets us run fully offline (mock provider +
  local LLM via Ollama) for demos, tests, and cost-sensitive segments, with zero API keys. The
  [F-006](../features/F-006-free-mvp-generation-provider.md) analysis — swap the paid generator for
  a free one at MVP stage — is this optionality being exercised: a shortlist of backends, each a
  one-file provider away.
- **Negotiating leverage** — no single vendor lock-in; a pricing or terms change is a config
  change, not a rewrite.

### Risks & open questions

- If the trust layer turns out to be *easy* to replicate, the moat is thin — how much of first-try
  success is genuinely hard mesh work vs. a thin wrapper? (Same question, from the other side, as
  B-001's willingness-to-pay risk.)
- Provider APIs can change pricing or terms; multi-provider mitigates but doesn't eliminate this.
- A generator good enough to be printable *without* our layer would collapse the thesis — but that
  also implies clarification/validation still add value, just less.
- The abstraction has only absorbed *similar* backends so far (HTTP task APIs, chat-completions
  servers). A structurally different one — e.g. the planned self-hosted `python` service — is the
  real test of whether the seam stays thin.
