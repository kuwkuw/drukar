import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient, LlmStreamEvent, LlmStreamParams } from './llm-client.js';

const MAX_TOKENS = 4096;

export class AnthropicLlmClient implements LlmClient {
  private readonly client = new Anthropic();

  constructor(private readonly model: string) {}

  async *streamMessage(params: LlmStreamParams): AsyncGenerator<LlmStreamEvent> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: params.system,
        messages: params.messages,
        tools: params.tools,
      },
      { signal: params.signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text_delta', text: event.delta.text };
      }
    }

    const message = await stream.finalMessage();
    yield { type: 'message_stop', content: message.content, stopReason: message.stop_reason };
  }
}
