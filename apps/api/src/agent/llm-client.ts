import type Anthropic from '@anthropic-ai/sdk';

export type LlmStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'message_stop'; content: Anthropic.ContentBlock[]; stopReason: Anthropic.StopReason | null };

export interface LlmStreamParams {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  /** Aborts the in-flight request (e.g. the SSE client disconnected). */
  signal?: AbortSignal | undefined;
}

/** Seam between the agent loop and the LLM backend, so tests can script responses
 * instead of calling a real API. Implementations are selected by DRUKAR_LLM_PROVIDER via
 * createLlmClient() in llm-factory.ts; a native-SDK provider (e.g. @google/genai) slots in
 * as another implementation there with no other module changes. */
export interface LlmClient {
  streamMessage(params: LlmStreamParams): AsyncIterable<LlmStreamEvent>;
}
