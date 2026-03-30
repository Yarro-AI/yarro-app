# Component Snapshots — Yarro PM Dashboard

Full props interface, description, variants, and gotchas for every reusable component.

---

## PageShell
**File:** `src/components/page-shell.tsx`

```ts
interface PageShellProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode       // right-aligned, flex row
  headerExtra?: React.ReactNode   // below title/subtitle, above content
  topBar?: React.ReactNode        // pinned full-width bar above title (e.g. search)
  children: React.ReactNode
  noPadding?: boolean             // disable px-8 pt-8 pb-8
  scrollable?: boolean            // add overflow-y-auto to content area
  className?: string
}
```

**What it renders:** Full-height flex column. Optional pinned topBar (h-14, border-b, px-8), then a padded content area with page title + optional subtitle + optional actions row, then `headerExtra`, then a flex-1 content area for children.

**Gotcha:** The content area is `flex-1 min-h-0 flex flex-col overflow-hidden` by default. Children must handle their own internal scroll via `overflow-y-auto` or `fillHeight` on DataTable. If `scrollable={true}`, the content area gets `overflow-y-auto` instead.

---

## SectionHeader
**File:** `src/components/section-header.tsx`

```ts
interface SectionHeaderProps {
  title: string
  actions?: React.ReactNode
  className?: string
  size?: 'sm' | 'md'   // sm = py-3, md = py-4 (default: md)
}
```

**What it renders:** A `flex items-center justify-between` row with a `border-b border-border/40`. Title uses `typography.sectionTitle` (uppercase, tracking-wide, muted). Optional actions slot on the right.

**When to use:** Inside cards/panels as the header. Never as a page-level heading (use PageShell's `title` prop instead).

---

## DataTable
**File:** `src/components/data-table.tsx`

```ts
export type Column<T> = {
  key: string
  header: string
  sortable?: boolean
  width?: string                           // e.g. 'w-24', 'w-48'
  render?: (row: T) => React.ReactNode
  getValue?: (row: T) => string | number | null  // for sort when using custom render
}

type DataTableProps<T> = {
  data: T[]
  columns: Column<T>[]
  searchPlaceholder?: string
  searchKeys?: string[]                    // field names to search across
  onRowClick?: (row: T) => void
  onViewClick?: (row: T) => void           // shows Eye icon on hover
  getRowId: (row: T) => string             // required key extractor
  getRowClassName?: (row: T) => string     // conditional row styling
  emptyMessage?: ReactNode
  loading?: boolean                        // shows 5-row skeleton
  maxHeight?: string                       // default 'calc(100vh - 280px)'
  fillHeight?: boolean                     // expand to fill parent (preferred)
  headerExtra?: ReactNode                  // extra content in toolbar row (right of search)
  showHeader?: boolean                     // default true
  hideToolbar?: boolean                    // default false — hide search + headerExtra
  disableBodyScroll?: boolean              // overflow-visible for nested scrollers
}
```

**What it renders:** Search toolbar + sortable table with column headers + footer showing result count. Loading state = 5 animated skeleton rows. Empty state = centred `emptyMessage`.

**Variants/modes:**
- `fillHeight` — preferred on all list pages, expands to fill PageShell content area
- `hideToolbar` — use when search is in PageShell topBar
- `disableBodyScroll` — use when DataTable is inside an already-scrolling parent

**Gotcha:** When `hideToolbar={true}`, the internal search is disabled. Filter `data` yourself before passing it in, or use the topBar CommandSearchInput and pass filtered data.

---

## StatusBadge
**File:** `src/components/status-badge.tsx`

```ts
type StatusBadgeProps = {
  status: string
  variant?: 'default' | 'outline'  // currently only outline styling is implemented
  size?: 'sm' | 'md'               // sm = text-xs px-2 py-0.5, md = text-sm px-2.5 py-1
  className?: string
}
```

**What it renders:** A rounded-full `<span>` with `border bg-transparent`, coloured border + text using semantic tokens. Formats `snake_case` → `Title Case`, preserves `PM`, `LL`, `OOH`, `SLA` as uppercase. Priority statuses wrap with a tooltip showing the description.

**Colour mapping summary:**
- Blue (primary): `open`, `booked`, `scheduled`, `greeting`, `address_collection`, `issue_collection`, `availability_collection`, `awaiting manager`, `awaiting landlord`, `booking sent`, `awaiting booking`, `ooh dispatched`, `landlord managing`
- Green (success): `ll_approved`, `completed`, `low`, `ooh resolved`, `landlord resolved`
- Amber (warning): `contractor_notified`, `quote_received`, `pm_approved`, `medium`, `high`, `awaiting contractor`, `sent`, `reschedule requested`, `landlord no response`, `landlord in progress`, `ooh in progress`
- Red (danger): `urgent`, `emergency`, `not completed`, `handoff`, `ooh unresolved`, `no contractors`, `landlord declined`, `landlord needs help`
- Grey (muted): `closed`, `created`, `on hold`, `dismissed`, `archived`

**Gotcha:** Never add colour overrides via `className`. If a status string isn't in `badgeStyles`, it falls back to grey/muted — that's intentional for unknown statuses.

---

## KPICard
**File:** `src/components/kpi-card.tsx`

```ts
type KPICardProps = {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  trend?: { value: number; isPositive: boolean }
  variant?: 'default' | 'warning' | 'danger' | 'success'
  onClick?: () => void
  className?: string
}
```

**What it renders:** `bg-card rounded-xl border p-5`. Title (muted small), large value (`text-3xl font-semibold`), optional subtitle, optional icon (primary/10 bg circle), optional trend indicator.

**Variants:** `default` = plain border. `warning`/`danger`/`success` = coloured left border accent (`border-l-4`).

**When to use:** Dashboard metric summary cards.

---

## DetailDrawer (+ sub-components)
**File:** `src/components/detail-drawer.tsx`

```ts
type DetailDrawerProps = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  width?: 'default' | 'wide' | 'full'  // 500/550px | 600/700px | 800/900px
  // Edit mode
  editable?: boolean
  isEditing?: boolean
  isSaving?: boolean
  onEdit?: () => void
  onSave?: () => void
  onCancel?: () => void
  // Delete
  deletable?: boolean
  onDelete?: () => void
  deleteLabel?: string
  deleteIcon?: ReactNode
}
```

**Sub-components (all exported from same file):**

```ts
// Groups related fields with optional title
DetailSection: { title?: string; children: ReactNode; className?: string }

// Horizontal label-value pair with border-b
DetailRow: { label: string; children: ReactNode; className?: string }

// CSS grid wrapper
DetailGrid: { children: ReactNode; columns?: 2 | 3; className?: string }

// Small label + value stacked vertically
DetailField: { label: string; children: ReactNode; className?: string }

// Thin divider line
DetailDivider: { className?: string }
```

**What it renders:** A Sheet (shadcn slide-out panel) from the right. Header: title + subtitle + Edit/Cancel/Save/Delete buttons. Body: scrollable, `p-6`.

**Gotcha:** `width` defaults to `'wide'` (600/700px). The drawer uses `hideCloseButton` and provides its own X button in the header.

---

## EditableField (+ variants)
**File:** `src/components/editable-field.tsx`

```ts
// Base union type — polymorphic by `type` prop
type EditableFieldProps =
  | { type: 'text' | 'email' | 'phone' | 'number'; value: string | number | null; onChange: (v: string) => void; ... }
  | { type: 'textarea'; value: string | null; onChange: (v: string) => void; rows?: number; ... }
  | { type: 'select'; value: string | null; onChange: (v: string) => void; options: {value: string; label: string}[]; ... }
  | { type: 'boolean'; value: boolean | null; onChange: (v: boolean) => void; trueLabel?: string; falseLabel?: string; ... }

// All share: label, isEditing, className, required? (not on boolean)
```

**What it renders:** Read mode = `text-xs muted label` + `text-sm font-medium` value. Edit mode = appropriate input (Input, Textarea, Select, or boolean Select).

**Additional exports:**
- `CompactEditableField` — for grid layouts, shows `bg-muted/50 rounded-lg` read view
- `CurrencyField` — `£` prefix input, stores as `number | null`

---

## CommandSearchInput
**File:** `src/components/command-search-input.tsx`

```ts
type CommandSearchInputProps = {
  placeholder?: string
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  blurDelayMs?: number   // delay before firing onBlur (useful for click-to-select lists)
  className?: string
}
```

**What it renders:** A `h-9 px-3 rounded-lg border bg-background/80 backdrop-blur-sm` container with Search icon, text input, and X clear button. Focus ring: `border-primary/60 ring-1 ring-primary/20`.

**When to use:** In PageShell `topBar` for list page search. Not inside the DataTable toolbar.

---

## InteractiveHoverButton
**File:** `src/components/ui/interactive-hover-button.tsx`

```ts
interface InteractiveHoverButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string
  variant?: 'default' | 'secondary'
}
```

**What it renders:** Rounded-full button. On hover: text slides out right as an arrow-right icon fades in, and a colour blob sweeps from left. `default` = Yarro blue (`bg-yarro`) sweep. `secondary` = zinc sweep.

**Gotcha:** Default width is `w-32`. Always override via `className` to fit the label: `className="w-40 text-sm h-9"`. Extends all native button attributes so `disabled`, `type`, `onClick` all work directly.

---

## HandoffAlertBanner
**File:** `src/components/handoff-alert-banner.tsx`

```ts
// Props inferred from usage — shows count of handoff tickets
// Displays an orange warning banner at top of tickets page
```

**When to use:** Automatically shown on the tickets page when `handoff === true` tickets exist.

---

## SlaBadge
**File:** `src/components/sla-badge.tsx`

```ts
// Displays SLA deadline as a time-remaining badge
// Colour: green → amber → red as deadline approaches
// Used on ticket rows in the tickets page
```

---

## PriorityDot
**File:** `src/components/priority-dot.tsx`

```ts
// Small dot indicator sized and coloured by priority level
// Used inline in ticket rows or lists
```

---

## GuideTabs
**File:** `src/components/guide-tabs.tsx`

Renders the tab navigation row used across all guide sub-pages (PM / Tenants / Landlords / Contractors / Rules). Passed as `headerExtra` to PageShell on guide pages.

---

## CopyableGuide
**File:** `src/components/copyable-guide.tsx`

Wraps guide content and adds a "Copy to clipboard" button. Takes a `title` string, `content` string (the plain text that gets copied), and `children` (the visual rendering). Used on all guide sub-pages.

---

## WhatsAppPreview
**File:** `src/components/whatsapp-preview.tsx`

```ts
// Shows a fake WhatsApp conversation thread
// Used on guide pages to illustrate what messages look like
// Props: label, messages: [{from: 'yarro'|'user', text: string, actions?: string[]}]
```

---

## CollapsibleSection
**File:** `src/components/collapsible-section.tsx`

Expandable/collapsible panel. Used on property detail pages to show related entities (tenants, contractors) that can be shown/hidden.

---

## ConfirmDeleteDialog
**File:** `src/components/confirm-delete-dialog.tsx`

Standard "Are you sure?" dialog before destructive actions. Used in all entity pages before deletion.

---

## DateFilter
**File:** `src/components/date-filter.tsx`

Date range picker, works with `useDateRange()` context. Used on the tickets page to filter by date.

---

## UI Primitives (`src/components/ui/`)

Standard shadcn/ui components — use as documented by shadcn. Key ones:

| Component | Notes |
|-----------|-------|
| `Button` | `variant`: default, outline, ghost, secondary, destructive, link. `size`: default, sm, lg, icon |
| `Input` | Standard text input with `border-input` |
| `Textarea` | Multi-line text input |
| `Select` + `SelectTrigger/Content/Item` | Dropdown select |
| `Dialog` + `DialogContent/Header/Title/Description` | Modal dialog |
| `Sheet` + `SheetContent/Header/Title` | Slide-out panel (used inside DetailDrawer) |
| `Tooltip` + `TooltipTrigger/Content/Provider` | Hover tooltip |
| `Badge` | Simple label badge (not to be confused with StatusBadge) |
| `Popover` | Floating popover (used for filter panels) |
| `Switch` | Toggle switch |
| `Combobox` | Searchable dropdown |
| `MultiCombobox` | Multi-select searchable dropdown |
