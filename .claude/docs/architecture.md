# Yarro Architecture Overview

Yarro is a WhatsApp-first property maintenance automation platform. Tenants report issues via WhatsApp, and the system handles the entire lifecycle: triage, contractor dispatch, quotes, approvals, scheduling, and completion tracking.

---

## The Flow

```
Tenant messages WhatsApp
  -> AI conversation (OpenAI via Edge Function)
  -> Ticket created in database
  -> PM + Landlord notified (WhatsApp)
  -> Contractor dispatched (WhatsApp with portal link)
  -> Contractor submits quote (via web portal)
  -> Landlord approves/declines (WhatsApp reply or auto-approve)
  -> Job scheduled (contractor picks date/slot via portal)
  -> Tenant + PM + Landlord notified of booking
  -> Job reminder sent day-of
  -> Contractor marks complete (via portal)
  -> Tenant confirms resolution (via portal)
  -> Ticket closed
```

### Ticket State Machine — Polymorphic Dispatch

`c1_compute_next_action` is a router. Universal states are handled inline (archived, closed, on_hold), then dispatch by category or lifecycle flag:

```
c1_compute_next_action routes by category:
   ├─ compliance_renewal → cert renewal lifecycle
   ├─ rent_arrears → arrears tracking (no contractor)
   └─ default → standard contractor dispatch flow
```

| Route | Sub-routine | Handles |
|-------|-------------|---------|
| `compliance_renewal` | `compute_compliance_next_action` | Cert renewal lifecycle |
| `rent_arrears` | `compute_rent_arrears_next_action` | Per-tenant arrears tracking |
| `landlord_allocated` flag | `compute_landlord_next_action` | Landlord-managed outcomes |
| `ooh_dispatched` flag | `compute_ooh_next_action` | Emergency outcomes |
| _(default)_ | `compute_maintenance_next_action` | Standard contractor dispatch |

**Dispatch order:** universal states → category → lifecycle flags → simple flags → maintenance fallback.

**How to add a new ticket category:**
1. Create `compute_{category}_next_action()` in a new migration (SECURITY DEFINER)
2. Add `IF v_ticket.category = '{category}' THEN ...` to the router (protected — Safe Modification Protocol)
3. Add new `next_action_reason` values to the CHECK constraint via migration
4. Add the sub-routine to `supabase/core-rpcs/README.md` protected list
5. Add entries to `supabase/core-rpcs/ticket-lifecycle.md`
6. If non-contractor ticket type: create a dedicated `create_{category}_ticket()` function (pattern: `create_rent_arrears_ticket`)

Full spec: `docs/POLYMORPHIC-DISPATCH-PLAN.md`.

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
| `yarro-compliance-reminder` | Daily compliance expiry check → PM notification + renewal ticket creation |
| `yarro-rent-reminder` | Daily rent reminders + escalation → rent arrears ticket creation |

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
| `c1_rent_payments` | Payment audit trail — trigger auto-updates c1_rent_ledger totals |
| `c1_rent_payments` | Payment audit trail — trigger auto-updates c1_rent_ledger totals |

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
5. **Real-time** is not currently used; pages refresh on navigation or manual reload

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
- See `docs/POLYMORPHIC-DISPATCH-PLAN.md` for the dispatch pattern and all 5 sub-routines
