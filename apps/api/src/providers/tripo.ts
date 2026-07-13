import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GenOptions } from '@drukar/shared';
import type { GenerationProvider, GenerationResult } from './types.js';

const DEFAULT_BASE_URL = 'https://api.tripo3d.ai/v2/openapi';
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 180_000;

/** Tripo task states that mean "stop polling, it won't finish". Anything else keeps polling. */
const TERMINAL_FAILURE_STATES = new Set(['failed', 'cancelled', 'banned', 'expired', 'unknown']);

interface TripoEnvelope<T> {
  code: number;
  message?: string;
  data: T;
}

interface TripoTask {
  task_id: string;
  status: string;
  progress?: number;
  output?: Record<string, unknown>;
}

export interface TripoProviderOptions {
  apiKey?: string | undefined;
  /** Optional Tripo model_version (e.g. "v2.5"); omitted when unset so the account default applies. */
  modelVersion?: string | undefined;
  baseUrl?: string | undefined;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof globalThis.fetch | undefined;
  pollIntervalMs?: number | undefined;
  timeoutMs?: number | undefined;
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
      },
      { once: true },
    );
  });

/** Extract a URL from an output field that may be a bare string or a `{ url }` object. */
function urlOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string') {
    return (value as { url: string }).url;
  }
  return undefined;
}

/**
 * Real Tripo3D text-to-3D provider: create a task, poll until it succeeds, download the resulting
 * GLB. Returns a local mesh path for the printability pipeline. See https://docs.tripo3d.ai.
 */
export class TripoProvider implements GenerationProvider {
  private readonly apiKey: string | undefined;
  private readonly modelVersion: string | undefined;
  private readonly baseUrl: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(options: TripoProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.modelVersion = options.modelVersion;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetch = options.fetchImpl ?? globalThis.fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async generate(prompt: string, _options: GenOptions, signal?: AbortSignal): Promise<GenerationResult> {
    if (!this.apiKey) {
      throw new Error('Tripo3D provider requires TRIPO_API_KEY — set it or use DRUKAR_PROVIDER=mock');
    }
    const taskId = await this.createTask(prompt, signal);
    const modelUrl = await this.pollForModel(taskId, signal);
    const meshPath = await this.download(modelUrl, signal);
    return { meshPath, format: 'glb' };
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' };
  }

  /**
   * Read a `{ code, message, data }` envelope, surfacing the API's own message on failure. Tripo
   * returns useful messages with non-2xx statuses too (e.g. 403 "You don't have enough credit"),
   * so we must inspect the body before falling back to the bare HTTP status.
   */
  private async readEnvelope<T>(res: Response, action: string): Promise<TripoEnvelope<T>> {
    let body: TripoEnvelope<T> | undefined;
    try {
      body = (await res.json()) as TripoEnvelope<T>;
    } catch {
      // non-JSON body (e.g. gateway error page)
    }
    if (body && body.code !== 0) {
      throw new Error(`Tripo ${action} failed (code ${body.code}): ${body.message ?? res.statusText}`);
    }
    if (!res.ok) {
      const suffix = body?.message ? ` — ${body.message}` : '';
      throw new Error(`Tripo ${action} failed: ${res.status} ${res.statusText}${suffix}`);
    }
    if (!body) throw new Error(`Tripo ${action} failed: non-JSON response (${res.status})`);
    return body;
  }

  private async createTask(prompt: string, signal?: AbortSignal): Promise<string> {
    const res = await this.fetch(`${this.baseUrl}/task`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        type: 'text_to_model',
        prompt,
        ...(this.modelVersion ? { model_version: this.modelVersion } : {}),
      }),
      signal: signal ?? null,
    });
    const body = await this.readEnvelope<{ task_id?: string }>(res, 'create task');
    if (!body.data?.task_id) throw new Error('Tripo create task returned no task_id');
    return body.data.task_id;
  }

  private async pollForModel(taskId: string, signal?: AbortSignal): Promise<string> {
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const res = await this.fetch(`${this.baseUrl}/task/${taskId}`, {
        headers: this.headers(),
        signal: signal ?? null,
      });
      const body = await this.readEnvelope<TripoTask>(res, 'poll');

      const { status, output } = body.data;
      if (status === 'success') {
        const modelUrl = urlOf(output?.['pbr_model']) ?? urlOf(output?.['model']);
        if (!modelUrl) throw new Error('Tripo task succeeded but returned no model URL');
        return modelUrl;
      }
      if (TERMINAL_FAILURE_STATES.has(status)) {
        throw new Error(`Tripo generation ${status}`);
      }
      if (Date.now() >= deadline) {
        throw new Error(`Tripo generation timed out after ${this.timeoutMs}ms (last status: ${status})`);
      }
      await sleep(this.pollIntervalMs, signal);
    }
  }

  private async download(url: string, signal?: AbortSignal): Promise<string> {
    const res = await this.fetch(url, { signal: signal ?? null });
    if (!res.ok) throw new Error(`Tripo model download failed: ${res.status} ${res.statusText}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const meshPath = join(tmpdir(), `drukar-tripo-${randomUUID()}.glb`);
    await writeFile(meshPath, bytes);
    return meshPath;
  }
}
