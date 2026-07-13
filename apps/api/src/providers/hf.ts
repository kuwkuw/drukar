import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GenOptions, MeshFormat } from '@drukar/shared';
import { MeshFormatSchema } from '@drukar/shared';
import type { GenerationProvider, GenerationResult } from './types.js';

// hysts/Shap-E: the only maintained free text-to-3D Space with a *named* gradio endpoint
// (api_name="text-to-3d", single prompt input, GLB out). See F-006 for the survey.
const DEFAULT_SPACE_URL = 'https://hysts-shap-e.hf.space';
const DEFAULT_API_NAME = 'text-to-3d';
const DEFAULT_TIMEOUT_MS = 300_000;

// Shap-E demo defaults (seed fixed for reproducibility; the agent varies the prompt, not the seed).
const DEFAULT_SEED = 0;
const DEFAULT_GUIDANCE_SCALE = 15;
const DEFAULT_NUM_INFERENCE_STEPS = 64;

export interface HfSpaceProviderOptions {
  /** Base URL of a gradio Space exposing a text→Model3D endpoint. */
  spaceUrl?: string;
  /** gradio api_name of that endpoint (default "text-to-3d", the Shap-E Space). */
  apiName?: string;
  /** Optional HF token — anonymous calls work but get a smaller ZeroGPU quota. */
  hfToken?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof globalThis.fetch;
  timeoutMs?: number;
}

interface SseEvent {
  event: string;
  data: string;
}

/** Parse an SSE body into events; gradio emits `event:`/`data:` line pairs per message. */
function parseSse(body: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trim());
    }
    if (dataLines.length > 0) events.push({ event, data: dataLines.join('\n') });
  }
  return events;
}

/** Extract a downloadable URL from a gradio FileData output value. */
function fileUrlOf(value: unknown, spaceUrl: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const file = value as { url?: unknown; path?: unknown };
  if (typeof file.url === 'string') return file.url;
  if (typeof file.path === 'string') return `${spaceUrl}/gradio_api/file=${file.path}`;
  return undefined;
}

/**
 * Free text-to-3D via a Hugging Face gradio Space (default: hysts/Shap-E). Uses the gradio 5
 * call protocol: POST /gradio_api/call/<api_name> → { event_id }, then GET the same path +
 * /<event_id> which streams SSE until a terminal `complete` / `error` event. Zero keys required;
 * quality is deliberately "good enough" — the printability layer is the product (B-003).
 */
export class HfSpaceProvider implements GenerationProvider {
  private readonly spaceUrl: string;
  private readonly apiName: string;
  private readonly hfToken?: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: HfSpaceProviderOptions = {}) {
    // `||`, not `??`: env-sourced options arrive as '' when the .env line is present but blank.
    this.spaceUrl = (options.spaceUrl || DEFAULT_SPACE_URL).replace(/\/+$/, '');
    this.apiName = options.apiName || DEFAULT_API_NAME;
    this.hfToken = options.hfToken || undefined;
    this.fetch = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async generate(prompt: string, _options: GenOptions): Promise<GenerationResult> {
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const eventId = await this.createCall(prompt, deadline);
    const fileUrl = await this.awaitResult(eventId, deadline);
    return this.download(fileUrl, deadline);
  }

  private headers(json: boolean): Record<string, string> {
    return {
      ...(json ? { 'content-type': 'application/json' } : {}),
      ...(this.hfToken ? { authorization: `Bearer ${this.hfToken}` } : {}),
    };
  }

  private callUrl(suffix = ''): string {
    return `${this.spaceUrl}/gradio_api/call/${this.apiName}${suffix}`;
  }

  private async createCall(prompt: string, signal: AbortSignal): Promise<string> {
    const res = await this.fetch(this.callUrl(), {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ data: [prompt, DEFAULT_SEED, DEFAULT_GUIDANCE_SCALE, DEFAULT_NUM_INFERENCE_STEPS] }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`HF Space call failed: ${res.status} ${res.statusText} — is the Space up? (${this.spaceUrl})`);
    }
    let body: { event_id?: unknown };
    try {
      body = (await res.json()) as { event_id?: unknown };
    } catch {
      throw new Error('HF Space call returned a non-JSON response');
    }
    if (typeof body.event_id !== 'string') throw new Error('HF Space call returned no event_id');
    return body.event_id;
  }

  /** Read the SSE result stream to the end and pull the output file URL from the terminal event. */
  private async awaitResult(eventId: string, signal: AbortSignal): Promise<string> {
    const res = await this.fetch(this.callUrl(`/${eventId}`), { headers: this.headers(false), signal });
    if (!res.ok) throw new Error(`HF Space result stream failed: ${res.status} ${res.statusText}`);
    let body: string;
    try {
      body = await res.text();
    } catch (err) {
      if (signal.aborted) {
        throw new Error(`HF Space generation timed out after ${this.timeoutMs}ms`, { cause: err });
      }
      throw err;
    }

    const events = parseSse(body);
    let terminal: SseEvent | undefined;
    for (let i = events.length - 1; i >= 0 && !terminal; i--) {
      const e = events[i];
      if (e && (e.event === 'complete' || e.event === 'error')) terminal = e;
    }
    if (!terminal) throw new Error('HF Space stream ended without a terminal event');
    if (terminal.event === 'error') {
      const detail = terminal.data && terminal.data !== 'null' ? `: ${terminal.data}` : '';
      throw new Error(
        `HF Space generation failed${detail} (free ZeroGPU quota may be exhausted — retry later or set HF_TOKEN)`,
      );
    }

    let outputs: unknown;
    try {
      outputs = JSON.parse(terminal.data);
    } catch {
      throw new Error('HF Space complete event carried non-JSON data');
    }
    const fileUrl = Array.isArray(outputs) ? fileUrlOf(outputs[0], this.spaceUrl) : undefined;
    if (!fileUrl) throw new Error('HF Space completed but returned no model file');
    return fileUrl;
  }

  private async download(url: string, signal: AbortSignal): Promise<GenerationResult> {
    const res = await this.fetch(url, { headers: this.headers(false), signal });
    if (!res.ok) throw new Error(`HF Space model download failed: ${res.status} ${res.statusText}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const ext = /\.(glb|stl|obj)(?:$|\?)/i.exec(url)?.[1]?.toLowerCase();
    const format: MeshFormat = ext ? MeshFormatSchema.parse(ext) : 'glb';
    const meshPath = join(tmpdir(), `drukar-hf-${randomUUID()}.${format}`);
    await writeFile(meshPath, bytes);
    return { meshPath, format };
  }
}
