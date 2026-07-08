import { ChatPanel } from './components/ChatPanel';
import { ModelViewer } from './components/ModelViewer';
import { ReportPanel } from './components/ReportPanel';
import { useChat } from './hooks/useChat';
import { useJob } from './hooks/useJob';

// TODO(landing-page): add a client-facing landing page that explains what Drukar does — the
// clarify → generate → validate → repair → export value prop, an example run, and a
// call-to-action into this workbench. First-time visitors currently drop straight into the
// chat with no context. Since the SPA has no router yet, this likely means introducing one
// (or a simple hash/state toggle) so "/" is the description page and the workbench lives at
// its own route.
export function App() {
  const chat = useChat();
  const { data: job } = useJob(chat.jobId);

  return (
    <div className="flex h-full">
      <aside className="flex w-2/5 min-w-80 flex-col border-r border-neutral-800">
        <header className="flex items-center justify-between gap-2 border-b border-neutral-800 px-4 py-3">
          <h1 className="text-sm font-semibold tracking-wide">
            Drukar <span className="font-normal text-neutral-500">— text to print-ready 3D model</span>
          </h1>
          <div className="flex shrink-0 gap-2">
            <button
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
              onClick={chat.newChat}
            >
              New chat
            </button>
            <button
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
              onClick={() => void chat.clearAllJobs().catch(() => {})}
            >
              Clear jobs
            </button>
          </div>
        </header>
        <ChatPanel
          messages={chat.messages}
          activity={chat.activity}
          isStreaming={chat.isStreaming}
          awaitingResponse={chat.awaitingResponse}
          startedAt={chat.startedAt}
          onSend={chat.send}
          onCancel={chat.cancel}
        />
      </aside>

      <main className="flex flex-1 flex-col">
        <section className="min-h-0 flex-[3] border-b border-neutral-800">
          <ModelViewer job={job} />
        </section>
        <section className="min-h-0 flex-[2]">
          <ReportPanel job={job} onDelete={() => void chat.deleteCurrentJob().catch(() => {})} />
        </section>
      </main>
    </div>
  );
}
