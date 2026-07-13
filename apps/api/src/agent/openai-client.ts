import type Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type {
  ChatCompletionChunk,
  ChatCompletionFunctionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type { LlmClient, LlmStreamEvent, LlmStreamParams } from './llm-client.js';

const MAX_TOKENS = 4096;

/**
 * LlmClient speaking the OpenAI chat-completions protocol. With a custom baseURL this
 * covers Ollama, OpenRouter, Groq, Mistral and Gemini's compat endpoint, not just OpenAI.
 * Anthropic wire shapes stay the internal canonical format; this adapter translates at
 * its own boundary so the agent loop and session store never see OpenAI types.
 */

function contentBlocksToText(content: string | readonly { type: string }[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b): b is Anthropic.TextBlockParam => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

export function toOpenAiMessages(
  system: string,
  messages: Anthropic.MessageParam[],
): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [{ role: 'system', content: system }];

  for (const message of messages) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content });
      continue;
    }

    if (message.role === 'assistant') {
      const text = contentBlocksToText(message.content);
      const toolCalls = message.content
        .filter((b): b is Anthropic.ToolUseBlockParam => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          type: 'function' as const,
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));
      out.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    // User turn: tool results become role:'tool' messages; any text becomes a user message.
    const toolResults = message.content.filter(
      (b): b is Anthropic.ToolResultBlockParam => b.type === 'tool_result',
    );
    for (const result of toolResults) {
      out.push({
        role: 'tool',
        tool_call_id: result.tool_use_id,
        content: typeof result.content === 'string' ? result.content : contentBlocksToText(result.content ?? []),
      });
    }
    const text = contentBlocksToText(message.content);
    if (text) out.push({ role: 'user', content: text });
  }

  return out;
}

export function toOpenAiTools(tools: Anthropic.Tool[]): ChatCompletionFunctionTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema as Record<string, unknown>,
    },
  }));
}

export interface AccumulatedToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

export function fromFinishedCompletion(
  text: string,
  toolCalls: AccumulatedToolCall[],
  finishReason: string | null,
): { content: Anthropic.ContentBlock[]; stopReason: Anthropic.StopReason | null } {
  const content: Anthropic.ContentBlock[] = [];
  if (text) content.push({ type: 'text', text, citations: null });

  for (const call of toolCalls) {
    let input: unknown;
    try {
      input = call.argumentsJson ? JSON.parse(call.argumentsJson) : {};
    } catch {
      throw new Error(`Model returned malformed JSON for tool ${call.name}: ${call.argumentsJson}`);
    }
    content.push({ type: 'tool_use', id: call.id, name: call.name, input, caller: { type: 'direct' } });
  }

  const stopReason: Anthropic.StopReason | null =
    finishReason === 'tool_calls' ? 'tool_use' : finishReason === 'length' ? 'max_tokens' : finishReason ? 'end_turn' : null;

  return { content, stopReason };
}

export interface OpenAiLlmClientOptions {
  model: string;
  baseUrl?: string;
  apiKey?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
}

export class OpenAiLlmClient implements LlmClient {
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAiLlmClientOptions) {
    this.client = new OpenAI({
      baseURL: options.baseUrl,
      apiKey: options.apiKey ?? 'ollama',
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  async *streamMessage(params: LlmStreamParams): AsyncGenerator<LlmStreamEvent> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.options.model,
        max_tokens: MAX_TOKENS,
        stream: true,
        messages: toOpenAiMessages(params.system, params.messages),
        tools: toOpenAiTools(params.tools),
      },
      { signal: params.signal },
    );

    let text = '';
    let finishReason: string | null = null;
    // Tool-call argument chunks arrive incrementally, keyed by index.
    const toolCalls = new Map<number, AccumulatedToolCall>();

    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      if (choice.delta.content) {
        text += choice.delta.content;
        yield { type: 'text_delta', text: choice.delta.content };
      }
      for (const delta of choice.delta.tool_calls ?? []) {
        const existing = toolCalls.get(delta.index) ?? { id: '', name: '', argumentsJson: '' };
        if (delta.id) existing.id = delta.id;
        if (delta.function?.name) existing.name += delta.function.name;
        if (delta.function?.arguments) existing.argumentsJson += delta.function.arguments;
        toolCalls.set(delta.index, existing);
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    const ordered = [...toolCalls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
    const { content, stopReason } = fromFinishedCompletion(text, ordered, finishReason);
    yield { type: 'message_stop', content, stopReason };
  }
}
