import type { AgentConfig } from '../config.js';
import { AnthropicLlmClient } from './anthropic-client.js';
import type { LlmClient } from './llm-client.js';
import { OpenAiLlmClient } from './openai-client.js';

/** Mirrors createProvider() in providers/index.ts: one switch, selected by env at boot. */
export function createLlmClient(config: AgentConfig): LlmClient {
  switch (config.llmProvider) {
    case 'anthropic':
      return new AnthropicLlmClient(config.model);
    case 'openai':
      return new OpenAiLlmClient({
        model: config.model,
        baseUrl: config.llmBaseUrl,
        apiKey: config.llmApiKey,
      });
  }
}
