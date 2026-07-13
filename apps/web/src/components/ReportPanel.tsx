import type { CheckResult, Job } from '@drukar/shared';
import { artifactUrl } from '../api/client';

const STATUS_STYLES: Record<Job['status'], string> = {
  queued: 'bg-neutral-700',
  clarifying: 'bg-sky-900',
  generating: 'bg-amber-800',
  validating: 'bg-amber-800',
  repairing: 'bg-amber-800',
  done: 'bg-emerald-800',
  failed: 'bg-red-900',
};

function CheckRow({ check }: { check: CheckResult }) {
  return (
    <li className="flex items-start gap-2 py-1.5 text-sm">
      <span>{check.pass ? '✅' : '❌'}</span>
      <div>
        <span className="font-medium">{check.label}</span>
        {check.details && <p className="text-xs text-neutral-400">{check.details}</p>}
        {check.warnings.map((w) => (
          <p key={w} className="text-xs text-amber-500">
            ⚠ {w}
          </p>
        ))}
      </div>
    </li>
  );
}

function FeedbackPrompt({ job, onReportOutcome }: { job: Job; onReportOutcome: (printed: boolean) => void }) {
  if (job.feedback) {
    return (
      <p className="mb-3 text-xs text-neutral-400">
        {job.feedback.printed ? '✅ You reported this printed successfully.' : '❌ You reported this failed to print.'}
      </p>
    );
  }
  return (
    <div className="mb-3 flex items-center gap-2 rounded border border-neutral-800 px-3 py-2">
      <span className="text-xs text-neutral-300">Did it print successfully?</span>
      <button
        className="rounded bg-emerald-800 px-2 py-0.5 text-xs font-medium hover:bg-emerald-700"
        onClick={() => onReportOutcome(true)}
      >
        Yes
      </button>
      <button
        className="rounded bg-red-900 px-2 py-0.5 text-xs font-medium hover:bg-red-800"
        onClick={() => onReportOutcome(false)}
      >
        No
      </button>
    </div>
  );
}

export function ReportPanel({
  job,
  onDelete,
  onReportOutcome,
}: {
  job: Job | undefined;
  onDelete?: () => void;
  onReportOutcome?: (printed: boolean) => void;
}) {
  if (!job) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-600">
        The printability report appears here
      </div>
    );
  }

  const report = job.report;
  return (
    <div className="h-full overflow-y-auto p-4 text-sm">
      <div className="mb-3 flex items-center gap-3">
        <span className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${STATUS_STYLES[job.status]}`}>
          {job.status}
        </span>
        <span className="text-xs text-neutral-400">
          attempt {job.attempt}/{job.maxAttempts}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {job.status === 'done' && job.artifacts.stl && (
            <a
              className="rounded bg-emerald-800 px-2 py-0.5 text-xs font-medium hover:bg-emerald-700"
              href={artifactUrl(job.id, job.artifacts.stl, job.updatedAt)}
              download="model.stl"
            >
              Download STL
            </a>
          )}
          {onDelete && (
            <button
              className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-800"
              onClick={onDelete}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {job.error && <p className="mb-3 text-xs text-red-400">{job.error}</p>}

      {job.status === 'done' && onReportOutcome && <FeedbackPrompt job={job} onReportOutcome={onReportOutcome} />}

      {report ? (
        <>
          <ul className="divide-y divide-neutral-800">
            {report.checks.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </ul>

          {report.appliedFixes.length > 0 && (
            <div className="mt-3">
              <h3 className="text-xs font-semibold uppercase text-neutral-500">Applied fixes</h3>
              <ul className="mt-1 list-inside list-disc text-xs text-neutral-300">
                {report.appliedFixes.map((f, i) => (
                  <li key={i}>{f.description}</li>
                ))}
              </ul>
            </div>
          )}

          {report.warnings.length > 0 && (
            <div className="mt-3">
              <h3 className="text-xs font-semibold uppercase text-neutral-500">Warnings</h3>
              <ul className="mt-1 list-inside list-disc text-xs text-amber-500">
                {report.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-3 text-xs text-neutral-500">
            {report.stats.triangles.toLocaleString()} triangles · {report.stats.vertices.toLocaleString()}{' '}
            vertices
            {report.stats.volumeMm3 != null && <> · {report.stats.volumeMm3.toFixed(1)} mm³</>}
            {report.orientation && (
              <>
                {' '}
                · overhang {(report.orientation.overhangRatio * 100).toFixed(1)}% · bed contact{' '}
                {report.orientation.bedContactAreaMm2.toFixed(1)} mm²
              </>
            )}
          </p>
        </>
      ) : (
        <p className="text-xs text-neutral-500">No report yet.</p>
      )}
    </div>
  );
}
