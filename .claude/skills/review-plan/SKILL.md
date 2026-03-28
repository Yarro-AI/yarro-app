# Review Plan Skill

## Purpose
Pressure-test Claude's plan before Adam accepts it. Catch gaps, shortcuts, and fragile approaches — then make the plan strong enough to approve and build with confidence.

## When To Use
Trigger: `/review-plan`
Run while still in plan mode, after Claude has proposed a plan and before accepting it.

## Core Principle
**The plan is already in the conversation.** Claude just proposed it. All the context is loaded. Don't go exploring — interrogate what's here. The only reason to touch the codebase is to verify that code the plan references actually exists and works the way the plan assumes.

---

## Process

### Step 1 — Read the plan in context
The plan is in the current conversation. Read it carefully. Extract every claim it makes:
- File paths it will read or modify
- Functions, RPCs, components it references or creates
- Tables, columns, types it depends on
- The order of operations

### Step 2 — Verify code references
This is the only step that touches the codebase. For everything the plan references as **already existing**:

1. **Does it exist?** Quick glob/grep — confirm file paths, function names, table references are real
2. **Does it match?** If the plan says "modify the `fetchCerts` function on line 45" — is that function actually there, at roughly that location, doing what the plan thinks?
3. **Are there callers?** If the plan changes a function/RPC signature, grep for other code that calls it. The plan must handle these or it'll break things silently

Don't verify things the plan is **creating** — only things it **depends on**. If something doesn't exist and the plan doesn't create it, that's a blocker.

Keep this fast. A few targeted greps, not a full codebase scan.

### Step 3 — Scrutinise the plan
This is the core of the review. Go through the plan step by step and pressure-test it:

**Gaps — what's missing?**
- Steps that assume happy paths without handling errors
- Missing loading, error, or empty states in UI work
- Data that won't survive a page refresh (React state only, not persisted)
- Business logic in the frontend that should be an RPC (backend-first rule)
- Schema changes without `supabase gen types` regeneration step
- New tables without RLS policies

**Shortcuts — where is it cutting corners?**
- Direct table access (`.from().select()`) where an RPC should exist
- `any` types or type assertions that paper over real mismatches
- Hardcoded values that should be constants or config
- Copy-pasted logic instead of reusing existing utilities
- Skipping validation at system boundaries

**Ordering — are the steps in the right sequence?**
- Does it reference something before creating it?
- Are database changes deployed before frontend code that depends on them?
- Are types regenerated before the UI code that needs them?

**Robustness — will this hold up?**
- Operations that should be atomic but are written as separate steps
- Race conditions (especially around auth, state, or concurrent mutations)
- Missing constraints (NOT NULL, CHECK, UNIQUE, FK) the app will rely on
- Destructive migrations on tables with existing data

**Completeness — does it actually deliver what it promises?**
- Does every stated goal map to a concrete step?
- Are there steps that sound good but are vague ("update the UI accordingly")?
- Would you know exactly what to build from this plan, or would you have to guess?

### Step 4 — Present findings
Output the review directly in the conversation. Don't write to files.

**Format:**

```
## Plan Review

**Verdict:** [Ready to build | Fix before building | Needs rethink]

### Findings

**[BLOCKER]** — [thing that will cause the build to fail or produce wrong results]
> Suggested fix: ...

**[RISK]** — [thing that works in dev but breaks in prod or at scale]
> Suggested fix: ...

**[GAP]** — [thing that's missing but won't block the build]
> Suggested fix: ...

**[IMPROVE]** — [way to make the approach stronger or simpler]
> Suggestion: ...

### Suggested plan changes
[If there are blockers or significant risks, restate the specific steps that need to change and how. Keep it surgical — don't rewrite the whole plan.]
```

**Severity guide:**
- **BLOCKER** — implementation will fail or corrupt data. Must fix before building.
- **RISK** — will work initially but cause problems. Should fix before building.
- **GAP** — missing but non-critical. Can address during implementation.
- **IMPROVE** — not wrong, but there's a better approach.

If the plan is solid, say so. "No issues found, ready to build" is a valid review. Don't pad with artificial observations.

---

## Rules
- **Stay focused on the plan at hand.** Don't audit the whole codebase or read unrelated files.
- **Don't add scope.** The review makes the plan more correct, not bigger.
- **Don't rewrite the plan.** Point out what to fix and suggest how. Adam or Claude updates it.
- **Don't write to files.** Findings go in the conversation, not into task files.
- **Be direct.** If a step is weak, say why and what would be stronger. No hedging.
- **Proportional effort.** A 3-step plan gets a quick pass. A 15-step migration gets deep scrutiny.
- **When flagging a DECISION** (something that needs Adam's input), always include a recommendation so Adam can approve or override without re-deriving the context.

## What This Skill Does NOT Do
- Write code or create branches
- Change product decisions — only technical execution
- Add features or scope the plan didn't ask for
- Search for plan files on disk — the plan is in the conversation
- Read supporting docs unless a specific claim needs checking
