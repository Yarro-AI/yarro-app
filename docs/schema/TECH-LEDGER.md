# Yarro — Tech Ledger
*Full data schema, existing + new tables, relationships, and RPC inventory*
*Last updated: March 2026*

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js / React / TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase (PostgreSQL, EU hosted) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Edge Functions | Supabase Edge Functions (Deno) |
| Messaging | Twilio (WhatsApp) |
| AI | OpenAI GPT-4o |
| Hosting | Vercel |
| Email | Resend |
| Repo | github.com/adamekubia/yarro-app |
| Supabase ref | qedsceehrrvohsjmbodc |

---

## Existing Tables (15 tables + 2 views)

### Core Entities

**`c1_property_managers`**
Root entity. One row per PM account.
- PM profile, business hours, dispatch mode, ticket mode config
- All other tables reference this via `property_manager_id`

**`c1_properties`** → property_managers, landlords
- Address, approval settings, contractor mapping
- `property_manager_id`, `landlord_id`
- Denormalized landlord fields synced on update

**`c1_landlords`** → property_managers
- Contact method (WhatsApp/email), denormalized onto properties

**`c1_tenants`** → property_managers, properties
- `phone`, `email`, `role_tag`, `verified_by`
- Currently assigned to properties only
- **Phase 2: gains `room_id` foreign key (dual assignment — property_id retained)**

**`c1_contractors`** → property_managers
- Multi-category, property assignments, soft delete, contact method toggle

### Operational

**`c1_tickets`** — 68 columns, full lifecycle
- `status`, `priority`, `category`, `job_stage`
- SLA tracking, scheduling, quotes
- Landlord/OOH/reschedule workflow
- Portal tokens
- **Phase 2: gains `room_id` foreign key (nullable — backwards compatible)**

**`c1_conversations`** → properties, property_managers, tenants
- WhatsApp conversation state machine

**`c1_messages`** → tickets (1:1)
- Message log per ticket per party

**`c1_job_completions`** → tickets (1:1)
- Completion evidence, media, financials

**`c1_events`** → property_managers, tickets
- Audit event log — every action written here

**`c1_ledger`** → tickets
- Financial ledger per ticket

**`c1_outbound_log`** → tickets
- Outbound WhatsApp message log

**`c1_feedback`** → property_managers, tickets

### Infrastructure

**`c1_profiles`** → property_managers, contractors
- Team members, OOH contacts

**`c1_integrations`** → property_managers
- CRM connections

**`c1_import_jobs`** → integrations, property_managers

### Compliance (Phase 1 — Complete)

**`c1_compliance_certificates`** → properties, property_managers
```sql
id                  uuid PK
property_manager_id uuid FK → c1_property_managers
property_id         uuid FK → c1_properties
certificate_type    enum (hmo_license | gas_safety | eicr | epc | fire_risk | pat | legionella | smoke_alarms | co_alarms)
status              enum (valid | expiring | expired) -- computed
expiry_date         date
issue_date          date
document_url        text -- Supabase Storage
notes               text
reminder_sent_at    timestamptz -- Phase 2: track when reminder was sent
contractor_id       uuid FK → c1_contractors -- Phase 2: who to dispatch for renewal
created_at          timestamptz
updated_at          timestamptz
```

### Views

**`v_properties_hub`**
Enriched property view — tenants, contractors, open/recent tickets as JSON aggregates.
**Phase 2: extend to include room count, occupancy rate.**

**`v_integrations_safe`**
Integrations minus sensitive credentials.

---

## New Tables (Phase 2 — HMO Layer)

### `c1_rooms`

Core room entity. One row per room in an HMO property.

```sql
id                  uuid PK default gen_random_uuid()
property_manager_id uuid FK → c1_property_managers NOT NULL
property_id         uuid FK → c1_properties NOT NULL
room_number         text NOT NULL  -- "Room 1", "Room 2", "Attic Room" etc.
room_name           text           -- optional friendly name e.g. "Garden Room"
floor               text           -- optional e.g. "Ground", "First"
current_tenant_id   uuid FK → c1_tenants  -- nullable (vacant if null)
tenancy_start_date  date
tenancy_end_date    date
monthly_rent        numeric(10,2)
rent_due_day        integer        -- day of month (1–28). NULL = weekly
rent_frequency      enum (monthly | weekly)  -- default monthly
is_vacant           boolean generated always as (current_tenant_id is null) stored
created_at          timestamptz default now()
updated_at          timestamptz default now()
```

**Indexes:**
- `(property_id)` — rooms per property lookup
- `(current_tenant_id)` — room from tenant lookup
- `(property_manager_id, is_vacant)` — vacancy dashboard queries

**RLS:** property_manager_id = auth.uid() scoped

---

### `c1_rent_ledger`

One row per expected rent payment per room per period. Tracks whether it was paid.

```sql
id                  uuid PK default gen_random_uuid()
property_manager_id uuid FK → c1_property_managers NOT NULL
room_id             uuid FK → c1_rooms NOT NULL
tenant_id           uuid FK → c1_tenants NOT NULL
due_date            date NOT NULL
amount_due          numeric(10,2) NOT NULL
amount_paid         numeric(10,2)  -- null until payment logged
paid_at             timestamptz    -- when operator marked as paid
payment_method      text           -- free text: "bank transfer", "cash" etc.
status              enum (pending | paid | overdue | partial) -- computed or set
reminder_1_sent_at  timestamptz    -- 3 days before due
reminder_2_sent_at  timestamptz    -- on due date
reminder_3_sent_at  timestamptz    -- 3 days overdue
notes               text
created_at          timestamptz default now()
updated_at          timestamptz default now()
```

**Indexes:**
- `(room_id, due_date)` — rent status per room
- `(property_manager_id, status, due_date)` — dashboard outstanding view
- `(tenant_id)` — tenant payment history

---

## Schema Changes to Existing Tables

### `c1_tenants` — add room_id
```sql
ALTER TABLE c1_tenants
ADD COLUMN room_id uuid REFERENCES c1_rooms(id) ON DELETE SET NULL;
```
- Nullable. Existing tenants unaffected.
- Dual assignment: `property_id` retained, `room_id` added.
- A tenant without a `room_id` is a property-level tenant (pre-HMO or BTL).

### `c1_tickets` — add room_id
```sql
ALTER TABLE c1_tickets
ADD COLUMN room_id uuid REFERENCES c1_rooms(id) ON DELETE SET NULL;
```
- Nullable. All existing tickets unaffected.
- New tickets created via WhatsApp intake will have `room_id` populated once `c1_context_logic` is extended.

### `c1_compliance_certificates` — add reminder + contractor fields
```sql
ALTER TABLE c1_compliance_certificates
ADD COLUMN reminder_sent_at timestamptz,
ADD COLUMN contractor_id uuid REFERENCES c1_contractors(id) ON DELETE SET NULL,
ADD COLUMN reminder_days_before integer DEFAULT 60;
```
- `contractor_id`: which contractor to auto-dispatch to when this cert type expires.
- `reminder_days_before`: configurable per certificate (default 60 days).
- `reminder_sent_at`: prevents duplicate reminders.

---

## RPC Inventory

### Existing RPCs (do not modify unless noted)

| RPC | Purpose | Phase 2 change |
|-----|---------|---------------|
| `c1_context_logic` | Phone → tenant → property → conversation state | **Extend: add room lookup** |
| `c1_convo_finalize` | Close conversation, return tenant_id + property_id | **Extend: return room_id** |
| `c1_create_ticket` | Create ticket with all resolved IDs | **Extend: accept room_id** |
| `get_compliance_summary` | Dashboard compliance card data | No change |
| `upsert_compliance_certificate` | Create/edit certificate | **Extend: accept contractor_id, reminder_days_before** |
| `delete_compliance_certificate` | Soft or hard delete | No change |
| `get_todo_items` | Dashboard todo panel | No change |
| `get_recent_events` | Dashboard activity feed | No change |

### New RPCs (Phase 2)

**`get_rooms_for_property(property_id)`**
Returns all rooms for a property with current tenant name, tenancy dates, rent config, vacancy status.

**`get_rent_summary_for_property(property_id, month, year)`**
Returns all rooms with their rent status for a given month. Used by rent tracking view.

**`create_rent_ledger_entries(property_id, month, year)`**
Generates `c1_rent_ledger` rows for all occupied rooms in a property for a given period. Called monthly by cron or manually by operator.

**`mark_rent_paid(rent_ledger_id, amount_paid, payment_method)`**
Marks a rent ledger entry as paid. Updates `paid_at`, `amount_paid`, `status`.

**`get_compliance_expiring(days_ahead, property_manager_id)`**
Returns certificates expiring within N days that haven't had a reminder sent. Used by compliance reminder cron.

---

## Edge Functions — Changes Required

### `whatsapp-intake` — room awareness

**Current flow:** `c1_context_logic(phone, message)` → returns `ctx.tenant`, `ctx.property`

**Extended flow:** `c1_context_logic` extended to also return `ctx.room` (nullable).

**Room confirmation logic (inside `c1_context_logic`):**
1. Look up tenant by phone → get `room_id` from `c1_tenants`
2. If `room_id` found → populate `ctx.room`, no action needed
3. If tenant found but no `room_id` → set `ai_instruction = CONFIRM_ROOM`, return room options for property
4. If no tenant found → existing `nomatch` flow unchanged

**Impact on `whatsapp-intake`:**
- `buildSystemPrompt()` extended to include room context when available
- `c1_create_ticket` call extended to pass `room_id`
- No new pipeline — room flows through existing branch detection

### New Edge Function: `compliance-reminder-cron`

Runs on a schedule (daily). Checks for expiring certificates and triggers the dispatch pipeline.

**Flow:**
1. Call `get_compliance_expiring(days_ahead=90)` — returns certs expiring within 90 days where `reminder_sent_at IS NULL`
2. For each cert:
   a. Look up PM's preferred contact method (WhatsApp first, then email)
   b. Send operator notification via existing Twilio/Resend sending layer
   c. If `contractor_id` is set on the certificate:
      - Create a compliance renewal ticket via `c1_create_ticket`
      - Trigger existing dispatcher for that contractor
   d. Update `reminder_sent_at` on the certificate
3. Log all actions to `c1_events`

**Key principle:** Compliance dispatch is not a new system. It creates a ticket and calls the existing dispatcher. Same audit trail, same contractor WhatsApp flow, same job completion loop.

### New Edge Function: `rent-reminder-cron`

Runs daily. Checks `c1_rent_ledger` for upcoming and overdue entries.

**Reminder schedule:**
- 3 days before due date → `reminder_1_sent_at`
- On due date (if unpaid) → `reminder_2_sent_at`
- 3 days overdue (if unpaid) → `reminder_3_sent_at`

**Flow:**
1. Query `c1_rent_ledger` for entries matching reminder schedule where reminder not yet sent
2. Look up tenant `phone` via `tenant_id`
3. Send WhatsApp message via existing Twilio layer
4. Update `reminder_N_sent_at`
5. Log to `c1_events`

---

## Twilio Template Mappings — New Templates Needed

| Template | Trigger | Recipient |
|----------|---------|-----------|
| `compliance_expiry_operator` | Cert expiring in N days | PM (WhatsApp or email) |
| `compliance_dispatch_contractor` | Compliance renewal job created | Contractor |
| `rent_reminder_before` | 3 days before rent due | Tenant |
| `rent_reminder_due` | Rent due today (unpaid) | Tenant |
| `rent_reminder_overdue` | Rent overdue 3+ days | Tenant |
| `room_confirm_prompt` | Tenant has no room assigned | Tenant (during intake) |

---

## File Structure Reference

```
src/
├── app/(dashboard)/
│   ├── dashboard/page.tsx          -- compliance card EXISTS, add rent summary card
│   ├── compliance/
│   │   ├── page.tsx                -- all certs list EXISTS
│   │   └── [id]/page.tsx           -- cert detail + upload EXISTS
│   ├── properties/
│   │   ├── page.tsx                -- compliance badge EXISTS, add rooms count column
│   │   └── [id]/page.tsx           -- compliance section EXISTS, add Rooms tab
│   └── [NEW] rent/page.tsx         -- rent tracking overview
├── components/
│   ├── property-compliance-section.tsx   -- EXISTS
│   ├── certificate-row.tsx               -- EXISTS
│   ├── certificate-form-dialog.tsx       -- EXISTS
│   ├── [NEW] property-rooms-tab.tsx      -- room list + occupancy for property detail
│   ├── [NEW] room-form-dialog.tsx        -- create/edit room
│   ├── [NEW] rent-ledger-table.tsx       -- paid/outstanding per property
│   └── [NEW] rent-payment-dialog.tsx     -- mark payment received
supabase/
├── functions/
│   ├── whatsapp-intake/index.ts          -- extend for room awareness
│   ├── [NEW] compliance-reminder-cron/
│   └── [NEW] rent-reminder-cron/
└── migrations/
    ├── [NEW] YYYYMMDD_add_rooms_table.sql
    ├── [NEW] YYYYMMDD_add_rent_ledger.sql
    ├── [NEW] YYYYMMDD_add_room_id_to_tenants.sql
    ├── [NEW] YYYYMMDD_add_room_id_to_tickets.sql
    ├── [NEW] YYYYMMDD_add_compliance_reminder_fields.sql
    └── [NEW] YYYYMMDD_room_rpcs.sql
```
