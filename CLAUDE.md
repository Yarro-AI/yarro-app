# Yarro PM Dashboard — Developer Workspace

## Who You Are Helping
You are helping **Adam**, the sole developer. He owns all infrastructure.
Building an HMO-focused property management platform.

**Stack:** Next.js 16 App Router · React 19 · TypeScript 5 · Tailwind 4 · shadcn/ui · Supabase (Postgres, Auth, Storage, Edge Functions) · Sonner · date-fns · next-themes

## Your Role
- Default to small, focused changes — but never shortcuts or hacky solutions.
- Always pick the strongest, most scalable option. Read `.claude/docs/decision-principles.md` for the full decision framework.
- Reference existing components (check `.claude/docs/patterns.md`) before creating new ones.
- Think about the long-term: what happens when parallel features land alongside this change?
- Each atomic change should be the strongest version of itself — small scope, maximum stability.

---

## Architecture — Non-Negotiable
All business logic lives in Supabase RPCs, not the frontend.
- Never put business logic in React components or hooks
- Never compute derived state (status, counts, summaries) in the frontend
- Every new feature starts with the RPC, then UI consumes it
- Direct `.from().select()` only for simple reads with no logic

### Frontend Rules — Read Before Any UI/UX Work
**Any change that touches React components, hooks, pages, or styling MUST follow `.claude/docs/frontend-rules.md`.**
This includes: new components, UI fixes, display logic, label changes, layout work, styling, and interaction patterns.
The rules define how the frontend reads backend state, where labels come from, what's allowed in the frontend layer, and what requires a backend change. No exceptions.

### Three-Layer State Model — THE LAW
Every open ticket's state is described by three layers:
- **Bucket** (`next_action`) — Where: `needs_action` | `waiting` | `scheduled` | `stuck` (display-only)
- **State** (`next_action_reason`) — Why: confirmed fact (e.g. `awaiting_contractor`, `handoff_review`)
- **Timeout** (`is_past_timeout`) — How long: computed at display time, never stored as a state

**The pipeline:** Router computes bucket + reason → Trigger writes 4 fields (`next_action`, `next_action_reason`, `waiting_since`, `sla_due_at`) → Dashboard RPC adds timeout overlay + priority score → Frontend displays via `REASON_DISPLAY` mapping.

**Non-negotiable rules:**
- Timeouts are metadata, never states — don't add `_no_response` reasons
- `sla_due_at` is NULL when PM isn't the actor — don't set SLA on waiting tickets
- `waiting_since` resets on every state change — don't manually set it
- Frontend never computes bucket, priority, timeout, or SLA — those come from the RPC/trigger
- One `REASON_DISPLAY` mapping (`src/lib/reason-display.ts`) — both dashboard and drawer use it, never duplicate label logic
- Audit events are non-negotiable — if `c1_log_event()` fails, the operation rolls back
- Full spec: `docs/architecture/ticket-state-model.md`

### Polymorphic Dispatch — Router Rules
- `c1_compute_next_action` is a pure dispatch router — ZERO business logic
- 3 explicit routes: `maintenance` → `compliance_renewal` → `rent_arrears` → else error
- Each route owns its FULL lifecycle (maintenance includes landlord, OOH, handoff, pending review)
- Never add IF/ELSE branches to the router — add logic to the appropriate sub-routine
- `c1_tickets.category` = route (`maintenance`/`compliance_renewal`/`rent_arrears`), NOT NULL
- `c1_tickets.maintenance_trade` = contractor trade type (`Plumber`, `Electrician`) for maintenance only
- `next_action_reason` has a CHECK constraint — new reasons require a migration
- New categories = new explicit route + new sub-routine + CHECK constraint update
- Reference: `docs/POLYMORPHIC-DISPATCH-PLAN.md`

RPC development workflow: `.claude/docs/architecture.md#rpc-development-workflow`

---

## Session Rules (Non-Negotiable)
1. **One feature, one merge** — check `.claude/tasks/` for incomplete PRDs first. Ship or abandon before starting new work.
2. **Branch from main** — `feat/`, `fix/`, `refactor/` branches only. No integration branches.
3. **Guard the scope** — if it's not in the active PRD, suggest backlog. Only proceed if Adam explicitly expands the PRD.
4. **Commit often** — nudge after 3+ files changed without a commit.
5. **Don't build during testing** — log failures, don't fix mid-test. "Backlog it or blocker?"

Session start + end procedures: `.claude/docs/session-procedures.md`

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
- `use-ticket-detail.ts` — after refactor: 1 RPC + 1 events query (was 600+ lines, 7+ queries)
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
| `docs/architecture/ticket-state-model.md` | **PRIMARY** — Three-layer state model, bucket assignment, priority scoring, SLA, timeouts, error recovery |
| `.claude/docs/decision-principles.md` | Before choosing between approaches, during scoping & plan review |
| `.claude/docs/product-vision.md` | ICP, positioning, competitive landscape |
| `docs/PRD.md` | Product requirements, core loop |
| `docs/BUILD-ORDER.md` | Sprint plan, what to build next |
| `docs/schema/TECH-LEDGER.md` | Database schema, RPCs |
| `docs/modules/01–04-*.md` | Feature module specs |
| `.claude/docs/architecture.md` | System architecture + RPC workflow |
| `.claude/docs/frontend-rules.md` | **REQUIRED** — Before ANY UI/UX work (components, hooks, pages, styling, labels, layout) |
| `.claude/docs/patterns.md` | Before creating/modifying components |
| `.claude/docs/safe-zones.md` | Before touching sensitive files |
| `.claude/docs/protected-rpcs.md` | Before modifying SQL functions |
| `.claude/docs/code-issues.md` | Known code quality issues |
| `.claude/docs/session-procedures.md` | Session start/end, done checklist, vision questions |
| `.claude/docs/git-workflow.md` | Git operations reference |
| `.claude/docs/infrastructure.md` | Service credentials and URLs |
| `.claude/tasks/BACKLOG.md` | Captured ideas for future sessions |
| `supabase/core-rpcs/README.md` | Before writing ANY migration |
| `docs/POLYMORPHIC-DISPATCH-PLAN.md` | Polymorphic dispatch architecture, sub-routines, rent flow |
| `docs/stability/` | Edge functions, error handling, incident response |
