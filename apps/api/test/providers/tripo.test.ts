import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { GenOptionsSchema } from '@drukar/shared';
import { TripoProvider } from '../../src/providers/tripo.js';

const options = GenOptionsSchema.parse({});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** Records requests and replays a scripted sequence of Responses, one per call. */
function scriptedFetch(responses: Response[]): {
  fetch: typeof fetch;
  calls: { url: string; init?: RequestInit | undefined }[];
} {
  const calls: { url: string; init?: RequestInit | undefined }[] = [];
  let i = 0;
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({ url: String(input), init });
    const res = responses[i++];
    if (!res) throw new Error(`scriptedFetch: no response for call ${i}`);
    return res;
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

describe('TripoProvider', () => {
  it('requires an API key', async () => {
    await expect(new TripoProvider().generate('a vase', options)).rejects.toThrow(/TRIPO_API_KEY/);
  });

  it('creates a task, polls to success, and downloads the GLB', async () => {
    const glbBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3]); // "glTF" + filler
    const { fetch, calls } = scriptedFetch([
      jsonResponse({ code: 0, data: { task_id: 'task-1' } }),
      jsonResponse({ code: 0, data: { task_id: 'task-1', status: 'running', progress: 40 } }),
      jsonResponse({
        code: 0,
        data: { task_id: 'task-1', status: 'success', output: { pbr_model: 'https://cdn.tripo/model.glb' } },
      }),
      new Response(glbBytes, { status: 200 }),
    ]);

    const provider = new TripoProvider({ apiKey: 'tsk_test', fetchImpl: fetch, pollIntervalMs: 0 });
    const result = await provider.generate('a small clean vase', options);

    expect(result.format).toBe('glb');
    expect(new Uint8Array(await readFile(result.meshPath))).toEqual(glbBytes);

    // create task
    expect(calls[0]?.url).toBe('https://api.tripo3d.ai/v2/openapi/task');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ type: 'text_to_model', prompt: 'a small clean vase' });
    expect((calls[0]?.init?.headers as Record<string, string>)?.['authorization']).toBe('Bearer tsk_test');
    // poll + download
    expect(calls[1]?.url).toBe('https://api.tripo3d.ai/v2/openapi/task/task-1');
    expect(calls[3]?.url).toBe('https://cdn.tripo/model.glb');
  });

  it('falls back to output.model when pbr_model is absent', async () => {
    const { fetch } = scriptedFetch([
      jsonResponse({ code: 0, data: { task_id: 't' } }),
      jsonResponse({ code: 0, data: { task_id: 't', status: 'success', output: { model: 'https://cdn.tripo/base.glb' } } }),
      new Response(new Uint8Array([1, 2]), { status: 200 }),
    ]);
    const provider = new TripoProvider({ apiKey: 'tsk_test', fetchImpl: fetch, pollIntervalMs: 0 });
    await expect(provider.generate('x', options)).resolves.toMatchObject({ format: 'glb' });
  });

  it('throws on a non-zero create-task code', async () => {
    const { fetch } = scriptedFetch([jsonResponse({ code: 2002, message: 'quota exceeded', data: {} })]);
    const provider = new TripoProvider({ apiKey: 'tsk_test', fetchImpl: fetch });
    await expect(provider.generate('x', options)).rejects.toThrow(/quota exceeded/);
  });

  it('surfaces the API message on a non-2xx response (real 403 shape)', async () => {
    // Tripo returns 403 + a helpful JSON message when out of credit — must not be swallowed.
    const { fetch } = scriptedFetch([
      new Response(
        JSON.stringify({ code: 2010, message: "You don't have enough credit to create this task" }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      ),
    ]);
    const provider = new TripoProvider({ apiKey: 'tsk_test', fetchImpl: fetch });
    await expect(provider.generate('x', options)).rejects.toThrow(/enough credit/);
  });

  it('throws when the task fails', async () => {
    const { fetch } = scriptedFetch([
      jsonResponse({ code: 0, data: { task_id: 't' } }),
      jsonResponse({ code: 0, data: { task_id: 't', status: 'failed' } }),
    ]);
    const provider = new TripoProvider({ apiKey: 'tsk_test', fetchImpl: fetch, pollIntervalMs: 0 });
    await expect(provider.generate('x', options)).rejects.toThrow(/failed/);
  });

  it('times out if the task never completes', async () => {
    // Always "running": every poll returns the same in-progress response.
    const runningForever = (async () =>
      jsonResponse({ code: 0, data: { task_id: 't', status: 'running' } })) as unknown as typeof fetch;
    let created = false;
    const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (!created) {
        created = true;
        return jsonResponse({ code: 0, data: { task_id: 't' } });
      }
      return runningForever(input, init);
    }) as typeof fetch;

    const provider = new TripoProvider({ apiKey: 'tsk_test', fetchImpl, pollIntervalMs: 0, timeoutMs: 5 });
    await expect(provider.generate('x', options)).rejects.toThrow(/timed out/);
  });
});
