# Yarro PM — Codebase Audit & Technical Brief

**Date:** 2026-03-27
**Purpose:** Full technical audit for a new developer taking over the codebase.
**Assumes:** You understand the business (property management) but are learning the technical side.

---

## 1. What This App Actually Does (Technically)

Yarro PM is a **property management dashboard** that automates the lifecycle of maintenance tickets — from a tenant reporting a broken boiler via WhatsApp, all the way through to a contractor fixing it and everyone getting notified.

Here's the real flow:

1. **A tenant sends a WhatsApp message** to a Twilio phone number saying "my boiler is broken"
2. **An AI (GPT-4o) has a conversation** with the tenant over WhatsApp, gathering details about the issue (what's wrong, where in the property, how urgent, photos)
3. **The system creates a "ticket"** — a maintenance job record in the database
4. **Notifications go out** via WhatsApp to the property manager (PM), landlord, and available contractors
5. **Contractors submit quotes** through a web portal (no login — they click a link in their WhatsApp message)
6. **The landlord approves or declines** through their own portal link
7. **The contractor is scheduled**, does the work, and submits a completion form
8. **Everyone gets notified** that the job is done

The dashboard (what you see at `localhost:3000`) is where the property manager oversees all of this — viewing tickets, managing properties/tenants/contractors/landlords, tracking compliance certificates, and handling edge cases the automation can't resolve.

**In short:** WhatsApp is the front door for tenants and contractors. The web dashboard is the control panel for the property manager. Supabase Edge Functions are the engine that connects everything.

---

## 2. Folder Map — What Lives Where

```
yarro-pm/
├── src/                          # The web application (what runs in the browser)
│   ├── app/                      # All pages and routes (Next.js App Router)
│   │   ├── (dashboard)/          # Protected pages — the PM's control panel
│   │   │   ├── page.tsx          # Homepage: KPIs, to-do list, activity feed
│   │   │   ├── layout.tsx        # Auth guard + sidebar + providers
│   │   │   ├── tickets/          # Kanban board for all maintenance tickets
│   │   │   ├── properties/       # Property list + detail pages
│   │   │   ├── tenants/          # Tenant list + detail pages
│   │   │   ├── contractors/      # Contractor list + detail pages
│   │   │   ├── landlords/        # Landlord list + detail pages
│   │   │   ├── settings/         # Account settings (name, email, password)
│   │   │   ├── import/           # Onboarding wizard for bulk data import
│   │   │   ├── integrations/     # Alto CRM connection
│   │   │   ├── feedback/         # User feedback submission
│   │   │   └── guide/            # Product guide / help pages
│   │   ├── api/                  # Server-side API routes
│   │   │   └── auth/logout/      # Logout endpoint (clears cookies)
│   │   ├── auth/                 # Auth callbacks (password reset, email confirm)
│   │   ├── login/                # Login page
│   │   ├── update-password/      # Password reset page
│   │   ├── contractor/[token]/   # Public portal: contractors view/submit quotes
│   │   ├── landlord/[token]/     # Public portal: landlords approve/decline
│   │   ├── tenant/[token]/       # Public portal: tenants track status/reschedule
│   │   ├── ooh/[token]/          # Public portal: emergency contacts respond
│   │   ├── i/[ticketId]/         # Public page: view ticket photos
│   │   ├── layout.tsx            # Root layout (theme, fonts, global providers)
│   │   └── globals.css           # Global styles
│   │
│   ├── components/               # Reusable UI components
│   │   ├── ui/                   # Base components (buttons, inputs, dialogs, etc.)
│   │   │   └── (21 files)        # Built with Radix UI + Tailwind (shadcn/ui pattern)
│   │   ├── ticket-detail/        # Ticket modal with 4 tabs (overview, conversation, dispatch, completion)
│   │   ├── onboarding/           # Multi-step import wizard components
│   │   ├── sidebar.tsx           # Main navigation sidebar
│   │   ├── kanban-board.tsx      # Ticket board (Open → Awaiting → Scheduled → Done)
│   │   ├── property-compliance-section.tsx  # Certificate tracking UI
│   │   ├── certificate-form-dialog.tsx      # Add/edit certificates
│   │   ├── certificate-row.tsx              # Single certificate display
│   │   └── (15+ other shared components)
│   │
│   ├── contexts/                 # React Context providers (global state)
│   │   ├── pm-context.tsx        # Auth state: who is logged in, their PM record
│   │   └── date-range-context.tsx # Date filter state for dashboard
│   │
│   ├── hooks/                    # Custom React hooks (reusable logic)
│   │   ├── use-ticket-detail.ts  # Fetches all data for one ticket (600+ lines)
│   │   ├── use-edit-mode.ts      # Inline editing with audit trail
│   │   └── use-open-ticket.ts    # Opens ticket modal via URL params
│   │
│   ├── lib/                      # Utility functions and setup
│   │   ├── supabase/             # Supabase client setup (browser, server, middleware)
│   │   ├── constants.ts          # Business constants (categories, priorities, SLAs, cert types)
│   │   ├── normalize.ts          # UK phone/name/address normalization
│   │   ├── validate.ts           # Input validation helpers
│   │   ├── postcode.ts           # UK postcode lookup via postcodes.io API
│   │   ├── utils.ts              # Tailwind class merging utility (cn function)
│   │   ├── typography.ts         # Text formatting utilities
│   │   └── spacing.ts            # Spacing constants
│   │
│   ├── types/                    # TypeScript type definitions
│   │   └── database.ts           # Auto-generated Supabase types (all table schemas)
│   │
│   ├── styles/                   # Style utilities
│   │   └── spacing.ts
│   │
│   └── middleware.ts             # Runs on every request: refreshes auth session
│
├── supabase/                     # Backend: Supabase Edge Functions
│   ├── functions/
│   │   ├── _shared/              # Shared code used by all functions
│   │   │   ├── twilio.ts         # Send WhatsApp/email + log to DB
│   │   │   ├── supabase.ts       # Create admin Supabase client
│   │   │   ├── events.ts         # Log events to audit ledger
│   │   │   ├── templates.ts      # Twilio template IDs + helper formatters
│   │   │   ├── telegram.ts       # Error alerting to Telegram
│   │   │   ├── resend.ts         # Email sending via Resend
│   │   │   └── email-templates.ts # HTML email templates
│   │   │
│   │   ├── yarro-tenant-intake/  # WhatsApp AI conversation → ticket creation
│   │   ├── yarro-ticket-notify/  # Notifications after ticket creation
│   │   ├── yarro-dispatcher/     # Send quotes to contractors/landlords
│   │   ├── yarro-scheduling/     # Schedule confirmed jobs
│   │   ├── yarro-completion/     # Process job completion forms
│   │   ├── yarro-followups/      # Send reminders (contractor, landlord, PM)
│   │   ├── yarro-job-reminder/   # Day-of job reminders
│   │   ├── yarro-ooh-escalation/ # Escalate after-hours tickets
│   │   ├── yarro-outbound-monitor/ # Handle replies on outbound WhatsApp
│   │   └── yarro-alto-import/    # Alto CRM integration
│   │
│   └── config.toml               # Supabase local config
│
├── public/                       # Static assets (logos, icons)
├── .backups/                     # Database RPC/trigger backups
├── .claude/                      # Claude Code context and documentation
│   ├── docs/                     # Architecture, patterns, HMO plan, etc.
│   └── context/                  # Active edit tracking, design tokens
├── .github/workflows/            # CI: deploy-functions.yml
├── yarro-app/                    # Legacy copy of the repo (from original developer)
│
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── next.config.ts                # Next.js configuration
├── CLAUDE.md                     # Instructions for Claude Code AI assistant
├── SESSION_LOG.md                # Developer session notes
└── CHANGELOG.md                  # Change history
```

---

## 3. Key Files — What Each Does and How They Connect

### The Core Pipeline (follow a ticket from start to finish)

| # | File | What It Does | Connects To |
|---|------|-------------|-------------|
| 1 | `supabase/functions/yarro-tenant-intake/index.ts` | Receives WhatsApp messages, runs AI conversation, creates tickets | Twilio webhook → OpenAI → `c1_conversations` → `c1_tickets` → triggers #2 |
| 2 | `supabase/functions/yarro-ticket-notify/index.ts` | Decides who to notify (PM, landlord, OOH contacts) and sends first messages | Reads ticket → sends WhatsApp → triggers #3 |
| 3 | `supabase/functions/yarro-dispatcher/index.ts` | Sends quote requests to contractors, handles landlord approvals | Sends WhatsApp to contractors/landlord → triggers #4 on approval |
| 4 | `supabase/functions/yarro-scheduling/index.ts` | Finalizes approved jobs, sends booking confirmations | Updates ticket status → sends WhatsApp to contractor/tenant |
| 5 | `supabase/functions/yarro-completion/index.ts` | Processes job completion forms, uploads photos | Fillout webhook → `c1_job_completions` → notifies everyone |
| 6 | `supabase/functions/yarro-followups/index.ts` | Sends reminders when people don't respond | Cron → checks timeouts → sends WhatsApp reminders |
| 7 | `supabase/functions/yarro-job-reminder/index.ts` | Day-of reminders to contractors and tenants | Cron → sends WhatsApp |
| 8 | `supabase/functions/yarro-ooh-escalation/index.ts` | Escalates after-hours tickets at start of business day | Hourly cron → flags tickets for PM review |
| 9 | `supabase/functions/yarro-outbound-monitor/index.ts` | Handles reply messages from contractors/landlords | Twilio webhook → processes quotes/approvals/declines |
| 10 | `supabase/functions/yarro-alto-import/index.ts` | Imports data from Alto property management software | Manual trigger → Alto API → database |

### The Dashboard (what the PM sees and uses)

| File | What It Does | Key Data |
|------|-------------|----------|
| `src/app/(dashboard)/layout.tsx` | Guards all dashboard pages — redirects to login if not authenticated, to import if no properties | Checks auth + PM record + properties |
| `src/app/(dashboard)/page.tsx` | Homepage with KPIs, to-do list, recent activity, handoff queue | Aggregates from `c1_tickets`, `c1_conversations`, `c1_ledger` |
| `src/app/(dashboard)/tickets/page.tsx` | Kanban board: Open → Awaiting → Scheduled → Done | `c1_tickets` with status/job_stage |
| `src/app/(dashboard)/properties/page.tsx` | Property list with landlords, tenants, contractors nested in drawers | `v_properties_hub` (denormalized view) |
| `src/app/(dashboard)/properties/[id]/page.tsx` | Single property detail with compliance certificates | `c1_properties` + `c1_compliance_certificates` |
| `src/app/(dashboard)/tenants/page.tsx` | Tenant list with property assignments | `c1_tenants` joined with `c1_properties` |
| `src/app/(dashboard)/contractors/page.tsx` | Contractor list with categories and assigned properties | `c1_contractors` with `property_ids` array |
| `src/app/(dashboard)/landlords/page.tsx` | Landlord list with linked properties | `c1_landlords` → `c1_properties` |
| `src/components/ticket-detail/ticket-detail-modal.tsx` | Full ticket view with 4 tabs (overview, conversation, dispatch, completion) | Uses `use-ticket-detail.ts` hook |
| `src/components/kanban-board.tsx` | The ticket board with smart grouping (awaiting quote vs. awaiting landlord vs. awaiting booking) | Receives tickets as props |
| `src/components/sidebar.tsx` | Left navigation with live counts from database | `c1_properties`, `c1_tenants`, etc. |

### Public Portals (token-based, no login required)

| File | Who Uses It | What They Can Do |
|------|------------|-----------------|
| `src/app/contractor/[token]/page.tsx` | Contractors | View job details, submit quotes |
| `src/app/landlord/[token]/page.tsx` | Landlords | Approve or decline quotes |
| `src/app/tenant/[token]/page.tsx` | Tenants | Track progress, reschedule, confirm completion |
| `src/app/ooh/[token]/page.tsx` | Emergency contacts | Report outcome of after-hours response |
| `src/app/i/[ticketId]/page.tsx` | Anyone with link | View ticket photos |

### Infrastructure Files (don't touch unless you understand them)

| File | What It Does | Why It Matters |
|------|-------------|---------------|
| `src/contexts/pm-context.tsx` | Global auth state — tracks who's logged in | Has deliberate race-condition fixes. Two-layer pattern (auth user + PM record) is intentional |
| `src/middleware.ts` | Refreshes auth session on every page load | If this breaks, everyone gets logged out |
| `src/lib/supabase/middleware.ts` | The actual session refresh logic + route protection | Defines which routes are public vs. protected |
| `src/types/database.ts` | Auto-generated TypeScript types for all tables | **Do not manually edit** — gets overwritten by `supabase gen types` |
| `src/lib/supabase/client.ts` | Creates browser-side Supabase client (singleton) | Used by every component that reads/writes data |
| `src/lib/supabase/server.ts` | Creates server-side Supabase client | Used by server components and API routes |

### Shared Backend Utilities

| File | What It Does |
|------|-------------|
| `supabase/functions/_shared/twilio.ts` | Sends WhatsApp messages via Twilio + logs to `c1_outbound_log`. Auto-detects WhatsApp vs. email |
| `supabase/functions/_shared/templates.ts` | Registry of 35+ Twilio WhatsApp template IDs + formatting helpers |
| `supabase/functions/_shared/events.ts` | Logs lifecycle events to `c1_ledger` audit trail |
| `supabase/functions/_shared/supabase.ts` | Creates admin Supabase client for Edge Functions |
| `supabase/functions/_shared/telegram.ts` | Sends error/info alerts to a Telegram channel |
| `supabase/functions/_shared/resend.ts` | Sends emails via Resend service |

---

## 4. The Tech Stack

### Languages
| Language | Where | Why |
|----------|-------|-----|
| **TypeScript** | Everywhere | Type-safe JavaScript. Catches errors before runtime. The entire codebase uses it |
| **SQL (PostgreSQL)** | Supabase RPCs | Core business logic runs as database functions (you won't see these in the codebase — they live in Supabase) |

### Frameworks
| Framework | Version | What It Does |
|-----------|---------|-------------|
| **Next.js** | 16.1.3 | React framework for building web apps. Handles routing, server rendering, API routes |
| **React** | 19.2.3 | UI library. Everything you see in the browser is a React component |
| **Tailwind CSS** | 4.x | Utility-first CSS. Instead of writing CSS files, you add classes like `bg-blue-500 text-white p-4` directly to HTML |

### Backend / Database
| Service | What It Does |
|---------|-------------|
| **Supabase** | Backend-as-a-service. Provides: PostgreSQL database, authentication, file storage, Edge Functions (serverless code), real-time subscriptions |
| **Supabase Edge Functions** | Serverless functions that run on Deno (not Node.js). Handle all the automation (WhatsApp processing, notifications, scheduling) |
| **PostgreSQL RPCs** | Custom database functions (like `c1_context_logic`, `c1_create_ticket`). These contain the core business logic and run inside the database itself |

### External Services
| Service | What It Does | Where It's Used |
|---------|-------------|----------------|
| **Twilio** | Sends/receives WhatsApp messages | All Edge Functions. Two numbers: inbound (+447446904822) and outbound (+447463558759) |
| **OpenAI (GPT-4o)** | AI that conversations with tenants to understand their issue | `yarro-tenant-intake` only |
| **Resend** | Sends emails (alternative to WhatsApp for some contacts) | `_shared/resend.ts` |
| **Telegram** | Error alerting for the developer | `_shared/telegram.ts` |
| **Vercel** | Hosts the web app | Deployment target |
| **postcodes.io** | Free UK postcode lookup API | `src/lib/postcode.ts` |
| **Alto** | Property management CRM integration (partially built) | `yarro-alto-import` |

### UI Libraries
| Library | What It Does |
|---------|-------------|
| **Radix UI** | Accessible, unstyled UI primitives (dialogs, dropdowns, tabs, tooltips, etc.) |
| **shadcn/ui** | Pre-built Radix + Tailwind components in `src/components/ui/`. Not a package — actual source code you own |
| **Lucide React** | Icon library (the icons you see everywhere) |
| **Sonner** | Toast notification popups |
| **cmdk** | Command palette (Cmd+K search) |
| **Recharts** | Chart library (for KPI visualizations) |
| **date-fns** | Date formatting/manipulation |
| **react-day-picker** | Calendar date picker component |

---

## 5. Data Models — The Main Objects and How They Relate

### Entity Relationship Map

```
                    ┌──────────────────┐
                    │ Property Manager │  (the logged-in user)
                    │ c1_property_     │
                    │ managers         │
                    └────────┬─────────┘
                             │ owns everything below
          ┌──────────────────┼──────────────────┐
          │                  │                  │
    ┌─────▼─────┐    ┌──────▼──────┐    ┌──────▼──────┐
    │ Landlord  │    │  Property   │    │ Contractor  │
    │ c1_       │◄───│ c1_         │    │ c1_         │
    │ landlords │    │ properties  │    │ contractors │
    └───────────┘    └──────┬──────┘    └──────┬──────┘
                            │                  │
                     ┌──────▼──────┐           │
                     │   Tenant    │           │
                     │ c1_tenants  │           │
                     └──────┬──────┘           │
                            │ reports issue    │ assigned to fix
                     ┌──────▼──────────────────▼──────┐
                     │            Ticket               │
                     │         c1_tickets              │
                     └──────┬──────────────────────────┘
                            │
          ┌─────────────────┼─────────────────────┐
          │                 │                     │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌──────────▼────────┐
   │ Conversation│  │   Messages  │  │  Job Completion   │
   │ c1_         │  │ c1_messages │  │ c1_job_completions│
   │conversations│  └─────────────┘  └───────────────────┘
   └─────────────┘

   Supporting tables:
   ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐
   │   Ledger     │  │ Outbound Log │  │ Compliance Certificates│
   │ c1_ledger    │  │ c1_outbound_ │  │ c1_compliance_        │
   │ (audit trail)│  │ log          │  │ certificates          │
   └──────────────┘  └──────────────┘  └───────────────────────┘
```

### Each Object Explained

**Property Manager (`c1_property_managers`)**
The logged-in user. Everything in the system belongs to a PM. Key fields: name, email, business_name, dispatch_mode (auto vs. review), timeout settings for contractors/landlords.

**Property (`c1_properties`)**
A physical address being managed. Links to one landlord. Has an auto_approve_limit (quotes below this amount skip landlord approval). Also stores contractor_mapping (which contractors handle which categories for this property), access_instructions, and emergency_access_contact.

**Landlord (`c1_landlords`)**
The property owner. Has name, phone, email. One landlord can own multiple properties. Gets notified about quotes and must approve jobs above auto_approve_limit.

**Tenant (`c1_tenants`)**
A person living in a property. Has name, phone, email, role_tag (lead_tenant, tenant, etc.). One property can have multiple tenants. Reports maintenance issues via WhatsApp.

**Contractor (`c1_contractors`)**
A tradesperson. Has categories (plumber, electrician, etc. — stored as an array), property_ids (which properties they serve), contact_method (whatsapp or email), active flag for soft delete.

**Ticket (`c1_tickets`)**
The central object — a maintenance job. This is the biggest and most complex table:
- **Lifecycle fields:** status (open/closed/archived), job_stage (Sent/Quoted/Approved/Scheduled/Completed), next_action, next_action_reason
- **Issue fields:** issue_title, issue_description, category, priority, images
- **Financial fields:** contractor_quote, final_amount
- **People fields:** tenant_id, contractor_id, property_id, contractor_ids (all contractors who were asked)
- **Scheduling:** scheduled_date, confirmation_date, availability
- **Special flags:** handoff (needs PM attention), is_manual (created manually, not via WhatsApp)

**Conversation (`c1_conversations`)**
The AI chat session with a tenant via WhatsApp. Has a `log` field (JSON array of messages), `stage` (where in the conversation flow), `status` (active/finalized), and links to the property and tenant. One conversation creates one ticket.

**Messages (`c1_messages`)**
Stores structured submission data from contractors, landlords, and the PM for a ticket. Uses JSONB columns: `contractors` (array of quote submissions), `landlord` (approval/decline), `manager` (PM notes). One-to-one with tickets.

**Job Completion (`c1_job_completions`)**
Records when a contractor finishes (or fails to finish) a job. Has: completed (bool), notes, media_urls (photos), quote_amount, markup_amount, total_amount, reason (if not completed). One-to-one with tickets.

**Ledger (`c1_ledger`)**
Audit trail — every significant event gets logged here. Fields: ticket_id, event_type (string like "ISSUE_CREATED", "QUOTE_RECEIVED", "JOB_COMPLETED"), data (JSON metadata), actor_role (SYSTEM, PM, CONTRACTOR, etc.).

**Outbound Log (`c1_outbound_log`)**
Every WhatsApp/email message sent by the system. Fields: ticket_id, recipient_phone, recipient_role, message_type, template_sid, twilio_sid, status.

**Compliance Certificates (`c1_compliance_certificates`)**
HMO compliance documents for properties. Types: gas_safety, eicr, epc, fire_risk, hmo_license, pat, legionella, smoke_alarms, co_alarms. Tracks issued_date, expiry_date, status.

**Feedback (`c1_feedback`)**
User-submitted feedback about the product. Category + message + optional ticket reference.

---

## 6. How Data Flows Through the App

### Flow 1: Tenant Reports an Issue (WhatsApp → Database → Dashboard)

```
Tenant sends WhatsApp "my boiler is broken"
    │
    ▼
Twilio receives message, POSTs to yarro-tenant-intake Edge Function
    │
    ▼
Edge Function calls c1_context_logic RPC
    → Gets: which property? which tenant? which PM? conversation history?
    │
    ▼
Builds prompt, calls OpenAI GPT-4o
    → AI classifies: is this a new issue? continuation? emergency? gibberish?
    │
    ▼
If conversation needs more info:
    → Appends AI response to c1_conversations.log
    → Sends reply via Twilio WhatsApp
    → Waits for next message
    │
If conversation is complete (has enough detail):
    → Calls c1_create_ticket RPC
    → Creates row in c1_tickets with issue details
    → Uploads any photos to Supabase Storage
    │
    ▼
Triggers yarro-ticket-notify Edge Function
    → Checks: is it business hours? Is PM in auto or review mode?
    → Sends WhatsApp to PM ("New ticket: Boiler issue at 42 Oak St")
    → Sends WhatsApp to landlord
    → Triggers yarro-dispatcher to contact contractors
    │
    ▼
Dashboard auto-shows new ticket (PM refreshes page or has real-time subscription)
```

### Flow 2: PM Views Ticket on Dashboard (Browser → Supabase → Browser)

```
PM clicks on a ticket in the Kanban board
    │
    ▼
React component calls useTicketDetail(ticketId) hook
    │
    ▼
Hook makes 5-7 parallel Supabase queries:
    → c1_tickets (basic info)
    → c1_conversations (AI chat log)
    → c1_messages (contractor quotes, landlord response)
    → c1_job_completions (completion status)
    → c1_ledger (event history)
    → c1_outbound_log (all messages sent)
    │
    ▼
Data arrives, React renders ticket-detail-modal with 4 tabs:
    → Overview: status, priority, people, amounts, media
    → Conversation: unified thread of all messages
    → Dispatch: outbound message log, contractor quotes
    → Completion: job result, photos, amounts
```

### Flow 3: Contractor Submits Quote (Portal → Database → Notifications)

```
Contractor clicks WhatsApp link → opens /contractor/[token] in browser
    │
    ▼
Page calls c1_contractor_portal RPC with token
    → Returns: ticket details, property address, issue description
    │
    ▼
Contractor fills in quote amount + notes, clicks submit
    │
    ▼
Page calls c1_submit_contractor_quote RPC
    → Inserts quote into c1_messages.contractors JSONB array
    → Updates ticket job_stage
    │
    ▼
Database trigger or Edge Function sends notifications:
    → PM gets WhatsApp: "Contractor quoted £150 for boiler repair"
    → If under auto_approve_limit: auto-approved, triggers scheduling
    → If over limit: landlord gets WhatsApp for approval
```

### Flow 4: PM Edits a Property (Browser → Supabase → Browser)

```
PM clicks "Edit" on property detail page
    │
    ▼
useEditMode hook activates — copies current data into editable state
    │
    ▼
PM changes fields (address, access instructions, auto-approve limit)
    │
    ▼
PM clicks "Save"
    │
    ▼
normalizeRecord() runs:
    → Normalizes phone numbers to 447XXXXXXXXX format
    → Title-cases names
    → Lowercases emails
    → Trims whitespace
    │
    ▼
Supabase .from('c1_properties').update({...}).eq('id', propertyId)
    → Also appends to _audit_log JSONB array (who changed what, when)
    │
    ▼
React re-renders with updated data
```

---

## 7. Structural Issues, Missing Pieces, and Incomplete Areas

### Things That Are Incomplete

1. **Alto Import (Phase 2 not built)** — `yarro-alto-import` can test the connection to Alto CRM, but the actual data import is a placeholder returning "not yet implemented"

2. **HMO Room Layer (Phase 2 of pivot)** — The compliance certificate tracking (Phase 1) is done, but the rooms table/UI hasn't been built yet. This is the next major feature — adding rooms to properties and assigning tenants to rooms

3. **`yarro-app/` directory** — This is a full copy of the repo from the original developer. It has its own `node_modules`, `.git`, `src/`, everything. It's likely leftover from the handover and should probably be deleted once you've confirmed you don't need anything from it

4. **Database Functions are not in the codebase** — The PostgreSQL RPCs (`c1_context_logic`, `c1_create_ticket`, `c1_contractor_context`, etc.) are the most critical business logic but they live only in Supabase. Backups exist in `.backups/supabase-export-2026-03-26/` but they're snapshots, not version-controlled

### Structural Concerns

5. **`use-ticket-detail.ts` is 600+ lines** — This hook does too much. It fetches from 5-7 tables, transforms data, and provides helper functions. It's tightly coupled to the database schema, so any schema change could break it in multiple places

6. **`database.ts` has manual edits** — The compliance certificates table was manually added (see the comment on line 17). This will get overwritten next time you run `supabase gen types`. You'd need to re-add it or ensure the DB schema matches

7. **Properties table has denormalized landlord fields** — `c1_properties` has both `landlord_id` (the proper foreign key) AND `landlord_name`, `landlord_phone`, `landlord_email` (copied values). This means landlord data can get out of sync if someone updates the landlord but not the property

8. **`c1_messages` uses JSONB heavily** — Contractor quotes, landlord responses, and manager notes are all stored as JSON blobs instead of separate tables. This makes querying harder and means you can't use foreign keys or indexes on the nested data

9. **No automated tests** — There are no test files anywhere in the codebase. No unit tests, no integration tests, no end-to-end tests. Changes are verified manually only

10. **No TypeScript strict mode** — The `tsconfig.json` doesn't enforce `strict: true`. This means some type errors that could catch bugs are silently allowed

11. **Edge Functions share no type definitions with the frontend** — The Supabase Edge Functions (in `supabase/functions/`) and the Next.js app (in `src/`) have separate codebases with no shared types. If you change a database column, you need to update both places manually

### Things That Could Surprise You

12. **Two WhatsApp numbers with different roles** — Inbound (+447446904822) receives tenant messages. Outbound (+447463558759) sends notifications and receives replies from contractors/landlords. Mixing these up would break the routing

13. **Tokens expire or are one-use** — Portal URLs (contractor, landlord, tenant, ooh) use tokens that are generated per-ticket. If a token is invalid, the portal shows an error. These tokens are stored in the tickets table

14. **OpenAI is only used in one place** — Despite being an "AI" product, GPT-4o is only called by `yarro-tenant-intake` for the initial WhatsApp conversation. Everything else is rule-based automation

15. **Cron jobs run in Supabase** — Several Edge Functions run on schedules (followups, job reminders, OOH escalation) but the cron configuration lives in Supabase's dashboard, not in the codebase. You can't see when they run by reading the code

---

## 8. What You Need to Know to Safely Make Changes

### Before You Touch Anything

1. **Run `npm run dev`** — Make sure the app starts and you can log in
2. **Run `npm run build`** — Make sure TypeScript compiles with no errors. Do this before AND after every change
3. **Read the file first** — Especially anything in the "Caution Zones" list in `CLAUDE.md`
4. **Check if the file is auto-generated** — `src/types/database.ts` gets overwritten. Don't invest time editing it manually

### Safe Changes (low risk)

- Editing text/labels in components
- Changing Tailwind CSS classes for styling
- Adding new pages under `src/app/(dashboard)/`
- Adding new components in `src/components/`
- Modifying `src/lib/constants.ts` to add categories, priorities, etc.

### Moderate Risk Changes

- Editing any page that fetches from Supabase — make sure the column names match `database.ts`
- Modifying `src/components/sidebar.tsx` — affects every page's navigation
- Changing the onboarding wizard — it inserts data into 5 tables and has complex validation

### High Risk Changes (understand deeply before touching)

- **`src/contexts/pm-context.tsx`** — Auth state. Has deliberate race-condition fixes. The two-layer pattern (authUser + PM record) exists because Supabase auth and the PM table can be out of sync during signup
- **`src/middleware.ts` + `src/lib/supabase/middleware.ts`** — Session management. Breaking this logs everyone out
- **`supabase/functions/yarro-tenant-intake/`** — The WhatsApp AI conversation state machine. Especially `prompts.ts` (1,550 lines). The backend parses specific emoji and phrases from the AI output
- **Any Supabase Edge Function** — These handle real-time WhatsApp messages. A bug means tenants/contractors don't get notified
- **Database RPCs** — The `c1_*` functions in PostgreSQL. These aren't in the codebase but are called everywhere. You'd modify them in the Supabase dashboard

### Key Patterns to Follow

1. **Always use `normalizeRecord()`** before inserting data — it fixes phone formats, capitalizes names, etc.
2. **Use semantic color tokens** — `bg-card`, `text-card-foreground`, `bg-muted`, not raw colors like `bg-gray-100`
3. **Use `cn()` for conditional classes** — Import from `@/lib/utils`, e.g., `cn("base-class", condition && "conditional-class")`
4. **Use `sendAndLog()`** in Edge Functions — Never send a WhatsApp message without logging it
5. **Log events with `logEvent()`** — Every significant action should appear in the `c1_ledger`
6. **All tables are prefixed with `c1_`** — This was likely a namespace for "client 1" from the original multi-tenant design

### Commands to Remember

```bash
npm run dev          # Start dev server at localhost:3000
npm run build        # TypeScript check + production build (run before every push)
npm run lint         # Check for code style issues
```

### Environment Variables

The app needs a `.env.local` file with at minimum:
- `NEXT_PUBLIC_SUPABASE_URL` — Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Public Supabase key (safe for browsers)

Edge Functions need (set in Supabase dashboard):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Admin access
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` — WhatsApp messaging
- `OPENAI_API_KEY` — For tenant intake AI
- `RESEND_API_KEY` — For email sending
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — For error alerts

---

## Appendix: Quick Reference

### Ticket Lifecycle States

```
Status:    open → closed → archived
Job Stage: (none) → Sent → Quoted → Approved → Scheduled → Completed
```

### Priority Levels & SLA Windows

| Priority | Response Target |
|----------|----------------|
| Emergency | 1 hour |
| Urgent | 2 hours |
| High | 24 hours |
| Medium | 7 days |
| Low | 14 days |

### Contractor Categories

Plumber, Electrician, Gas Engineer, Joiner, Locksmith, Pest Control, Roofer, Plasterer, Painter/Decorator, Handyman, Cleaner, Drainage, HVAC, Appliance, Glazier, General

### Certificate Types (HMO Compliance)

HMO License, Gas Safety (CP12), EICR, EPC, Fire Risk Assessment, PAT Testing, Legionella Risk, Smoke Alarms, CO Alarms
