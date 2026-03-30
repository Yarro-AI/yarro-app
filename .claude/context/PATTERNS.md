# Established Patterns — Yarro PM Dashboard

Hard-won rules and patterns. A developer new to this codebase would get these wrong without being told.

---

## PageShell — Every Dashboard Page Uses It

```tsx
import { PageShell } from '@/components/page-shell'

// Minimal
<PageShell title="Tenants">
  {/* content fills remaining height */}
</PageShell>

// With subtitle and action button
<PageShell
  title="Tickets"
  subtitle="All maintenance requests"
  actions={<InteractiveHoverButton text="New Ticket" onClick={...} />}
>
  {/* content */}
</PageShell>

// With pinned top bar (search above title)
<PageShell
  title="Properties"
  topBar={<CommandSearchInput value={search} onChange={setSearch} placeholder="Search properties..." />}
>
  {/* content */}
</PageShell>

// With extra header content (e.g. tabs below title)
<PageShell title="Guide" headerExtra={<GuideTabs />}>
  {/* content */}
</PageShell>
```

**What PageShell does:**
- Wraps in `flex flex-col h-dvh lg:h-full overflow-hidden` (full viewport height mobile, full parent height desktop)
- `topBar` renders pinned at top, full-width, `h-14`, `border-b border-border/40 px-8`
- Header area: `px-8 pt-8 pb-8` (or `pt-6` if topBar present), contains title + actions
- Content area: `flex-1 min-h-0` — children manage their own scroll

**Gotcha:** Never add your own outer padding or height wrapper around PageShell — it owns that.

---

## Top Bar / Search Pattern (List Pages)

List pages (tickets, properties, tenants, contractors, landlords) pin their search input above the page title using `topBar`:

```tsx
<PageShell
  title="Properties"
  topBar={
    <CommandSearchInput
      value={search}
      onChange={setSearch}
      placeholder="Search properties..."
      className="w-full max-w-sm"
    />
  }
>
  <DataTable ... />
</PageShell>
```

`CommandSearchInput` has built-in focus ring (`border-primary/60 ring-1 ring-primary/20`), clear button, and `backdrop-blur-sm` glass effect. Use it instead of a raw `<input>` or `<Input>` for the top bar.

---

## DataTable Pattern

```tsx
import { DataTable, Column } from '@/components/data-table'

const columns: Column<MyRow>[] = [
  {
    key: 'name',
    header: 'Name',
    sortable: true,
    render: (row) => <span className="font-medium">{row.name}</span>,
    getValue: (row) => row.name, // needed for sorting when using custom render
  },
  {
    key: 'status',
    header: 'Status',
    width: 'w-32',
    render: (row) => <StatusBadge status={row.status} />,
  },
]

<DataTable
  data={rows}
  columns={columns}
  searchPlaceholder="Search..."
  searchKeys={['name', 'address']}    // fields to search across
  onRowClick={(row) => openDrawer(row)}
  getRowId={(row) => row.id}
  fillHeight                          // fills parent height (use inside PageShell)
  hideToolbar                         // hides the built-in search bar (when using topBar instead)
  loading={isLoading}
  emptyMessage="No properties found"
/>
```

**When to use `fillHeight`:** Almost always. It makes the table expand to fill the available height within PageShell.

**When to use `hideToolbar`:** When search is in the PageShell topBar (most list pages). The toolbar contains its own search input which would duplicate the topBar search.

**Searching:** When `hideToolbar={true}`, the DataTable's internal search is disconnected from the search bar. The page must filter `data` itself before passing to DataTable, or use the topBar + DataTable's `searchKeys` together with `hideToolbar={false}`.

**Column sorting:** Add `sortable: true` to any column. For custom-rendered cells, provide `getValue` to return the raw sortable value.

---

## Mobile Height Chain

This is the most common source of layout bugs. The height chain must be unbroken from the root `<html>` element all the way down to the scrollable container.

```
html/body: h-full
  ↓
Root layout: h-full (flex)
  ↓
Dashboard layout: h-full flex (sidebar + main area)
  ↓
PageShell: h-dvh lg:h-full flex flex-col overflow-hidden
  ↓
Content area: flex-1 min-h-0 flex flex-col overflow-hidden
  ↓
Your content: flex-1 min-h-0 (or overflow-y-auto)
```

**The critical rules:**
- `flex-1` alone is not enough — you must also add `min-h-0` to prevent flex children from overflowing
- Never use `height: 100%` without also having `min-height: 0`
- If a panel refuses to scroll, add `min-h-0` to it and its parent
- On mobile: use `h-dvh` not `h-screen` (avoids iOS browser chrome overlap)

---

## Tab Indicator Pattern

The correct way to implement tabs with an underline indicator:

```tsx
// ✅ Correct — border-b-2 on a span inside the button
<div className="flex items-end gap-6 border-b border-border/40">
  <button
    onClick={() => setTab('first')}
    className="flex items-center py-2.5 -mb-px transition-colors group"
  >
    <span className={cn(
      'text-sm font-medium border-b-2 pb-px transition-colors',
      tab === 'first'
        ? 'text-primary border-primary'
        : 'text-muted-foreground border-transparent group-hover:text-foreground group-hover:border-border'
    )}>
      First Tab
    </span>
  </button>
  {/* repeat for other tabs */}
</div>

// ❌ Wrong — absolute-positioned span (older pattern, no longer used)
<button className="relative pb-3 pt-3 ...">
  Tab
  {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
</button>
```

The `border-b-2 pb-px -mb-px` trick: the `pb-px` gives the text a tiny bottom padding so the border appears below the text baseline, and `-mb-px` on the button pulls the outer border of the parent to overlap with the button's indicator, making it appear seamless.

---

## cn() for Conditional Classes

```tsx
import { cn } from '@/lib/utils'

// Always use cn() for conditional/merged classes
<div className={cn(
  'base-class other-base-class',
  isActive && 'active-class',
  variant === 'danger' && 'danger-class',
  className // always spread className last to allow overrides
)} />
```

Never concatenate strings or use ternaries inside className directly — always use `cn()`.

---

## Dark Mode Handling

Dark mode is fully automatic — no `dark:` overrides needed in component code.

**Why:** All colour tokens are CSS custom properties. The `.dark` and `.blue` classes on `<html>` swap the CSS variable values. Since every component uses semantic tokens (`text-primary`, `bg-card` etc.), they all adapt automatically.

**The only time you'd write `dark:`** is for structural effects like glass/blur overlays that genuinely need different opacity in dark mode. Even then, prefer a single low opacity value that works in both: `bg-white/10` instead of `bg-white/50 dark:bg-white/10`.

---

## Auth Pattern (All Dashboard Pages)

```tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'

export default function MyPage() {
  const { propertyManager } = usePM()
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    if (!propertyManager?.id) return
    const { data } = await supabase
      .from('c1_my_table')
      .select('*')
      .eq('property_manager_id', propertyManager.id) // always filter by PM
    setData(data || [])
  }, [propertyManager?.id])

  useEffect(() => {
    fetchData()
  }, [fetchData])
  // ...
}
```

**Rules:**
- Every page must be `'use client'`
- Always call `usePM()` to get `propertyManager`
- Always filter queries by `propertyManager.id` — never return all data
- Use `useCallback` for fetch functions to avoid infinite `useEffect` loops
- Always handle loading and error states

---

## Drawer Pattern (Entity Detail)

```tsx
import {
  DetailDrawer,
  DetailSection,
  DetailGrid,
  DetailField,
  DetailDivider,
} from '@/components/detail-drawer'

<DetailDrawer
  open={isOpen}
  onClose={() => setIsOpen(false)}
  title="14 Elm Street"
  subtitle="Property · Bristol"
  editable
  isEditing={isEditing}
  isSaving={isSaving}
  onEdit={() => setIsEditing(true)}
  onSave={handleSave}
  onCancel={() => setIsEditing(false)}
  deletable
  onDelete={handleDelete}
>
  <DetailSection title="Contact">
    <DetailGrid columns={2}>
      <DetailField label="Phone">{property.phone}</DetailField>
      <DetailField label="Email">{property.email}</DetailField>
    </DetailGrid>
  </DetailSection>
  <DetailDivider />
  <DetailSection title="Tenants">
    {/* list of tenants */}
  </DetailSection>
</DetailDrawer>
```

---

## Toast Notifications

```tsx
import { toast } from 'sonner'

toast.success('Saved successfully')
toast.error('Something went wrong')
toast.loading('Saving...')
```

Never use custom alert/notification components — always use Sonner.

---

## InteractiveHoverButton Usage

Used for primary CTAs (Save, Create, Send Feedback etc.):

```tsx
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'

<InteractiveHoverButton
  text="Save Changes"
  onClick={handleSave}
  disabled={isSaving}
  className="w-36 text-sm h-9"
/>
```

- Default variant = Yarro blue sweep
- `secondary` variant = zinc sweep
- Always pass `className` to control width — default is `w-32`
- Pass `disabled` to prevent interaction while loading

---

## StatusBadge — The Integration Contract

`StatusBadge` is the single source of truth for status-to-colour mapping. The `badgeStyles` record in `status-badge.tsx` maps snake_case strings to semantic token classes.

**Rules:**
- Always pass the raw status string — `StatusBadge` formats it for display (`snake_case` → `Title Case`, keeps `PM`, `LL`, `OOH`, `SLA` uppercase)
- Never add colour className to override badge colours
- If Faraaz introduces a new status string, it needs a new entry in `badgeStyles`
- Priority strings get a tooltip with a description (from `PRIORITY_DESCRIPTIONS` in constants.ts)
