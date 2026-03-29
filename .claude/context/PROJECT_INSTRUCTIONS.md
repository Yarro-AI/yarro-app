# Yarro PM Dashboard — Claude Chat Assistant Context

## What Yarro Is

Yarro is a property management automation platform. It uses a WhatsApp-based AI to handle tenant maintenance requests end-to-end: tenants report issues via WhatsApp, an AI assistant collects details, tickets are created in the database, contractors are dispatched, quotes are requested and approved, jobs are scheduled and completed — all automated, with the property manager stepping in only when the AI hands off or when approval is needed.

The dashboard (this codebase) is the frontend that property managers use to monitor and manage everything.

---

## Authenticated Dashboard Routes

All live under `src/app/(dashboard)/` and require authentication via middleware.

| Route | File | Description |
|-------|------|-------------|
| `/` | `src/app/(dashboard)/page.tsx` | Home dashboard — To-do panel + Scheduled panel |
| `/tickets` | `src/app/(dashboard)/tickets/page.tsx` | All tickets with filtering, search, ticket detail modal |
| `/properties` | `src/app/(dashboard)/properties/page.tsx` | Properties list + inline detail drawer |
| `/properties/[id]` | `src/app/(dashboard)/properties/[id]/page.tsx` | Property detail page |
| `/tenants` | `src/app/(dashboard)/tenants/page.tsx` | Tenants list + inline detail drawer |
| `/tenants/[id]` | `src/app/(dashboard)/tenants/[id]/page.tsx` | Tenant detail page |
| `/contractors` | `src/app/(dashboard)/contractors/page.tsx` | Contractors list + inline detail drawer |
| `/contractors/[id]` | `src/app/(dashboard)/contractors/[id]/page.tsx` | Contractor detail page |
| `/landlords` | `src/app/(dashboard)/landlords/page.tsx` | Landlords list + inline detail drawer |
| `/landlords/[id]` | `src/app/(dashboard)/landlords/[id]/page.tsx` | Landlord detail page |
| `/settings` | `src/app/(dashboard)/settings/page.tsx` | Account settings + password change |
| `/integrations` | `src/app/(dashboard)/integrations/page.tsx` | Third-party integrations (Alto etc.) |
| `/import` | `src/app/(dashboard)/import/page.tsx` | Data import via OnboardingWizard |
| `/feedback` | `src/app/(dashboard)/feedback/page.tsx` | Send feedback with category selector |
| `/guide` | `src/app/(dashboard)/guide/page.tsx` | PM guide (tabbed, 5 sub-tabs) |
| `/guide/tenant` | `src/app/(dashboard)/guide/tenant/page.tsx` | Tenant-facing guide |
| `/guide/landlord` | `src/app/(dashboard)/guide/landlord/page.tsx` | Landlord-facing guide |
| `/guide/contractor` | `src/app/(dashboard)/guide/contractor/page.tsx` | Contractor-facing guide |
| `/guide/rules` | `src/app/(dashboard)/guide/rules/page.tsx` | Rules & Preferences |
| `/guide/import` | `src/app/(dashboard)/guide/import/page.tsx` | Onboarding import wizard |

---

## Public Portal Routes

Token-authenticated, no login required — accessed by tenants/contractors/landlords via WhatsApp links.

| Route | File | Description |
|-------|------|-------------|
| `/tenant/[token]` | `src/app/tenant/[token]/page.tsx` | Tenant scheduling portal |
| `/contractor/[token]` | `src/app/contractor/[token]/page.tsx` | Contractor job portal |
| `/landlord/[token]` | `src/app/landlord/[token]/page.tsx` | Landlord approval portal |
| `/ooh/[token]` | `src/app/ooh/[token]/page.tsx` | Out-of-hours escalation portal |
| `/i/[ticketId]` | `src/app/i/[ticketId]/page.tsx` | Public ticket image viewer |
| `/login` | `src/app/login/page.tsx` | PM login page |
| `/update-password` | `src/app/update-password/page.tsx` | Password reset |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 with `@theme inline` custom properties |
| Components | shadcn/ui primitives + custom components |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (cookie-based sessions, managed by middleware) |
| Icons | lucide-react |
| Animation | tw-animate-css |
| Toasts | sonner |
| Date handling | date-fns |
| Charts | recharts |

---

## Design Direction

**Aesthetic:** Stripe / Linear / Vercel. Clean, minimal, data-dense. Not card-heavy. Tables and lists with clear hierarchy. Subtle chrome (borders, not shadows). Fast interactions.

**Core rules:**
- Semantic tokens ONLY — never hardcode `text-blue-600`, `bg-gray-100`, `border-red-500` etc. Always use `text-primary`, `bg-muted`, `border-danger/40` etc.
- Dark mode is automatic — the three themes (light, dark, navy-blue) all work from the same class names because everything flows through CSS variables
- `cn()` from `@/lib/utils` for all conditional class merging
- Typography via `typography` constants from `@/lib/typography` — never write raw `text-2xl font-bold` inline
- Spacing via `spacing` constants from `@/styles/spacing` — never write raw `px-8 pt-8` inline
- Card chrome: `bg-card rounded-xl border border-border` — never `bg-white shadow`
- Hover states: subtle — `hover:bg-muted/40` on rows, `hover:bg-muted/30` on panels
- No drop shadows on interactive elements — use border changes instead

---

## Component Library

All in `src/components/`. See COMPONENT_SNAPSHOTS.md for full props and usage.

### Page-Level Wrappers
| Component | File | What it does |
|-----------|------|-------------|
| `PageShell` | `page-shell.tsx` | Universal page wrapper — title, subtitle, actions, optional topBar |
| `SectionHeader` | `section-header.tsx` | Consistent card/panel header with optional actions |

### Data Display
| Component | File | What it does |
|-----------|------|-------------|
| `DataTable` | `data-table.tsx` | Sortable, searchable table — used on all list pages |
| `StatusBadge` | `status-badge.tsx` | Semantic-token badge for all status/priority strings |
| `KPICard` | `kpi-card.tsx` | Metric card with optional icon, trend, and click handler |
| `SlaBadge` | `sla-badge.tsx` | SLA timer badge, colour-coded by urgency |
| `PriorityDot` | `priority-dot.tsx` | Small dot indicator for ticket priority |

### Detail & Edit
| Component | File | What it does |
|-----------|------|-------------|
| `DetailDrawer` | `detail-drawer.tsx` | Slide-out sheet for entity detail/edit. Also exports DetailSection, DetailRow, DetailGrid, DetailField, DetailDivider |
| `EditableField` | `editable-field.tsx` | Polymorphic form field (text, email, phone, number, select, textarea, boolean). Also exports CompactEditableField, CurrencyField |

### Search & Input
| Component | File | What it does |
|-----------|------|-------------|
| `CommandSearchInput` | `command-search-input.tsx` | Styled search input with clear button and focus ring. Used in top bar |
| `DateFilter` | `date-filter.tsx` | Date range picker for filtering |

### Tickets
| Component | File | What it does |
|-----------|------|-------------|
| `TicketDetailModal` | `ticket-detail/ticket-detail-modal.tsx` | Full ticket detail dialog with tabbed content |
| `TicketForm` | `ticket-form.tsx` | Large ticket creation/edit form |
| `HandoffAlertBanner` | `handoff-alert-banner.tsx` | Warning banner for tickets requiring manual attention |

### Feedback & Dialogs
| Component | File | What it does |
|-----------|------|-------------|
| `ConfirmDeleteDialog` | `confirm-delete-dialog.tsx` | Standard delete confirmation dialog |
| `CollapsibleSection` | `collapsible-section.tsx` | Expandable/collapsible panel |

### Guide Pages
| Component | File | What it does |
|-----------|------|-------------|
| `GuideTabs` | `guide-tabs.tsx` | Tab navigation row for guide sub-pages |
| `CopyableGuide` | `copyable-guide.tsx` | Wrapper that adds copy-to-clipboard to guide content |
| `WhatsAppPreview` | `whatsapp-preview.tsx` | Fake WhatsApp conversation preview for guides |

### Onboarding
| Component | File | What it does |
|-----------|------|-------------|
| `OnboardingWizard` | `onboarding-wizard.tsx` | Multi-step import wizard |

### Navigation
| Component | File | What it does |
|-----------|------|-------------|
| `Sidebar` | `sidebar.tsx` | Main navigation sidebar with theme toggle |

### UI Primitives (`src/components/ui/`)
shadcn/ui components: `Button`, `Input`, `Textarea`, `Select`, `Dialog`, `Sheet`, `Table`, `Tooltip`, `Badge`, `Card`, `Popover`, `DropdownMenu`, `Avatar`, `Tabs`, `Switch`, `Separator`, `Calendar`, `Command`, `Combobox`, `MultiCombobox`

**`InteractiveHoverButton`** (`ui/interactive-hover-button.tsx`) — animated arrow-sweep CTA button. Used for primary actions like Save, Send. Extends native `<button>` props. Variant `default` = Yarro blue sweep, `secondary` = zinc sweep.

---

## Git Workflow

- **Active branch:** `adam/design-system` — all work goes here, no per-feature branches
- **Push rule:** `npm run build` must pass before every push (enforced by pre-push hook)
- **PR rule:** open PR from `adam/design-system` → `main` only when Adam says a chunk is ready for Faraaz to review
- **Never create new branches** unless Faraaz explicitly asks for one
- **Never push to `main`** — Faraaz reviews and merges everything
- **Commit prefixes:** `feat:`, `fix:`, `style:`, `refactor:`
- **Preview URL:** https://yarro-pm-git-adam-design-system-adam-7258s-projects.vercel.app (auto-updates on every push)

---

## File Safety Zones

### GREEN — Claude Code can edit freely
- `src/app/(dashboard)/` — all dashboard pages
- `src/components/` — all components except auth-related ones
- `public/` — static assets

### YELLOW — Flag to Faraaz before changing
- `package.json` — adding dependencies needs Faraaz's approval
- `src/hooks/use-edit-mode.ts`, `src/hooks/use-ticket-detail.ts` — complex hooks with side effects
- `src/lib/constants.ts` — values must match database exactly
- `src/app/globals.css` — theme CSS variables (scoped edits OK, structural changes need review)
- `src/app/(dashboard)/layout.tsx` — affects all dashboard pages
- `src/components/sidebar.tsx` — navigation structure

### RED — Never include in prompts, never modify
- `supabase/functions/` — Edge Functions (Deno, Twilio, OpenAI)
- `.github/workflows/` — CI/CD pipeline
- `src/proxy.ts` — auth session management
- `src/contexts/pm-context.tsx` — auth state provider with race-condition fixes
- `src/lib/supabase/` — Supabase client config
- `src/types/database.ts` — auto-generated types
- `.env.local` — environment variables
- `supabase/config.toml` — Supabase project config

---

## Division of Labour

**Adam** owns all frontend/UI work in `src/app/(dashboard)/`, `src/components/`, and design system files. He works on `adam/design-system` and opens PRs for Faraaz's review.

**Faraaz** owns all backend: `supabase/functions/`, database schema, migrations, RLS policies. He commits independently to `main`. He reviews and merges all of Adam's PRs.

**No SQL, no schema changes, no edge function edits** come from Adam's side.

---

## How to Write a Good Prompt for Claude Code

A good prompt includes:

1. **File path(s) to modify** — exact paths, no guessing
2. **Current state** — what the code currently does / looks like
3. **What to change** — specific, unambiguous description
4. **What to preserve** — existing behaviour, other sections, patterns not being changed
5. **Design constraints** — which tokens to use, which components to reach for, what NOT to do
6. **Verification steps** — `npm run build`, what to visually check, any grep checks

**Good prompt example structure:**
```
File: src/app/(dashboard)/tickets/page.tsx

Current state: The status column renders a plain string. The priority column is missing.

Change:
- Wrap the status cell value in <StatusBadge status={row.display_stage || row.status} />
- Add a priority column after status using <StatusBadge status={row.priority} size="sm" />

Preserve:
- All existing columns and their order (just inserting priority after status)
- All existing filter logic
- The CommandSearchInput in the topBar

Design constraints:
- StatusBadge handles its own colours — do not add className colour overrides
- Column width for priority: w-24

Verification:
- npm run build must pass
- Priority badge should be visible on each row
- Existing status badges should be unchanged
```
