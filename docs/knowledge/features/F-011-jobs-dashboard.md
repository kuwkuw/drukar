---
id: F-011
type: feature
title: Jobs and metrics dashboard
status: implemented
tags: [dashboard, metrics, ui, observability]
related: [F-009, B-001]
links:
  - apps/web/src/components/Dashboard.tsx
  - apps/api/src/routes/jobs.ts
  - packages/shared/src/job.ts
updated: 2026-07-14
---

### Summary

A `#/dashboard` route visualizing request/job processing: the north-star metric and its inputs
as stat tiles, a per-check failure breakdown, and a recent-jobs table. Gives F-009's metrics a
readout and doubles as the job-history view. Satisfies FR-018.

### How it works

- **Data**: `GET /api/jobs` (new; newest-first, capped at 200) + the existing `GET /api/metrics`.
  Aggregates are computed client-side — job counts are tiny at MVP scale, so no server-side
  aggregation endpoint beyond metrics.
- **KPI tiles**: first-try success rate (with printed/reported hint), jobs completed, outcomes
  reported, average attempts per completed job (regeneration cost), share of completed jobs
  needing auto-repair.
- **Check-failure breakdown**: share of validated jobs failing each printability check, as
  single-hue horizontal bars (`#0284c7`, validated against the dark surface with the dataviz
  six-checks script). This is the diagnostic view — a check that fails on most jobs (e.g. the
  suspected wall-thickness false positive) shows up as a data pattern, not an anecdote.
- **Recent jobs table**: created, request, status chip, attempts, failed checks, print feedback,
  coarse duration (createdAt → last update). Polls every 10s via TanStack Query.

### Status & gaps

- `implemented`; `GET /api/jobs` covered in `jobs.test.ts`. UI verification is manual (open
  `#/dashboard` with a few jobs in the store).
- **Public on the live demo**: the API has no auth, so the dashboard — including user request
  texts — is visible to anyone who finds the URL. Acceptable for the demo posture (same is true
  of every API route); revisit with auth.
- Duration is coarse (job created → last update); per-step latency (NFR-006) still isn't
  instrumented.
- No time-series view — pointless until job data survives deploys (the F-007/F-010 disk
  decision).
