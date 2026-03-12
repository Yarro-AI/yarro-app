# Component Patterns, Recipes, and Gotchas

## Core Components

### DataTable — Sortable, searchable table

Used on tickets, properties, tenants, contractors pages.

```tsx
import { DataTable } from '@/components/data-table'

// Define columns
const columns = [
  {
    key: 'address',
    header: 'Address',
    sortable: true,
    render: (row) => <span className="font-medium">{row.address}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'priority',
    header: 'Priority',
    render: (row) => row.priority ? <StatusBadge status={row.priority} /> : '-',
  },
]

// Use the table
<DataTable
  data={items}
  columns={columns}
  searchPlaceholder="Search properties..."
  searchKeys={['address', 'landlord_name']}
  onRowClick={(row) => handleRowClick(row)}
  getRowId={(row) => row.id}
  fillHeight                    // fills available vertical space
/>
```

### DetailDrawer — Side panel for viewing/editing records

```tsx
import { DetailDrawer, DetailSection, DetailField, DetailGrid } from '@/components/detail-drawer'

<DetailDrawer
  open={!!selected}
  onClose={() => setSelected(null)}
  title={selected?.address || 'Details'}
  editable
  isEditing={isEditing}
  onEdit={startEditing}
  onSave={saveChanges}
  onCancel={cancelEditing}
>
  <DetailSection title="Property Info">
    <DetailGrid>
      <DetailField label="Address">{selected.address}</DetailField>
      <DetailField label="Landlord">{selected.landlord_name}</DetailField>
    </DetailGrid>
  </DetailSection>
</DetailDrawer>
```

### EditableField — Form fields that toggle display/edit

```tsx
import { EditableField } from '@/components/editable-field'

// Text input
<EditableField
  label="Address"
  type="text"
  value={data.address}
  isEditing={isEditing}
  onChange={(val) => updateField('address', val)}
/>

// Select dropdown
<EditableField
  label="Priority"
  type="select"
  value={data.priority}
  isEditing={isEditing}
  onChange={(val) => updateField('priority', val)}
  options={[
    { value: 'Low', label: 'Low' },
    { value: 'Medium', label: 'Medium' },
    { value: 'High', label: 'High' },
    { value: 'Urgent', label: 'Urgent' },
    { value: 'Emergency', label: 'Emergency' },
  ]}
/>

// Textarea
<EditableField
  label="Notes"
  type="textarea"
  value={data.notes}
  isEditing={isEditing}
  onChange={(val) => updateField('notes', val)}
/>
```

### StatusBadge — Colored badges

Auto-colors based on the status string. Used everywhere.

```tsx
import { StatusBadge } from '@/components/status-badge'

<StatusBadge status="open" />           // Blue
<StatusBadge status="scheduled" />      // Blue
<StatusBadge status="completed" />      // Green
<StatusBadge status="urgent" />         // Red/orange
<StatusBadge status="Dismissed" />      // Gray
<StatusBadge status={ticket.priority} size="md" />
```

### KPICard — Dashboard metric cards

```tsx
import { KPICard } from '@/components/kpi-card'
import { Ticket } from 'lucide-react'

<KPICard
  title="Open Tickets"
  value={12}
  icon={Ticket}
  variant="warning"
  onClick={() => router.push('/tickets')}
/>
```

### Toast Notifications

```tsx
import { toast } from 'sonner'

toast.success('Property updated!')
toast.error('Failed to save: ' + error.message)
```

---

## Hooks

### useEditMode — Edit/save/cancel state

```tsx
import { useEditMode } from '@/hooks/use-edit-mode'

const {
  isEditing,
  editedData,
  isSaving,
  startEditing,
  cancelEditing,
  updateField,
  saveChanges,
  error,
} = useEditMode({
  initialData: myRecord,
  onSave: async (data, auditEntry) => {
    await supabase.from('c1_properties').update(data).eq('id', data.id)
  },
  pmId: propertyManager.id,
})
```

### usePM — Get auth + PM context

```tsx
import { usePM } from '@/contexts/pm-context'

const { propertyManager, authUser, loading } = usePM()

// Use propertyManager.id to filter all queries:
const { data } = await supabase
  .from('c1_tickets')
  .select('*')
  .eq('property_manager_id', propertyManager.id)
```

---

## Styling Patterns

### The cn() helper

Merges Tailwind classes, handles conflicts. Later classes win.

```tsx
import { cn } from '@/lib/utils'

<div className={cn(
  'px-4 py-2 rounded-lg',                    // base styles
  isActive && 'bg-primary text-primary-foreground',  // conditional
  className                                    // passed from parent
)} />
```

### Semantic Colors (Required)

Always use semantic tokens, never raw colors:

| Use This | Not This |
|----------|----------|
| `text-foreground` | `text-gray-900` |
| `text-muted-foreground` | `text-gray-500` |
| `bg-card` | `bg-white` |
| `bg-muted` | `bg-gray-100` |
| `border-border` | `border-gray-200` |
| `bg-primary` | `bg-blue-600` |

### Common Layout Patterns

**Page structure:**
```tsx
<div className="p-8 flex flex-col h-full overflow-hidden">
  {/* Header */}
  <div className="flex-shrink-0 flex items-center justify-between mb-3">
    <h1 className="text-2xl font-semibold">Page Title</h1>
  </div>

  {/* Content */}
  <div className="flex-1 min-h-0">
    <DataTable ... />
  </div>
</div>
```

**Card sections:**
```tsx
<Card>
  <CardHeader>
    <CardTitle>Section Title</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Content here */}
  </CardContent>
</Card>
```

---

## Data Fetching Pattern

All dashboard pages are **`'use client'`** components. They fetch data like this:

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePM } from '@/contexts/pm-context'
import { createClient } from '@/lib/supabase/client'

export default function MyPage() {
  const { propertyManager } = usePM()
  const supabase = createClient()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!propertyManager?.id) return
    const { data, error } = await supabase
      .from('c1_tickets')
      .select('*')
      .eq('property_manager_id', propertyManager.id)
    if (!error && data) setData(data)
    setLoading(false)
  }, [propertyManager?.id, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) return <div className="p-8">Loading...</div>

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-4">My Page</h1>
      {/* Your content here */}
    </div>
  )
}
```

**Key rules:**
- Always `'use client'` for dashboard pages
- Always filter by `propertyManager.id` — PMs only see their own data
- Use `useCallback` for fetch functions to prevent infinite loops
- Use `createClient()` from `@/lib/supabase/client`

---

## Common Recipes

### Recipe: Add a field to an existing form

1. Find the page component that renders the form
2. Find the `EditableField` section
3. Add a new `EditableField` with the correct type
4. Wire it to `updateField('field_name', value)` via `useEditMode`
5. If the field needs a new database column → **ESCALATE to Faraaz**

### Recipe: Create a new dashboard page

1. Create folder: `src/app/(dashboard)/my-page/`
2. Create file: `page.tsx`
3. Use the data fetching pattern above as your template
4. Add a nav link in `src/components/sidebar.tsx`
5. The `(dashboard)/layout.tsx` automatically wraps it with sidebar + auth

### Recipe: Fix a styling/UI bug

1. Find the component file
2. Look for Tailwind classes — they use `cn()` for conditional merging
3. Make your change
4. Check: light mode, dark mode, mobile (375px), desktop (1440px)
5. Check other pages that use the same component (search for the import)

---

## Gotchas

| Gotcha | What Happens | Fix |
|--------|-------------|-----|
| `cn()` class order | Later classes override earlier ones | Put conditional classes last |
| `.single()` on queries | Returns 406 error if 0 or 2+ rows | Use `.maybeSingle()` instead |
| `constants.ts` values | Must match DB exactly — `'Plumber'` not `'plumber'` | Check existing values before adding |
| Forgot `property_manager_id` | Shows ALL data across PMs | Always filter by `propertyManager.id` |
| Using raw colors | Breaks in dark/blue themes | Use semantic tokens: `text-foreground` |
| Icons from wrong library | Build errors or visual inconsistency | Only use `lucide-react` |
| Missing `'use client'` | Server component errors when using hooks | Add at top of file if using useState/useEffect/hooks |
| Editing shared components | Changes affect every page that uses it | Search for imports first, check all usage sites |
| Adding shadcn components | Must use correct style | Run `npx shadcn@latest add component-name` |
