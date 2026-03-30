## PRD: [name]
**Date:** YYYY-MM-DD
**Branch:** feat/[name]
**Status:** In Progress | Complete | Abandoned
**Journey:** [journey name — Slice N of M] (omit if standalone)
**Scope:** [one sentence — the bumper for drift detection during the session]

### Goal
What this builds and why it matters. One paragraph max.

### User Story
As a [PM/landlord/tenant], I want [action] so that [outcome].

### Technical Plan
[Claude states this — Adam approves before any code is written]
1. Step one
2. Step two
3. Step three

### Acceptance Criteria
- [ ] Specific, testable statement ("User can click X and see Y")
- [ ] Another testable statement
- [ ] Each must be verifiable in browser or via database query

### Test Plan
| # | Step | Expected Result | Pass? |
|---|------|-----------------|-------|
| 1 | [specific action to take] | [what you should see] | |
| 2 | [next action] | [expected result] | |
| 3 | npm run build | Zero errors | |

### Out of Scope
- [Thing that came up but is NOT part of this build]
- [Another adjacent thing]
These items get added to BACKLOG.md if not already there.

### Constraints
- Files not to touch
- Patterns to follow (reference .claude/docs/patterns.md)
- Protected RPCs (reference supabase/core-rpcs/README.md)

### Done When
- [ ] All acceptance criteria pass
- [ ] Test plan passes
- [ ] `npm run build` passes
- [ ] Committed, merged to main, pushed
- [ ] SESSION_LOG.md updated
