import type Anthropic from '@anthropic-ai/sdk';

export type LlmStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'message_stop'; content: Anthropic.ContentBlock[]; stopReason: Anthropic.StopReason | null };

export interface LlmStreamParams {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
}

/** Seam between the agent loop and the LLM backend, so tests can script responses
 * instead of calling the real Anthropic API. */
// TODO(llm-providers): support switching LLM models across providers (OpenAI, Google, local
// via Ollama, ...) — add a DRUKAR_LLM_PROVIDER env var + a factory like providers/index.ts,
// with one LlmClient implementation per provider. The agent loop only depends on this
// interface, so no other module changes.
export interface LlmClient {
  streamMessage(params: LlmStreamParams): AsyncIterable<LlmStreamEvent>;
}
