---
id: F-010
type: feature
title: Durable chat sessions and resume
status: implemented
tags: [persistence, chat, sessions, ux]
related: [F-004, F-007, F-009]
links:
  - apps/api/src/chat/session-store.ts
  - apps/api/src/chat/transcript.ts
  - apps/web/src/hooks/useChat.ts
  - apps/api/test/chat/session-store.test.ts
updated: 2026-07-13
---

### Summary

Before this, a restart/deploy kept jobs but silently forgot the conversations that produced them
— the UI showed a finished model while the agent had amnesia about it. Sessions now persist and
the browser resumes them: transcripts snapshot to disk like jobs do, the client keeps its chat id
across reloads, and a reloaded page refetches and re-renders the conversation. Satisfies FR-017.

### How it works

- **Server persistence** — `SessionStore` keeps its in-memory map but optionally snapshots each
  chat to `<DRUKAR_DATA_DIR>/sessions/<sha256(chatId)>.json`, hydrated at boot. Filenames are
  hashes because `chatId` is client-supplied — a raw id like `../..` would walk the filesystem.
  Memory mutations stay synchronous; disk writes are awaited per turn. `JobStore.clear()` was
  re-scoped to only delete dirs of jobs it owns, so "Clear jobs" no longer wipes the sibling
  `sessions/` subdir.
- **Resume protocol** — `GET /api/chat/:chatId` returns a `ChatTranscript` (`@drukar/shared`):
  the displayable messages plus the associated `jobId`. `toTranscript()` projects the agent's
  wire-format history down to human-readable turns — tool_use/tool_result plumbing and
  tool-results-only turns are filtered server-side. Unknown chats return an empty transcript
  (nothing to resume is not an error).
- **Client** — the chat id lives in `localStorage` (`drukar-chat-id`); "New chat" rotates it.
  On mount, `useChat` fetches the transcript and fills the message list and job pointer — but
  only into an untouched UI, so a user who types before the fetch resolves wins the race.

### Status & gaps

- `implemented` — session persistence, hostile-chatId containment, and corrupt-snapshot skipping
  covered in `session-store.test.ts`; transcript projection and the resume endpoint in
  `chat.test.ts`. UI resume verified manually.
- **Durability is bounded by the host disk**: on Render's free tier `DRUKAR_DATA_DIR` is
  ephemeral, so this survives process restarts and same-instance sleeps but not redeploys. The
  remaining step is infra, not code — a paid Render disk or Fly.io volume (see F-007 gaps).
- Session snapshots accumulate without bound (one file per chatId ever used). Harmless at MVP
  scale; add TTL pruning on hydrate if it ever matters.
