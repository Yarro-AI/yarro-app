# Ticket State Model Refactor — Session Prompt

Copy everything below the line into a new Claude Code session.

---

## The prompt

We're executing a major refactor: the **Ticket State Model**. This replaces the current multi-RPC, frontend-computed state system with a clean three-layer model (bucket / state / timeout) where the backend is the single source of truth and the frontend is a pure display layer.

### What you need to read first

Before writing any code, read these files in order:

1. **Architecture spec** — `docs/architecture/ticket-state-model.md` — this is the target architecture. Understand the three-layer model, bucket assignment, priority scoring, SLA, timeouts, error recovery, and the SSOT principle. This is the north star.

2. **Master implementation plan** — `.claude/plans/gentle-roaming-creek.md` — this is the full plan with all known gaps and risks already identified and addressed. It has Steps 1-10 plus Sprint 0, deployment strategy, prerequisites, protected RPC summary, edge function summary, and files affected. Do not modify this file.

### Sprint plans (execute in order)

Each sprint is a self-contained plan with exact file paths, line numbers, SQL, and verification checklists:

| Order | File | What it does |
|-------|------|-------------|
| 1st | `.claude/plans/sprint-00-documentation-foundation.md` | Update 7 guiding docs to encode the new mental model before any code changes |
| 2nd | `.claude/plans/sprint-0a-backend-foundation.md` | 8 sub-migrations: new columns, scoring function, router rewrite, trigger 4-field write, SLA consolidation, new RPCs, backfill, CHECK constraint |
| 3rd | `.claude/plans/sprint-0b-auto-creation-edge-functions.md` | Compliance auto-ticket cron, rent RPC augment, edge function cleanup, job_stage column DROP |
| 4th | `.claude/plans/sprint-0c-dashboard-rpc.md` | Rewrite c1_get_dashboard_todo with timeout CTE, stuck override, priority scoring |
| 5th | `.claude/plans/sprint-0d-audit-trail.md` | STATE_CHANGED events in trigger, TIMEOUT events, drop c1_ledger |
| 6th | `.claude/plans/sprint-0e-drawer-frontend.md` | c1_ticket_detail RPC, REASON_DISPLAY mapping, kill STAGE_CONFIG/extras/deriveTimeline, portal migration |
| 7th | `.claude/plans/sprint-0f-realtime-verification.md` | Supabase Realtime subscription + 40-point E2E verification |

### How to work

- **One sprint at a time.** Read the sprint plan, execute it, run the verification checklist at the end, then move to the next.
- **Always document gaps, bugs and risks as you go.** If you notice gaps, bugs, potential risks, missing parts of the plan, or anything worth noting for future sessions — log it in `.claude/docs/refactor-notes.md`. This is the living document for the refactor. Use the existing sections (Pre-existing Issues, Decision Log, Gaps Found, Risks Encountered).
- **When making key architectural decisions that aren't in the plan:** The source of truth is `docs/architecture/ticket-state-model.md` and the plans themselves. If there are decisions that need to be made between two or more architectural choices that aren't specifically documented in the docs or plans, **never assume or guess. ALWAYS pause and ask.** Explain the potential choices, their implications, their respective risks and tradeoffs, and before continuing with the build we will make decisions to guide the build.
- **Commit after each sprint passes verification.** Each sprint boundary is a safe rollback point.
- **Protected RPCs require my approval.** When you hit a protected RPC (check `supabase/core-rpcs/README.md`), show me the change and ask before writing `CREATE OR REPLACE FUNCTION`.
- **Edge function changes require my approval.** Show me the scoped diff before modifying any file in `supabase/functions/`.
- **All data is seed data.** Tickets can be deleted, the database can be wiped. Don't worry about data preservation — worry about getting the architecture right.
- **The app can go down during deployment.** No zero-downtime requirement.
- **Don't skip verification.** Each sprint's checklist exists because something could silently break without it.

### Key constraints

- `c1_messages.stage` is known debt — the router still reads it, edge functions still write it. Don't touch it this refactor.
- Don't introduce new `getSession()`/`getUser()` calls outside `pm-context.tsx` (Supabase Auth hang bug).
- Audit events are non-negotiable — if `c1_log_event()` fails, the operation rolls back. No exception swallowing.
- Edge functions must deploy BEFORE the migration that drops `job_stage` (Sprint B handles this ordering).
- The existing `trg_c1_set_sla` trigger must be dropped before the recompute trigger starts writing `sla_due_at` (Sprint A sub-step 1b handles this).

### Git workflow

- **One branch per sprint.** Branch from `main` at the start of each sprint:
  - Sprint 0: `refactor/ticket-state-model-docs`
  - Sprint A: `refactor/ticket-state-model-backend`
  - Sprint B: `refactor/ticket-state-model-auto-creation`
  - Sprint C: `refactor/ticket-state-model-dashboard-rpc`
  - Sprint D: `refactor/ticket-state-model-audit-trail`
  - Sprint E: `refactor/ticket-state-model-frontend`
  - Sprint F: `refactor/ticket-state-model-realtime`
- **Merge to main after each sprint passes verification.** The next sprint branches from the updated main.
- **Do not push or merge without my approval.** When a sprint's verification checklist passes, tell me and I'll confirm the merge.

### Start here

Read the architecture spec and master plan. Then start with Sprint 0 (documentation foundation) on branch `refactor/ticket-state-model-docs`. Ask me if anything is unclear or if you hit a decision point not covered by the plans.
