---
id: X-000
type: business # or feature
title: Short human-readable title
status: idea # business: idea|hypothesis|validated|parked · feature: idea|planned|partial|implemented|out-of-scope
tags: []
related: []
links: []
updated: 2026-07-08
---

<!--
Copy this file into business/ or features/ as `<id>-<slug>.md`, fill the frontmatter, then use
the heading set that matches the type and delete the other. Keep it tight — one idea per file.
See index.md for the format spec and conventions.
-->

## Business entry headings

### Summary
One or two sentences: what the idea is.

### Problem
What real-world problem or user pain this addresses.

### Bet
The specific wager we're making — the non-obvious choice and what we believe because of it.

### Why it matters
Impact if true (differentiation, cost, adoption, defensibility).

### Risks & open questions
What would falsify the bet; what we still need to learn.

---

## Feature entry headings

### Summary
What the feature is, in one or two sentences.

### How it works
The mechanism, the key modules, the data flow. Link code in `links`.

### Rationale
Why it's built this way — the business idea(s) it serves (cross-link in `related`) and the
technical trade-offs chosen.

### Status & gaps
What's implemented, what's stubbed or missing, where it plugs in later.
