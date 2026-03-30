# Module: Rent Tracking
*Feature module — HMO Phase 2, new build*

---

## What This Is

Room-level rent tracking. Operators configure rent per room, generate monthly ledger entries, log payments as they come in, and see at a glance who's paid and who hasn't. Tenants get automated WhatsApp reminders before and after rent is due. No open banking in v1 — manual logging only.

---

## What's New (All of It)

Everything in this module is new. No existing feature is extended except the Twilio/WhatsApp sending layer (which rent reminders piggyback on).

New tables: `c1_rent_ledger`
New RPCs: `create_rent_ledger_entries`, `get_rent_summary_for_property`, `mark_rent_paid`
New edge function: `rent-reminder-cron`
New components: `rent-ledger-table.tsx`, `rent-payment-dialog.tsx`
New Twilio templates: 3 reminder templates

---

## Data Model

Rent is configured at the room level (`c1_rooms`):

| Field | Purpose |
|-------|---------|
| `monthly_rent` | Amount due each period |
| `rent_frequency` | monthly or weekly |
| `rent_due_day` | Day of month (1–28) for monthly, day of week (0–6) for weekly |

Each payment period gets a row in `c1_rent_ledger`:

| Field | Purpose |
|-------|---------|
| `due_date` | The specific date payment is due |
| `amount_due` | Copied from room config at time of generation |
| `amount_paid` | Filled in when operator marks paid |
| `paid_at` | Timestamp of payment logging |
| `status` | pending / paid / overdue / partial |
| `reminder_1/2/3_sent_at` | Reminder tracking |

---

## Rent Configuration (Room Form)

Rent is configured when creating or editing a room. See room-layer module for form fields.

**Key decisions:**
- `rent_due_day` is 1–28, never 29–31. Avoids February edge cases.
- Weekly frequency: `rent_due_day` = 0 (Monday) through 6 (Sunday) — day of week rent is due.
- Amount is stored on the room. When ledger entries are generated, the current `monthly_rent` value is copied to `amount_due` — ledger rows are immutable snapshots.

---

## UI: Rent Ledger View

**Location:** New tab on property detail page — "Rent" (alongside Overview, Rooms, Compliance tabs).

**Header:**

```
April 2026                                    [← March]  [May →]
[Generate April Rent]  ← button, disabled if entries already exist for this month

Paid: 2/5    Outstanding: 3/5    Total due: £3,225
```

**Table:**

```
┌───────────┬─────────────┬───────────┬──────────────┬───────────┬──────────────┐
│ Room      │ Tenant      │ Due Date  │ Amount       │ Status    │              │
├───────────┼─────────────┼───────────┼──────────────┼───────────┼──────────────┤
│ Room 1    │ James Osei  │ 01 Apr    │ £650         │ ✓ Paid    │ ⋮            │
│ Room 2    │ Sarah Malik │ 01 Apr    │ £650         │ ⚠ Overdue │ ⋮            │
│ Room 3    │ —           │ —         │ —            │ Vacant    │              │
│ Room 4    │ Tom Chen    │ 01 Apr    │ £700         │ Pending   │ ⋮            │
│ Room 5    │ Priya Nair  │ 01 Apr    │ £625         │ Pending   │ ⋮            │
└───────────┴─────────────┴───────────┴──────────────┴───────────┴──────────────┘
```

**Status colours:**
- Paid — green
- Overdue — red/orange (past due date, not paid)
- Pending — grey (not yet due or due today)
- Partial — amber (amount_paid > 0 but < amount_due)
- Vacant — muted, no action available

**Row actions (⋮ menu):**
- Mark as paid → opens payment dialog
- Edit amount (e.g. partial month adjustment)
- View payment history for this room

---

## UI: Payment Dialog

**Triggered by:** "Mark as paid" from row menu.

**Fields:**

| Field | Type | Required |
|-------|------|----------|
| Amount paid | Number | Yes (pre-filled with amount_due) |
| Payment method | Text / Select | No — "Bank transfer", "Cash", "Standing order", other |
| Notes | Text | No |

**On submit:** Calls `mark_rent_paid` RPC. Row updates to "Paid" status immediately.

---

## UI: Dashboard Rent Card

**Location:** Dashboard right column, below compliance card.

**Content:**

```
Rent — April 2026
━━━━━━━━━━━━━━━━━━━━━━━━
● 2 paid
● 3 outstanding    ← clickable → goes to rent tab of relevant property
● 1 overdue        ← red
```

For v1 this is portfolio-wide (all properties). If operator has 1 property it's the same thing.

---

## Ledger Generation

**How it works:**

Operator clicks "Generate April Rent" on the property rent tab. This calls `create_rent_ledger_entries(property_id, month=4, year=2026)`.

The RPC:
1. Gets all occupied rooms for the property (where `current_tenant_id IS NOT NULL`)
2. For each room, calculates `due_date` from `rent_due_day` and the given month/year
3. Creates one `c1_rent_ledger` row per room with `status = pending`
4. Returns the created rows

**Guard:** If entries already exist for that property + month + year, the RPC returns them without creating duplicates. The "Generate" button is disabled once entries exist.

**Monthly vs weekly:** For v1 demo, monthly only is sufficient. Weekly is in schema but generation logic for weekly can be post-demo.

---

## Cron: `rent-reminder-cron`

**Schedule:** Daily at 09:00 UTC.

**Logic:**

```
1. Query c1_rent_ledger where:
   - status IN ('pending', 'overdue', 'partial')
   - due_date matches reminder schedule:

   Reminder 1: due_date = TODAY + 3 days AND reminder_1_sent_at IS NULL
   Reminder 2: due_date = TODAY AND reminder_2_sent_at IS NULL AND status != 'paid'
   Reminder 3: due_date = TODAY - 3 days AND reminder_3_sent_at IS NULL AND status != 'paid'

2. For each entry:
   a. Look up tenant phone via tenant_id
   b. Send WhatsApp via existing Twilio layer
   c. Update reminder_N_sent_at = NOW()
   d. If due_date < TODAY and status = 'pending': update status = 'overdue'

3. Log each reminder to c1_events
```

---

## WhatsApp Templates

**`rent_reminder_before`** — 3 days before due

> Hi [name], just a reminder that your rent of [£650] is due on [Wednesday 1st April]. Please ensure payment reaches us on time.

**`rent_reminder_due`** — on due date (unpaid)

> Hi [name], your rent of [£650] is due today. If you've already paid, please ignore this message. If not, please arrange payment as soon as possible.

**`rent_reminder_overdue`** — 3 days overdue

> Hi [name], your rent of [£650] was due on [1st April] and hasn't been received yet. Please contact us as soon as possible to arrange payment.

---

## Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Room becomes vacant mid-month | Ledger entry already created — operator marks as N/A or deletes it manually. No auto-deletion. |
| Tenant changes mid-month | Existing ledger entry stays under original tenant. New tenant's next month entry uses their details. |
| `rent_due_day` = 31 in a 30-day month | Always use 28 max to avoid this entirely (enforced at form level). |
| Operator marks rent paid before due date | Allowed — status = paid, reminders stop. |
| Partial payment | Operator sets amount_paid < amount_due, status = partial. Reminder 2/3 still fire if not fully paid. |
| No ledger entries generated for a month | Cron finds nothing, does nothing. No error. |
| Tenant has no phone number | Cron skips that entry, logs warning in c1_events. |
| Multiple properties | Each property manages its own ledger. Dashboard aggregates across all. |

---

## What the Demo Shows

1. Open property → Rent tab → April entries generated for all 5 rooms
2. Room 1 — mark as paid via dialog → status turns green
3. Show dashboard rent card — "1 paid, 4 outstanding"
4. Trigger rent cron manually → Room 2 (due today, unpaid) receives WhatsApp reminder
5. Show the reminder in c1_events activity feed

---

## Post-Demo: Profitability Calculator

Scoped out of demo but noted here for continuity.

**What the operator wants:** "Is this property making money?"

**Inputs per property:**
- Total monthly rent collected (sum from rent ledger)
- Mortgage payment (manual entry)
- Other expenses (manual entry — insurance, maintenance, management fees)

**Output:**
- Monthly profit/loss
- Yield estimate
- Simple dashboard card or separate page

This does not require new tables beyond what's being built — it's a calculation layer on top of `c1_rent_ledger` plus a few manual expense fields on `c1_properties`. Build after demo when first user asks for it.
