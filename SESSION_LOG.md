# Yarro PM — Session Log

> This file provides continuity between coding sessions. Claude reads it at the start of every session to know where you left off.
>
> **How it works:** After each session, update the "Latest" entry below. When you start a new session, Claude will check "Next Session Pickup" and pick up where you left off.

---

## Latest: 2026-03-28 — Rent Reminder Cron + Compliance Cron Cleanup

### Summary
Confirmed compliance reminder cron was already deployed (migration just untracked in git — committed it). Then built the rent reminder cron: renamed `c1_log_compliance_event` → `c1_log_system_event` for reuse across ticket-less events, created `get_rent_reminders_due()` RPC with 3-window UNION query (3 days before, due date, 3 days overdue), built `yarro-rent-reminder` edge function with placeholder guard for missing Twilio templates, and registered `pg_cron` job at 09:00 UTC. All deployed and merged to `feat/hmo-compliance`.

### Changes Made
- Committed `supabase/migrations/20260329120000_compliance_reminder_cron.sql` (was applied but untracked)
- Created `supabase/migrations/20260329140000_rename_log_system_event.sql` — rename generic event logger
- Created `supabase/migrations/20260329150000_rent_reminder_rpc.sql` — `get_rent_reminders_due()` RPC
- Created `supabase/migrations/20260329160000_rent_reminder_cron.sql` — pg_cron at 09:00 UTC
- Created `supabase/functions/yarro-rent-reminder/index.ts` — edge function with placeholder guard
- Modified `supabase/functions/_shared/templates.ts` — 3 placeholder rent reminder SIDs
- Modified `supabase/functions/yarro-compliance-reminder/index.ts` — updated to use renamed `c1_log_system_event`

### Status
- [x] Build passes
- [x] Tested locally
- [x] Migrations applied to remote
- [x] Edge functions deployed (yarro-rent-reminder + yarro-compliance-reminder)
- [x] Cron jobs verified (compliance 08:00 UTC, rent 09:00 UTC)
- [x] Committed and pushed to `feat/hmo-compliance`

### Adam's Pending Task
Create 3 Twilio Content API templates and replace PLACEHOLDER SIDs in `supabase/functions/_shared/templates.ts`:
- `rent_reminder_before` — 1=name, 2=amount, 3=due_date
- `rent_reminder_due` — 1=name, 2=amount
- `rent_reminder_overdue` — 1=name, 2=amount, 3=due_date
Then redeploy: `supabase functions deploy yarro-rent-reminder`

### Next Session Pickup
1. Day 10: QA + demo prep — full demo flow rehearsal
2. Create Twilio rent reminder templates (Adam task)
3. Final polish before demo deadline (~11 April 2026)

---

## 2026-03-28 — Rent Tracking (Days 8-9)

### Summary
Built room-level rent tracking for HMO properties. Created `c1_rent_ledger` table with RLS, `ON DELETE RESTRICT` to protect financial records, and unique constraint on `(room_id, due_date)` for idempotent generation. Built 3 RPCs: `create_rent_ledger_entries` (idempotent via ON CONFLICT DO NOTHING), `get_rent_summary_for_property` (pure read with derived `effective_status` — no write side-effects), and `mark_rent_paid` (ownership check, partial/full detection). Built `PropertyRentSection` component with month navigation, generate button, summary stats, status badges (paid/overdue/pending/partial/vacant), and "Mark Paid" action. Built `RentPaymentDialog` with pre-filled amount, payment method select, and notes. Wired into property detail page after Rooms section.

### Changes Made
- Created `supabase/migrations/20260329100000_rent_ledger.sql` — c1_rent_ledger table, RLS, indexes, grants, trigger
- Created `supabase/migrations/20260329110000_rent_rpcs.sql` — 3 RPCs (create_rent_ledger_entries, get_rent_summary_for_property, mark_rent_paid)
- Created `src/components/property-rent-section.tsx` — rent section with month nav, generate, table, status badges
- Created `src/components/rent-payment-dialog.tsx` — payment recording dialog
- Modified `src/app/(dashboard)/properties/[id]/page.tsx` — added PropertyRentSection after Rooms
- Regenerated `src/types/database.ts`

### Status
- [x] Build passes
- [x] Tested locally
- [x] Migrations applied to remote
- [x] Committed and pushed to `feat/hmo-compliance`

### Next Session Pickup
1. Set up compliance-reminder cron (Days 6-7) — daily at 08:00 UTC
2. Dashboard rent card — portfolio-wide paid/outstanding/overdue for current month
3. Day 10: QA + demo prep — full demo flow rehearsal

---

## 2026-03-28 — WhatsApp Room Awareness + Demo Seed (Day 5)

### Summary
Seeded demo data (1 HMO property at 14 Brixton Hill, 5 rooms, 4 tenants, 5 compliance certs with mixed statuses). Fixed property detail page layout — sections were overlapping due to flex overflow constraints. Then built Day 5: WhatsApp room awareness. Extended c1_context_logic to return room data for known tenants, extended c1_create_ticket to auto-populate room_id from tenant's current room assignment (with INNER JOIN to prevent FK violations on stale room_ids), and threaded room context through the edge function to GPT-4o's user prompt. Live WhatsApp test confirmed: ticket created with room_id populated correctly.

### Changes Made
- Created `supabase/seed-demo-data.sql` — demo seed script for SQL editor
- Created `supabase/migrations/20260329000000_whatsapp_room_awareness.sql` — full CREATE OR REPLACE for c1_context_logic (room lookup + return) and c1_create_ticket (room_id in INSERT)
- Modified `supabase/functions/yarro-tenant-intake/prompts.ts` — extended ContextForPrompt + MessageContext interfaces, added room to buildUserPrompt
- Modified `supabase/functions/yarro-tenant-intake/index.ts` — pass ctx.room to both prompt builders
- Modified `src/app/(dashboard)/properties/[id]/page.tsx` — fixed overflow-hidden → overflow-y-auto, removed flex-1 min-h-0 from view-mode wrapper

### Status
- [x] Build passes
- [x] Tested locally
- [x] Migration applied to remote
- [x] Edge function deployed
- [x] Live WhatsApp test passed (room_id on ticket confirmed)
- [x] Committed and pushed to `feat/hmo-compliance`

### Next Session Pickup
1. Days 8-9: Rent tracking — c1_rent_ledger table, per-room rent config, payment logging, rent summary UI
2. Set up cron schedule for compliance-reminder (daily at 08:00 UTC)
3. Day 10: QA + demo prep

---

## 2026-03-28 — Room Layer Complete (Phase 2, Days 1-4)

### Summary
Built the full room layer for HMO support. Created c1_rooms table with generated is_vacant column, 5 RPCs (get, upsert, delete, assign_tenant, remove_tenant) with row locking and dual-sync between c1_rooms.current_tenant_id and c1_tenants.room_id. Built rooms section on property detail page (table with vacancy styling, orange badges for expiring tenancies), tenant assignment dialog, rooms column on properties list, read-only room display on tenant detail, and room_number display in ticket overview. Extended v_properties_hub view with room counts. All merged into feat/hmo-compliance and pushed.

### Changes Made
- Created migration `20260328000000_add_rooms_table.sql` — c1_rooms table, RLS, indexes, updated_at trigger, room_id on tenants/tickets
- Created migration `20260328010000_room_rpcs.sql` — 5 RPCs with ownership checks, row locking, dual-sync
- Created migration `20260328020000_extend_properties_hub_rooms.sql` — room counts on v_properties_hub
- Created `src/components/property-rooms-section.tsx` — rooms table with add/edit/delete/assign/remove
- Created `src/components/room-form-dialog.tsx` — room form with validation
- Created `src/components/tenant-assign-dialog.tsx` — tenant picker with tenancy dates
- Modified `src/app/(dashboard)/properties/[id]/page.tsx` — embedded rooms section
- Modified `src/app/(dashboard)/properties/page.tsx` — rooms column (occupied/total)
- Modified `src/app/(dashboard)/tenants/[id]/page.tsx` — read-only room display
- Modified `src/hooks/use-ticket-detail.ts` — room_id + c1_rooms join
- Modified `src/components/ticket-detail/ticket-overview-tab.tsx` — room row in People section
- Regenerated `src/types/database.ts`
- Merged `feat/compliance-automation` (which included room layer + compliance automation) into `feat/hmo-compliance`

### Status
- [x] Build passes
- [x] Tested locally
- [x] Committed and pushed to `feat/hmo-compliance`
- [x] All migrations applied to remote

### Next Session Pickup
1. Seed demo data — 1 property, 5 rooms, 4 tenants assigned, 1 vacant (run in Supabase SQL editor)
2. Day 5: WhatsApp room awareness — extend c1_context_logic to return ctx.room
3. Remaining: rent tracking (Days 8-9), QA + demo prep (Day 10)
4. Days 8-9: Rent tracking (c1_rent_ledger, per-room config, payment logging)
5. Set up cron schedule for compliance-reminder (daily at 08:00 UTC)

---

## 2026-03-27 — Compliance RPC Migration, Phase 1 Sign-Off, Compliance UI Build-Out

### Summary
Full compliance session. Migrated all compliance business logic to 4 Supabase RPCs (backend-first rule). Signed off Phase 1 — all deliverables verified. Fixed Vercel build issue (module-level Supabase client in `/i/[ticketId]`). Set up Vercel preview deployment on `feat/hmo-compliance` branch. Then built out three compliance UI features: sidebar nav item, all-compliance page with searchable/sortable table, and certificate detail page with document upload via Supabase Storage (bucket + RLS policies via migration).

### Changes Made
- Created migration `20260327131027_compliance_rpcs.sql` with 4 RPCs
- Updated `property-compliance-section.tsx`, `page.tsx`, `certificate-row.tsx` to use RPCs
- Regenerated `src/types/database.ts`
- Marked Phase 1 complete in `.claude/docs/hmo-pivot-plan.md`
- Merged `refactor/compliance-rpcs` into `feat/hmo-compliance`
- Fixed `src/app/i/[ticketId]/page.tsx` — moved Supabase client inside function (Vercel build fix)
- Added Compliance to sidebar nav (`src/components/sidebar.tsx`)
- Created `/compliance` page with summary counts + data table (`src/app/(dashboard)/compliance/page.tsx`)
- Created `/compliance/[id]` detail page with doc upload (`src/app/(dashboard)/compliance/[id]/page.tsx`)
- Created migration `20260327192008_compliance_storage_policies.sql` — storage bucket + RLS policies
- Set up Vercel preview deployment for `feat/hmo-compliance` (env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

### Status
- [x] Build passes
- [x] Tested locally
- [x] Committed and pushed
- [x] Phase 1 signed off
- [x] Vercel preview deployment live

### Next Session Pickup
1. Phase 2: Room layer — start with database (c1_rooms table, room CRUD RPCs)
2. Remaining backlog: property detail page UI fixes, properties page compliance column refinement, UI warmth pass

---

## Archive

### First Session (initial setup)
Fresh workspace on the new `Yarro-AI/yarro-app` org repo. Environment being set up — no code changes made.
