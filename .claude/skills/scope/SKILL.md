# Scope — PRD Builder

Build a bounded, testable PRD for one vertical slice. Branch from main, build it, ship it.

- `/scope` — scope a slice (uses active journey if one exists)
- `/scope journey` — create a new journey (read `scope-guide.md` first, then `.claude/templates/journey-template.md`)
- `/scope fix` — lightweight mode for quick fixes

---

## Process

### Phase 0 — Check State

1. Look in `.claude/tasks/` for any PRD with `Status: In Progress`. If found:
   > "Unfinished task: **[name]**. Ship it (`/ship`) or abandon it first."
   Stop until resolved.

2. Look for `journey-*.md` with `Status: Active`. If found, read it and show:
   > "Journey: **[name]** — [N]/[M] slices shipped. Next: **[slice]**. Continue?"
   If Adam confirms, use that slice as the starting point for Phase 2.

### Phase 1 — Read Context (minimal)

Read only what's needed — don't load everything:
- `SESSION_LOG.md` — **latest entry only** (first `## Latest:` or `## 2026-` section)
- Active journey file (if exists, already small)
- CLAUDE.md is already in context — don't re-read it
- BACKLOG.md — only if Adam is deciding what to build, skip if they already know

### Phase 2 — Interrogate

**If there's an active journey with a clear next slice** — ask 3 questions:

1. **"What does done look like?"** — concrete, browser-verifiable acceptance criteria
2. **"What are we NOT building?"** — scope boundary. Prompt with adjacent slices from the journey
3. **"Any caution zones?"** — check against CLAUDE.md caution zones + `supabase/core-rpcs/README.md`

**If standalone (no journey)** — ask 5 questions:

1. **"What are we building?"** — specific slice, not a vague area. Push back on broad answers: "What's the one thing a user can do when we ship this?"
2. **"Why now? What does this unblock?"** — if no clear urgency, suggest backlog
3. **"What does done look like?"** — browser-verifiable acceptance criteria
4. **"What are we NOT building?"** — the most important question. If Adam can't answer, scope isn't clear
5. **"Any caution zones?"** — cross-reference CLAUDE.md + protected RPCs

### Scope Gate

Before generating anything, verify:
- **Vertical slice?** Data layer → UI → works in browser. If it's just RPCs or just a form, push back: "Can we scope this end-to-end?"
- **One session?** If not: "What's the minimum slice that's useful on its own?"
- **Dependencies shipped?** If this needs something unbuilt: "This depends on [X]. Build that first?"
- **Testable done?** If vague: "I can't write a test for that. What would you check in the browser?"
- **Strongest approach, not just fastest?** Apply the decision test from `.claude/docs/decision-principles.md`. If a quicker approach was chosen, document why it's safe.
- **Holds when adjacent features land?** What breaks if the next slice on the journey touches the same tables or flows?

### Phase 3 — Generate PRD

Create `.claude/tasks/YYYY-MM-DD-[name].md` using the template at `.claude/templates/prd-template.md`.

Fill in all sections from the interrogation answers. If an active journey exists, add `**Journey:** [name] — Slice [N] of [M]` to the header.

Add any "Out of Scope" items to `.claude/tasks/BACKLOG.md` immediately.

### Phase 4 — Branch and Confirm

```bash
git checkout main && git pull origin main
git checkout -b feat/[name]
```

> "PRD created. Branch `feat/[name]` from main. Confirm to start."

Do NOT write code until Adam confirms.

---

## Lightweight Mode (`/scope fix`)

For quick fixes (1-2 files, obvious scope):

Create minimal task file:
```markdown
## Fix: [name]
**Date:** YYYY-MM-DD  |  **Branch:** fix/[name]  |  **Status:** In Progress
### Goal
[One sentence]
### Done When
- [ ] [The fix works]
- [ ] `npm run build` passes
- [ ] Committed, merged to main, pushed
```

Branch, confirm, go. No interrogation.

---

## Rules

- Always branch from `main`
- Never start building without confirmation
- Resolve incomplete PRDs before creating new ones
- Every slice must be vertical (data → UI → works in browser)
- Update journey file when a slice ships
