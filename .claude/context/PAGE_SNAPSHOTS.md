# Page Snapshots — Yarro PM Dashboard

Current state of every dashboard page. Use this to understand what already exists before proposing changes.

---

## Home Dashboard `/`
**File:** `src/app/(dashboard)/page.tsx`

**Layout:** Does NOT use PageShell. Custom layout — full-height flex column split into a left panel (TodoPanel) and a right panel (ScheduledPanel) in a 2-column grid. The dashboard layout wraps this in the sidebar + main area.

**Left panel — TodoPanel:**
- Tab row at top: "To-do" and "In Progress" tabs with `border-b-2` underline indicator
- "To-do" tab shows `actionable` items — filtered from `c1_todo_items` view, excluding `FOLLOW_UP` action type and `awaiting_landlord` items < 24h old
- "In Progress" tab shows tickets with `next_action_reason` in: `awaiting_contractor`, `awaiting_booking`, `awaiting_landlord`, `allocated_to_landlord`, `landlord_in_progress`, `ooh_dispatched`, `ooh_in_progress`, `scheduled`
- Each row: issue summary, property label, waiting time, REASON_BADGE (dot + text label), CTA button linking to `/tickets?id=...`
- Overdue scheduled jobs appear as a distinct section with a red "Confirm completion" label

**Right panel — ScheduledPanel:**
- Lists upcoming scheduled visits grouped by date
- Reads `ticket.next_action_reason === 'scheduled'` and `ticket.scheduled_date`
- Date groups: "Today", "Tomorrow", named weekday, or formatted date
- Each row: issue description, address, scheduled time

**Key data interfaces:**
- `TodoItem` — from `c1_todo_items` RPC, includes `action_type`, `action_label`, `next_action_reason`, `waiting_since`, `priority_bucket`
- `TicketSummary` — flat ticket row for the scheduled panel
- `RecentEvent` — event log entries for activity feed

**Design decisions to preserve:**
- REASON_BADGE record: dot + text colour per `next_action_reason` — all semantic tokens
- ACTION_CTA record: CTA button label per action type
- FOLLOW_UP items are intentionally excluded from To-do (they're in a separate context)
- `awaiting_landlord` items are hidden for the first 24 hours (PM shouldn't chase immediately)

---

## Tickets `/tickets`
**File:** `src/app/(dashboard)/tickets/page.tsx`

**Layout:** PageShell with `topBar` = CommandSearchInput. DataTable fills remaining height.

**Features:**
- Search via CommandSearchInput in topBar
- Lifecycle filter tabs: Open / Closed / Archived (shown as tab row below title using `headerExtra`)
- Workflow filter chips: Needs Manager / Waiting / Scheduled
- Type filter chips: Auto / Manual
- Date range filter via DateFilter component
- Column sort on all columns
- Row click opens TicketDetailModal

**Columns:** Issue, Address, Status (StatusBadge on `display_stage`), Priority (StatusBadge), SLA (SlaBadge), Assigned Contractor, Date, Hold/Resume toggle

**Key filter constants:**
- `WAITING_REASONS`: awaiting_contractor, awaiting_landlord, awaiting_booking, allocated_to_landlord
- `NEEDS_MGR_REASONS`: needs_attention, no_contractors, landlord_declined, landlord_no_response, landlord_needs_help, job_not_completed, manager_approval

**Design decisions:**
- HandoffAlertBanner appears at the top when handoff tickets exist
- Archived tickets are hidden by default (separate tab)
- On-hold tickets show a Play/Pause button per row
- SlaBadge shows time-to-breach or breached state per ticket

---

## Properties `/properties`
**File:** `src/app/(dashboard)/properties/page.tsx`

**Layout:** PageShell with topBar search. DataTable with DetailDrawer for inline editing.

**Table columns:** Address, Landlord, Tenants count, Contractors count, Open Tickets count

**DetailDrawer content:** Address, landlord details (name/phone/email), auto-approve limit, access instructions, emergency contact, tenants list (collapsible), contractors list (collapsible), open/recent tickets list

**Edit mode:** Full inline edit of property fields including landlord assignment (dropdown of all landlords), tenant/contractor multi-select, access instructions

**Create mode:** InteractiveHoverButton "Add Property" opens create drawer with same fields

---

## Property Detail `/properties/[id]`
**File:** `src/app/(dashboard)/properties/[id]/page.tsx`

**Layout:** PageShell with full page content. Two-column layout: left = property details + tickets, right = tenants + contractors.

**Sections:**
- Property header: address, landlord name, auto-approve limit (£ badge), access instructions
- Open tickets: DataTable of active tickets filtered to this property
- Recent activity: closed/archived tickets
- Tenants: cards showing name, phone, email
- Contractors: cards showing name, phone, speciality, active/inactive indicator

**Key design decisions:**
- Active/inactive contractor status shown as coloured dot: `bg-success` (active) / `bg-danger` (inactive)
- All icon wrappers use semantic tokens: `bg-primary/10 text-primary`, `bg-success/10 text-success` etc.

---

## Tenants `/tenants`
**File:** `src/app/(dashboard)/tenants/page.tsx`

**Layout:** PageShell with topBar search. DataTable with DetailDrawer.

**Table columns:** Name, Phone, Email, Property Address, Move-in date

**DetailDrawer:** Contact details (phone, email), property assignment, ticket history

---

## Tenant Detail `/tenants/[id]`
**File:** `src/app/(dashboard)/tenants/[id]/page.tsx`

**Layout:** PageShell. Contact info + associated property + ticket history.

**Icon sections:**
- Phone: `bg-primary/10 text-primary`
- Email: `bg-primary/10 text-primary`
- Shield (guarantor/status): `bg-warning/10 text-warning`
- BadgeCheck (verified): `bg-success/10 text-success`

---

## Contractors `/contractors`
**File:** `src/app/(dashboard)/contractors/page.tsx`

**Layout:** PageShell with topBar search. DataTable with DetailDrawer.

**Table columns:** Name, Phone, Email, Specialities, Active status (dot indicator)

---

## Contractor Detail `/contractors/[id]`
**File:** `src/app/(dashboard)/contractors/[id]/page.tsx`

**Layout:** PageShell. Contact info + specialities + active status + action buttons.

**Notable UI:**
- Active/inactive dot: `${active ? 'bg-success/10' : 'bg-danger/10'}` wrapper, `${active ? 'bg-success' : 'bg-danger'}` dot — appears in both view and edit modes
- WhatsApp action button active state: `bg-success text-success-foreground`
- Email action button active state: `bg-primary text-primary-foreground`
- Icon wrappers: `bg-primary/10` for phone, `bg-primary/10` for email/message, `bg-warning/10` for speciality tag

---

## Landlords `/landlords`
**File:** `src/app/(dashboard)/landlords/page.tsx`

**Layout:** PageShell with topBar search. DataTable with DetailDrawer.

**Table columns:** Name, Phone, Email, Properties count, Auto-approve limit

---

## Landlord Detail `/landlords/[id]`
**File:** `src/app/(dashboard)/landlords/[id]/page.tsx`

**Layout:** PageShell. Contact info + properties list + approval settings.

**Notable UI:**
- WhatsApp button: `bg-success text-success-foreground`
- Email button: `bg-primary text-primary-foreground`
- Building2 icon: `bg-success/10 text-success`
- MessageCircle icon: `bg-primary/10 text-primary`

---

## Settings `/settings`
**File:** `src/app/(dashboard)/settings/page.tsx`

**Layout:** PageShell with `scrollable`, `max-w-2xl` content constraint.

**Sections:**
1. **Account** — Read-only display of: Name (User icon), Email (Mail icon), Company/organisation (Building2 icon). Values come from `usePM()` context.
2. **Security** — Password change form: New Password input, Confirm Password input, Save button (InteractiveHoverButton). Validates min 6 chars and match before calling `supabase.auth.updateUser`.

**Design decisions:** Uses `bg-card rounded-xl border p-6` card chrome directly (not SectionHeader). Icons are `text-muted-foreground` — not coloured.

---

## Integrations `/integrations`
**File:** `src/app/(dashboard)/integrations/page.tsx`

**Layout:** PageShell with content showing integration provider cards.

**Content:** Provider cards (e.g. Alto) showing connection status, connect/disconnect actions. Uses local components in `integrations/components/`.

---

## Import `/import`
**File:** `src/app/(dashboard)/import/page.tsx`

**Layout:** PageShell wrapping the `OnboardingWizard` component. Full-height wizard for uploading and mapping CSV data for properties/tenants/contractors/landlords.

---

## Feedback `/feedback`
**File:** `src/app/(dashboard)/feedback/page.tsx`

**Layout:** PageShell with `scrollable`. Two-section layout: left = feedback form, right = feedback history.

**Form:**
- Category selector: 4 buttons (Bug, Feature Request, Improvement, General) with coloured icons
  - Bug: `text-danger bg-danger/10 border-danger/20`
  - Feature: `text-warning bg-warning/10 border-warning/20`
  - Improvement: `text-primary bg-primary/10 border-primary/20`
  - General: `text-muted-foreground bg-muted border-border`
- Active state adds stronger border + `ring-2` glow in matching colour
- Icon wrapper (inside each button): `bg-white/10` (active) / `bg-white/5` (inactive) — glass effect
- Textarea for feedback message
- InteractiveHoverButton "Send Feedback" — turns `bg-success text-success-foreground` after send

**History:** Right panel shows previous submissions as a timeline list.

---

## Guide — PM `/guide`
**File:** `src/app/(dashboard)/guide/page.tsx`

**Layout:** PageShell with `headerExtra={<GuideTabs />}`. CopyableGuide wrapper around content.

**GuideTabs:** Links to sub-pages (You / Tenants / Landlords / Contractors / Rules)

**Content:** Two-column grid. Left = 4 steps (notifications, approve quotes, handle handoffs, monitor dashboard). Each step = icon wrapper + heading + bullet list. Right = WhatsAppPreview example + Tips box + GDPR compliance note.

**Pattern:** All 4 guide sub-pages follow the same two-column layout with WhatsApp preview on the right.

---

## Guide — Tenants `/guide/tenant`
**File:** `src/app/(dashboard)/guide/tenant/page.tsx`

Steps: Start a conversation / Follow the prompts / Wait for updates. Right: WhatsApp example conversation.

---

## Guide — Landlords `/guide/landlord`
**File:** `src/app/(dashboard)/guide/landlord/page.tsx`

Steps: Get notified / Approve quotes. Right: WhatsApp approval example + Auto-approve limits info box.

---

## Guide — Contractors `/guide/contractor`
**File:** `src/app/(dashboard)/guide/contractor/page.tsx`

Steps: Receive job requests / Submit quote / Get approval / Complete job. Right: WhatsApp job flow example + Tips.

---

## Guide — Rules `/guide/rules`
**File:** `src/app/(dashboard)/guide/rules/page.tsx`

**Layout:** PageShell with GuideTabs. CopyableGuide wrapper.

**Content:** Multi-section reference document covering:
- Ticket handling (categories, priorities, auto-routing)
- Dispatch mode settings
- Business hours and OOH contacts
- Timing and follow-up rules
- Booking and scheduling rules

Contains inline code-style blocks with keyword formatting and section dividers.

---

## Public Portals

### Tenant Portal `/tenant/[token]`
**File:** `src/app/tenant/[token]/page.tsx`
Token-authenticated scheduling portal. Tenant selects availability for a repair visit.

### Contractor Portal `/contractor/[token]`
**File:** `src/app/contractor/[token]/page.tsx`
Token-authenticated job portal. Contractor views job details, submits quote, marks completion.

### Landlord Portal `/landlord/[token]`
**File:** `src/app/landlord/[token]/page.tsx`
Token-authenticated approval portal. Landlord approves or declines a quote.

### OOH Portal `/ooh/[token]`
**File:** `src/app/ooh/[token]/page.tsx`
Out-of-hours escalation. Emergency contact views issue and responds.

---

## Layout Files

### Dashboard Layout `/src/app/(dashboard)/layout.tsx`
Renders the sidebar + main content area. Wraps all dashboard pages. **YELLOW zone — do not modify without flagging to Faraaz.**

### Root Layout `/src/app/layout.tsx`
Sets up fonts (Geist Sans/Mono), ThemeProvider, Toaster (Sonner), `<html className="h-full">`.
