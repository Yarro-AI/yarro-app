# SSOT Drift Audit — Session Prompt

## Role
You are auditing a property management SaaS (Yarro) for Single Source of Truth (SSOT) violations. Your job is to trace every piece of data from where it's written to everywhere it's read, and find places where the same data is sourced, computed, or displayed from different places — creating drift risk.

## Background — how we got here
The architectural foundation is documented in `docs/architecture/ticket-state-model.md`. That document established the Three-Layer State Model (Bucket → State → Timeout), the polymorphic dispatch router, and the principle that ALL business logic lives in Supabase RPCs and triggers, never the frontend. It was the original SSOT blueprint.

Since then, the system has evolved significantly — rooms, rent ledger, compliance automation, WhatsApp intake, contractor dispatch, and daily cron jobs have all been built on top of that foundation. Each addition brought its own data paths, triggers, and display logic. Some followed the SSOT principles perfectly. Others introduced drift — denormalized fields, duplicate computations, inconsistent status labels, frontend logic that should live in the DB.

This audit is the refinement pass. The goal is not to redesign the architecture — the foundation is strong. The goal is to find every place where reality drifted from the blueprint, and bring it back into alignment. The end state: every piece of data has ONE authoritative source, ONE path to write it, and every reader looks at that same source. No exceptions, no "it mostly works", no "we'll fix it later". Stability and reliability app-wide.

## What is drift?
**Drift** = two parts of the system can show different answers for the same question. This happens when data is written in one place but read from a denormalized copy, when status is computed in the frontend instead of the DB, when labels are hardcoded in multiple components, or when two RPCs compute the same thing differently.

## Goal
Walk through the entire user journey of an HMO property manager using Yarro. At each step, trace:
1. **Where is the data written?** (Which RPC, trigger, or direct INSERT?)
2. **Where is the data read?** (Which pages, components, RPCs, views?)
3. **Are all readers looking at the same source?** If not → drift risk.
4. **Are all writers going through the same path?** If not → sync risk.
5. **Is any business logic computed in the frontend?** If so → SSOT violation.

## What counts as a violation
- Same data point read from different tables/columns across pages
- Status or label computed in frontend JS instead of DB/RPC
- Same status badge using different logic in different components
- Denormalized field that isn't maintained by a trigger (can go stale)
- Two RPCs computing the same derived value with different logic
- Frontend calling `.from().select()` where business logic is involved
- Counts/summaries computed client-side from raw rows instead of by the DB
- Labels or display text hardcoded in multiple components instead of one mapping

## How to report findings
For each finding:
```
**[DRIFT RISK]** [entity].[field] — [short description]
- Written by: [RPC/trigger/direct insert]
- Read by: [list every page/component/RPC that reads it]
- The problem: [how they can diverge]
- Impact: [what the PM sees when it drifts]
- Fix: [how to make it SSOT]
```

## Stack context
- Next.js 16 App Router + React 19 + TypeScript + Supabase (Postgres, Auth, Edge Functions)
- Business logic lives in Supabase RPCs and triggers, NOT the frontend
- Frontend is a display layer — calls RPCs, renders results
- Polymorphic dispatch router for tickets (maintenance / compliance_renewal / rent_arrears)
- Three-layer state model: Bucket (next_action) → State (next_action_reason) → Timeout (is_past_timeout)

## Reference files
Before auditing, read these to understand the established patterns and what good looks like:
- `.claude/audits/ssot-patterns.md` — 7 SSOT patterns already built (the standard)
- `.claude/audits/ssot-anti-patterns.md` — 5 real bugs caused by drift (what bad looks like)
- `.claude/audits/ssot-user-journey.md` — the audit checklist (what to investigate)
- `.claude/audits/ssot-execution-plan.md` — how to move through the audit systematically

## Architecture docs
- `docs/architecture/ticket-state-model.md` — the original SSOT blueprint
- `.claude/docs/architecture.md` — system architecture
- `.claude/docs/frontend-rules.md` — what frontend can and can't do
- `docs/POLYMORPHIC-DISPATCH-PLAN.md` — ticket dispatch architecture

## Files to investigate
### Backend
- `supabase/migrations/` — ALL migrations for RPCs, triggers, views, constraints
- `supabase/functions/` — ALL edge functions
- `supabase/core-rpcs/README.md` — protected RPC list

### Frontend
- `src/app/(dashboard)/` — ALL page files
- `src/components/` — ALL components
- `src/lib/reason-display.ts` — label mapping (should be single source)
- `src/lib/supabase/database.types.ts` — generated types

## Output format
After auditing each phase, produce:
1. **Summary table**: every drift risk found, severity (Critical/High/Medium), and which phase
2. **Grouped fixes**: cluster related drift risks that share a root cause
3. **Priority order**: which fixes have the highest blast radius and should be done first
