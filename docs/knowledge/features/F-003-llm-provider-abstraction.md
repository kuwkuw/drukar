---
id: F-003
type: feature
title: LLM provider abstraction
status: implemented
tags: [providers, llm, agent, cost]
related: [B-003, F-004]
links:
  - apps/api/src/agent/llm-client.ts
  - apps/api/src/agent/llm-factory.ts
  - apps/api/src/agent/anthropic-client.ts
  - apps/api/src/agent/openai-client.ts
  - apps/api/src/config.ts
updated: 2026-07-08
---

### Summary

The LLM driving the agent loop sits behind the `LlmClient` seam, selected at boot by
`DRUKAR_LLM_PROVIDER` (`anthropic` | `openai`). Because the `openai` client speaks the
chat-completions protocol with a configurable base URL, one implementation covers OpenAI, Ollama
(local), OpenRouter, Groq, Mistral and Gemini's compat endpoint.

### How it works

[llm-client.ts](../../../apps/api/src/agent/llm-client.ts) defines the seam: `streamMessage()`
yields a small `LlmStreamEvent` union (`text_delta` | `message_stop`). `createLlmClient(config)` in
[llm-factory.ts](../../../apps/api/src/agent/llm-factory.ts) switches on the provider id.

- **Anthropic** ([anthropic-client.ts](../../../apps/api/src/agent/anthropic-client.ts)) — wraps the
  Anthropic SDK stream.
- **OpenAI-compatible** ([openai-client.ts](../../../apps/api/src/agent/openai-client.ts)) — a pure
  adapter. Anthropic wire shapes stay the **internal canonical format** (`MessageParam` history,
  `Tool` defs, `ContentBlock` events); the adapter translates messages/tools/tool-calls at its own
  boundary and accumulates streamed tool-call argument chunks. The agent loop and session store
  never see OpenAI types.

Config lives in [config.ts](../../../apps/api/src/config.ts) (`DRUKAR_LLM_BASE_URL`,
`DRUKAR_LLM_API_KEY`, with a placeholder key for Ollama).

### Rationale

Another expression of [B-003](../business/B-003-delegate-generation-own-trust.md): the reasoning
model is a commodity behind a seam, so we ride model improvements and avoid lock-in. The
chat-completions coverage matters for **cost and demoability** — pointing at a local Ollama model
runs the entire agent loop with zero API spend, which is how the product is currently exercised
end-to-end.

### Status & gaps

- Both clients, the factory, config, and translation helpers: implemented and tested
  (`apps/api/test/agent/openai-client.test.ts`, `llm-factory.test.ts`), and verified live against
  local Ollama (`gemma4:e4b`).
- Switching is **boot-time only** (env). Per-chat/runtime model selection from the UI is a possible
  later extension (would touch `ChatRequest` + the UI).
- Native-SDK providers (e.g. `@google/genai`) can slot in as another `LlmClient` with no other
  module changes.
