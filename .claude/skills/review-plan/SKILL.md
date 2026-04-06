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

### Step 1 — Comprehend the plan

Before judging anything, understand the plan deeply. This is the foundation — a shallow read produces shallow reviews.

**1a. Read the plan and its source context.**
The plan is in the conversation. So is the context it was created from — the user's request, any docs or specs referenced, prior discussion. Read all of it. Don't skip the "why" to get to the "what".

**1b. Build a mental model.**
Work through the plan and answer these questions internally before moving on:
- **Intent**: What is this plan actually trying to achieve? What problem does it solve for the end user (HMO landlord / R2R operator)?
- **Architecture**: Where does new logic live? Is it in RPCs (where business logic belongs) or in the frontend (where it shouldn't be)? What's the data flow from database → RPC → API → UI?
- **Scope boundary**: What does this plan change, and what does it deliberately leave alone? Are those boundaries sensible?
- **Downstream effects**: If this plan ships, what else in the system is affected? Other pages that read the same data? RPCs that touch the same tables? The WhatsApp intake flow? The audit trail?
- **Real-world implications**: Think about what happens when this runs in production with real tenants, real landlords, real compliance deadlines. What if data is messy, late, or missing? What if a user does something unexpected?

**1c. State your understanding.**
Before presenting findings, write a brief summary (3–5 sentences) of what the plan does and why. This forces clarity and gives Adam a chance to correct misunderstandings before the review proceeds.

### Step 2 — Verify code references
This is the only step that touches the codebase. For everything the plan references as **already existing**:

1. **Does it exist?** Quick glob/grep — confirm file paths, function names, table references are real
2. **Does it match?** If the plan says "modify the `fetchCerts` function on line 45" — is that function actually there, at roughly that location, doing what the plan thinks?
3. **Are there callers?** If the plan changes a function/RPC signature, grep for other code that calls it. The plan must handle these or it'll break things silently
4. **Does it touch a protected RPC?** If any step writes `CREATE OR REPLACE FUNCTION` for a function listed in `supabase/core-rpcs/README.md`, flag it as a **BLOCKER**. The plan must include: backup of current definition, Adam's explicit approval, and the safe modification protocol from `supabase/core-rpcs/README.md`.

Don't verify things the plan is **creating** — only things it **depends on**. If something doesn't exist and the plan doesn't create it, that's a blocker.

Keep this fast. A few targeted greps, not a full codebase scan.

### Step 3 — Scrutinise the plan
Now that you understand the plan's intent and have verified its assumptions, pressure-test it. Think from a different angle than the one that created the plan — the planner was focused on "how do I build this?", your job is "what happens when this meets reality?"

**Architecture violations — does this respect the Yarro system design?**
- Business logic in React components or hooks that should be an RPC (backend-first rule is non-negotiable)
- Derived state computed in the frontend (status calculations, counts, summaries) instead of the database
- Direct table access (`.from().select()`) where an RPC should exist because there's logic involved
- Frontend making multiple round-trips when one RPC could do the job
- Remember: the frontend is a display layer. It calls RPCs and renders results. If the plan has the frontend deciding, computing, or orchestrating business logic, that's wrong.

**Downstream impact — what breaks or changes elsewhere?**
- Other pages, components, or hooks that read the same tables or call the same RPCs
- The WhatsApp intake flow if it touches tenant/ticket/compliance data
- The audit trail — does this operation get logged? Should it?
- Type generation — if schema changes, everything downstream needs `supabase gen types`
- RLS policies — new tables or changed access patterns need policy review

**Real-world resilience — what happens in production?**
- What if the data is messy, incomplete, or late? (Real landlords don't fill everything in perfectly)
- What if a compliance deadline passes while this feature is partially built?
- What if two users act on the same record at the same time?
- What if a tenant's situation changes mid-flow? (moves rooms, leaves early, disputed charges)
- Operations that should be atomic but are written as separate steps
- Missing constraints (NOT NULL, CHECK, UNIQUE, FK) the app will rely on
- Destructive migrations on tables with existing data

**Gaps — what's missing?**
- Steps that assume happy paths without handling errors
- Missing loading, error, or empty states in UI work
- Data that won't survive a page refresh (React state only, not persisted)
- Schema changes without `supabase gen types` regeneration step
- New tables without RLS policies

**Ordering — are the steps in the right sequence?**
- Does it reference something before creating it?
- Are database changes deployed before frontend code that depends on them?
- Are types regenerated before the UI code that needs them?

**Completeness — does it actually deliver what it promises?**
- Does every stated goal map to a concrete step?
- Are there steps that sound good but are vague ("update the UI accordingly")?
- Would you know exactly what to build from this plan, or would you have to guess?

**Stability & scalability — is this the strongest approach? (See `.claude/docs/decision-principles.md`)**
- Is there a more robust approach that wasn't considered? If so, flag as **[IMPROVE]** with both options and trade-off arguments
- Does this approach hold up when adjacent features are added to the same tables or flows?
- Are we taking a shortcut that creates tech debt? If so, is refactoring later genuinely trivial (no schema/boundary implications)?
- Would this approach survive 10x the current data volume?
- If a quick approach was chosen, is the justification explicit and sound?

### Step 4 — Present findings
Output the review directly in the conversation. Don't write to files.

**Format:**

```
## Plan Review

### Understanding
[3–5 sentence summary of what the plan does, why it exists, and what context it was built from. This proves comprehension before critique.]

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
- **IMPROVE** — not wrong, but a more stable or scalable alternative exists. Present both options with trade-off arguments.

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
