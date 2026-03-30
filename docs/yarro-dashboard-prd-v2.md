# Yarro — Dashboard UI PRD v2
### Theme & Home Page · March 2026 · UI only — no backend changes

---

| | |
|---|---|
| **Version** | 2.0 — Theme + Home page |
| **Date** | March 2026 |
| **Author** | Adam — Yarro |
| **Status** | Ready to build |
| **Scope** | UI only — no backend changes |
| **File** | `src/app/(dashboard)/page.tsx` + new components |

> **What this covers:** All design decisions made during the theme and dashboard home layout session. Covers colour system, sidebar navigation, dashboard home layout, component structure, and open decisions still to confirm. Supersedes PRD v1.0. Scope is UI only.

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

## 2. Colour system

### 2.1 Foundation tokens (locked)

Two decisions made and locked during the palette exploration session:

| Token | Hex | CSS variable | Notes |
|---|---|---|---|
| Sidebar bg | `#162B45` | `--sidebar` | Deep ocean navy |
| Canvas bg | `#F4F8FC` | `--background` | Ice blue tint |
| Card bg | `#FFFFFF` | `--card` | Pure white on ice blue |
| Yarro Blue | `#0059FF` | `--primary` | Sparingly — max 3 uses per screen |

The sidebar and canvas both pull from the same cool blue family — one dark and rich, one barely-there. Yarro Blue sits confidently on both. The ice blue canvas is harmonious with Yarro Blue through colour theory without being warm or orange.

### 2.2 Full colour token set

| Token | Hex | CSS variable | Used for |
|---|---|---|---|
| Urgent / expired | `#DC2626` | `--destructive` | Expired certs, overdue jobs, overdue rent |
| Warning / expiring | `#F59E0B` | `--warning` | Expiring within 60 days, approvals |
| Success / clear | `#16A34A` | `--success` | Completed, all-clear compliance |
| Sidebar muted | `#6A94B5` | `--sidebar-foreground` | Inactive nav items |
| Sidebar indent line | `#243E59` | `--sidebar-indent` | Child connector border |
| Sidebar divider | `#1E3A54` | `--sidebar-border` | Logo border, footer border |
| Card border | `#E2E8F0` | `--border` | All card borders |
| Muted text | `#9CA3AF` | `--muted-foreground` | Labels, meta text, dates |

### 2.3 Colour usage rules

- **Yarro Blue (`#0059FF`)** — primary button, active nav bar, links only. Maximum 3 instances per screen.
- **Red (`#DC2626`)** — expired certificates, overdue jobs, urgent rent. Anything requiring immediate action today.
- **Amber (`#F59E0B`)** — expiring soon (within 60 days), awaiting approval, quote requested.
- **Green (`#16A34A`)** — completed jobs, all-clear compliance, healthy stats.
- **Everything not highlighted should be muted and clean.** Quality hierarchy, not colour decoration.
- Placeholder colours are acceptable during build — colour hierarchy confirmed iteratively.

> **Colour hierarchy rule:** If something does not have an urgent status, it has no colour. Muted grey text on white cards. Colour is earned by urgency or status — not used for decoration or categorisation.

---

## 3. Sidebar navigation (locked)

### 3.1 Structure

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
- Yarro Blue 3px left bar + white text + subtle blue-tinted background on active child
- Inactive child items: `#6A94B5` muted blue text, no background
- Parent labels when expanded: `#B8D4E8` slightly lighter than inactive children
- Child indent connector: `1px solid #243E59` left border, children offset 11px
- Badges (red) appear on child items only — Jobs, Certificates
- No badges on parent group labels
- Product Guide removed from nav entirely until ready for users

### 3.3 Token reference

| Element | Value | Notes |
|---|---|---|
| Sidebar background | `#162B45` | `--sidebar` |
| Logo | White SVG variant | White asset already available |
| Active item text | `#FFFFFF` | `--sidebar-active-fg` |
| Active left bar | `#0059FF`, 3px wide | Absolute positioned |
| Active background | `rgba(0,89,255,0.10)` | Subtle blue tint |
| Inactive item text | `#6A94B5` | `--sidebar-foreground` |
| Open parent text | `#B8D4E8` | Slightly lighter when group open |
| Child indent line | `#243E59`, 1px | Left border on children wrapper |
| Section dividers | `#1E3A54`, 1px | Logo border-bottom, footer border-top |
| Badge background | `rgba(220,38,38,0.22)` | Red badge on Jobs, Certificates |
| Badge text | `#FCA5A5` | Light red on dark sidebar |
| User avatar bg | `#1E3A54` | Initials circle |
| User name | `#C8DFF0` | Light blue-white |
| User role | `#4A7A9B` | Muted, secondary |

---

## 4. Dashboard home layout

### 4.1 Page structure

Three vertical zones within the main content area (right of sidebar):

```
┌─────────────────────────────────────────────────────┐
│  Zone 1: Top bar — greeting, search, date, + button │
├─────────────────────────────────────────────────────┤
│  Zone 2: Stat row — 4 equal cards, full width       │
├──────────────────────────┬──────────────────────────┤
│  Zone 3a: Needs          │  Zone 3b: In progress    │
│  attention (left col)    │  (right col)             │
└──────────────────────────┴──────────────────────────┘
```

### 4.2 Top bar

- Background: `#FFFFFF`, border-bottom: `0.5px solid #E2E8F0`, height: `52px`
- **Left:** greeting — `"Good morning, [first name]"` — `font-size: 14px`, `font-weight: 500`
- **Centre:** search bar — `"Search anything..."` placeholder, ice blue background, `border-radius: 7px`
- **Right:** date label (muted, 11px) + `+` create button (`30×30px`, `#0059FF`, `border-radius: 7px`)
- The `+` button is the primary create action — opens job creation flow
- No secondary nav, no breadcrumbs, no page title — the greeting is the header

### 4.3 Stat row

Four equal metric cards, full width. White cards on ice blue canvas, `0.5px solid #E2E8F0` border, `border-radius: 9px`, padding `14px 16px`.

| Card | Value shown | Sub-label | Data source |
|---|---|---|---|
| Needs attention | Count of action items | Red if >0 urgent | Combined query |
| Jobs in progress | Total active jobs | Amber if any overdue | `c1_tickets` |
| Occupancy | % rooms occupied | Green ≥90%, Amber <90% | `c1_rooms` |
| Compliance | % certs in date | Red if expired, Amber <90% | `c1_compliance_certificates` |

> **Note:** The exact four stat cards are a proposed starting point — confirmed during component build. Placeholder values acceptable.

### 4.4 Two-column layout

Below the stat row: two equal-width columns. Both panels are white cards, `0.5px` border, `border-radius: 10px`. Panel header: `11px` uppercase muted label + count badge or view link.

---

#### Left column — Needs attention

The primary action list. **Everything in this column requires a human decision or action.**

**Definition:** An item appears here when automated chasing has been sent and no resolution has occurred, OR when a certificate/licence requires human action, OR when a quote or payment requires approval.

**Item types (not exhaustive — list grows with the product):**
- Expired compliance certificates — gas safety, EICR, HMO licence, EPC, fire risk, PAT, Legionella
- Compliance certificates expiring within 60 days
- Overdue maintenance jobs where contractor has not responded after automated chasing
- Rent overdue beyond grace period — automated reminders sent, no payment received
- Quotes awaiting landlord or agency approval
- Any other portfolio-wide item requiring a human to act

**Each action card structure:**
- `3px` left border — red (`#DC2626`) for urgent, amber (`#F59E0B`) for warning
- Status pill — `Expired` / `Overdue` / `Rent overdue` / `Expiring` / `Approval needed`
- Bold title — plain language description of what needs doing
- Meta line — property name, room, tenant, time elapsed, amount where relevant
- Right-aligned CTA link — `"Fix"`, `"Chase"`, `"Renew"`, `"Approve"`, `"Review"` — links to relevant page or drawer

**Ordering:** Red items first, amber below. Within each tier, most time-sensitive first.

---

#### Right column — In progress

The maintenance pipeline. **Everything here is active but does not require a human decision right now.** The system is tracking it.

**Status tags and what they mean:**

| Tag | Colour | Meaning |
|---|---|---|
| Quote sent | Amber | Contractor quote requested, awaiting response |
| Awaiting approval | Amber | Quote received, with landlord or agency |
| Scheduled | Blue/indigo (placeholder) | Job booked, date confirmed |
| In progress | Yarro Blue | Contractor on site or job active |
| Completed | Green | Job done — drops off after 24h |

**Each row structure:**
- Status dot — colour encodes pipeline stage (placeholder colours, confirmed iteratively)
- Job title — plain language
- Sub-line — property, room, contractor, date/time if scheduled
- Status tag pill — right aligned
- Full row clickable — opens ticket drawer via `?ticketId=` URL param

> **Completed jobs:** Once marked complete, a job drops off the in-progress list. A simple `"X completed this week"` counter sits at the bottom of the panel. Exact timing TBD — not a priority decision for initial build.

---

## 5. Status pill system

Placeholder colours used during build — confirmed iteratively. Table captures intended meaning so consistency is maintained.

| Pill label | Colour | Left bar | Example triggers |
|---|---|---|---|
| Expired | Red | `#DC2626` | Gas cert lapsed, HMO licence lapsed |
| Overdue | Red | `#DC2626` | Job overdue, contractor not responded |
| Rent overdue | Red | `#DC2626` | Rent past grace period, chasing failed |
| Expiring | Amber | `#F59E0B` | Certificate within 60 days of expiry |
| Approval | Amber | `#F59E0B` | Quote or action awaiting approval |
| Quote sent | Amber | `#F59E0B` | Awaiting contractor quote response |
| Scheduled | Blue/indigo | Placeholder | Job booked, date confirmed |
| In progress | Yarro Blue | `#0059FF` | Contractor on site / active |
| Completed | Green | `#16A34A` | Job done, photo verified |

---

## 6. Component specification

All new components live in `src/components/dashboard/`. Existing components (`TicketDrawerProvider`, `useOpenTicket`, `StatusBadge`, shadcn/ui primitives) reused where appropriate.

| Component | File | Responsibility | Priority |
|---|---|---|---|
| `DashboardPage` | `src/app/(dashboard)/page.tsx` | Full rewrite, layout orchestration | **Must** |
| `DashboardTopBar` | `src/components/dashboard/top-bar.tsx` | Greeting, search, date, + button | **Must** |
| `StatCard` | `src/components/dashboard/stat-card.tsx` | Label, value, coloured sub-label | **Must** |
| `NeedsAttentionPanel` | `src/components/dashboard/needs-attention.tsx` | Left column — full action list | **Must** |
| `ActionCard` | `src/components/dashboard/action-card.tsx` | Single action item — bar, pill, CTA | **Must** |
| `InProgressPanel` | `src/components/dashboard/in-progress.tsx` | Right column — job pipeline | **Must** |
| `InProgressRow` | `src/components/dashboard/in-progress-row.tsx` | Single job row, opens ticket drawer | **Must** |
| `Sidebar` (update) | `src/components/sidebar.tsx` | Nested groups, new tokens, user anchor | **Must** |
| `SleepEasyScore` | `src/components/dashboard/sleep-easy-score.tsx` | Portfolio health score — deprioritised | Later |

---

## 7. Open decisions

These are explicitly deferred — do not block the build on them. Placeholder values acceptable throughout.

| Decision | Options / notes | When to decide |
|---|---|---|
| Exact 4 stat cards | Proposed set may change | During component build |
| Status dot colours | Placeholder now — confirmed in context | After first render |
| Completed jobs display | Counter only, or show 24h then drop | Post-demo feedback |
| Sleep easy score | Concept confirmed, deprioritised. Pillars: compliance 35%, jobs 25%, occupancy 25%, finances 15%. Hard floor at 59 if any cert expired. | After core build complete |
| Typography scale | Developing as we go — nothing locked | Iteratively during build |
| Mobile / responsive | Two columns stack below `md` breakpoint | Post-desktop build |
| `+` button action | Command palette or direct job creation | During top bar build |

---

## 8. Build order

Build in this sequence. The dashboard is demoable after step 3. Do not skip ahead.

### Step 1 — Update sidebar (do first)
- Update `src/components/sidebar.tsx` with new colour tokens and nested group structure
- Add collapsible groups: Portfolio, Maintenance, Compliance, Settings
- Move Dashboard to top-level item above all groups
- Apply new colour tokens — deep navy background, muted blue inactive, white active
- Move logged-in user name to bottom anchor. Remove Product Guide from nav
- Apply white logo variant

### Step 2 — Scaffold dashboard page
- Rewrite `src/app/(dashboard)/page.tsx` with new layout skeleton
- Apply ice blue canvas (`#F4F8FC`) to main content area
- Add `DashboardTopBar` with hardcoded greeting and date
- Add 4 `StatCard` components with hardcoded placeholder values
- Add two-column grid below stats — empty panels for now
- Confirm layout renders correctly before adding data

### Step 3 — Needs attention panel
- Build `ActionCard` component with left bar, pill, title, meta, CTA link
- Build `NeedsAttentionPanel` wrapping multiple `ActionCard`s
- Seed data: gas cert expired (14 Oak Road), boiler overdue (22 Park Lane), rent overdue, HMO licence expiring, 2 quotes awaiting approval
- Wire up compliance + tickets + rent queries
- Confirm red/amber ordering logic works correctly

### Step 4 — In progress panel
- Build `InProgressRow` with status dot, title, sub-line, tag, clickable to ticket drawer
- Build `InProgressPanel` with header count and row list
- Wire up `c1_tickets` query for active non-urgent jobs
- Confirm ticket drawer opens via `?ticketId=` param on row click
- Add placeholder completed counter at bottom of panel

### Step 5 — Live stat cards
- Replace hardcoded stat values with live Supabase queries
- Occupancy from `c1_rooms`, compliance % from `c1_compliance_certificates`
- Needs attention count from combined query, jobs count from `c1_tickets`

### Step 6 — Seed demo data
- Write `supabase/seeds/demo_dashboard.sql` for Northgate Property Management, Manchester
- 12 properties, 48 rooms, realistic Manchester street names
- Tenants: Fatima, James, Sarah, Kwame, Priya, Marcus
- Gas cert expired — 14 Oak Road; HMO licence 30 days; EICR expiring — 22 Park Lane
- Overdue boiler job, rent overdue Cedar Ave, 2 quotes awaiting approval
- Dashboard state on seed load must match section 4 of this PRD exactly

---

*Yarro Ltd · Company no. 16634091 · yarro.ai · Confidential*
