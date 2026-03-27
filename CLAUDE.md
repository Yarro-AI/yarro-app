# Yarro PM Dashboard — Developer Workspace

## Who You Are Helping

You are helping **Adam**, the sole developer on the Yarro PM dashboard. Adam owns all infrastructure (Supabase, Vercel, domain, Twilio, GitHub). He is building this into an HMO-focused property management platform.

**Stack:** Next.js 16 App Router · React 19 · TypeScript 5 · Tailwind 4 · shadcn/ui · Supabase (Postgres, Auth, Storage, Edge Functions) · Sonner · date-fns · next-themes

## Your Role

- **Teaching mode**: Always explain what you are doing and why. Never silently write code — walk Adam through your reasoning.
- When Adam asks about code, explain the existing pattern first, then propose changes.
- Reference existing components and utilities before creating new ones. Check `.claude/docs/patterns.md`.
- Default to small, focused changes.
- If Adam seems confused, slow down. Explain the concept before the code.

---

## Daily Workflow

### Every Morning (before any code)
1. Read SESSION_LOG.md — check "Next Session Pickup" for pending work
2. Check git state: `git status` and `git branch`
3. If work is pending from last session, mention it: "Last time we were working on X. Want to continue?"
4. Ask Adam: "What is the one thing we are building today?"
5. Read CLAUDE.md + SESSION_LOG.md + BACKLOG.md + relevant files
6. Generate task file at `.claude/tasks/YYYY-MM-DD-taskname.md`
7. State technical plan — Adam approves before any code is written
8. Create task branch off `feat/hmo-compliance`
9. Build starts only after Adam confirms

### During Every Session
- One task only — nothing else
- New ideas → .claude/tasks/BACKLOG.md → back to task
- Run /context if session feels long
- /clear between unrelated tasks (keeps CLAUDE.md, wipes conversation)

### Every Session End
- Run the done checklist (see "Before Claiming Done" below)
- `/clear` if switching tasks

### Branch Structure
main (live, always working)
└── feat/hmo-compliance (full HMO pivot)
    └── feat/[taskname] (one task at a time)

### Branch Commands
```bash
# Start a new task
git checkout feat/hmo-compliance
git pull
git checkout -b feat/[taskname]

# Finish a task — merge back to hmo-compliance
git checkout feat/hmo-compliance
git merge feat/[taskname]
git push
```

### Rule
Never commit directly to main.
Never commit directly to feat/hmo-compliance during active development.
Always work on a task branch.

---

## Caution Zones

These files are complex and have non-obvious behavior. Read thoroughly before modifying and back up first.

| File | Why It's Sensitive |
|------|-------------------|
| `supabase/functions/yarro-tenant-intake/` | WhatsApp intake state machine — `c1_context_logic` RPC drives conversation flow |
| `supabase/functions/yarro-tenant-intake/prompts.ts` | 1,550 lines of AI prompts. Backend code parses exact emoji + phrases. See `.claude/docs/hmo-pivot-plan.md` Section 10 for the list of load-bearing phrases |
| `src/contexts/pm-context.tsx` | Auth state provider — has race-condition fixes for Supabase GitHub issue #35754. Two-layer pattern (authUser + PM record) is intentional |
| `src/middleware.ts` + `src/lib/supabase/` | Auth session management — cookie refresh on every request. `getSession()` vs `getUser()` choice is deliberate |
| `types/database.ts` | Auto-generated from Supabase. Manual edits get overwritten on next type generation |
| `src/hooks/use-ticket-detail.ts` | Large hook (600+ lines) tightly coupled to DB schema. Fetches 5-7 queries in parallel |
| Database RPCs (`c1_context_logic`, `c1_create_ticket`, etc.) | Core business logic in PostgreSQL. Backed up in `.backups/supabase-export-2026-03-26/` |

---

## Git Workflow

**Remotes:**
- `origin` → `adamekubia/yarro-app` (your fork — primary)
- `upstream` → `Yarro-AI/yarro-app` (original org repo — pull only if still have access)

**Rules:**
1. Commit with clear prefixed messages: `feat:`, `fix:`, `style:`, `refactor:`
2. **Before pushing, always run:** `npm run build` (pre-push hook enforces this)
3. Push to `origin` (your fork)
4. Always work on a task branch — never commit directly to `main` or `feat/hmo-compliance`

---

## Dev Commands

```bash
npm run dev          # Start dev server → http://localhost:3000
npm run build        # Production build + TypeScript check
npm run lint         # ESLint check
```

---

## Before Claiming Done (Mandatory Checklist)

Run this before telling Adam a change is complete:

1. `npm run build` passes with zero errors
2. Feature works visually in browser
3. Data persists on page refresh
4. No errors in browser DevTools console
5. Responsive: check at 375px mobile and 1440px desktop
6. Dark mode: looks right in both themes
7. No hardcoded values that should come from constants or props
8. No `any` types or `@ts-ignore` in new code
9. SESSION_LOG.md updated
10. New ideas captured in BACKLOG.md
11. Committed and pushed to task branch

---

## Current Project: HMO Pivot

Yarro PM is pivoting to focus on HMO (Houses in Multiple Occupation) property management.

See these docs for full context:
- `.claude/docs/hmo-pivot-plan.md` — phased build plan, what stays/changes/is new
- `.claude/docs/code-issues.md` — known code quality issues to fix incrementally

**Build order:**
1. ~~Phase 1: Compliance tracking (certificates, expiry dates, dashboard card)~~ **DONE**
2. **Phase 2: Room layer (rooms table, room assignment, size validation)** ← active
3. Phase 3: Room-aware tickets
4. Phase 4: Compliance automation + room-aware intake

---

## Product Vision

Yarro targets UK HMO letting agencies (100–500 units). Full context: `.claude/docs/product-vision.md`

**Build decisions should always ask:**
- Does this serve an HMO agency specifically or is it generic?
- Does this reduce chasing, context switching, or compliance risk?
- Does this add to the audit trail or make it clearer?
- Would a Fixflo user switch to Yarro for this feature?

---

## Infrastructure

Adam owns all infra (Supabase, Vercel, Twilio, GitHub, domain). Details: `.claude/docs/infrastructure.md`

---

## End of Session

Update `SESSION_LOG.md`:

```markdown
## YYYY-MM-DD — [What was worked on]

### Summary
One paragraph of what happened.

### Changes Made
- List of files changed and why

### Status
- [ ] Build passes
- [ ] Tested locally
- [ ] Committed and pushed

### Next Session Pickup
1. Most important next step
2. Anything unfinished
```

---

## Reference Documentation

| File | When to Read |
|------|-------------|
| `.claude/docs/architecture.md` | Understanding how Yarro works |
| `.claude/docs/patterns.md` | Before creating or modifying components |
| `.claude/docs/hmo-pivot-plan.md` | HMO pivot phases, build order, what stays/changes |
| `.claude/docs/code-issues.md` | Known code quality issues and priorities |
| `.claude/docs/product-vision.md` | Product positioning, ICP, HMO context |
| `.claude/docs/infrastructure.md` | Service credentials and URLs |
| `.claude/docs/setup-guide.md` | Environment setup reference |
| `.claude/docs/git-workflow.md` | Git operations reference |
| `.claude/tasks/BACKLOG.md` | Captured ideas for future sessions |
| `.claude/skills/morning-prd/SKILL.md` | Morning PRD skill definition |

