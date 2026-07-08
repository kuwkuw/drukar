import { describe, expect, it } from 'vitest';
import { AnthropicLlmClient } from '../../src/agent/anthropic-client.js';
import { createLlmClient } from '../../src/agent/llm-factory.js';
import { OpenAiLlmClient } from '../../src/agent/openai-client.js';
import { LlmProviderIdSchema, type AgentConfig } from '../../src/config.js';

const base: AgentConfig = { llmProvider: 'anthropic', model: 'test-model', maxRegenerations: 2 };

describe('createLlmClient', () => {
  it('creates the anthropic client', () => {
    expect(createLlmClient(base)).toBeInstanceOf(AnthropicLlmClient);
  });

  it('creates the openai client with base URL and key', () => {
    const client = createLlmClient({
      ...base,
      llmProvider: 'openai',
      llmBaseUrl: 'http://localhost:11434/v1',
      llmApiKey: 'ollama',
    });
    expect(client).toBeInstanceOf(OpenAiLlmClient);
  });

  it('rejects unknown provider ids at the config boundary', () => {
    expect(() => LlmProviderIdSchema.parse('gemini')).toThrow();
  });
});
