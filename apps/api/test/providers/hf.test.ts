import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { GenOptionsSchema } from '@drukar/shared';
import { HfSpaceProvider } from '../../src/providers/hf.js';

const options = GenOptionsSchema.parse({});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function sseResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
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

describe('HfSpaceProvider', () => {
  it('creates a call, reads the SSE stream, and downloads the GLB', async () => {
    const glbBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3]); // "glTF" + filler
    const { fetch, calls } = scriptedFetch([
      jsonResponse({ event_id: 'ev-1' }),
      sseResponse(
        'event: generating\ndata: null\n\n' +
          'event: complete\ndata: [{"path": "/tmp/model.glb", "url": "https://hysts-shap-e.hf.space/gradio_api/file=/tmp/model.glb", "meta": {"_type": "gradio.FileData"}}]\n\n',
      ),
      new Response(glbBytes, { status: 200 }),
    ]);

    const provider = new HfSpaceProvider({ fetchImpl: fetch });
    const result = await provider.generate('a small clean vase', options);

    expect(result.format).toBe('glb');
    expect(new Uint8Array(await readFile(result.meshPath))).toEqual(glbBytes);

    // create call (defaults: no auth header without a token)
    expect(calls[0]?.url).toBe('https://hysts-shap-e.hf.space/gradio_api/call/text-to-3d');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init?.body)).data[0]).toBe('a small clean vase');
    expect((calls[0]?.init?.headers as Record<string, string>)?.['authorization']).toBeUndefined();
    // result stream + download
    expect(calls[1]?.url).toBe('https://hysts-shap-e.hf.space/gradio_api/call/text-to-3d/ev-1');
    expect(calls[2]?.url).toBe('https://hysts-shap-e.hf.space/gradio_api/file=/tmp/model.glb');
  });

  it('builds a file URL from path when the output has no url', async () => {
    const { fetch, calls } = scriptedFetch([
      jsonResponse({ event_id: 'ev-2' }),
      sseResponse('event: complete\ndata: [{"path": "/tmp/out.glb"}]\n\n'),
      new Response(new Uint8Array([1, 2]), { status: 200 }),
    ]);
    const provider = new HfSpaceProvider({ spaceUrl: 'https://my-space.hf.space/', fetchImpl: fetch });
    await expect(provider.generate('x', options)).resolves.toMatchObject({ format: 'glb' });
    expect(calls[2]?.url).toBe('https://my-space.hf.space/gradio_api/file=/tmp/out.glb');
  });

  it('falls back to the default Space when env-sourced options are empty strings', async () => {
    // A blank `DRUKAR_HF_SPACE_URL=` / `HF_TOKEN=` line in .env yields '', not undefined.
    const { fetch, calls } = scriptedFetch([
      jsonResponse({ event_id: 'ev-0' }),
      sseResponse('event: complete\ndata: [{"url": "https://cdn.hf/model.glb"}]\n\n'),
      new Response(new Uint8Array([1]), { status: 200 }),
    ]);
    const provider = new HfSpaceProvider({ spaceUrl: '', hfToken: '', fetchImpl: fetch });
    await provider.generate('x', options);
    expect(calls[0]?.url).toBe('https://hysts-shap-e.hf.space/gradio_api/call/text-to-3d');
    expect((calls[0]?.init?.headers as Record<string, string>)?.['authorization']).toBeUndefined();
  });

  it('sends the HF token on every request when configured', async () => {
    const { fetch, calls } = scriptedFetch([
      jsonResponse({ event_id: 'ev-3' }),
      sseResponse('event: complete\ndata: [{"url": "https://cdn.hf/model.glb"}]\n\n'),
      new Response(new Uint8Array([1]), { status: 200 }),
    ]);
    const provider = new HfSpaceProvider({ hfToken: 'hf_test', fetchImpl: fetch });
    await provider.generate('x', options);
    for (const call of calls) {
      expect((call.init?.headers as Record<string, string>)?.['authorization']).toBe('Bearer hf_test');
    }
  });

  it('throws with quota guidance on an error event', async () => {
    const { fetch } = scriptedFetch([
      jsonResponse({ event_id: 'ev-4' }),
      sseResponse('event: error\ndata: "You have exceeded your GPU quota"\n\n'),
    ]);
    const provider = new HfSpaceProvider({ fetchImpl: fetch });
    await expect(provider.generate('x', options)).rejects.toThrow(/GPU quota.*HF_TOKEN/s);
  });

  it('throws when the stream ends without a terminal event', async () => {
    const { fetch } = scriptedFetch([
      jsonResponse({ event_id: 'ev-5' }),
      sseResponse('event: heartbeat\ndata: null\n\n'),
    ]);
    const provider = new HfSpaceProvider({ fetchImpl: fetch });
    await expect(provider.generate('x', options)).rejects.toThrow(/without a terminal event/);
  });

  it('throws when the complete event has no file output', async () => {
    const { fetch } = scriptedFetch([
      jsonResponse({ event_id: 'ev-6' }),
      sseResponse('event: complete\ndata: [null]\n\n'),
    ]);
    const provider = new HfSpaceProvider({ fetchImpl: fetch });
    await expect(provider.generate('x', options)).rejects.toThrow(/no model file/);
  });

  it('surfaces a non-2xx create call with the Space URL', async () => {
    const { fetch } = scriptedFetch([new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' })]);
    const provider = new HfSpaceProvider({ fetchImpl: fetch });
    await expect(provider.generate('x', options)).rejects.toThrow(/503.*hysts-shap-e/s);
  });
});
