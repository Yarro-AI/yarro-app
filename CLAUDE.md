# Yarro PM Dashboard — Developer Workspace

## Who You Are Helping
You are helping **Adam**, the sole developer. He owns all infrastructure.
Building an HMO-focused property management platform.

**Stack:** Next.js 16 App Router · React 19 · TypeScript 5 · Tailwind 4 · shadcn/ui · Supabase (Postgres, Auth, Storage, Edge Functions) · Sonner · date-fns · next-themes

## Your Role
- Default to small, focused changes — but never shortcuts or hacky solutions. Always pick the strongest, most scalable option.
- Reference existing components (check `.claude/docs/patterns.md`) before creating new ones.

---

## Session Rules (Non-Negotiable)
1. **One feature, one merge** — check `.claude/tasks/` for incomplete PRDs first. Ship or abandon before starting new work.
2. **Branch from main** — `feat/`, `fix/`, `refactor/` branches only. No integration branches.
3. **Guard the scope** — if it's not in the active PRD, suggest backlog. Only proceed if Adam explicitly expands the PRD.
4. **Commit often** — nudge after 3+ files changed without a commit.
5. **Don't build during testing** — log failures, don't fix mid-test. "Backlog it or blocker?"

### Session Start
1. Read SESSION_LOG.md — check "Next Session Pickup"
2. Check git state: `git status` and `git branch`
3. Check `.claude/tasks/` for incomplete PRDs — enforce Rule 1
4. If pending work exists, mention it
5. Run `/scope` to create a PRD (or `/scope` lightweight for quick fixes)
6. Build starts only after Adam confirms the PRD

Session end procedures + done checklist: `.claude/docs/session-procedures.md`

---

## Architecture — Non-Negotiable
All business logic lives in Supabase RPCs, not the frontend.
- Never put business logic in React components or hooks
- Never compute derived state (status, counts, summaries) in the frontend
- Every new feature starts with the RPC, then UI consumes it
- Direct `.from().select()` only for simple reads with no logic
- **Polymorphic Dispatch Pattern** for all ticket state logic:
  - `c1_compute_next_action` is a ~30-line router — dispatches to domain-specific sub-routines
  - Never add IF/ELSE branches to the router — add logic to the appropriate sub-routine
  - New ticket categories get a new sub-routine registered in the router
  - Every workflow (intake, dispatch, reminders, followups) flows through the ticket system
  - Reference: `docs/POLYMORPHIC-DISPATCH-PLAN.md`

RPC development workflow: `.claude/docs/architecture.md#rpc-development-workflow`

---

## Protected RPCs — Hard Stop
Before writing `CREATE OR REPLACE FUNCTION` in any migration:
1. Check `supabase/core-rpcs/README.md` for the protected list (69 functions)
2. If it's listed, **STOP and ask Adam**
3. Details & dependency graph: `.claude/docs/protected-rpcs.md`

---

## Caution Zones
Before modifying sensitive files, read: `.claude/docs/safe-zones.md` (GREEN/YELLOW/RED zones)

Key files with non-obvious behavior:
- `pm-context.tsx` — auth race-condition fixes, two-layer pattern is intentional
- `prompts.ts` — 1,550 lines, backend parses exact emoji + phrases
- `use-ticket-detail.ts` — 600+ line hook, tightly coupled to DB schema
- `src/lib/supabase/` — `getSession()` vs `getUser()` choice is deliberate

---

## Git
- `origin` → `adamekubia/yarro-app` (primary fork)
- `upstream` → `Yarro-AI/yarro-app` (pull only)
- Commit prefixes: `feat:`, `fix:`, `style:`, `refactor:`
- Before push: `npm test && npm run build` (pre-push hook enforces this)
- Full workflow: `.claude/docs/git-workflow.md`

## Dev Commands
```bash
npm run dev          # Dev server (production Supabase)
npm run dev:local    # Dev server (local Supabase/Docker)
npm run build        # Production build + TypeScript check
npm run lint         # ESLint
npm test             # Vitest (all tests once)
npm run test:watch   # Vitest (watch mode)
```

---

## Current Project
HMO pivot — Phase 1 (compliance) done, Phase 2 (rooms/rent/WhatsApp) in progress.
Specs: `docs/PRD.md` · `docs/BUILD-ORDER.md` · `docs/modules/01–04*.md` · `docs/schema/TECH-LEDGER.md`

---

## Reference Index
| File | When to Read |
|------|-------------|
| `.claude/docs/product-vision.md` | ICP, positioning, competitive landscape |
| `docs/PRD.md` | Product requirements, core loop |
| `docs/BUILD-ORDER.md` | Sprint plan, what to build next |
| `docs/schema/TECH-LEDGER.md` | Database schema, RPCs |
| `docs/modules/01–04-*.md` | Feature module specs |
| `.claude/docs/architecture.md` | System architecture + RPC workflow |
| `.claude/docs/patterns.md` | Before creating/modifying components |
| `.claude/docs/safe-zones.md` | Before touching sensitive files |
| `.claude/docs/protected-rpcs.md` | Before modifying SQL functions |
| `.claude/docs/code-issues.md` | Known code quality issues |
| `.claude/docs/session-procedures.md` | Session end, done checklist, vision questions |
| `.claude/docs/git-workflow.md` | Git operations reference |
| `.claude/docs/infrastructure.md` | Service credentials and URLs |
| `.claude/tasks/BACKLOG.md` | Captured ideas for future sessions |
| `supabase/core-rpcs/README.md` | Before writing ANY migration |
| `docs/POLYMORPHIC-DISPATCH-PLAN.md` | Polymorphic dispatch architecture, sub-routines, rent flow |
| `docs/stability/` | Edge functions, error handling, incident response |
