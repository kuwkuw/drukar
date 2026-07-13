import type Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage } from '@drukar/shared';

/** Project the agent's wire-format history down to what a human said and read.
 * Tool_use/tool_result blocks and empty turns (e.g. tool-results-only user turns)
 * are dropped — the client renders conversation, not plumbing. */
export function toTranscript(history: Anthropic.MessageParam[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const message of history) {
    // The SDK's MessageParam admits 'system'; the agent never stores one, but the type must narrow.
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const text =
      typeof message.content === 'string'
        ? message.content
        : message.content
            .filter((b): b is Anthropic.TextBlockParam => b.type === 'text')
            .map((b) => b.text)
            .join('');
    if (text) out.push({ role: message.role, content: text });
  }
  return out;
}
