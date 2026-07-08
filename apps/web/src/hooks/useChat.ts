import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { streamChat } from '../api/client';

export interface ChatBubble {
  id: number;
  role: 'user' | 'assistant' | 'error';
  text: string;
}

export interface ToolActivity {
  toolUseId: string;
  tool: string;
  /** undefined while running */
  ok?: boolean;
  summary?: string;
}

let nextBubbleId = 0;

export function useChat() {
  const chatIdRef = useRef<string>(crypto.randomUUID());
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [activity, setActivity] = useState<ToolActivity[]>([]);
  const [jobId, setJobId] = useState<string>();
  const [isStreaming, setIsStreaming] = useState(false);
  // True from Send until the first event of any kind arrives — the "thinking…" phase, which on a
  // slow/local model is many seconds of otherwise-blank UI.
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  // Wall-clock start of the in-flight request (ms), for an elapsed timer; undefined when idle.
  const [startedAt, setStartedAt] = useState<number>();
  const abortRef = useRef<AbortController>(null);
  const queryClient = useQueryClient();

  // NOTE(ui-visibility): finer-grained pipeline phases (generating → validating → repairing) aren't
  // shown live because the printability pipeline is one synchronous call inside executeGenerateModel
  // — surfacing them would require the backend to emit intermediate job_update events around it.

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const send = useCallback(
    async (message: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);
      setAwaitingResponse(true);
      setStartedAt(Date.now());
      setMessages((m) => [...m, { id: nextBubbleId++, role: 'user', text: message }]);

      // One in-flight assistant bubble per turn; text_chunks append to it.
      const assistantId = nextBubbleId++;
      let assistantText = '';
      const appendAssistant = (text: string) => {
        assistantText += text;
        setMessages((m) => {
          const rest = m.filter((b) => b.id !== assistantId);
          return [...rest, { id: assistantId, role: 'assistant' as const, text: assistantText }];
        });
      };

      try {
        for await (const event of streamChat({ chatId: chatIdRef.current, message }, controller.signal)) {
          setAwaitingResponse(false); // any event ends the thinking phase
          switch (event.type) {
            case 'text_chunk':
              appendAssistant(event.text);
              break;
            case 'tool_started':
              setActivity((a) => [...a, { toolUseId: event.toolUseId, tool: event.tool }]);
              break;
            case 'tool_finished':
              setActivity((a) =>
                a.map((t) =>
                  t.toolUseId === event.toolUseId ? { ...t, ok: event.ok, summary: event.summary } : t,
                ),
              );
              break;
            case 'job_update':
              setJobId(event.job.id);
              queryClient.setQueryData(['job', event.job.id], event.job);
              break;
            case 'question_for_user':
              // The full text already arrived via text_chunks; nothing extra to render.
              break;
            case 'error':
              setMessages((m) => [...m, { id: nextBubbleId++, role: 'error', text: event.message }]);
              break;
            case 'done':
              if (event.jobId) setJobId(event.jobId);
              break;
          }
        }
      } catch (err) {
        // A user-initiated cancel isn't an error — just stop, leaving any partial reply in place.
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          const text = err instanceof Error ? err.message : String(err);
          setMessages((m) => [...m, { id: nextBubbleId++, role: 'error', text }]);
        }
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
        setAwaitingResponse(false);
        setStartedAt(undefined);
      }
    },
    [queryClient],
  );

  return { messages, activity, jobId, isStreaming, awaitingResponse, startedAt, send, cancel };
}
