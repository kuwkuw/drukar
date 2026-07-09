---
id: F-005
type: feature
title: Client-facing landing page
status: implemented
tags: [web, ui, onboarding, routing]
related: [B-001, F-004]
links:
  - apps/web/src/App.tsx
  - apps/web/src/components/Landing.tsx
  - apps/web/src/components/Workbench.tsx
  - apps/web/src/hooks/useRoute.ts
updated: 2026-07-09
---

### Summary

A first-touch page at `#/` that explains what Drukar does — the
clarify → generate → validate → repair → export value proposition, an illustrative example run, and
a call-to-action into the workbench. First-time visitors no longer drop straight into an empty chat
with no context.

### How it works

The SPA had no router, so this introduces a minimal hash-based one rather than a dependency:

- [useRoute.ts](../../../apps/web/src/hooks/useRoute.ts) — a `useRoute()` hook that maps
  `window.location.hash` to `'landing' | 'workbench'` (`#/app*` → workbench, everything else →
  landing) and re-renders on `hashchange`. Plain anchors (`#/`, `#/app`) do the navigating.
- [App.tsx](../../../apps/web/src/App.tsx) — now just the router: renders `<Workbench />` or
  `<Landing />`.
- [Workbench.tsx](../../../apps/web/src/components/Workbench.tsx) — the previous `App` body (chat +
  model viewer + report), unchanged except the title links back to `#/`.
- [Landing.tsx](../../../apps/web/src/components/Landing.tsx) — hero, a 5-step "how it works" strip,
  a static example conversation, and two CTAs into `#/app`. Static content only, no data fetching.

### Rationale

The product's differentiator is trust ([B-001](../business/B-001-first-try-print-guarantee.md)), not
generation — and that promise is invisible inside the workbench itself. The landing page states it
before the user has spent anything. Hash routing keeps the app a static, router-free SPA (served by
nginx with no server-side route config) while cleanly separating the pitch from the tool.

### Status & gaps

- Implemented. Satisfies [FR-014](../requirements/functional.md).
- Example run is static illustrative copy, not a recorded real session.
- Hash routing is deliberately minimal (no nested routes, no history abstraction); revisit if the UI
  grows more surfaces.
