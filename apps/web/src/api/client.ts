import type { AgentEvent, ChatRequest, Job } from '@drukar/shared';
import { AgentEventSchema, JobSchema } from '@drukar/shared';

/** POST /api/chat and yield parsed SSE frames. EventSource can't POST, so we read the stream by hand. */
export async function* streamChat(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Chat request failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep).trim();
      buffer = buffer.slice(sep + 2);
      if (!frame.startsWith('data:')) continue;
      yield AgentEventSchema.parse(JSON.parse(frame.slice(5).trim()));
    }
  }
}

export async function fetchJob(id: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}`);
  if (!res.ok) throw new Error(`Job fetch failed: ${res.status}`);
  return JobSchema.parse(await res.json());
}

/** cacheKey (job.updatedAt) busts the GLTF loader cache when a regeneration rewrites preview.glb. */
export function artifactUrl(jobId: string, name: string, cacheKey: string): string {
  return `/api/jobs/${jobId}/artifacts/${name}?v=${encodeURIComponent(cacheKey)}`;
}
