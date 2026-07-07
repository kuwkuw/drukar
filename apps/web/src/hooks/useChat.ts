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
  const queryClient = useQueryClient();

  const send = useCallback(
    async (message: string) => {
      setIsStreaming(true);
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
        for await (const event of streamChat({ chatId: chatIdRef.current, message })) {
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
        const text = err instanceof Error ? err.message : String(err);
        setMessages((m) => [...m, { id: nextBubbleId++, role: 'error', text }]);
      } finally {
        setIsStreaming(false);
      }
    },
    [queryClient],
  );

  return { messages, activity, jobId, isStreaming, send };
}
