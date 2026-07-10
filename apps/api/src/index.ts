import { GenerationProviderIdSchema } from '@drukar/shared';
import { createLlmClient } from './agent/llm-factory.js';
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

  const app = await buildApp(
    {
      llm: createLlmClient(agentConfig),
      provider: createProvider(providerId, {
        tripoApiKey: process.env.TRIPO_API_KEY,
        tripoModelVersion: process.env.TRIPO_MODEL_VERSION,
        hfSpaceUrl: process.env.DRUKAR_HF_SPACE_URL,
        hfToken: process.env.HF_TOKEN,
      }),
      jobStore,
      sessionStore: new SessionStore(),
      config: printabilityConfig,
      maxAttempts: 1 + agentConfig.maxRegenerations,
    },
    { logger: true, webDist: process.env.DRUKAR_WEB_DIST },
  );

  const port = Number(process.env.DRUKAR_API_PORT) || 3000;
  const host = process.env.DRUKAR_API_HOST || '0.0.0.0';
  await app.listen({ port, host });
  app.log.info(
    { llmProvider: agentConfig.llmProvider, model: agentConfig.model, provider: providerId, dataDir },
    'drukar api ready',
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
