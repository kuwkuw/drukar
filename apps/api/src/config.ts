import { z } from 'zod';
import type { PrinterType } from '@drukar/shared';

export interface PrintabilityConfig {
  minWallMmByPrinterType: Record<PrinterType, number>;
  /** Faces tilted more than this many degrees from vertical count as overhangs. */
  overhangDeg: number;
  /** Maximum share of overhang surface area before the overhang check fails (0..1). */
  overhangMaxRatio: number;
  /** Printer build volume in millimetres, [width, depth, height]. */
  buildVolumeMm: [number, number, number];
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${name}: ${raw}`);
  return n;
}

function parseBuildVolume(raw: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!raw) return fallback;
  const parts = raw.split('x').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
    throw new Error(`Invalid DRUKAR_BUILD_VOLUME: ${raw} — expected WxDxH, e.g. 220x220x250`);
  }
  return [parts[0]!, parts[1]!, parts[2]!];
}

export function loadPrintabilityConfig(): PrintabilityConfig {
  return {
    minWallMmByPrinterType: {
      fdm: envNumber('DRUKAR_MIN_WALL_MM_FDM', 1.2),
      resin: envNumber('DRUKAR_MIN_WALL_MM_RESIN', 0.8),
    },
    overhangDeg: envNumber('DRUKAR_OVERHANG_DEG', 50),
    overhangMaxRatio: envNumber('DRUKAR_OVERHANG_MAX_RATIO', 0.3),
    buildVolumeMm: parseBuildVolume(process.env.DRUKAR_BUILD_VOLUME, [220, 220, 250]),
  };
}

export interface ServerConfig {
  /** Per-IP rate limits; undefined = disabled (DRUKAR_RATE_LIMIT_MAX=0). */
  rateLimit?: { max: number; chatMax: number; timeWindowMs: number };
  /** Trust X-Forwarded-For (set when behind a reverse proxy, e.g. Render). */
  trustProxy: boolean;
}

export function loadServerConfig(): ServerConfig {
  const max = envNumber('DRUKAR_RATE_LIMIT_MAX', 300);
  return {
    rateLimit:
      max > 0
        ? {
            max,
            chatMax: envNumber('DRUKAR_CHAT_RATE_LIMIT_MAX', 10),
            timeWindowMs: envNumber('DRUKAR_RATE_LIMIT_WINDOW_MS', 60_000),
          }
        : undefined,
    trustProxy: ['1', 'true'].includes(process.env.DRUKAR_TRUST_PROXY ?? ''),
  };
}

/** api-internal (selected via env, never crosses the api/web boundary), so not in @drukar/shared. */
export const LlmProviderIdSchema = z.enum(['anthropic', 'openai']);
export type LlmProviderId = z.infer<typeof LlmProviderIdSchema>;

export interface AgentConfig {
  /** LLM backend: 'anthropic' (default) or 'openai' (any chat-completions-compatible server). */
  llmProvider: LlmProviderId;
  model: string;
  /** Base URL for the openai provider, e.g. http://localhost:11434/v1 (Ollama) or an OpenRouter/Gemini-compat URL. */
  llmBaseUrl?: string;
  /** API key for the openai provider; Ollama ignores it but the SDK requires one, hence the placeholder. */
  llmApiKey?: string;
  /** Regeneration attempts allowed after the first, i.e. job.maxAttempts = 1 + maxRegenerations. */
  maxRegenerations: number;
}

export function loadAgentConfig(): AgentConfig {
  const llmBaseUrl = process.env.DRUKAR_LLM_BASE_URL || undefined;
  return {
    llmProvider: LlmProviderIdSchema.parse(process.env.DRUKAR_LLM_PROVIDER || 'anthropic'),
    model: process.env.DRUKAR_MODEL || 'claude-fable-5',
    llmBaseUrl,
    llmApiKey:
      process.env.DRUKAR_LLM_API_KEY ||
      process.env.OPENAI_API_KEY ||
      (llmBaseUrl ? 'ollama' : undefined),
    maxRegenerations: envNumber('DRUKAR_MAX_REGENERATIONS', 2),
  };
}
