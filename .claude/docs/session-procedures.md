# Session Procedures

## Session Start
1. Read SESSION_LOG.md — check "Next Session Pickup"
2. Check git state: `git status` and `git branch`
3. Check `.claude/tasks/` for incomplete PRDs — enforce Rule 1
4. If pending work exists, mention it
5. Run `/scope` to create a PRD for today's build (or `/scope` lightweight for quick fixes)
6. Build starts only after Adam confirms the PRD

## Session End
Run `/ship` — this handles test plan, build, commit, merge, push, and session log.

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

## Branch Commands

```bash
# Start (always from main)
git checkout main && git pull origin main
git checkout -b feat/[name]

# Finish (run /ship, or manually)
git checkout main
git merge --no-ff feat/[name]
git push origin main
```

Always branch from main. Always merge back to main.
No integration branches. One feature branch, one merge, ship it.

## Done Checklist

Run this before telling Adam a change is complete:

1. `npm test` passes with zero failures
2. `npm run build` passes with zero errors
3. Feature works visually in browser
4. Data persists on page refresh
5. No errors in browser DevTools console
6. Responsive: check at 375px mobile and 1440px desktop
7. Dark mode: looks right in both themes
8. No hardcoded values that should come from constants or props
9. No `any` types or `@ts-ignore` in new code
10. SESSION_LOG.md updated
11. New ideas captured in BACKLOG.md
12. State changes produce audit events (check `c1_events` after testing)
13. Dashboard and drawer show identical state for the same ticket (same label, same context)
14. No new frontend stage derivation, timeline computation, or label mapping outside `REASON_DISPLAY`
15. Committed and pushed to task branch

## Product Vision Questions

When making design decisions, ask:
- Does this serve an HMO agency specifically or is it generic?
- Does this reduce chasing, context switching, or compliance risk?
- Does this add to the audit trail or make it clearer?
- Would a Fixflo user switch to Yarro for this feature?
- Does this maintain a single source of truth, or does it introduce a parallel computation?
- Does this produce an audit event that would hold up in a legal dispute?

Full context: `docs/PRD.md`
