# AGENTS.md

Repository guidelines and architectural invariants for vozix.

## Environment & Verification

Run all package commands with `pnpm`:

- **Type Check**: `pnpm type-check` — type checks the codebase (`tsc --noEmit`).
- **Audit React Code**: `pnpm react-doctor` — verifies React 19 compiler compatibility, hooks hygiene, and hydration safety.
- **Run Frontend Tests**: `pnpm test:fe` — UI component tests (`happy-dom`).
- **Run Backend Tests**: `pnpm test:be` — integration tests (`node` + in-memory MongoDB replica set).
- **Run E2E Tests**: `pnpm test:e2e` — end-to-end browser tests (`Playwright`).
- **Run Test Coverage**: `pnpm test:coverage` — enforces 90% coverage threshold (85% branches).
- **Validate Translations**: `pnpm check:po` — checks for untranslated strings in `messages/*.po`.
- **Sync Agent Skills**: `pnpm skills:install` — restores community skills from `skills-lock.json`.

## Architectural Invariants

### 1. Data Layer & Server Boundaries

- **Database Access**: Raw MongoDB Node.js driver (no ORM). Retrieve typed collections via factory functions in `lib/collections.ts`. Wrap multi-document mutations in `withTransaction` (`lib/db.ts`).
- **Server Boundaries**: Isolate server code with `import "server-only"`.
- **Data Mutations**: Route domain state mutations through Server Actions in `actions/` marked with `"use server"`. Auth, account, and admin operations may use Better Auth endpoints (`authClient`) directly.
- **Validation & Rate Limiting**: Validate Server Action inputs with Zod schemas from `schemas/server.ts`. Protect sensitive endpoints with `isRateLimited` (`lib/rate-limit.ts`).

### 2. Environment Configuration

- Access environment variables exclusively via typed helpers in `@/env/client` or `@/env/server` (`@t3-oss/env-nextjs`). Never access `process.env` directly in application code.

### 3. Internationalization (`next-intl`)

- Base strings live directly in source code (`actions/`, `app/`, `components/`, `hooks/`, `lib/`, `schemas/`). `next build` / `next dev` extracts them into `messages/en-US.po`.
- Keep `messages/en-US.po` strictly as auto-generated output (never edit it manually).
- Provide localized translations in target files (`vi-VN.po`, `ja-JP.po`, `ko-KR.po`, `zh-CN.po`) and run `pnpm check:po` to verify completeness.
- **Translation Scope**: `next-intl` does not support passing the translation function (`t`) from `useExtracted()` or `getExtracted()` across components. Call `useExtracted()` (client) or `await getExtracted()` (server) directly within each component or action instead of passing `t` as a prop.

### 4. Code Conventions

- **File Naming**: Use `kebab-case` for source files. Exempt generated and locale files.
- **Module Resolution**: Use `@/*` alias for root-relative imports.

## Context Pointers

Load specialized skills when entering these distinct workflow branches:

- **UI & HUD Design System**: [.agents/skills/precision-hud/SKILL.md](.agents/skills/precision-hud/SKILL.md) — When designing, building, or styling pages, forms, tables, dashboards, cards, or dialogs according to the Technical Instrument & Precision HUD design language.
- **Test-Driven Development**: [.agents/skills/tdd/SKILL.md](.agents/skills/tdd/SKILL.md) — When developing features or fixing bugs test-first with unit or integration tests.
- **Bug Diagnosis**: [.agents/skills/diagnosing-bugs/SKILL.md](.agents/skills/diagnosing-bugs/SKILL.md) — When troubleshooting unexpected errors, memory leaks, or flaky tests.
- **Code Review**: [.agents/skills/code-review/SKILL.md](.agents/skills/code-review/SKILL.md) — When evaluating branch changes against repo standards and functional specs.
- **Deep Module Architecture**: [.agents/skills/codebase-design/SKILL.md](.agents/skills/codebase-design/SKILL.md) — When designing interface seams, modularizing logic, or refactoring services.

## Agent skills

### Issue tracker

Local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`GLOSSARY.md` and `docs/adr/` at the repo root). See `docs/agents/domain.md`.
