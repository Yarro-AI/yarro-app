# Decision Principles

How to choose between approaches when building Yarro. Every scoping decision, plan review, and implementation choice flows through this framework.

---

## Core Principle

**Stability first.** Default to the most robust, stable, and scalable option — even when it's harder upfront. Small atomic changes remain the unit of work, but each change should be the strongest version of itself.

---

## SSOT Principle

Every piece of state has ONE authoritative source. If you're writing the same value in two places, one of them is wrong.

| State | Source | Writer |
|-------|--------|--------|
| Ticket bucket + reason | Router | Trigger (3 write sites) |
| Display text (labels, context) | `REASON_DISPLAY` mapping | Frontend (one object, both views) |
| Priority | `c1_tickets.priority` column | Escalation crons |
| Timeline | `c1_events` table | RPC transactions |
| Timeout | Dashboard RPC (computed) | Never stored as a column value |

**Before writing code, ask:**
- "Does this introduce a second source of truth for any piece of state?" — if yes, restructure.
- "Does this put business logic in the frontend?" — if yes, it belongs in an RPC.
- "Does this compute something the trigger/RPC already provides?" — if yes, read from the provided field.
- "Am I about to add a CASE/IF/switch mapping `next_action_reason` to display text?" — check `REASON_DISPLAY` first.

---

## When to Present Trade-offs

Not every decision needs a formal comparison. Use this threshold:

**Present both options** (quick vs robust, with arguments for each) when the decision affects:
- Data flow or schema design
- System boundaries (RPC vs frontend, edge function responsibilities)
- Public interfaces (portal endpoints, API contracts, token formats)
- Patterns that other features will build on

**Just pick the strongest approach** when:
- The decision is an implementation detail within a settled architecture
- The choice doesn't affect other features or future work
- There's an obvious best practice with no meaningful trade-off

When presenting options, recommend the robust one. Only recommend the quick option if it has genuinely zero downstream risk.

---

## The Decision Test

Before committing to an approach, ask:

1. **Is this the strongest approach, or just the fastest?**
2. **What breaks when adjacent features land in 1–3 months?**
3. **What's the cost of changing this later vs doing it right now?**
4. **Are we choosing this because it's right, or because it's quick?**

If the answer to #1 is "just the fastest" — present the stronger alternative with trade-offs.

---

## When Quick Is Acceptable

A quick approach is the right call when ALL of these are true:

- Zero downstream risk — nothing else depends on this decision
- No schema or system boundary implications
- Trivially refactorable later — rename, extract, restructure with no callers affected
- The quick version doesn't compromise data integrity, security, or correctness

When choosing the quick path, document **why** it's safe. "This is isolated to one component with no external callers" is a valid reason. "It's faster" is not.

---

## Don't Gold-Plate

Stability-first does not mean perfection-first.

- If something can be cleanly refactored when needed, ship the simpler version now
- Perfection that blocks progress is worse than good-enough that ships
- Don't get locked trying to make everything perfect when it can be easily refactored later
- Three similar lines of code is better than a premature abstraction
- Build for what's needed now + what's clearly coming next, not for hypothetical future requirements
