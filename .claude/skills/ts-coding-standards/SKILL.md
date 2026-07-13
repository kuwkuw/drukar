---
name: ts-coding-standards
description: Use when writing, reviewing, or refactoring TypeScript code. Provides type safety patterns, error handling, project layout, and async programming guidelines.
allowed-tools: Read, Grep, Glob
metadata:
  mcpmarket-version: 1.0.0
---
# TypeScript Coding Standards

This skill provides modern TypeScript coding guidelines and best practices for this project.

## When to Apply

Apply these standards when:
- Writing new TypeScript code
- Reviewing or refactoring existing TypeScript code
- Designing module APIs and interfaces
- Implementing error handling strategies

## Core Principles

1. **Type Safety Over Convenience** - Never sacrifice type safety for shorter code
2. **Explicit Over Implicit** - Make types and intentions clear
3. **Simple Over Clever** - Prefer readable code over clever abstractions
4. **Fail Fast** - Catch errors at compile time, not runtime

## Source file size

- **Hard limit**: No TypeScript source file under `src/` (including `*.test.ts` / `*.tsx`) should stay above **1000 lines**. If a file is at or past that size, **split it** in the same change set or as a focused follow-up.
- **How to split**: Prefer clear module boundaries (feature, layer, or cohesive helpers). When many imports point at one path, use a **thin facade** file that re-exports from `*-helpers.ts`, `*-types.ts`, or a small subdirectory so callers keep stable import paths.
- **Agents**: When editing or reviewing code, if a touched file is **1000+ lines**, treat splitting as **in scope** for the task unless the user explicitly excludes it.
- **Automation**: There is no automated line-count check in this repo; enforce the limit during
  review. (Largest file at time of writing: ~215 lines — flag anything trending toward the limit.)

## After coding (agents)

This is a **pnpm workspace** (ESLint + Prettier + vitest + tsc — no Bun, no Biome). After
modifying TypeScript, from the repo root:

1. Run **`pnpm lint`** (ESLint; enforces `consistent-type-imports` and unused vars — prefix
   with `_` to allow).
2. Run **`pnpm --filter @drukar/api typecheck`** (`tsc --noEmit`; web and shared typecheck as
   part of `pnpm build`).
3. Run **`pnpm --filter @drukar/api test`** (vitest; or a single file via
   `pnpm --filter @drukar/api exec vitest run test/foo.test.ts`).
4. Run **`pnpm format`** (Prettier) when you touch formatted paths.

If lint or typecheck reports issues, fix them before declaring the task complete.

## Quick Reference

### Must-Use Patterns

| Pattern | Use Case |
|---------|----------|
| Discriminated Unions | State machines, API responses, Result types |
| Branded Types | IDs, emails, validated strings |
| `readonly` | Data that should not mutate |
| `unknown` in catch | Safe error handling |
| Explicit undefined checks | Array/object indexed access |

### Must-Avoid Anti-Patterns

| Anti-Pattern | Alternative |
|--------------|-------------|
| `any` type | `unknown` with type guards |
| Throwing exceptions for control flow | Result type pattern |
| Optional chaining without null check | Explicit narrowing |
| Deep folder nesting (>3 levels) | Flat, feature-based structure |
| Implicit `undefined` in optional props | Explicit `T \| undefined` |

## Detailed Guidelines

For comprehensive guidance, see:
- [Error Handling Patterns](./error-handling.md) - Result types, discriminated unions, neverthrow
- [Type Safety Best Practices](./type-safety.md) - Branded types, strict config, type guards
- [Project Layout Conventions](./project-layout.md) - Directory structure, file naming, imports
- [Async Programming Patterns](./async-patterns.md) - Promise handling, concurrent execution
- [Security Guidelines](./security.md) - Credential protection, path sanitization, sensitive data handling

## tsconfig.json Strict Mode

This project uses maximum TypeScript strictness — the flags below are **already enabled** in
`tsconfig.base.json` (all packages extend it). Ensure your code compiles with:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true
  }
}
```

Unused locals/parameters are enforced by **ESLint**, not tsc (prefix with `_` to allow) — do
not add `noUnusedLocals`/`noUnusedParameters` to tsconfig; the ESLint rule is the single source.

Practical consequences seen throughout this codebase:
- `process.env.FOO` is illegal (`noPropertyAccessFromIndexSignature`) — use `process.env['FOO']`.
- Options interfaces declare `prop?: T | undefined` so call sites may pass explicitly-undefined
  values (`exactOptionalPropertyTypes`); `fetch` inits pass `signal: signal ?? null`.

## Where this repo intentionally diverges

These repo conventions (documented in CLAUDE.md) **win** over the generic guidance in the
detail files:

- **Entry points are `index.ts`** (`apps/api/src/index.ts`), not `main.ts` as
  `project-layout.md` suggests.
- **Layout is a pragmatic 3-package workspace** (`packages/shared`, `apps/api`, `apps/web`)
  with a clean dependency direction — not the 4-package Clean Architecture split. Don't
  restructure toward it.
- **Error handling throws at provider/IO boundaries and catches at the agent loop / routes**;
  Result types (`error-handling.md`) are an accepted future direction, not the current
  convention. Match the surrounding code.
- **Validation uses zod at every trust boundary** (HTTP bodies, LLM tool output, disk
  snapshots, client-side API responses) rather than hand-rolled type guards.

## References

- [TypeScript Advanced Patterns 2025](https://dev.to/frontendtoolstech/typescript-advanced-patterns-writing-cleaner-safer-code-in-2025-4gbn)
- [The Strictest TypeScript Config](https://whatislove.dev/articles/the-strictest-typescript-config/)
- [neverthrow - Type-Safe Errors](https://github.com/supermacro/neverthrow)
