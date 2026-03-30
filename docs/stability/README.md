# Yarro PM — Stability & Architecture Reference

**Read this before writing any migration, touching edge functions, or modifying auth.**

This folder is the single source of truth for how the Yarro system works under the hood — what's deliberate, what's fragile, and how to build safely. It was created from a full forensic audit on 2026-03-30.

## Contents

| File | When to Read |
|------|-------------|
| [Architecture Decisions](architecture-decisions.md) | Before modifying auth, middleware, edge functions, or ticket flow |
| [Risk Registry](risk-registry.md) | When triaging bugs or planning features near known fragile areas |
| [Error Handling Map](error-handling-map.md) | When debugging user-reported errors or adding new data fetching |
| [Edge Function Flows](edge-function-flows.md) | Before touching WhatsApp intake, notifications, or dispatch |
| [Development Guidelines](development-guidelines.md) | Before starting any new build session |
| [Known Issues](known-issues.md) | When looking for backlog items or checking if an issue is already tracked |
| [When Things Go Wrong](when-things-go-wrong.md) | **During an incident** — step-by-step response for the 5 most likely failures |
| [Monitoring](monitoring.md) | Setting up and understanding the monitoring stack (Sentry, UptimeRobot, Telegram) |

## Related Docs (don't duplicate)

- `.claude/docs/architecture.md` — system architecture overview
- `.claude/docs/patterns.md` — component and UI patterns
- `.claude/docs/protected-rpcs.md` — deep RPC dependency reference
- `.claude/docs/setup-guide.md` — environment setup
- `.claude/docs/git-workflow.md` — git operations
- `supabase/core-rpcs/README.md` — 61 protected RPCs (alphabetical list)
