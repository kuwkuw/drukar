---
id: F-009
type: feature
title: Print outcome feedback and metrics
status: implemented
tags: [metrics, feedback, trust, product]
related: [B-001, F-001, F-004]
links:
  - packages/shared/src/job.ts
  - apps/api/src/routes/jobs.ts
  - apps/web/src/components/ReportPanel.tsx
  - apps/api/test/routes/jobs.test.ts
updated: 2026-07-13
---

### Summary

Closes the trust loop: the user reports whether the physical print actually succeeded, and the
system aggregates those reports into the north-star "% of first-try successful prints" metric.
Until this existed, B-001 (the first-try print guarantee) was unfalsifiable — the pipeline could
claim printability but nothing measured reality. Satisfies FR-016 and flips
[NFR-003](../requirements/non-functional.md) to met.

### How it works

- **Datum** — `PrintFeedback` (`{ printed, reportedAt }`), an optional field on `Job` in
  `packages/shared`. One bit on purpose: "did it print?" is answerable in one click; anything
  richer (failure mode, photos) would depress response rates for data the MVP can't act on yet.
- **Capture** — `POST /api/jobs/:id/feedback` `{ printed }`. Only `done` jobs qualify (409
  otherwise — you can't have printed a model that was never produced); re-reporting overwrites so
  a misclick isn't permanent. The UI is a "Did it print successfully? [Yes] [No]" prompt in the
  workbench report panel, shown for done jobs until answered.
- **Readout** — `GET /api/metrics` → `PrintMetrics`: `jobsDone`, `reported`, `printed`, and
  `successRate` (`printed / reported`, `null` until any feedback exists). Computed on demand by
  scanning the JobStore — no counters to keep consistent.

### Rationale

"First-try" is interpreted as *the user's print attempt*, not the pipeline's generation attempt:
internal regenerations (`job.attempt`) are the system spending its own budget to make the first
physical print succeed, which is exactly the product bet. So the metric is over reported
outcomes, regardless of how many generation attempts the job consumed.

### Status & gaps

- `implemented` — feedback + metrics covered in `jobs.test.ts` (record, re-report, 409/404/400,
  aggregation, null rate).
- Feedback is voluntary and unauthenticated; the metric measures *reported* outcomes, with
  self-selection bias (frustrated users may report more). Fine for MVP-scale learning.
- Data lives in the ephemeral `DRUKAR_DATA_DIR` on the free Render tier — metric resets on
  deploy. This is the concrete argument for the persistence upgrade (F-007 gaps).
- No metrics UI yet; the endpoint is the readout. A landing-page or workbench counter can come
  later once there's data worth showing.
