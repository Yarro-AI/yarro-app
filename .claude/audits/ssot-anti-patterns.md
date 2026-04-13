# SSOT Anti-Patterns — What Drift Looks Like

These are real bugs found and fixed in Yarro during E2E testing (April 2026). They illustrate what drift looks like in practice. When auditing, look for SIMILAR patterns — different data, same structural problem.

---

### 1. Two paths, different behaviour (rent_due_day)
**What happened:** Room form showed "1st" visually but submitted NULL. The trigger checked `IF rent_due_day IS NULL THEN RETURN` — no entry, no error, no audit. But the batch RPC used `COALESCE(rent_due_day, 1)` — it defaulted to 1st.
**The pattern:** Same field, two code paths handling NULL differently. One fails silently, the other works. PM has no idea why one room gets entries and another doesn't.
**How we fixed it:** COALESCE in the trigger (same as the RPC) + frontend validation requiring due day when rent is set.

### 2. Multiple mutation paths, inconsistent side effects (room_remove_tenant)
**What happened:** `room_end_tenancy` cancelled future rent entries but `room_remove_tenant` didn't. Both result in "tenant leaves room" but with different downstream effects.
**The pattern:** Two RPCs that achieve the same outcome but only one handles the cleanup. New code paths get added without checking if they need the same side effects.
**How we fixed it:** Moved ALL side effects into the trigger. RPCs only update the room — trigger handles everything downstream.

### 3. Hardcoded filter instead of reading actual value (sendAndLog)
**What happened:** `sendAndLog` auto-detect query had `.eq("contact_method", "email")` hardcoded. Instead of reading the actual contact_method and routing accordingly, it only looked for email tenants. WhatsApp tenants silently fell through to the wrong path.
**The pattern:** Code that assumes a value instead of reading it from the source. Works for the first use case, breaks silently for others.
**How we fixed it:** Removed the hardcoded filter. Now reads actual contact_method and routes accordingly.

### 4. Cascade from bad data (overpayment → ticket closure)
**What happened:** Payment on an already-paid entry made total_paid > amount_due. Trigger set status='paid'. Auto-close check found no overdue/partial entries for tenant → closed EVERY open rent ticket for that tenant, even ones for different months.
**The pattern:** Missing validation at the entry point allows bad data in. Downstream automation trusts the data and amplifies the error. One wrong payment closes 3 tickets.
**How we fixed it:** Guard at entry (reject payment on paid entries) + cap in trigger (amount_paid never exceeds amount_due) + auto-close only when genuinely no debt remains.

### 5. Same data, two computation paths (priority mismatch)
**What happened:** Dashboard read `priority` from the ticket table (set at creation, never updated for rent). Drawer computed priority from an extras RPC using days overdue. Same ticket showed "Low" on dashboard and "High" in drawer.
**The pattern:** One reader looks at a stored field, another computes it dynamically. Stored field goes stale, dynamic is current. PM sees two different answers.
**How we fixed it:** Set priority at creation AND escalate daily via cron. Both readers now look at the same stored field, which is kept current by escalation.

---

## The meta-pattern

Most drift comes from one of these structural problems:

1. **Multiple writers, no enforcer** — several code paths can change the same data, each with its own side effects (or lack thereof). Fix: consolidate into trigger or single RPC.

2. **Denormalized copy without maintenance** — a field is copied for convenience but nothing keeps it in sync. Fix: trigger maintains the copy, or eliminate the copy and derive from source.

3. **Frontend computing what the DB should compute** — status, labels, counts done in JS instead of SQL. Fix: move to RPC, frontend renders result.

4. **Missing validation at the boundary** — bad data gets in, downstream automation amplifies it. Fix: validate at entry, guard at every step.

5. **Stored vs computed disagreement** — one path reads stored data, another computes it fresh. Fix: keep stored data current (cron/trigger), or always compute fresh (RPC).
