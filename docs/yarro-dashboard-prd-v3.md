# Yarro — Dashboard UI PRD v3
### Theme, Sidebar & Home Page · March 2026 · UI-only — no backend changes

---

| | |
|---|---|
| **Version** | 3.0 — Theme + Sidebar + Home page visual refresh |
| **Date** | 28 March 2026 |
| **Author** | Adam — Yarro |
| **Status** | Ready to build |
| **Scope** | UI only — no backend changes. Retheme globals, redesign sidebar, add stat row, polish existing dashboard panels |
| **Supersedes** | PRD v2.0 (corrects codebase alignment errors) |
| **Key files** | `src/app/globals.css`, `src/components/sidebar.tsx`, `src/app/(dashboard)/page.tsx` |

> **Important context:** `page.tsx` contains ~1,100 lines of working business logic — todo panel, in-progress filtering, compliance summary, rent summary, activity feed. This is a **visual refresh and retheme**, not a rewrite. All existing data fetching and business logic stays.

---

## 1. Design direction

### 1.1 Reference apps analysed

| App | Take | Avoid |
|---|---|---|
| GoCardless | Warm canvas, dark committed sidebar, colour restraint, breathing cards | Nothing — closest match to target |
| Notion | Generous whitespace, large human greeting, light nav weight | Editorial illustration style |
| SaaSBold | Coloured stat card accents, confident number typography | Cool grey canvas, charts as decoration |
| Monday.com | Nothing — used as what-not-to-do | Everything — too dense, too many features |

### 1.2 Design principles (locked)

- **Urgent first** — the most important thing on the page is what needs action today
- **One job per zone** — each section has a single responsibility, no overlap
- **HMO-native language** — certificates, rooms, HMO licences, Awaab's Law
- **Less Stripe, more approachable** — professional but not intimidating
- **Every click goes somewhere** — nothing is decorative
- **Colour used deliberately** — Yarro Blue touches max 3 things per screen
- **Muted and clean by default** — only urgent/status items get colour

> **Core product insight made visual:** The dashboard answers one question the moment it loads — *"Is my portfolio protected right now, and what do I need to do today?"* Everything in the layout flows from that single question.

---

## 2. Design system reference

All components reference tokens from `globals.css`, `src/lib/typography.ts`, and `src/styles/spacing.ts`. **Never hardcode hex values, px sizes, or font sizes in components.**

### 2.1 Colour tokens

Updated `globals.css` values — cool blue family.

| Token | CSS variable | New value | Tailwind class | Used for |
|---|---|---|---|---|
| Canvas background | `--background` | `#F4F8FC` | `bg-background` | Page background behind cards |
| Foreground text | `--foreground` | `#1c1b18` | `text-foreground` | Primary text (unchanged) |
| Card surface | `--card` | `#FFFFFF` | `bg-card` | All cards and panels |
| Card text | `--card-foreground` | `#1c1b18` | `text-card-foreground` | Text inside cards |
| Yarro Blue | `--primary` | `#0059FF` | `bg-primary`, `text-primary` | Buttons, active states, links. Max 3 per screen |
| Primary foreground | `--primary-foreground` | `#FFFFFF` | `text-primary-foreground` | Text on primary buttons |
| Muted surface | `--muted` | `#EDF2F7` | `bg-muted` | Subtle backgrounds, hover states |
| Muted text | `--muted-foreground` | `#64748B` | `text-muted-foreground` | Labels, meta, timestamps. WCAG AA 4.67:1 on white |
| Secondary surface | `--secondary` | `#EDF2F7` | `bg-secondary` | Secondary backgrounds |
| Accent surface | `--accent` | `#E2E8F0` | `bg-accent` | Lighter hover states |
| Border | `--border` | `#E2E8F0` | `border-border` | All card and section borders |
| Input border | `--input` | `#E2E8F0` | `border-input` | Form input borders |
| Focus ring | `--ring` | `#0059FF` | `ring-ring` | Focus states on interactive elements |
| Destructive | `--destructive` | `#EF4444` | `text-destructive` | Delete actions, form errors |

**Status colours (unchanged — used by StatusBadge):**

| Token | CSS variable | Value | Used for |
|---|---|---|---|
| Danger | `--danger` | `#ef4444` | Expired certs, overdue jobs, overdue rent |
| Warning | `--warning` | `#f59e0b` | Expiring within 60 days, awaiting approval |
| Success | `--success` | `#10b981` | Completed, all-clear compliance, paid rent |
| Info | `--info` | `#3b82f6` | Informational badges |

**Sidebar-specific tokens (new):**

| Token | CSS variable | New value | Used for |
|---|---|---|---|
| Sidebar background | `--sidebar` | `#162B45` | Deep navy sidebar background |
| Sidebar text | `--sidebar-foreground` | `#6A94B5` | Inactive nav items |
| Sidebar active text | `--sidebar-primary-foreground` | `#FFFFFF` | Active nav item text |
| Sidebar active bg | `--sidebar-accent` | `rgba(0,89,255,0.10)` | Active nav item background |
| Sidebar primary | `--sidebar-primary` | `#0059FF` | Active left bar accent |
| Sidebar border | `--sidebar-border` | `#1E3A54` | Logo border, footer border |
| Sidebar ring | `--sidebar-ring` | `#0059FF` | Focus states inside sidebar |

**Scrollbar (update warm stone → cool blue):**
- Thumb: `#CBD5E1` (was `#d6d3ce`)
- Thumb hover: `#94A3B8` (was `#a8a29e`)

### 2.2 Typography tokens

Reference `src/lib/typography.ts` — never write raw Tailwind text classes.

| PRD concept | Typography key | Classes |
|---|---|---|
| Page greeting | `typography.pageTitle` | `text-2xl font-semibold text-foreground` |
| Panel header | `typography.cardTitle` | `text-base font-semibold text-foreground` |
| Section label | `typography.sectionTitle` | `text-xs font-semibold text-muted-foreground uppercase tracking-wider` |
| Body text | `typography.bodyText` | `text-sm text-muted-foreground leading-relaxed` |
| Data label | `typography.dataLabel` | `text-sm font-medium text-foreground` |
| Timestamp / meta | `typography.metaText` | `text-xs text-muted-foreground` |
| Very small label | `typography.microText` | `text-[11px] text-muted-foreground/70` |
| CTA link | `typography.actionLink` | `text-sm font-medium text-primary hover:text-primary/70` |
| Muted link | `typography.mutedLink` | `text-xs text-muted-foreground hover:text-foreground` |

**New token needed for stat card numbers:**
```
statValue: 'text-3xl font-semibold text-foreground'
```
Add to `typography.ts` during build.

### 2.3 Spacing tokens

Reference `src/styles/spacing.ts` — never hardcode padding or gap values.

| PRD concept | Spacing key | Value |
|---|---|---|
| Page horizontal padding | `spacing.pagePaddingX` | `px-8` |
| Page top padding | `spacing.pagePaddingTop` | `pt-8` |
| Gap between sections | `spacing.sectionGap` | `gap-6` |
| Gap between items | `spacing.itemGap` | `gap-4` |
| Compact gap | `spacing.tightGap` | `gap-3` |
| Card header padding | `spacing.cardHeaderPadding` | `px-5 py-3` |
| Card content padding | `spacing.cardContentPadding` | `p-5` |
| Row padding | `spacing.rowPaddingX` / `spacing.rowPaddingY` | `px-5` / `py-3` |

### 2.4 Component chrome

| Element | Radius | Notes |
|---|---|---|
| Card component (shadcn) | `rounded-2xl` (18px) | For standalone Card components |
| Dashboard panels | `rounded-xl` (14px) | Lighter panels (todo, scheduled, compliance, etc.) |
| Buttons | `rounded-lg` (10px) | Standard button radius |
| Inputs | `rounded-lg` (10px) | Form inputs |
| Dialogs / modals | `rounded-xl` (14px) | Modal content |
| Stat cards | `rounded-xl` (14px) | New stat row cards |
| Badges / pills | `rounded-full` | Status badges, count badges |

### 2.5 Rules

- Never hardcode palette colours — always use semantic tokens (`bg-card`, `text-muted-foreground`, etc.)
- Never write raw Tailwind text classes — always import from `typography.ts`
- Never hardcode spacing — always import from `spacing.ts`
- Always use `cn()` from `@/lib/utils` for class merging
- `StatusBadge` handles all status-to-colour mapping — don't create new status pill components
- `border-border` for all borders — no raw border colours

### 2.6 Colour usage rules (locked)

- **Yarro Blue (`#0059FF`)** — primary button, active nav bar, links only. Maximum 3 instances per screen.
- **Red (`#ef4444`)** — expired certificates, overdue jobs, urgent rent. Anything requiring immediate action today.
- **Amber (`#f59e0b`)** — expiring soon (within 60 days), awaiting approval, quote requested.
- **Green (`#10b981`)** — completed jobs, all-clear compliance, healthy stats.
- **Everything not highlighted should be muted and clean.** Quality hierarchy, not colour decoration.
- Placeholder colours are acceptable during build — colour hierarchy confirmed iteratively.

> **Colour hierarchy rule:** If something does not have an urgent status, it has no colour. Muted grey text on white cards. Colour is earned by urgency or status — not used for decoration or categorisation.

---

## 3. Sidebar navigation

### 3.1 Structure

Redesign from current white/flat nav to dark navy with collapsible nested groups.
No section labels. Group names are the collapsible parent items themselves.

```
Dashboard                    ← top level, always visible, above all groups

Portfolio                    ← collapsible group
  └ Properties
  └ Rooms
  └ Tenants
  └ Landlords
  └ Rent

Maintenance                  ← collapsible group
  └ Jobs
  └ Contractors

Compliance                   ← collapsible group
  └ Certificates
  └ Audit trail

Settings                     ← collapsible group (collapsed by default)
  └ Integrations
  └ Rules & preferences

─────────────────────────────
Adam Jones                   ← logged-in user, initials avatar, overflow menu
Account owner
```

### 3.2 Behaviour rules (locked)

- Dashboard sits above all groups — no parent, no indent, always visible
- Groups collapse and expand on click — chevron rotates 90°, state persists to `localStorage`
- All groups start **expanded** on first load — user sees full structure immediately
- Settings starts **collapsed** by default — secondary utility
- Active state appears on **child items only**, never on parent group labels
- Yarro Blue 3px left bar + white text + `bg-sidebar-accent` on active child
- Inactive child items: `text-sidebar-foreground` (`#6A94B5`)
- Parent labels when expanded: slightly lighter than inactive children
- Child indent connector: `1px solid` `--sidebar-border` left border, children offset 11px
- Badges (red) appear on child items only — Jobs, Certificates
- No badges on parent group labels
- Entity counts from current sidebar carry over to child items (Properties, Tenants, etc.)

### 3.3 Preserve from current sidebar

The current sidebar (`src/components/sidebar.tsx`) has features that must survive the redesign:
- **Collapse toggle**: 64px collapsed / 256px expanded, persisted to `localStorage`
- **Entity counts**: fetches counts from Supabase (properties, landlords, tenants, contractors). Keep on child items
- **Tooltips**: right-side tooltips when collapsed
- **User section**: bottom anchor with dropdown menu (Settings, Sign out)
- **Logo**: needs white SVG variant for dark background (`/logo-wordmark-white.png` or similar)

### 3.4 Token reference

| Element | Value | Token |
|---|---|---|
| Sidebar background | `#162B45` | `--sidebar` |
| Logo | White SVG variant | Asset needed |
| Active item text | `#FFFFFF` | `--sidebar-primary-foreground` |
| Active left bar | `#0059FF`, 3px wide | `--sidebar-primary` |
| Active background | `rgba(0,89,255,0.10)` | `--sidebar-accent` |
| Inactive item text | `#6A94B5` | `--sidebar-foreground` |
| Child indent line | `#1E3A54`, 1px | `--sidebar-border` |
| Section dividers | `#1E3A54`, 1px | `--sidebar-border` |
| Badge background | `rgba(220,38,38,0.22)` | Custom — only on Jobs, Certificates |
| Badge text | `#FCA5A5` | Custom light red on dark bg |
| User avatar bg | `#1E3A54` | `--sidebar-border` value |
| User name | `#C8DFF0` | Custom light blue-white |
| User role | `#4A7A9B` | Custom muted |

---

## 4. Dashboard top bar

**No changes.** `DashboardHeader` already exists at `src/components/dashboard-header.tsx` and is mounted in the layout at `src/app/(dashboard)/layout.tsx`.

It provides:
- **Search**: Cmd+K global command palette, searches across all entities
- **Create**: `+` button dropdown with 5 entity types (Ticket, Property, Tenant, Contractor, Landlord)
- **Height**: `h-12`, `border-b border-border/40`

Greeting and page title live in `PageShell` within the page content area, not in the global top bar.

---

## 5. Dashboard home layout

### 5.1 Page structure

Three vertical zones within the main content area (right of sidebar, below top bar):

```
┌─────────────────────────────────────────────────────┐
│  PageShell: title = "Good morning, Adam"            │
├──────────┬──────────┬──────────┬───────────────────┤
│  Zone 1: Stat row — 4 equal cards, full width       │
├──────────────────────────┬──────────────────────────┤
│  Zone 2a: Todo panel     │  Zone 2b: Right column   │
│  (to-do + in-progress    │  (scheduled, compliance, │
│   tabbed list)           │   rent, activity feed)   │
└──────────────────────────┴──────────────────────────┘
```

### 5.2 Greeting

Already implemented in `page.tsx` (line ~663):
- Uses `PageShell title={greetingLabel}` where `greetingLabel` = `"Good morning/afternoon/evening, [first name]"`
- Typography: `typography.pageTitle` (`text-2xl font-semibold text-foreground`)
- Create ticket button as `PageShell actions={...}`

### 5.3 Stat row (NEW)

Four equal metric cards, full width. `grid grid-cols-2 lg:grid-cols-4 gap-4` — grid layout inline in `page.tsx`.

Each card: `bg-card rounded-xl border border-border`, padding via `spacing.cardContentPadding`.

| Card | Value shown | Colour logic | Data source |
|---|---|---|---|
| Needs attention | Count of actionable items | `text-danger` if >0 | `todoItems.length` (from `c1_get_dashboard_todo`) |
| Jobs in progress | Count of active jobs | `text-warning` if any overdue | `inProgressTickets.length` (filtered by `IN_PROGRESS_REASONS`) |
| Compliance | X valid / Y total | `text-danger` if expired, `text-warning` if expiring | `compliance_get_summary` RPC (returns `{ expired, expiring, valid, total }`) |
| Rent | X paid / Y total | `text-danger` if overdue | `get_rent_dashboard_summary` RPC (returns `{ paid, outstanding, overdue, partial, total }`) |

**StatCard component spec** (`src/components/dashboard/stat-card.tsx`):
- Props: `label: string`, `value: string | number`, `subtitle?: string`, `accentColor?: 'danger' | 'warning' | 'success' | 'primary' | 'muted'`
- Label: `typography.metaText` (muted, uppercase)
- Value: `typography.statValue` (new — `text-3xl font-semibold text-foreground`)
- Subtitle: `typography.metaText` with optional colour from `accentColor`
- No left border accent on stat cards — they use colour on the subtitle text only
- All 4 data sources already fetched in `page.tsx` — no new queries needed

### 5.4 Two-column layout

Below the stat row. Already implemented at `page.tsx` line ~704.
- Grid: `flex flex-col lg:flex-row gap-8`
- Left column: `lg:flex-1` — TodoPanel
- Right column: `lg:w-[clamp(320px,30vw,420px)]` — stacked panels

---

## 6. Needs attention panel (left column)

### 6.1 What it is

The primary action list. **Everything in this column requires a human decision or action.**

Already implemented as `TodoPanel` in `page.tsx` (lines ~212–395). Will be extracted to `src/components/dashboard/todo-panel.tsx`.

### 6.2 Definition

An item appears here when automated chasing has been sent and no resolution has occurred, OR when a certificate/licence requires human action, OR when a quote or payment requires approval.

### 6.3 Item types (not exhaustive — grows with product)

- Expired compliance certificates — gas safety, EICR, HMO licence, EPC, fire risk, PAT, Legionella
- Compliance certificates expiring within 60 days
- Overdue maintenance jobs where contractor has not responded after automated chasing
- Rent overdue beyond grace period — automated reminders sent, no payment received
- Quotes awaiting landlord or agency approval
- Handoff conversations requiring ticket creation
- Out-of-hours incidents needing follow-up
- Any other portfolio-wide item requiring a human to act

### 6.4 Data source

`supabase.rpc('c1_get_dashboard_todo', { p_pm_id })` — returns prioritised, scored items with:
- `ticket_id`, `issue_summary`, `property_label`
- `action_type`, `action_label`, `action_context`
- `next_action_reason`, `priority_bucket`, `sla_breached`
- `waiting_since`

### 6.5 Existing systems (reuse, don't recreate)

- **`REASON_BADGE`** — maps `next_action_reason` to `{ label, dot colour, text colour }`. Already has 20+ mappings.
- **`ACTION_CTA`** — maps `action_type` to button text ("Triage", "Review", "Approve", "Redispatch", etc.)
- **`NEXT_STEPS`** — recommended descriptions per state
- **`useOpenTicket()`** — opens ticket detail drawer via URL param

### 6.6 Visual refresh spec

**Add left-border accent to each todo item:**
- Urgent items (`sla_breached` or `priority_bucket === 'URGENT'`): `border-l-3 border-danger`
- Warning items (`priority_bucket === 'HIGH'`): `border-l-3 border-warning`
- Normal items: no left border

**Each item structure:**
- Left border accent (see above)
- Status dot + label from `REASON_BADGE` system
- Bold title: `typography.dataLabel` — issue summary
- Meta line: `typography.metaText` — property, room, time elapsed
- Right-aligned CTA: `typography.actionLink` — text from `ACTION_CTA`
- Full row clickable via `useOpenTicket()`

**Ordering:** Red items first (SLA breached, urgent), then amber (high priority), then normal. Within each tier, oldest `waiting_since` first. This ordering is already done server-side by the RPC.

### 6.7 Tabs

The panel has two tabs (already implemented):
- **To-do** — actionable items from `c1_get_dashboard_todo`
- **In Progress** — tickets filtered by `IN_PROGRESS_REASONS` set

---

## 7. In-progress panel (tab within TodoPanel)

### 7.1 What it is

The maintenance pipeline. **Everything here is active but does not require a human decision right now.** The system is tracking it.

### 7.2 Status stages

| Reason | Label (from `REASON_BADGE`) | Colour | Meaning |
|---|---|---|---|
| `awaiting_contractor` | Awaiting reply | `text-warning` | Contractor notified, waiting for response |
| `awaiting_booking` | Awaiting booking | `text-warning` | Quote approved, waiting for date |
| `awaiting_landlord` | Awaiting landlord | `text-warning` | With landlord for approval |
| `allocated_to_landlord` | Landlord Managing | `text-primary` | Landlord handling directly |
| `landlord_in_progress` | Landlord In Progress | `text-warning` | Landlord's contractor on it |
| `ooh_dispatched` | OOH Dispatched | `text-primary` | Out-of-hours contact notified |
| `ooh_in_progress` | OOH In Progress | `text-warning` | Emergency being handled |
| `scheduled` | Scheduled | `text-success` | Job booked, date confirmed |

### 7.3 Row structure

- Status dot (colour from `REASON_BADGE`)
- Job title — plain language issue description
- Sub-line — property, contractor, date if scheduled
- Status tag using `StatusBadge` component (outline style — border + text, no fill)
- Full row clickable — opens ticket drawer via `useOpenTicket()`

---

## 8. Right-column panels

Four stacked panels in the right column. All exist in `page.tsx` — visual polish only.

### 8.1 Scheduled jobs

- Header: `typography.cardTitle` ("Scheduled") + count badge + "View all" link
- Overdue section: red-bordered cards at top (already implemented)
- Upcoming: flat list with date squares (`bg-primary/10`, day + month)
- Empty state: muted dash icon + "No scheduled jobs"
- Card chrome: `bg-card rounded-xl border border-border`

### 8.2 Compliance summary

- Header: `typography.cardTitle` with ShieldCheck icon + "View all" link
- Content: dot + label rows:
  - `bg-danger` dot + "X expired" (if any)
  - `bg-warning` dot + "X expiring within 30 days" (if any)
  - `bg-success` dot + "X valid"
  - All-clear state: single green dot + "All X certificates valid"
- Data: `compliance_get_summary` RPC → `{ expired, expiring, valid, total }`

### 8.3 Rent summary

- Header: `typography.cardTitle` with Banknote icon + month label + "View all" link
- Content: dot + label rows:
  - `bg-success` dot + "X paid"
  - `bg-warning` dot + "X outstanding" (clickable → properties page)
  - `bg-warning` dot + "X partial" (clickable)
  - `bg-danger` dot + "X overdue" (clickable)
- Data: `get_rent_dashboard_summary` RPC → `{ paid, outstanding, overdue, partial, total }`

### 8.4 Recent activity

- Header: `typography.cardTitle` ("Recent activity") + "View all" link
- Content: scrollable timeline list
- Each row: colour dot (from `EVENT_DOT_COLOR` map) + event label + detail + relative timestamp
- Clickable rows open ticket drawer via `useOpenTicket()`
- Grouped events show count badge
- Data: `c1_get_recent_events` RPC

### 8.5 Panel chrome (apply consistently)

All right-column panels should use:
- Container: `bg-card rounded-xl border border-border overflow-hidden`
- Header row: `px-6 pt-3 pb-3 border-b border-foreground/10`
- Header text: `typography.cardTitle` + `text-muted-foreground`
- "View all" button: `variant="ghost" size="sm"` with `text-primary` and ArrowRight icon
- Content padding: `px-6 py-4` for summary panels, `px-6 pb-6` for scrollable lists

---

## 9. Status system

**Do not create new status pill components.** Use the existing systems:

### 9.1 StatusBadge (`src/components/status-badge.tsx`)

- 50+ status-to-colour mappings
- Outline style: `border + text-colour`, no fill background
- Auto-formats snake_case to Title Case
- Already used throughout: tickets page, ticket detail, dashboard sheets

### 9.2 SlaBadge (`src/components/sla-badge.tsx`)

- SLA countdown: green (>50% remaining), amber (10–50%), red (<10%), breached
- Format: "2h 30m", "1d 4h", "BREACHED 30m"
- Used in ticket lists and detail views

### 9.3 REASON_BADGE (inline in `page.tsx`, will move to `todo-panel.tsx`)

- Dashboard-specific dot + text indicators
- 20+ mappings for `next_action_reason` values
- Lighter weight than StatusBadge — used inside todo items

---

## 10. Component specification

### Components to CREATE

| Component | File | Purpose | Priority |
|---|---|---|---|
| `StatCard` | `src/components/dashboard/stat-card.tsx` | Top stat row metric card | **Must** |
| `TodoPanel` | `src/components/dashboard/todo-panel.tsx` | Extracted from inline in page.tsx | **Must** |

### Components to MODIFY

| Component | File | Changes | Priority |
|---|---|---|---|
| `globals.css` | `src/app/globals.css` | Cool blue palette + sidebar tokens + scrollbar colours | **Must** |
| `Sidebar` | `src/components/sidebar.tsx` | Dark navy bg, collapsible nested groups, white logo | **Must** |
| Dashboard page | `src/app/(dashboard)/page.tsx` | Add stat row, import extracted TodoPanel, visual polish | **Must** |
| `typography.ts` | `src/lib/typography.ts` | Add `statValue` token | **Must** |

### Components UNCHANGED

| Component | File | Why |
|---|---|---|
| `DashboardHeader` | `src/components/dashboard-header.tsx` | Top bar stays as-is: search + create. Greeting in PageShell. |
| `PageShell` | `src/components/page-shell.tsx` | Already wraps dashboard correctly |
| `StatusBadge` | `src/components/status-badge.tsx` | All status display handled |
| `SlaBadge` | `src/components/sla-badge.tsx` | SLA countdown handled |
| `useOpenTicket` | `src/hooks/use-open-ticket.ts` | Ticket drawer navigation |
| Card, Button, Badge | `src/components/ui/` | shadcn primitives — no changes |

### Components NOT to create (v2 proposed, not needed)

| v2 proposal | Why not needed |
|---|---|
| `DashboardTopBar` | `DashboardHeader` already exists. Greeting lives in PageShell. |
| `ActionCard` | Todo items already rendered inline with REASON_BADGE system |
| `NeedsAttentionPanel` | TodoPanel already exists |
| `InProgressPanel` | In-progress tab exists within TodoPanel |
| `InProgressRow` | Already rendered inline |
| `SleepEasyScore` | Deferred — post-core-build |

---

## 11. Data sources

All data is already fetched in `page.tsx`. No new queries or RPCs needed.

| Data | Source | Returns |
|---|---|---|
| Todo items | `supabase.rpc('c1_get_dashboard_todo', { p_pm_id })` | Scored, prioritised action items |
| Recent events | `supabase.rpc('c1_get_recent_events', { p_pm_id, p_limit: 15 })` | Activity timeline |
| Compliance | `supabase.rpc('compliance_get_summary', { p_pm_id })` | `{ expired, expiring, valid, total }` |
| Rent | `supabase.rpc('get_rent_dashboard_summary', { p_pm_id })` | `{ paid, outstanding, overdue, partial, total }` |
| All tickets | Direct query on `c1_tickets` | Filtered by PM, date range, non-archived |
| Handoffs | Direct query on `c1_conversations` | Where `handoff=true`, `status=open` |

---

## 12. Build order

Build in this sequence. Do not skip ahead.

### Step 1 — Retheme globals.css

Update `src/app/globals.css`:
- Canvas tokens: `--background: #F4F8FC`, `--border: #E2E8F0`, `--muted: #EDF2F7`, `--muted-foreground: #64748B`
- Secondary/accent: `--secondary: #EDF2F7`, `--accent: #E2E8F0`
- Sidebar tokens: `--sidebar: #162B45`, `--sidebar-foreground: #6A94B5`, `--sidebar-border: #1E3A54`, `--sidebar-accent: rgba(0,89,255,0.10)`
- Scrollbar: thumb `#CBD5E1`, hover `#94A3B8`
- Keep unchanged: `--primary`, `--destructive`, `--danger`, `--warning`, `--success`, `--foreground`, `--card`
- Add `statValue` to `typography.ts`

### Step 2 — Regression check

After palette swap, visually spot-check:
- Properties list page
- Ticket detail modal
- Compliance table
- Tenant/contractor forms
- Login page
- Any page with inputs, cards, badges, tables

The palette is global — every page will change. Fix any contrast or readability issues before continuing.

### Step 3 — Sidebar redesign

Rewrite `src/components/sidebar.tsx`:
- Dark navy background (`bg-sidebar`)
- Collapsible nested groups (Portfolio, Maintenance, Compliance, Settings)
- Dashboard as top-level item above groups
- 3px left bar on active child items
- Child indent connectors
- Red badges on Jobs, Certificates child items
- White logo variant
- Preserve: collapse toggle, entity counts, tooltips, user dropdown

After: grep for all `sidebar-` token usage outside `sidebar.tsx` and verify rendering.

### Step 4 — Extract TodoPanel

Move `TodoPanel` function (~lines 212–395) and its supporting constants (`REASON_BADGE`, `ACTION_CTA`, `NEXT_STEPS`, `IN_PROGRESS_REASONS`) from `page.tsx` to `src/components/dashboard/todo-panel.tsx`.
- Export as named component
- Import in `page.tsx`
- No logic changes — pure extraction

### Step 5 — StatCard component

Create `src/components/dashboard/stat-card.tsx`:
- Props: `label`, `value`, `subtitle?`, `accentColor?`
- Style: `bg-card rounded-xl border border-border`, `spacing.cardContentPadding`
- Wire 4 cards in `page.tsx` using existing fetched data
- Grid: `grid grid-cols-2 lg:grid-cols-4 gap-4` inline in page.tsx, inserted above the two-column layout

### Step 6 — TodoPanel visual polish

- Add left-border accent (3px) based on priority/SLA breach status
- Ensure consistent padding and badge alignment
- Confirm tab switching works correctly after extraction

### Step 7 — Right-column panel polish

Apply consistent card chrome across all 4 right-column panels:
- Container: `bg-card rounded-xl border border-border`
- Headers: `typography.cardTitle` + count badge + "View all" link
- Content padding consistency
- Ensure all colour references use semantic tokens (no hardcoded hex)

### Step 8 — Responsive + empty states

- Verify two-column → single-column stacking below `lg` breakpoint
- Check loading skeleton matches new panel structure
- Confirm "All clear" empty state for todo panel
- Test sidebar collapsed state with new dark theme

---

## 13. Open decisions

### Resolved

| Decision | Resolution |
|---|---|
| Colour direction | Cool blue family (ice blue canvas + navy sidebar). Locked. |
| Sidebar direction | Dark navy + collapsible nested groups. Locked. |
| `+` button action | Already a dropdown in DashboardHeader — 5 entity types. Locked. |
| Top bar | Global search + create only. Greeting in PageShell. Locked. |
| `--muted-foreground` | `#64748B` (WCAG AA 4.67:1 on white). v2's `#9CA3AF` fails at 3.02:1. Locked. |
| TodoPanel extraction | Extract to `src/components/dashboard/todo-panel.tsx`. Locked. |
| StatRow wrapper | Not needed — grid layout inline in page.tsx. Locked. |
| Typography scale | Exists at `src/lib/typography.ts`. Add `statValue` only. Locked. |

### Still open

| Decision | Options / notes | When to decide |
|---|---|---|
| Exact 4 stat cards | Proposed set may change during build | During component build |
| Sleep Easy Score | Deferred — pillars defined but not prioritised | After core build |
| Completed jobs display | Counter only, or show 24h then drop | Post-demo feedback |
| White logo asset | Need `/logo-wordmark-white.png` or CSS filter | During sidebar build |
| Mobile responsive | Two columns stack below `lg` breakpoint (already works) | Post-desktop build |

---

*Yarro Ltd · Company no. 16634091 · yarro.ai · Confidential*
