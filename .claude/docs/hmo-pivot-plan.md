# HMO Platform Pivot: Build Plan

## Context
Yarro PM is pivoting from general property management to HMO (Houses in Multiple Occupation) focus. HMOs are shared houses with multiple tenants per property, each renting a room. The platform needs room-level tracking, compliance tracking, and keeps the existing contractor dispatch system.

---

## Key Decisions (Agreed)

1. **Compliance comes first, not rooms** — highest business value, no backend dependency for frontend work
2. **Rooms are optional** — properties with 0 rooms work exactly as before. No forced migration.
3. **Compliance table is normalized** — one row per certificate per property (not a wide table)
4. **Don't touch intake flow until Phase 4** — room can be auto-inferred from tenant
5. **Fix code issues incrementally** — no standalone cleanup phase

---

## Build Order

### Phase 1: Compliance Tracking (Week 1) — COMPLETE (2026-03-27)

**Database (Supabase SQL Editor):**
- Create `c1_compliance_certificates` table:
  - `id`, `property_id`, `certificate_type`, `issued_date`, `expiry_date`
  - `certificate_number`, `issued_by`, `document_url`, `status`, `notes`
  - `property_manager_id`, `created_at`, `updated_at`
- `certificate_type` enum: `hmo_license`, `gas_safety`, `eicr`, `epc`, `fire_risk`, `pat`, `legionella`, `smoke_alarms`, `co_alarms`
- CRUD RPCs for compliance certificates
- RPC for "get all expiring certificates for PM" (dashboard summary)

**Frontend:**
- `<ComplianceCard>` component — cert with expiry date, status badge (green/amber/red)
- Compliance section on property detail page — list certs, add/edit/delete
- Dashboard compliance summary card — "3 expiring this month", "1 expired"
- Add certificate types to `src/lib/constants.ts`

**Files modified:**
- `src/app/(dashboard)/properties/[id]/page.tsx`
- `src/app/(dashboard)/page.tsx`
- `src/lib/constants.ts`
- New: `src/components/compliance-card.tsx`

### Phase 2: Room Layer (Week 2)

**Database:**
- Create `c1_rooms` table:
  - `id`, `property_id`, `room_number`, `room_type` (single/double/en-suite/shared)
  - `floor`, `size_sqm`, `occupancy_max`, `status` (occupied/vacant/maintenance)
  - `property_manager_id`, `created_at`, `updated_at`, `_audit_log`
- Add `room_id` (FK, **nullable**) to `c1_tenants`
- Room CRUD RPCs
- RPC for room occupancy stats per property

**Frontend:**
- `<RoomsTable>` component — inline editable table within property detail
- Rooms tab/section on property detail page
- Room size validation (red if below 6.51m² single / 10.22m² double)
- Room occupancy indicators (occupied/vacant badges)
- Tenant detail: room assignment dropdown
- Tenant table: room column

**Files modified:**
- `src/app/(dashboard)/properties/[id]/page.tsx`
- `src/app/(dashboard)/tenants/page.tsx`
- New: `src/components/rooms-table.tsx`

### Phase 3: Room-Aware Tickets (Week 3-4)

**Database:**
- Add `room_id` (FK, nullable) to `c1_tickets`
- Update ticket creation RPCs to accept `room_id`
- Auto-resolve `room_id` from `tenant_id` when possible

**Frontend:**
- `<RoomSelector>` component — cascading dropdown (select property → shows rooms)
- Ticket form: room selector (null = common area / whole property)
- Ticket table: show room alongside property address
- Ticket detail overview: show room
- Onboarding wizard: rooms step after properties
- Filter tickets by room

**Files modified:**
- `src/app/(dashboard)/tickets/page.tsx`
- `src/components/ticket-form.tsx`
- `src/components/ticket-detail/ticket-overview-tab.tsx`
- `src/components/onboarding-wizard.tsx`
- New: `src/components/room-selector.tsx`

### Phase 4: Compliance Automation + Room-Aware Intake (Week 5+)

**Database/Backend:**
- pg_cron job or Edge Function: scan expiring certs, auto-create tickets
- New `next_action_reason` values: `compliance_expiring`, `compliance_expired`
- Update `c1_context_logic` to resolve room from tenant (auto-infer)
- Update dispatcher templates to include room info in issue description

**Frontend:**
- Compliance ticket type in ticket form
- Compliance items in dashboard "needs attention" section
- Certificate expiry calendar view

### Phase 5: Polish + Reporting (Week 6+)
- Portfolio-wide compliance status report
- Room occupancy rates across all properties
- `/guide/compliance` page
- PM settings: compliance reminder frequency
- "Convert to HMO" button on existing properties

---

## What Stays As-Is

- Contractors page + dispatch system
- Landlords page
- All portals (contractor/tenant/landlord/OOH)
- All Edge Functions (until Phase 4)
- Auth system, sidebar, PageShell
- DataTable, DetailDrawer, EditableField
- normalize.ts, validate.ts
- WhatsApp + AI classification

---

## What's Unnecessary for Launch

- Rent/deposit tracking
- Tenancy document storage
- Multi-unit rules (quiet hours, guest policies)
- Room-level asset inventory
- Tenant dispute logging

---

## 2-Week MVP

**Week 1:** Compliance tracking — certificates, property detail section, dashboard card
**Week 2:** Room display — rooms table, size validation, tenant-to-room assignment

---

## Verification Per Phase

1. `npm run build` passes
2. Existing features still work
3. Properties WITHOUT rooms work identically to before
4. New features work in light and dark mode
5. Responsive at 375px and 1440px
6. No console errors
