import type Anthropic from '@anthropic-ai/sdk';
import type { LlmClient, LlmStreamEvent, LlmStreamParams } from '../../src/agent/llm-client.js';

export type ScriptedTurn = { text?: string; toolCalls?: { id: string; name: string; input: unknown }[] };

/** Fake LlmClient that replays a fixed sequence of turns, one per streamMessage() call. */
export class ScriptedLlmClient implements LlmClient {
  private callIndex = 0;
  constructor(private readonly turns: ScriptedTurn[]) {}

  async *streamMessage(_params: LlmStreamParams): AsyncGenerator<LlmStreamEvent> {
    const turn = this.turns[this.callIndex++];
    if (!turn) throw new Error('ScriptedLlmClient: no more scripted turns');

    const content: Anthropic.ContentBlock[] = [];
    if (turn.text) {
      for (const ch of turn.text) yield { type: 'text_delta', text: ch };
      content.push({ type: 'text', text: turn.text, citations: null });
    }
    for (const call of turn.toolCalls ?? []) {
      content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input, caller: { type: 'direct' } });
    }

    yield {
      type: 'message_stop',
      content,
      stopReason: (turn.toolCalls?.length ?? 0) > 0 ? 'tool_use' : 'end_turn',
    };
  }
}
