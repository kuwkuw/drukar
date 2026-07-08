---
id: F-004
type: feature
title: Agent loop over SSE
status: implemented
tags: [agent, sse, orchestration, jobs]
related: [B-001, B-002, F-001, F-002, F-003]
links:
  - apps/api/src/agent/loop.ts
  - apps/api/src/agent/tools.ts
  - apps/api/src/agent/system-prompt.ts
  - apps/api/src/routes/chat.ts
  - apps/api/src/jobs/store.ts
  - packages/shared/src/chat.ts
updated: 2026-07-08
---

### Summary

The orchestration core: an async generator that drives a tool-calling LLM through
clarify → generate → validate → repair → (regenerate) → done, yielding a typed `AgentEvent`
stream that the SSE chat route pipes straight to the browser.

### How it works

`runAgentLoop({ chatId, message }, deps)` in [loop.ts](../../../apps/api/src/agent/loop.ts):

1. Loads per-chat transcript from the `SessionStore`, appends the user message.
2. Streams from the `LlmClient` ([F-003](F-003-llm-provider-abstraction.md)), re-emitting
   `text_chunk` events; on `message_stop`, pushes the assistant turn into history.
3. If the model called the `generate_model` tool
   ([tools.ts](../../../apps/api/src/agent/tools.ts)): runs the generation provider
   ([F-002](F-002-generation-provider-abstraction.md)) → `runPrintabilityPipeline`
   ([F-001](F-001-printability-pipeline.md)) → saves `model.stl` + `preview.glb`, updates the `Job`
   via the [JobStore](../../../apps/api/src/jobs/store.ts), and emits `tool_started` /
   `tool_finished` / `job_update`. Status logic: pass → `done`; else attempts exhausted → `failed`;
   else → `generating` (the model is expected to adjust the prompt and retry — this is
   [B-002](../business/B-002-regenerate-over-repair.md) in action).
4. No tool call → emits `question_for_user` (clarification) and hands back to the user.
5. Wraps everything in try/catch → `error` event; always ends with `done`.

The [system prompt](../../../apps/api/src/agent/system-prompt.ts) encodes the policy (clarify
before generating functional parts, never invent dimensions, regenerate on unrepairable results).
The `AgentEvent` union lives in [packages/shared](../../../packages/shared/src/chat.ts);
[routes/chat.ts](../../../apps/api/src/routes/chat.ts) serializes each event as an SSE `data:` frame.

### Rationale

This is where the product's promise ([B-001](../business/B-001-first-try-print-guarantee.md))
becomes a live, observable process. Modeling the loop as an async generator of typed events keeps
it: (a) testable with a scripted `LlmClient` (no network), (b) transport-agnostic (SSE today,
anything later), and (c) provider-agnostic (both mesh and LLM backends are injected `deps`).

### Status & gaps

- Implemented and covered by `apps/api/test/agent/loop.test.ts` (clean / regenerate / clarify
  paths) and the route tests; verified live via the web UI against Ollama.
- SSE only, no reconnect/resume; `SessionStore` is in-memory (transcripts lost on restart).
- UI-side processing visibility during the loop is thin — see `TODO(ui-visibility)` in
  `apps/web/src/hooks/useChat.ts`.
