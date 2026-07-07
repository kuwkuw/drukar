import { GenerationProviderIdSchema } from '@drukar/shared';
import { AnthropicLlmClient } from './agent/anthropic-client.js';
import { buildApp } from './app.js';
import { SessionStore } from './chat/session-store.js';
import { loadAgentConfig, loadPrintabilityConfig } from './config.js';
import { JobStore } from './jobs/store.js';
import { createProvider } from './providers/index.js';

// Dev runs with cwd=apps/api but .env lives at the repo root; try both. In Docker,
// env comes from compose env_file, so having no .env at all is fine too.
for (const envPath of ['.env', '../../.env']) {
  try {
    process.loadEnvFile(envPath);
    break;
  } catch {
    // keep looking; fall back to plain process env if none found
  }
}

async function main(): Promise<void> {
  const agentConfig = loadAgentConfig();
  const printabilityConfig = loadPrintabilityConfig();
  const providerId = GenerationProviderIdSchema.parse(process.env.DRUKAR_PROVIDER || 'mock');
  const dataDir = process.env.DRUKAR_DATA_DIR || './data';

  const jobStore = new JobStore(dataDir);
  await jobStore.hydrate();

  const app = await buildApp({
    llm: new AnthropicLlmClient(agentConfig.model),
    provider: createProvider(providerId),
    jobStore,
    sessionStore: new SessionStore(),
    config: printabilityConfig,
    maxAttempts: 1 + agentConfig.maxRegenerations,
  });

  const port = Number(process.env.DRUKAR_API_PORT) || 3000;
  const host = process.env.DRUKAR_API_HOST || '0.0.0.0';
  await app.listen({ port, host });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
