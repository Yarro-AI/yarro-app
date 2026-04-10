# Sprint B: Auto-Creation + Edge Functions

> **Prereq:** Sprint A (backend foundation) complete.
> **Output:** Compliance cron creates tickets, rent RPC sets new columns, edge functions don't write `job_stage`, `job_stage` column dropped.
> **Master plan:** `.claude/plans/gentle-roaming-creek.md` — Steps 2, 3, 4

---

## Step 2: Compliance auto-ticketing cron

### New RPC: `c1_compliance_auto_ticket()`

**Migration file:** `supabase/migrations/YYYYMMDD_02_compliance_auto_ticket.sql`

**Logic:**
1. Scan `c1_compliance_certificates` for PM's portfolio
2. **Incomplete cert** (no `document_url` OR no `expiry_date`) → create ticket with `cert_incomplete`, priority Normal
3. **Expiring cert** (expiry ≤30 days, doc exists) → create ticket with `compliance_needs_dispatch`, priority based on expiry proximity
4. **Expired cert** (past expiry, doc exists) → create ticket with `compliance_needs_dispatch`, priority Urgent
5. Pre-creation dedup: `NOT EXISTS (SELECT 1 FROM c1_tickets WHERE compliance_certificate_id = cc.id AND status = 'open')`
6. Pre-creation check: cert not already renewed (`NOT (cc.expiry_date > CURRENT_DATE AND cc.reminder_count = 0)`)

**Title generation:**
- `issue_title`: `'{cert_type} — {property_address}'` (e.g. "Gas Safety Certificate — 14 Elm Street")
- `issue_description`: `'{cert_type} {expired X days ago | expires in X days} — dispatch contractor for renewal'`

**New columns set at creation:**
- `deadline_date = cc.expiry_date`
- `waiting_since = now()`
- `category = 'compliance_renewal'`
- `compliance_certificate_id = cc.id`

**Audit event:** `c1_log_event(ticket_id, 'AUTO_TICKET_COMPLIANCE', 'system', NULL, property_label, metadata)` in same transaction.

### New cron: `compliance-auto-ticket-daily`

```sql
SELECT cron.schedule(
  'compliance-auto-ticket-daily',
  '5 8 * * *',  -- 08:05 UTC daily, after c1_compliance_escalate (07:55)
  $$SELECT c1_compliance_auto_ticket()$$
);
```

### Modify `compliance_dispatch_renewal` → idempotent

**Current behavior:** Raises exception if ticket exists for cert.
**New behavior:** If ticket exists, update it (assign contractor, advance state). If no ticket, create + dispatch.

```sql
-- Replace the exception with:
IF v_existing_ticket_id IS NOT NULL THEN
  -- Ticket exists (auto-created) — assign contractor and advance
  UPDATE c1_messages SET contractors = p_contractor_array, stage = 'contractor_notified'
  WHERE ticket_id = v_existing_ticket_id;
  -- ... dispatch logic
  RETURN v_existing_ticket_id;
END IF;
-- Otherwise create new ticket + dispatch (existing path)
```

**First run:** Run `c1_compliance_auto_ticket()` manually via SQL editor. Review created tickets before enabling the cron schedule.

### Verify Step 2:
- [ ] Manual run creates tickets for incomplete/expiring/expired certs
- [ ] Dedup prevents duplicate tickets for same cert
- [ ] `deadline_date` set from cert expiry
- [ ] `issue_title` and `issue_description` populated (not NULL)
- [ ] `AUTO_TICKET_COMPLIANCE` events in `c1_events`
- [ ] `compliance_dispatch_renewal` handles existing ticket (no exception)
- [ ] Cron scheduled after escalation cron

---

## Step 3: Rent day-1 ticketing — verify + augment

**`yarro-rent-reminder` already calls `create_rent_arrears_ticket()`** (line 298). No new edge function code needed.

### Update `create_rent_arrears_ticket` RPC

**Migration file:** `supabase/migrations/YYYYMMDD_03_rent_ticket_augment.sql`

**Changes to the RPC:**
1. Remove `job_stage = 'created'` from INSERT (already done in Sprint A 1f if combined)
2. Add `waiting_since = now()` to INSERT
3. Add `deadline_date` parameter or compute from `c1_rent_ledger`:
   ```sql
   -- Get the earliest overdue due_date for this tenant
   SELECT MIN(due_date) INTO v_deadline
   FROM c1_rent_ledger
   WHERE tenant_id = p_tenant_id AND status IN ('overdue', 'partial');
   
   -- INSERT includes: deadline_date = v_deadline
   ```
4. Add `AUTO_TICKET_RENT` audit event:
   ```sql
   PERFORM c1_log_event(v_ticket_id, 'AUTO_TICKET_RENT', 'system', NULL, v_property_label,
     jsonb_build_object('tenant_id', p_tenant_id, 'amount_overdue', v_total_arrears));
   ```
5. Verify `issue_title` and `issue_description` are generated (current: passed as params from edge function)

### Verify Step 3:
- [ ] Rent tickets have `deadline_date` set
- [ ] Rent tickets have `waiting_since` set
- [ ] `AUTO_TICKET_RENT` events in `c1_events` for new tickets
- [ ] Existing dedup still works (no duplicate tickets per tenant)
- [ ] Edge function unchanged — RPC handles the new columns

---

## Step 4: Handoff guard + remove `job_stage` writes from edge functions

### `yarro-tenant-intake/index.ts` — handoff guard

**Current state:** Already always calls `c1_create_ticket` on handoff/final/emergency branches (line 579).

**Changes:**
1. Verify handoff path passes `handoff_reason` in the `_issue` JSONB:
   ```typescript
   // In the handoff branch, add to the issue object:
   issue.handoff_reason = handoffReason // 'property_not_matched', 'category_unclear', etc.
   ```
2. Verify `c1_create_ticket` reads and writes `handoff_reason` from `_issue` (done in Sprint A 1f)

### `yarro-scheduling/index.ts` — remove `job_stage` writes

**Line 169:** Remove `job_stage: "Sent"` from the `.update()` call in the finalize-job path.
**Line 372:** Remove `job_stage: "Booked"` from the `.update()` call in the Fillout scheduling path.

Both are properties in `.update({...})` objects — just delete the key-value pair. No other changes.

### Deploy edge functions FIRST

```bash
supabase functions deploy yarro-tenant-intake
supabase functions deploy yarro-scheduling
# yarro-rent-reminder: no changes needed to the edge function itself
```

### Drop `job_stage` column (if not done in Sprint A)

After edge functions are deployed and verified:
```sql
ALTER TABLE c1_tickets DROP COLUMN IF EXISTS job_stage;
```

### `prompts.ts` check

**Confirmed:** `landlord_no_response` does NOT appear in `prompts.ts`. No changes needed.

### Verify Step 4:
- [ ] Edge functions deployed without errors
- [ ] `yarro-scheduling` no longer writes `job_stage`
- [ ] `yarro-tenant-intake` passes `handoff_reason` for handoff tickets
- [ ] `job_stage` column dropped from `c1_tickets`
- [ ] No references to `job_stage` remain in codebase (grep to verify)
- [ ] Existing dispatch flow still works (contractor gets notified, quote flow works)
- [ ] `c1_messages.stage` still being written by edge functions (known debt, intentional)

---

## Sprint B Verification (all steps)

- [ ] `supabase db push` succeeds
- [ ] Edge functions deployed
- [ ] `supabase gen types` regenerated
- [ ] Compliance auto-ticket cron creates tickets correctly
- [ ] Rent tickets have `deadline_date` and `waiting_since`
- [ ] `job_stage` column no longer exists
- [ ] Portals read `next_action_reason` (from Sprint A portal RPC updates)
- [ ] No errors in Sentry from edge functions
