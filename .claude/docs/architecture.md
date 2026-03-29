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

---

## Tech Stack

| Layer | Tech | Purpose |
|-------|------|---------|
| **Database** | Supabase (PostgreSQL) | All data, RLS, RPC functions, pg_cron |
| **Backend** | Supabase Edge Functions (Deno) | Message handling, notifications, scheduling logic |
| **Messaging** | Twilio (WhatsApp) | Tenant intake, notifications to all parties |
| **Email** | Resend | Email notifications for email-preference contacts |
| **AI** | OpenAI | Tenant conversation handling, issue extraction |
| **Frontend** | Next.js 14 (App Router) | PM dashboard, contractor/tenant/landlord portals |
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
