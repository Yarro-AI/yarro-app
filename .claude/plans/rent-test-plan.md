# Rent System Test Plan

## Setup

```sql
-- Get PM ID
SELECT id FROM c1_property_managers WHERE email = 'admin@yarro.ai';
-- Get property + rooms
SELECT r.id, r.room_number, r.current_tenant_id, r.monthly_rent, r.rent_due_day,
  t.full_name FROM c1_rooms r LEFT JOIN c1_tenants t ON t.id = r.current_tenant_id
  WHERE r.property_manager_id = '{PM_ID}' ORDER BY r.room_number;
```

Clean up test data from previous session if needed.

---

## Test 1: Room Rent Configuration

### 1a. Create room with rent + "Last day of month"
1. Property page → Rooms → Add Room
2. Room number: 10, monthly rent: £800, due day: "Last day of month"
- [ ] Room created
- [ ] rent_due_day = 0 in DB
- [ ] Due day shows "Last day of month" when editing

### 1b. Create room with due day 31
1. Add room with due day: 31st
- [ ] Room created, rent_due_day = 31
- [ ] In February, ledger entry should get due_date = Feb 28 (clamped)

### 1c. Edit room rent amount
1. Edit existing room → change monthly_rent from £800 to £900
- [ ] trg_room_rent_configured fires
- [ ] If tenant assigned, new ledger entry created with updated amount
- [ ] If no tenant, no ledger entry

---

## Test 2: Tenant Assignment → Automatic Rent

### 2a. Assign tenant to room with rent configured
1. Property → Rooms → Assign Tenant to room 10
2. Set tenancy type: Rolling Monthly, start: today
- [ ] Tenant assigned
- [ ] Rent ledger entry auto-created (check c1_rent_ledger)
- [ ] Due date correct (last day of month for day 0)
- [ ] Status = 'overdue' if due date passed, 'pending' if not
- [ ] Audit event: TENANT_ASSIGNED_TO_ROOM
- [ ] Audit event: RENT_LEDGER_AUTO_CREATED

### 2b. Overdue → dashboard ticket
If entry was created as overdue:
- [ ] trg_rent_ledger_overdue_ticket fired
- [ ] Rent arrears ticket exists with next_action = 'needs_action'
- [ ] Ticket visible on dashboard
- [ ] Priority: High (or appropriate)

### 2c. Verify rent page shows entry
1. Go to /rent → current month
- [ ] Entry shows for new tenant
- [ ] Correct room number, tenant name, amount, status

### 2d. Verify property rent tab
1. Property page → Rent tab → current month
- [ ] Entry shows for new tenant in room 10
- [ ] Status badge correct

---

## Test 3: Rent Payment Flow

### 3a. Partial payment
1. /rent page → "Mark Paid" on overdue entry
2. Enter £400 (room is £800)
- [ ] Status changes to "Partial"
- [ ] amount_paid = 400
- [ ] Amber badge on rent page
- [ ] Dashboard ticket remains open (still has debt)

### 3b. Full payment (remaining)
1. Same entry → "Mark Paid" → £400
- [ ] Status changes to "Paid"
- [ ] Green badge
- [ ] Dashboard ticket auto-closes (rent_cleared)
- [ ] Audit: RENT_PAYMENT_RECORDED

---

## Test 4: Tenant Changeover (Mid-Month)

### 4a. End tenancy with outstanding debt
1. Room has overdue entry (unpaid)
2. Property → Rooms → Remove Tenant → End Tenancy
- [ ] Dialog shows: "Tenant still owes £X"
- [ ] Warning with amount displayed
- [ ] On confirm: tenancy ended
- [ ] Old tenant's overdue entry STAYS in ledger (not deleted)
- [ ] Audit: TENANCY_ENDED

### 4b. Assign new tenant to same room
1. Same room → Assign Tenant → new tenant
- [ ] New ledger entry created for new tenant
- [ ] Old tenant's entry still exists (historical)

### 4c. Rent page display
1. /rent → current month
- [ ] New tenant's entry shown first (current)
- [ ] Old tenant's outstanding entry shown below with "Former" indicator
- [ ] Old tenant's PAID entries NOT shown on rent page

### 4d. Dashboard
- [ ] Old tenant's rent arrears ticket still open (they still owe)
- [ ] New tenant's entry: if overdue, new ticket created

---

## Test 5: Monthly Cron (Auto-Generation)

### 5a. Manual trigger
```bash
curl -X POST '{SUPABASE_URL}/functions/v1/yarro-rent-reminder' \
  -H 'Authorization: Bearer {ANON_KEY}' \
  -H 'Content-Type: application/json' -d '{}'
```
- [ ] Overdue flip: pending entries past due become 'overdue'
- [ ] Reminders sent to tenants with phones
- [ ] No duplicate tickets created (dedup check)

### 5b. Navigate to next month
1. /rent → click forward to next month
2. Property → Rent → "Generate [Next Month] Rent"
- [ ] Entries created for current tenants only
- [ ] Old tenants NOT generated for
- [ ] Correct amounts from rooms
- [ ] Correct due dates (including day 0 = last day)

---

## Test 6: WhatsApp Reminders

### 6a. Pre-due reminder (3 days before)
```sql
-- Set a ledger entry to be due 3 days from now
UPDATE c1_rent_ledger SET due_date = CURRENT_DATE + 3
WHERE id = '{LEDGER_ID}';
```
Trigger cron → 
- [ ] Reminder 1 sent
- [ ] reminder_1_sent_at set
- [ ] Status still 'pending'

### 6b. Due date reminder
```sql
UPDATE c1_rent_ledger SET due_date = CURRENT_DATE WHERE id = '{LEDGER_ID}';
```
Trigger cron →
- [ ] Reminder 2 sent
- [ ] reminder_2_sent_at set

### 6c. Overdue reminder (3 days past)
```sql
UPDATE c1_rent_ledger SET due_date = CURRENT_DATE - 3 WHERE id = '{LEDGER_ID}';
```
Trigger cron →
- [ ] Status flips to 'overdue'
- [ ] Reminder 3 sent
- [ ] reminder_3_sent_at set
- [ ] Dashboard ticket created (if not already)

### 6d. Chase messages (1d, 5d, 10d)
```sql
UPDATE c1_rent_ledger SET due_date = CURRENT_DATE - 5 WHERE id = '{LEDGER_ID}';
```
Trigger cron →
- [ ] chase_5d_sent_at set
- [ ] Priority escalated on ticket

---

## Test 7: Email Channel (if tenant prefers email)

### 7a. Set tenant to email preference
```sql
UPDATE c1_tenants SET contact_method = 'email' WHERE id = '{TENANT_ID}';
```
Trigger cron with overdue entry →
- [ ] Email sent instead of WhatsApp
- [ ] Email contains correct rent amount and due date
- [ ] No WhatsApp sent to this tenant

---

## Test 8: Ticket Drawer — Rent Overview

### 8a. Open rent arrears ticket
1. Dashboard → click rent arrears ticket
- [ ] Drawer opens with rent overview tab
- [ ] Shows: total owed, months overdue
- [ ] Shows rent ledger entries for this tenant
- [ ] Correct amounts and dates

---

## Test 9: Realtime Updates

### 9a. /rent page realtime
1. Open /rent in one tab
2. In another tab, record a payment or assign a tenant
- [ ] First tab updates WITHOUT manual refresh

### 9b. Property rent tab realtime
1. Open property rent tab in one tab
2. Assign tenant to room in another tab
- [ ] First tab shows new entry without refresh

---

## Test 10: Data Integrity

```sql
-- Open rent tickets should have matching overdue ledger entries
SELECT t.id, t.issue_title, t.tenant_id,
  EXISTS(SELECT 1 FROM c1_rent_ledger rl
    WHERE rl.tenant_id = t.tenant_id AND rl.status IN ('overdue', 'partial')
  ) AS has_overdue_ledger
FROM c1_tickets t
WHERE t.category = 'rent_arrears' AND t.status = 'open';
-- Expected: all rows have has_overdue_ledger = true

-- No ledger entries for tenants not assigned to any room
SELECT rl.id, rl.tenant_id, t.full_name, t.room_id
FROM c1_rent_ledger rl
JOIN c1_tenants t ON t.id = rl.tenant_id
WHERE rl.status IN ('pending', 'overdue')
  AND t.room_id IS NULL
  AND rl.due_date >= CURRENT_DATE - 30;
-- Expected: only former tenants with outstanding debt (acceptable)

-- All rooms with rent should have current month entry
SELECT r.id, r.room_number, r.current_tenant_id, r.monthly_rent, r.rent_due_day,
  EXISTS(SELECT 1 FROM c1_rent_ledger rl
    WHERE rl.room_id = r.id AND rl.tenant_id = r.current_tenant_id
    AND rl.due_date >= date_trunc('month', CURRENT_DATE)::date
    AND rl.due_date < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
  ) AS has_current_entry
FROM c1_rooms r
WHERE r.current_tenant_id IS NOT NULL AND r.monthly_rent IS NOT NULL AND r.rent_due_day IS NOT NULL;
-- Expected: all true
```

---

## Test 11: Edge Cases (Gap Coverage)

### 11a. Rent amount change mid-month
1. Room has tenant with £800 entry (pending or overdue)
2. Edit room → change monthly_rent to £900
- [ ] Existing entry updated to £900 (not a second entry)
- [ ] Status preserved (if was overdue, stays overdue)
- [ ] Paid/partial entries NOT modified

### 11b. Due day change mid-month
1. Room has tenant with entry due on 1st
2. Edit room → change rent_due_day to 15
- [ ] New entry created at 15th
- [ ] Old entry at 1st voided (status = 'cancelled')
- [ ] Only the 15th entry shows on rent page

### 11c. Overpayment
1. Room rent is £800
2. Mark paid → enter £1000
- [ ] What happens? (Currently: accepted, tenant shows as paid, £200 vanishes)
- [ ] Log as UX backlog item if no credit tracking

### 11d. Vacant room display
1. Room 10 has rent configured but no tenant
2. Property → Rent tab
- [ ] Room shows as "Vacant" or not shown (no phantom entry)
- [ ] No ledger entry exists

### 11e. Cross-page payment sync
1. Open /rent page in Tab A
2. Open property rent tab in Tab B
3. Mark paid in Tab B
- [ ] Tab A updates via realtime (no refresh)

### 11f. Summary stats after changeover
1. After tenant A leaves with £500 debt and tenant B moves in
2. /rent page header stats
- [ ] Outstanding count includes tenant A's debt
- [ ] Total expected reflects current tenants' rent only

---

## Priority Order
**P0 — must pass:** 2a → 2b → 2c → 3a → 3b → 4a → 4b → 4c → 9a → 11a → 11b
**P1 — should pass:** 1a → 1b → 1c → 4d → 5a → 5b → 8a → 10 → 11d → 11e
**P2 — nice to have:** 6a-6d → 7a → 9b → 11c → 11f
