import { useQueryClient } from '@tanstack/react-query';
import { ChatPanel } from './ChatPanel';
import { ModelViewer } from './ModelViewer';
import { ReportPanel } from './ReportPanel';
import { sendPrintFeedback } from '../api/client';
import { useChat } from '../hooks/useChat';
import { useJob } from '../hooks/useJob';

export function Workbench() {
  const chat = useChat();
  const { data: job } = useJob(chat.jobId);
  const queryClient = useQueryClient();

  const reportOutcome = async (printed: boolean) => {
    if (!job) return;
    const updated = await sendPrintFeedback(job.id, printed);
    queryClient.setQueryData(['job', updated.id], updated);
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-2/5 min-w-80 flex-col border-r border-neutral-800">
        <header className="flex items-center justify-between gap-2 border-b border-neutral-800 px-4 py-3">
          <h1 className="text-sm font-semibold tracking-wide">
            <a href="#/" className="hover:text-sky-400">
              Drukar
            </a>{' '}
            <span className="font-normal text-neutral-500">— text to print-ready 3D model</span>
          </h1>
          <div className="flex shrink-0 gap-2">
            <a
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
              href="#/dashboard"
            >
              Dashboard
            </a>
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
          <ReportPanel
            job={job}
            onDelete={() => void chat.deleteCurrentJob().catch(() => {})}
            onReportOutcome={(printed) => void reportOutcome(printed).catch(() => {})}
          />
        </section>
      </main>
    </div>
  );
}
