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
export interface LlmClient {
  streamMessage(params: LlmStreamParams): AsyncIterable<LlmStreamEvent>;
}
