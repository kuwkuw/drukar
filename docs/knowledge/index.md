# Drukar Knowledge Base

An **open knowledge format (OKF)** for Drukar: every business idea and technical feature is a
single Markdown file with consistent YAML frontmatter plus a prose body. Plain text, greppable,
tool-agnostic, and extensible one entry at a time — no database, no build step.

## Why this exists

The README and [CLAUDE.md](../../CLAUDE.md) describe the system as it is. This catalog captures the
*why* and the *intent*, as a traceable graph:

> **business idea** (why) → **requirement** (what) → **feature** (how)

Each is a durable, linkable record. It's the home for decisions, requirements, and ideas that
aren't obvious from the code alone.

## Entry format

Each entry is one file under `business/` or `features/`, named `<id>-<slug>.md`. Frontmatter:

```yaml
---
id: F-001                 # stable id, never reused. B-NNN = business, F-NNN = feature
type: feature             # business | feature
title: Printability pipeline
status: implemented       # see status vocab below
tags: [mesh, validation]
related: [B-001, B-002]   # ids of related entries
links:                    # evidence: repo paths and/or URLs
  - apps/api/src/mesh/pipeline.ts
updated: 2026-07-08       # ISO date of last meaningful edit
---
```

**Status vocabulary**

| type | statuses |
|---|---|
| business | `idea` · `hypothesis` · `validated` · `parked` |
| feature | `idea` · `planned` · `partial` · `implemented` · `out-of-scope` |

### Requirement records

Requirements are finer-grained and more numerous than ideas/features, so instead of one file each
they live in two **register documents** — [requirements/functional.md](requirements/functional.md)
and [requirements/non-functional.md](requirements/non-functional.md). Each requirement is a block:

```markdown
### FR-001 — Accept a plain-text object description
- **Priority:** Must · **Status:** met
- **Satisfied by:** [F-004](...) · **Traces to:** [B-001](...)
- One-sentence statement of the requirement.
```

- **Id** — `FR-NNN` (functional, what the system must do) or `NFR-NNN` (non-functional, qualities
  and constraints). Stable and greppable, like all record ids.
- **Priority** — MoSCoW: `Must` · `Should` · `Could` · `Won't`.
- **Status** — `met` · `partial` · `planned` · `dropped`.
- **Satisfied by** — the feature id(s) that implement it (`—` if none yet).
- **Traces to** — the business idea(s) that motivate it.

**Body** — free-form Markdown; use the [TEMPLATE.md](TEMPLATE.md) headings as a starting point
(business: Summary / Problem / Bet / Why it matters / Risks & open questions; feature: Summary /
How it works / Rationale / Status & gaps). Cross-link entries with their id in `related`, and link
implementing code in `links`.

## Conventions

- **Ids are permanent.** Retire an entry by setting `status: parked` / `out-of-scope`, don't delete
  or renumber — links stay valid.
- **One idea per file.** If an entry grows two theses, split it and cross-link.
- **`links` are the proof.** A `feature` entry claiming `implemented` should point at the code that
  implements it; a `business` entry can link to evidence, tickets, or the features that realize it.

## Catalog

### Business ideas

| id | title | status |
|---|---|---|
| [B-001](business/B-001-first-try-print-guarantee.md) | First-try print guarantee is the product | hypothesis |
| [B-002](business/B-002-regenerate-over-repair.md) | Regenerate over repair | validated |
| [B-003](business/B-003-delegate-generation-own-trust.md) | Delegate generation, own the trust layer | hypothesis |

### Technical features

| id | title | status |
|---|---|---|
| [F-001](features/F-001-printability-pipeline.md) | Printability pipeline | implemented |
| [F-002](features/F-002-generation-provider-abstraction.md) | Generation provider abstraction | implemented |
| [F-003](features/F-003-llm-provider-abstraction.md) | LLM provider abstraction | implemented |
| [F-004](features/F-004-agent-loop-sse.md) | Agent loop over SSE | implemented |
| [F-005](features/F-005-landing-page.md) | Client-facing landing page | implemented |
| [F-006](features/F-006-free-mvp-generation-provider.md) | Free generation provider for MVP | implemented |
| [F-007](features/F-007-ci-cd-and-deployment.md) | CI/CD and deployment | partial |
| [F-008](features/F-008-abuse-and-spend-protection.md) | Abuse and spend protection | implemented |

### Requirements

| register | count |
|---|---|
| [Functional (`FR-`)](requirements/functional.md) | 15 |
| [Non-functional (`NFR-`)](requirements/non-functional.md) | 12 |

_Next ids: business `B-004`, feature `F-009`, functional `FR-016`, non-functional `NFR-013`._
