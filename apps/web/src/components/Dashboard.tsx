import { useQuery } from '@tanstack/react-query';
import type { Job } from '@drukar/shared';
import { fetchJobs, fetchMetrics } from '../api/client';

const POLL_MS = 10_000;
/** sky-600 — validated against the dark surface (dataviz six-checks: L-band, chroma, contrast). */
const BAR_HUE = '#0284c7';

const STATUS_STYLES: Record<Job['status'], string> = {
  queued: 'bg-neutral-700',
  clarifying: 'bg-sky-900',
  generating: 'bg-amber-800',
  validating: 'bg-amber-800',
  repairing: 'bg-amber-800',
  done: 'bg-emerald-800',
  failed: 'bg-red-900',
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Coarse processing time (createdAt → last update); only meaningful once terminal. */
function durationOf(job: Job): string {
  if (job.status !== 'done' && job.status !== 'failed') return '…';
  const s = Math.round((new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="rounded border border-neutral-800 px-4 py-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-neutral-400">{label}</p>
      {hint && <p className="text-xs text-neutral-600">{hint}</p>}
    </div>
  );
}

/** One measure (failure share) across the four checks: single-hue horizontal bars,
 * thin marks with rounded data-ends, identity carried by row labels, values in ink. */
function CheckFailureBars({ jobs }: { jobs: Job[] }) {
  const withReport = jobs.filter((job) => job.report);
  const byId = new Map<string, { label: string; failed: number }>();
  for (const job of withReport) {
    for (const check of job.report?.checks ?? []) {
      const entry = byId.get(check.id) ?? { label: check.label, failed: 0 };
      if (!check.pass) entry.failed += 1;
      byId.set(check.id, entry);
    }
  }
  const rows = [...byId.values()].sort((a, b) => b.failed - a.failed);
  const total = withReport.length;

  if (total === 0) {
    return <p className="text-xs text-neutral-500">No validated jobs yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const pct = Math.round((row.failed / total) * 100);
        return (
          <li key={row.label} title={`${row.label}: failed on ${row.failed} of ${total} validated jobs`}>
            <div className="mb-0.5 flex items-baseline justify-between text-xs">
              <span className="text-neutral-300">{row.label}</span>
              <span className="tabular-nums text-neutral-400">
                {row.failed}/{total} · {pct}%
              </span>
            </div>
            <div className="h-2 rounded bg-neutral-800">
              <div
                className="h-2 rounded transition-[width]"
                style={{ width: `${Math.max(pct, row.failed > 0 ? 2 : 0)}%`, backgroundColor: BAR_HUE }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Dashboard() {
  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: fetchJobs, refetchInterval: POLL_MS });
  const { data: metrics } = useQuery({ queryKey: ['metrics'], queryFn: fetchMetrics, refetchInterval: POLL_MS });

  const done = jobs.filter((j) => j.status === 'done');
  const avgAttempts = done.length > 0 ? (done.reduce((sum, j) => sum + j.attempt, 0) / done.length).toFixed(1) : '—';
  const repairedShare =
    done.length > 0
      ? `${Math.round((done.filter((j) => (j.report?.appliedFixes.length ?? 0) > 0).length / done.length) * 100)}%`
      : '—';

  return (
    <div className="min-h-full overflow-y-auto p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-sm font-semibold tracking-wide">
          <a href="#/" className="hover:text-sky-400">
            Drukar
          </a>{' '}
          <span className="font-normal text-neutral-500">— dashboard</span>
        </h1>
        <a href="#/app" className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800">
          Open workbench
        </a>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile
          label="First-try print success"
          value={metrics?.successRate != null ? `${Math.round(metrics.successRate * 100)}%` : '—'}
          hint={metrics ? `${metrics.printed} printed / ${metrics.reported} reported` : undefined}
        />
        <StatTile label="Jobs completed" value={String(metrics?.jobsDone ?? done.length)} />
        <StatTile label="Outcomes reported" value={String(metrics?.reported ?? '—')} />
        <StatTile label="Avg attempts (completed)" value={avgAttempts} />
        <StatTile label="Needed auto-repair" value={repairedShare} hint="completed jobs with applied fixes" />
      </section>

      <section className="mb-8 max-w-xl">
        <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Check failures (share of validated jobs)</h2>
        <CheckFailureBars jobs={jobs} />
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Recent jobs</h2>
        {jobs.length === 0 ? (
          <p className="text-xs text-neutral-500">
            No jobs yet —{' '}
            <a href="#/app" className="text-sky-400 hover:underline">
              generate something in the workbench
            </a>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500">
                  <th className="py-2 pr-4 font-medium">Created</th>
                  <th className="py-2 pr-4 font-medium">Request</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Attempts</th>
                  <th className="py-2 pr-4 font-medium">Failed checks</th>
                  <th className="py-2 pr-4 font-medium">Printed?</th>
                  <th className="py-2 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {jobs.slice(0, 20).map((job) => {
                  const failing = job.report?.checks.filter((c) => !c.pass).map((c) => c.label) ?? [];
                  return (
                    <tr key={job.id} className="border-b border-neutral-900 hover:bg-neutral-900">
                      <td className="whitespace-nowrap py-2 pr-4 text-neutral-400">{timeAgo(job.createdAt)}</td>
                      <td className="max-w-64 truncate py-2 pr-4" title={job.userRequest}>
                        {job.userRequest}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${STATUS_STYLES[job.status]}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-neutral-300">
                        {job.attempt}/{job.maxAttempts}
                      </td>
                      <td className="max-w-48 truncate py-2 pr-4 text-neutral-400" title={failing.join(', ')}>
                        {job.report ? (failing.length > 0 ? failing.join(', ') : 'none') : '—'}
                      </td>
                      <td className="py-2 pr-4">
                        {job.feedback ? (job.feedback.printed ? '✅ yes' : '❌ no') : <span className="text-neutral-600">—</span>}
                      </td>
                      <td className="py-2 tabular-nums text-neutral-400">{durationOf(job)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
