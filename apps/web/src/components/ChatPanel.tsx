import { useEffect, useRef, useState } from 'react';
import type { ChatBubble, ToolActivity } from '../hooks/useChat';

function Bubble({ bubble }: { bubble: ChatBubble }) {
  const styles =
    bubble.role === 'user'
      ? 'self-end bg-sky-700'
      : bubble.role === 'error'
        ? 'self-start bg-red-900/70 border border-red-700'
        : 'self-start bg-neutral-800';
  return (
    <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${styles}`}>
      {bubble.text}
    </div>
  );
}

function ActivityRow({ item }: { item: ToolActivity }) {
  const icon = item.ok === undefined ? '⏳' : item.ok ? '✅' : '❌';
  return (
    <div className="self-start text-xs text-neutral-400">
      {icon} {item.tool}
      {item.summary ? ` — ${item.summary}` : '…'}
    </div>
  );
}

export function ChatPanel(props: {
  messages: ChatBubble[];
  activity: ToolActivity[];
  isStreaming: boolean;
  onSend: (message: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [props.messages, props.activity]);

  const submit = () => {
    const message = draft.trim();
    if (!message || props.isStreaming) return;
    setDraft('');
    props.onSend(message);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {props.messages.length === 0 && (
          <p className="m-auto max-w-xs text-center text-sm text-neutral-500">
            Describe the thing you want to print — Drukar generates it, validates printability and
            hands you a print-ready file.
          </p>
        )}
        {props.messages.map((b) => (
          <Bubble key={b.id} bubble={b} />
        ))}
        {props.activity.map((t) => (
          <ActivityRow key={t.toolUseId} item={t} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-neutral-800 p-3">
        <textarea
          className="max-h-32 flex-1 resize-none rounded-md bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:ring-1 focus:ring-sky-700"
          rows={2}
          placeholder="e.g. a 60mm tall vase with a twisted profile"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          className="rounded-md bg-sky-700 px-4 text-sm font-medium disabled:opacity-40"
          disabled={props.isStreaming || !draft.trim()}
          onClick={submit}
        >
          {props.isStreaming ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
