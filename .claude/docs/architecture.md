# Yarro Architecture Overview

> **Before making architectural decisions, read [`.claude/docs/decision-principles.md`](.claude/docs/decision-principles.md).**

Yarro is a WhatsApp-first property maintenance automation platform. Tenants report issues via WhatsApp, and the system handles the entire lifecycle: triage, contractor dispatch, quotes, approvals, scheduling, and completion tracking.

---

## The Flow

```
Tenant messages WhatsApp
  -> AI conversation (OpenAI via Edge Function)
  -> Ticket created in database
  -> Router computes bucket + reason
  -> Trigger writes 4 fields (next_action, next_action_reason, waiting_since, sla_due_at)
  -> PM + Landlord notified (WhatsApp)
  -> Contractor dispatched (WhatsApp with portal link)
  -> Dashboard RPC adds timeout overlay + priority score
  -> Frontend displays via REASON_DISPLAY mapping
  -> Lifecycle continues: quotes, approvals, scheduling, completion
  -> State changes trigger router recompute at every step
```

### Ticket State Machine — Polymorphic Dispatch

`c1_compute_next_action` is a **pure dispatch router**. Zero business logic. Universal states first (archived, closed, on_hold), then 3 explicit category routes, then fail loud.

```
c1_compute_next_action (THE LAW):
   Universal: archived → archived/dismissed, closed → completed, on_hold → on_hold
   ├─ compliance_renewal → compute_compliance_next_action()
   ├─ rent_arrears       → compute_rent_arrears_next_action()
   ├─ maintenance        → compute_maintenance_next_action()
   └─ anything else      → error/unknown_category (RAISE WARNING)
```

| Route | Sub-routine | Handles |
|-------|-------------|---------|
| `compliance_renewal` | `compute_compliance_next_action` | Cert renewal lifecycle |
| `rent_arrears` | `compute_rent_arrears_next_action` | Per-tenant arrears tracking |
| `maintenance` | `compute_maintenance_next_action` | Full maintenance lifecycle: contractor dispatch, landlord allocation, OOH, handoff, pending review |
| _(anything else)_ | **Error** | `unknown_category` — every ticket MUST have a valid category |

**Rules:**
- Router has zero business logic. All domain logic lives in sub-routines.
- Every ticket MUST have a `category` (NOT NULL constraint). NULL = creation bug.
- `c1_tickets.category` = route discriminator (`maintenance`, `compliance_renewal`, `rent_arrears`).
- `c1_tickets.maintenance_trade` = contractor trade type (`Plumber`, `Electrician`, etc.) — only for maintenance tickets.
- Landlord allocation, OOH dispatch, pending review, handoff are all INSIDE `compute_maintenance_next_action`, not in the router.
- `next_action_reason` has a CHECK constraint — adding new reasons requires a migration.

**How to add a new ticket category:**
1. Create `compute_{category}_next_action()` in a new migration (SECURITY DEFINER)
2. Add `IF v_ticket.category = '{category}' THEN ...` to the router (protected — Safe Modification Protocol)
3. Add new `next_action_reason` values to the CHECK constraint via migration
4. Add the sub-routine to `supabase/core-rpcs/README.md` protected list
5. Add entries to `supabase/core-rpcs/ticket-lifecycle.md`
6. If non-contractor ticket type: create a dedicated `create_{category}_ticket()` function (pattern: `create_rent_arrears_ticket`)

Full spec: `docs/POLYMORPHIC-DISPATCH-PLAN.md`.

---

## Three-Layer State Model

Every open ticket's state is described by three layers. Full spec: `docs/architecture/ticket-state-model.md`.

```
BUCKET  (next_action)         → Where is this ticket? (needs_action / waiting / scheduled)
STATE   (next_action_reason)  → Why is it there? (confirmed fact)
TIMEOUT (is_past_timeout)     → Has the wait gone too long? (display-time computation, never a state)
```

### How state gets written

**Three write sites — all write 4 fields, all call the router:**
1. `c1_trigger_recompute_next_action` — fires on ticket/message/completion changes (~90% of writes)
2. `c1_auto_close_completed_tickets` — reconciles completed tickets (inside the trigger)
3. `c1_toggle_hold` — hold/unhold toggle

**Every write sets:** `next_action`, `next_action_reason`, `waiting_since = now()`, `sla_due_at = CASE ... END`

No other code path may write `next_action` or `next_action_reason` directly.

### Dashboard data flow

One RPC → one Realtime subscription → one frontend mapping:
- `c1_get_dashboard_todo` returns all items with bucket, reason, priority_score, timeout flags
- Supabase Realtime subscription on `c1_tickets` triggers refetch on state changes
- Frontend `REASON_DISPLAY` mapping (`src/lib/reason-display.ts`) provides labels for both dashboard and drawer

### Drawer data flow

One RPC + one events query:
- `c1_ticket_detail(ticket_id)` returns universal + category-specific data
- `c1_events` query returns timeline (replaces frontend `deriveTimeline()`)
- No category-specific secondary fetches. No frontend stage derivation.

### Priority scoring

`c1_compute_priority_score()` — one shared SQL function, called by both RPCs:
```
priority_score = consequence_weight + time_pressure + sla_proximity + age_boost
```
Consequence-driven: severity base + deadline pressure + SLA proximity + age. No reason-specific boosts.

---

## Tech Stack

| Layer | Tech | Purpose |
|-------|------|---------|
| **Database** | Supabase (PostgreSQL) | All data, RLS, RPC functions, pg_cron |
| **Backend** | Supabase Edge Functions (Deno) | Message handling, notifications, scheduling logic |
| **Messaging** | Twilio (WhatsApp) | Tenant intake, notifications to all parties |
| **Email** | Resend | Email notifications for email-preference contacts |
| **AI** | OpenAI | Tenant conversation handling, issue extraction |
| **Frontend** | Next.js 16 (App Router) | PM dashboard, contractor/tenant/landlord portals |
| **Hosting** | Vercel | Frontend deployment |
| **Automation** | n8n | Workflow orchestration (cron jobs, dispatch chains) |

---

## Edge Functions (Backend - DO NOT MODIFY)

| Function | Purpose |
|----------|---------|
| `yarro-ticket-notify` | Post-ticket-creation notifications (PM, landlord, OOH routing) |
| `yarro-dispatcher` | Contractor dispatch, quote forwarding, landlord allocation |
| `yarro-scheduling` | Quote submission, job scheduling, reschedule, completion via portal |
| `yarro-completion` | Fillout/webhook completion processing, PM/LL/tenant notifications |
| `yarro-followups` | Timed follow-ups (contractor reminder, landlord timeout, PM escalation) |
| `yarro-job-reminder` | Day-of job reminders to contractors |
| `yarro-inbound` | Inbound WhatsApp message processing |
| `yarro-ai` | AI conversation handler (OpenAI) |
| `yarro-compliance-reminder` | Daily compliance expiry check → PM notification + auto-ticket creation |
| `yarro-rent-reminder` | Daily rent reminders + escalation → rent arrears auto-ticket creation |

---

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `c1_conversations` | WhatsApp conversation threads |
| `c1_tickets` | Maintenance tickets (the core entity) |
| `c1_properties` | Property records with address, landlord, access info |
| `c1_tenants` | Tenant records (name, phone, email) |
| `c1_contractors` | Contractor records (name, phone, category, contact_method) |
| `c1_landlords` | Landlord records |
| `c1_property_managers` | PM accounts + all configurable settings |
| `c1_messages` | Outbound message log + contractor JSONB entries |
| `c1_profiles` | OOH emergency contacts |
| `c1_job_completions` | Completion form submissions |
| `c1_events` | Audit trail — legal defence record, sole source for timeline. |
| `c1_rent_payments` | Payment audit trail — trigger auto-updates c1_rent_ledger totals |

**Timing columns on `c1_tickets`:** `waiting_since`, `contractor_sent_at`, `tenant_contacted_at`, `deadline_date`, `sla_due_at` — written by trigger on state change, used for timeout detection and priority scoring.

---

## Next.js App Structure

```
src/
├── app/
│   ├── (dashboard)/          # PM dashboard (authenticated)
│   │   ├── tickets/          # Ticket list + detail
│   │   ├── properties/       # Property management
│   │   ├── tenants/          # Tenant records
│   │   ├── contractors/      # Contractor management
│   │   ├── landlords/        # Landlord management
│   │   ├── guide/            # Onboarding + rules/preferences
│   │   │   └── rules/        # Dispatch & automation settings
│   │   ├── settings/         # Account settings
│   │   └── layout.tsx        # Dashboard layout with sidebar
│   ├── contractor/[token]/   # Contractor portal (public, token-auth)
│   ├── tenant/[token]/       # Tenant portal (public, token-auth)
│   ├── landlord/[token]/     # Landlord portal (public, token-auth)
│   ├── ooh/[token]/          # OOH emergency contact portal
│   ├── login/                # Auth pages
│   └── globals.css           # Global styles
├── components/               # Shared UI components
│   ├── ui/                   # shadcn/ui primitives (Button, Card, etc.)
│   └── sidebar.tsx           # Dashboard sidebar navigation
├── contexts/
│   └── pm-context.tsx        # Auth + PM data provider (DO NOT MODIFY)
├── hooks/                    # Custom React hooks
├── lib/
│   ├── supabase/             # Supabase client config (DO NOT MODIFY)
│   ├── normalize.ts          # Phone number normalization
│   ├── validate.ts           # Input validation helpers
│   ├── utils.ts              # cn() and general utilities
│   └── constants.ts          # App-wide constants
└── proxy.ts                  # Auth session refresh (DO NOT MODIFY)
```

---

## Data Flow: Supabase -> UI

1. **Auth context** (`pm-context.tsx`) loads the PM's profile on login
2. **Dashboard pages** use Supabase client to query tables directly (`.from().select()`)
3. **Some pages** use RPC functions for complex queries (`.rpc('function_name', params)`)
4. **Portal pages** (contractor/tenant/landlord) use token-based auth via RPC functions
5. **Real-time** — Supabase Realtime subscription on `c1_tickets` for dashboard auto-refresh on state changes

---

## Two WhatsApp Numbers

| Number | Purpose |
|--------|---------|
| +447446904822 | Tenant-facing (inbound conversations) |
| +447463558759 | Outbound notifications (all WhatsApp messages sent by system) |

---

## Key Patterns

- **Token-based portals**: Contractor, tenant, and landlord portals use URL tokens for auth (no login required)
- **Edge Functions handle all backend logic**: The frontend never writes to tickets directly — it calls Edge Functions which call RPCs
- **sendAndLog**: Every outbound message (WhatsApp or email) goes through this shared helper for consistent logging and error handling
- **PM settings**: All timing/dispatch/OOH rules are configurable per PM account in `c1_property_managers`

---

## RPC Development Workflow

Every new feature that involves business logic starts here:

1. Write the SQL function in a new migration file
2. Test it in Supabase dashboard SQL editor first
3. Deploy: `supabase db push`
4. Regenerate types: `supabase gen types typescript --project-id qedsceehrrvohsjmbodc > src/types/database.ts`
5. Build the UI to consume it

**Rules:**
- All business logic lives in RPCs, not the frontend
- Never compute derived state (status, counts, summaries) in React
- Direct `.from().select()` only for simple reads with no logic
- Frontend is a display layer — it calls RPCs and renders results

**Ticket state logic:**
- Add to the appropriate sub-routine, not the router
- New ticket categories need a new sub-routine + router registration
- Sub-routines are SECURITY DEFINER and protected
- See `docs/POLYMORPHIC-DISPATCH-PLAN.md` for the dispatch pattern and all 3 sub-routines
- Landlord/OOH/pending_review/handoff logic lives INSIDE `compute_maintenance_next_action`, not in the router
- Every RPC that changes ticket state must log an audit event in the same transaction. If `c1_log_event()` fails, the operation rolls back. No exception swallowing.
- Edge functions don't write state — they call RPCs which trigger the router.
