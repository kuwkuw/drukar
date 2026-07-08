import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  OpenAiLlmClient,
  fromFinishedCompletion,
  toOpenAiMessages,
  toOpenAiTools,
} from '../../src/agent/openai-client.js';
import { GENERATE_MODEL_TOOL } from '../../src/agent/tools.js';
import type { LlmStreamEvent } from '../../src/agent/llm-client.js';

describe('toOpenAiMessages', () => {
  it('translates a multi-turn history with tool use and results', () => {
    const history: Anthropic.MessageParam[] = [
      { role: 'user', content: 'make me a vase' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Generating now.' },
          { type: 'tool_use', id: 'call_1', name: 'generate_model', input: { prompt: 'a vase' } },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"pass":true}' }] },
    ];

    const out = toOpenAiMessages('You are Drukar.', history);

    expect(out).toEqual([
      { role: 'system', content: 'You are Drukar.' },
      { role: 'user', content: 'make me a vase' },
      {
        role: 'assistant',
        content: 'Generating now.',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'generate_model', arguments: '{"prompt":"a vase"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"pass":true}' },
    ]);
  });

  it('emits assistant tool calls with null content when there is no text', () => {
    const out = toOpenAiMessages('sys', [
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'call_2', name: 'generate_model', input: {} }],
      },
    ]);
    expect(out[1]).toMatchObject({ role: 'assistant', content: null });
  });
});

describe('toOpenAiTools', () => {
  it('maps Anthropic tools to function tools', () => {
    const [tool] = toOpenAiTools([GENERATE_MODEL_TOOL]);
    expect(tool).toMatchObject({
      type: 'function',
      function: { name: 'generate_model', parameters: { type: 'object' } },
    });
    expect(tool?.function.description).toBeTruthy();
  });
});

describe('fromFinishedCompletion', () => {
  it('builds Anthropic content blocks and maps finish reasons', () => {
    const { content, stopReason } = fromFinishedCompletion(
      'On it.',
      [{ id: 'call_3', name: 'generate_model', argumentsJson: '{"prompt":"a cube"}' }],
      'tool_calls',
    );
    expect(content).toEqual([
      { type: 'text', text: 'On it.', citations: null },
      {
        type: 'tool_use',
        id: 'call_3',
        name: 'generate_model',
        input: { prompt: 'a cube' },
        caller: { type: 'direct' },
      },
    ]);
    expect(stopReason).toBe('tool_use');

    expect(fromFinishedCompletion('hi', [], 'stop').stopReason).toBe('end_turn');
    expect(fromFinishedCompletion('hi', [], 'length').stopReason).toBe('max_tokens');
  });

  it('throws a clear error on malformed tool arguments', () => {
    expect(() =>
      fromFinishedCompletion('', [{ id: 'x', name: 'generate_model', argumentsJson: '{oops' }], 'tool_calls'),
    ).toThrow(/malformed JSON/);
  });
});

describe('OpenAiLlmClient streaming', () => {
  it('yields text deltas and a message_stop from a chat-completions SSE stream', async () => {
    const chunks = [
      { choices: [{ index: 0, delta: { role: 'assistant', content: 'Hel' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { content: 'lo' }, finish_reason: null }] },
      {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                { index: 0, id: 'call_9', type: 'function', function: { name: 'generate_model', arguments: '{"prom' } },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          { index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'pt":"a vase"}' } }] }, finish_reason: null },
        ],
      },
      { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
    ];
    const sse =
      chunks
        .map((c) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 0, model: 'm', ...c })}`)
        .join('\n\n') + '\n\ndata: [DONE]\n\n';

    const fakeFetch: typeof fetch = async () =>
      new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });

    const client = new OpenAiLlmClient({ model: 'test-model', baseUrl: 'http://fake.local/v1', fetch: fakeFetch });
    const events: LlmStreamEvent[] = [];
    for await (const event of client.streamMessage({ system: 'sys', messages: [{ role: 'user', content: 'hi' }], tools: [GENERATE_MODEL_TOOL] })) {
      events.push(event);
    }

    expect(events.filter((e) => e.type === 'text_delta').map((e) => (e.type === 'text_delta' ? e.text : ''))).toEqual([
      'Hel',
      'lo',
    ]);
    const stop = events.at(-1);
    if (stop?.type !== 'message_stop') throw new Error('expected message_stop last');
    expect(stop.stopReason).toBe('tool_use');
    expect(stop.content).toEqual([
      { type: 'text', text: 'Hello', citations: null },
      { type: 'tool_use', id: 'call_9', name: 'generate_model', input: { prompt: 'a vase' }, caller: { type: 'direct' } },
    ]);
  });
});
