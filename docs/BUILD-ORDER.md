# Yarro — Build Order
*Two-week sprint to demo-ready. Real product, real data, real user.*
*Start date: ~28 March 2026 | Demo deadline: ~11 April 2026*

---

## Principles

1. **Database first.** Every phase starts with migrations. Never build UI against tables that don't exist.
2. **Use existing infrastructure.** Compliance dispatch = existing dispatcher. Rent reminders = existing Twilio layer. No new pipelines unless unavoidable.
3. **Backwards compatible.** All new FK columns are nullable. Existing data never breaks.
4. **Demo data in parallel.** Seed the friend's 1 property, 5 rooms, 5 tenants as you build. Don't leave seeding to day 13.

---

## Week 1 — Foundation + Room Layer

### Day 1 — Database foundations

**Goal:** All new tables exist. Existing tables extended. Zero UI.

1. Migration: `c1_rooms` table
2. Migration: `c1_rent_ledger` table
3. Migration: add `room_id` (nullable) to `c1_tenants`
4. Migration: add `room_id` (nullable) to `c1_tickets`
5. Migration: add `reminder_sent_at`, `contractor_id`, `reminder_days_before` to `c1_compliance_certificates`
6. Regenerate Supabase types (`supabase gen types typescript`)
7. Fix any TypeScript errors from new columns

**Done when:** `supabase gen types` runs clean, no TS errors in existing code.

---

### Day 2 — Room RPCs + basic room UI

**Goal:** Rooms can be created and listed on a property.

1. Migration: `get_rooms_for_property(property_id)` RPC
2. New component: `room-form-dialog.tsx` — create/edit a room (room number, name, floor, rent amount, rent frequency, rent due day)
3. New component: `property-rooms-tab.tsx` — list of rooms with vacancy status, current tenant name, tenancy dates, monthly rent
4. Add Rooms tab to `src/app/(dashboard)/properties/[id]/page.tsx`

**Done when:** On a property detail page, you can see a Rooms tab, add a room, and see it listed.

---

### Day 3 — Tenant-to-room assignment

**Goal:** Existing tenants can be assigned to rooms. Room shows occupant.

1. Add room selector to tenant edit form (dropdown of rooms for the tenant's property — only unoccupied rooms shown)
2. On save: update `c1_tenants.room_id` AND update `c1_rooms.current_tenant_id` (keep in sync)
3. Update `property-rooms-tab.tsx` to show current occupant with link to tenant detail
4. Add tenancy start/end date fields to room assignment flow
5. Add "Rooms" column to properties list page (`src/app/(dashboard)/properties/page.tsx`) — shows occupied/total count e.g. "4/5"

**Done when:** You can assign a tenant to a room, the room shows occupied, the properties list shows room count.

---

### Day 4 — Demo data + room layer QA

**Goal:** Friend's real data is in. Room layer is solid.

1. Seed: 1 property, 5 rooms, 5 tenants, all assigned to rooms
2. Seed: compliance certificates for the property (mix of valid/expiring/expired)
3. QA the full room flow: create room → assign tenant → view occupancy → edit room → remove tenant (vacancy)
4. Edge cases:
   - Assigning a tenant to an already-occupied room (block or warn)
   - Deleting a room that has a tenant (block with message)
   - Room with no rent configured (show "—" not crash)

**Done when:** Demo data is live, room layer has no crashes on edge cases.

---

### Day 5 — WhatsApp room awareness

**Goal:** When a tenant WhatsApps, the system identifies their room and the ticket links to it.

1. Extend `c1_context_logic` PostgreSQL RPC:
   - After tenant lookup: check `c1_tenants.room_id`
   - If `room_id` found: return `ctx.room` with room data
   - If tenant found but no `room_id`: set `ai_instruction = CONFIRM_ROOM`, return list of rooms for that property
2. Extend `buildSystemPrompt()` in `whatsapp-intake` to include room context when available ("Tenant is in Room 3")
3. Extend `c1_convo_finalize` to return `room_id`
4. Extend `c1_create_ticket` to accept and store `room_id`
5. Add room display to ticket detail modal (Overview tab — show "Room 3" next to property)
6. Add new Twilio template: `room_confirm_prompt` — "Hi [name], just to confirm — are you in [room]? Reply YES or NO."

**Done when:** Send a WhatsApp from a seeded tenant's number. Ticket is created with room_id populated. Room shows in ticket detail.

---

## Week 2 — Compliance Automation + Rent Tracking

### Day 6 — Compliance reminder cron

**Goal:** Expiring certificates trigger WhatsApp/email to the operator.

1. Update `certificate-form-dialog.tsx`:
   - Add `reminder_days_before` field (default 60, options: 30/60/90)
   - Add `contractor_id` selector — dropdown of contractors, filtered by relevant category
2. New RPC: `get_compliance_expiring(days_ahead, property_manager_id)`
3. New edge function: `compliance-reminder-cron`
   - Query expiring certs via RPC
   - Send WhatsApp to PM via existing Twilio layer (fallback to email via Resend)
   - Update `reminder_sent_at`
   - Log to `c1_events`
4. New Twilio template: `compliance_expiry_operator`

**Done when:** Manually trigger the cron. A cert with expiry within 60 days sends a WhatsApp to the operator. `reminder_sent_at` is set. Event logged.

---

### Day 7 — Compliance dispatch integration

**Goal:** Expiring certificate with a contractor assigned auto-dispatches a renewal job.

1. Extend `compliance-reminder-cron`:
   - If `contractor_id` is set on the certificate:
     - Create a ticket via `c1_create_ticket` with `category = compliance_renewal`, linked to property
     - Call existing dispatcher with that ticket + contractor
2. New Twilio template: `compliance_dispatch_contractor`
3. QA: compliance reminder → operator WhatsApp → contractor dispatch → contractor receives WhatsApp → job created in ticket list
4. Verify audit trail: all actions appear in `c1_events` and dashboard activity feed

**Done when:** End-to-end compliance loop works. Operator gets notified. Contractor gets dispatched. Ticket exists. Audit trail complete.

---

### Day 8 — Rent tracking — configuration

**Goal:** Each room has rent configured and ledger entries can be generated.

1. Ensure room form captures: `monthly_rent`, `rent_frequency`, `rent_due_day`
2. New RPC: `create_rent_ledger_entries(property_id, month, year)` — generates rows in `c1_rent_ledger` for all occupied rooms
3. New RPC: `get_rent_summary_for_property(property_id, month, year)`
4. New component: `rent-ledger-table.tsx` — table of rooms, rent due, amount, status (pending/paid/overdue)
5. Add rent summary to property detail page (below rooms tab or as separate tab)
6. Add "Generate rent for [month]" action — calls `create_rent_ledger_entries`

**Done when:** For the seeded property, you can generate April rent, see all 5 rooms listed with amounts and pending status.

---

### Day 9 — Rent tracking — payment logging + reminders

**Goal:** Operator can mark rent paid. Tenants get automated reminders.

1. New component: `rent-payment-dialog.tsx` — mark as paid, enter amount and method
2. New RPC: `mark_rent_paid(rent_ledger_id, amount_paid, payment_method)`
3. New edge function: `rent-reminder-cron`:
   - 3 days before due: send `rent_reminder_before` WhatsApp to tenant
   - On due date (unpaid): send `rent_reminder_due`
   - 3 days overdue (unpaid): send `rent_reminder_overdue`
   - Update `reminder_N_sent_at` fields
4. New Twilio templates: `rent_reminder_before`, `rent_reminder_due`, `rent_reminder_overdue`
5. Add rent outstanding summary to dashboard (count of overdue rooms portfolio-wide)

**Done when:** Mark one room as paid — status updates. Manually trigger rent cron — reminder WhatsApp sent to tenant on seeded number.

---

### Day 10 — QA, polish, demo prep

**Goal:** No crashes. Demo flow runs clean start to finish.

**Full demo flow to rehearse:**

1. Open dashboard → see compliance card (1 expiring), see rent outstanding card
2. Click into property → Rooms tab → 5 rooms, 4 occupied, 1 vacant
3. Show compliance section → 1 cert expiring → contractor assigned → "dispatch renewal" visible
4. Send WhatsApp from test tenant number → intake identifies room → ticket created with room shown
5. Show ticket detail → linked to Room 3 → full audit trail
6. Show compliance cert → mark reminder as triggered → show event in activity feed
7. Show rent ledger → 5 rooms, April rent generated → mark Room 1 as paid → status updates
8. Show that a rent reminder WhatsApp was sent to Room 2 tenant (pending)

**QA checklist:**
- [ ] All new tables have RLS policies
- [ ] No console errors on any page
- [ ] Mobile nav works (responsive)
- [ ] Empty states handled (no rooms, no rent ledger, no certs)
- [ ] Deleting a property with rooms blocked or cascaded cleanly
- [ ] Cron functions handle zero results without erroring

---

## Buffer / Risk Days

If anything slips, this is the priority order for what to cut or simplify:

| Feature | Cut or simplify to |
|---------|-------------------|
| Automated rent reminders cron | Manual "send reminder" button in UI instead |
| Compliance auto-dispatch | Just the operator WhatsApp notification, no dispatch |
| WhatsApp room confirmation flow | Just populate room from existing assignment, skip confirm step |
| Rent ledger generation | Manually create rows in UI instead of RPC-generated |

**Do not cut:** Room layer, compliance dashboard, rent config per room, manual payment logging. These are the demo core.

---

## Post-Demo Immediate Backlog

Once demo is done and first user is active, next sprint:

1. Tenant knowledge base — AI answers tenancy agreement questions via WhatsApp
2. Profitability calculator — rent income vs mortgage vs expenses
3. Portfolio-level rent dashboard — all properties, all rooms, one view
4. Compliance report export — PDF for council inspection
5. Room history — previous tenants, historical issues (damp, mould, heating)
