# Design Tokens — Yarro PM Dashboard

## Overview

The design system uses Tailwind CSS v4 with `@theme inline` custom properties. All colours, radii, and spacing are defined as CSS custom properties in `src/app/globals.css`. Three themes are supported: `light` (default), `.dark`, and `.blue` (navy). All themes use the same Tailwind utility class names — the visual output adapts automatically based on which theme class is active on the `<html>` element.

**The golden rule: never hardcode palette colours.** Never write `text-blue-600`, `bg-gray-100`, `border-red-500`, `dark:text-blue-400` etc. Always use semantic tokens.

---

## CSS Custom Properties — `src/app/globals.css`

### Tailwind Token Mappings (`@theme inline`)

```css
/* Layout */
--color-background       → bg-background, text-background
--color-foreground       → bg-foreground, text-foreground
--color-card             → bg-card
--color-card-foreground  → text-card-foreground
--color-popover          → bg-popover
--color-popover-foreground → text-popover-foreground

/* Brand / Interactive */
--color-primary          → bg-primary, text-primary, border-primary
--color-primary-foreground → text-primary-foreground (text ON primary bg)
--color-secondary        → bg-secondary, text-secondary
--color-secondary-foreground → text-secondary-foreground

/* Neutral */
--color-muted            → bg-muted
--color-muted-foreground → text-muted-foreground
--color-accent           → bg-accent
--color-accent-foreground → text-accent-foreground

/* Status */
--color-destructive      → bg-destructive, text-destructive, border-destructive
--color-success          → bg-success, text-success, border-success
--color-success-foreground → text-success-foreground (white text ON success bg)
--color-warning          → bg-warning, text-warning, border-warning
--color-warning-foreground → text-warning-foreground (dark text ON warning bg)
--color-danger           → bg-danger, text-danger, border-danger
--color-danger-foreground → text-danger-foreground (white text ON danger bg)

/* Structure */
--color-border           → border-border
--color-input            → border-input, bg-input
--color-ring             → ring-ring

/* Yarro Brand (rarely used directly) */
--color-yarro            → bg-yarro, text-yarro (Yarro blue #0059FF)
--color-yarro-dark       → bg-yarro-dark
--color-yarro-light      → bg-yarro-light
--color-yarro-cyan       → bg-yarro-cyan

/* Charts */
--color-chart-1 through --color-chart-5

/* Sidebar */
--color-sidebar, --color-sidebar-foreground, --color-sidebar-primary,
--color-sidebar-primary-foreground, --color-sidebar-accent,
--color-sidebar-accent-foreground, --color-sidebar-border, --color-sidebar-ring

/* Border Radius */
--radius-sm  → rounded-sm   (0.125rem)
--radius-md  → rounded-md   (0.375rem)
--radius-lg  → rounded-lg   (0.5rem)
--radius-xl  → rounded-xl   (0.75rem)
--radius-2xl → rounded-2xl  (1rem)
--radius-3xl → rounded-3xl  (1.25rem)
--radius-4xl → rounded-4xl  (1.5rem)
```

### Raw Values Per Theme

| Token | Light | Dark | Navy Blue |
|-------|-------|------|-----------|
| `--background` | #FAFAFA | #09090B | #0a1628 |
| `--foreground` | #18181B | #FAFAFA | #f1f5f9 |
| `--card` | #FAFAFA | #09090B | #0a1628 |
| `--primary` | #0059FF | #3B82F6 | #3b82f6 |
| `--primary-foreground` | #FFFFFF | #FFFFFF | #ffffff |
| `--muted` | #F4F4F5 | #27272A | #1e3a5f |
| `--muted-foreground` | #71717A | #A1A1AA | #94a3b8 |
| `--border` | #E4E4E7 | #27272A | #1e3a5f |
| `--success` | #10b981 | #10b981 | #10b981 |
| `--warning` | #f59e0b | #f59e0b | #f59e0b |
| `--danger` | #ef4444 | #ef4444 | #ef4444 |
| `--destructive` | #EF4444 | #EF4444 | #ef4444 |
| `--success-foreground` | #ffffff | #ffffff | #ffffff |
| `--warning-foreground` | #1a1a1a | #1a1a1a | #1a1a1a |
| `--danger-foreground` | #ffffff | #ffffff | #ffffff |

### Spacing Variables (CSS)
```css
--page-padding-x: 2rem    /* px-8 */
--page-padding-top: 2rem  /* pt-8 */
--card-padding-x: 1.25rem /* px-5 */
--card-padding-y: 0.75rem /* py-3 */
--section-gap: 1.5rem     /* gap-6 */
--item-gap: 1rem          /* gap-4 */
```

---

## Typography Scale — `src/lib/typography.ts`

Import: `import { typography } from '@/lib/typography'`
Usage: `<h1 className={typography.pageTitle}>` — never write raw text classes.

| Constant | Classes | Use case |
|----------|---------|----------|
| `pageTitle` | `text-2xl font-bold text-foreground` | Page H1 |
| `pageSubtitle` | `text-sm text-muted-foreground mt-1` | Subtitle below H1 |
| `sectionTitle` | `text-sm font-semibold text-muted-foreground uppercase tracking-widest` | Card/panel section headings |
| `cardTitle` | `text-base font-semibold text-foreground` | Card title |
| `cardSubtitle` | `text-xs text-muted-foreground` | Card subtitle |
| `dataLabel` | `text-sm font-semibold text-foreground` | Field labels in data views |
| `dataValue` | `text-sm text-foreground` | Field values |
| `bodyText` | `text-sm text-muted-foreground` | General body copy |
| `metaText` | `text-xs text-muted-foreground` | Timestamps, metadata |
| `metaStrong` | `text-xs font-medium text-muted-foreground` | Emphasised metadata |
| `microText` | `text-[11px] text-muted-foreground/70` | Very small labels |
| `tabActive` | `text-sm font-medium text-primary` | Active tab label |
| `tabInactive` | `text-sm font-medium text-muted-foreground` | Inactive tab label |
| `actionLink` | `text-sm font-medium text-primary hover:text-primary/70 transition-colors` | Clickable text links |
| `mutedLink` | `text-xs text-muted-foreground hover:text-foreground transition-colors` | Secondary clickable text |

---

## Spacing Constants — `src/styles/spacing.ts`

Import: `import { spacing } from '@/styles/spacing'`
Usage: `<div className={spacing.cardContentPadding}>` — never write raw spacing inline.

| Constant | Value | Use case |
|----------|-------|----------|
| `pagePaddingX` | `px-8` | Page horizontal padding |
| `pagePaddingTop` | `pt-8` | Page top padding |
| `pagePaddingTopMobile` | `pt-5` | Mobile top padding |
| `pagePaddingBottom` | `pb-8` | Page bottom padding |
| `sectionGap` | `gap-6` | Between major page sections |
| `itemGap` | `gap-4` | Between items in a group |
| `tightGap` | `gap-3` | Tight item spacing |
| `cardPaddingX` | `px-5` | Card horizontal padding |
| `cardPaddingY` | `py-3` | Card vertical padding |
| `cardHeaderPadding` | `px-5 py-3` | Card header combined |
| `cardContentPadding` | `p-5` | Card body padding |
| `rowPaddingX` | `px-5` | Row horizontal padding |
| `rowPaddingY` | `py-3` | Row vertical padding |
| `rowPaddingXWide` | `px-8` | Wide row horizontal padding |

---

## Card Chrome Pattern

Cards use this exact chrome — never `bg-white shadow` or `bg-gray-50`:

```tsx
// Standard card
<div className="bg-card rounded-xl border border-border p-5">

// Card with header
<div className="bg-card rounded-xl border border-border overflow-hidden">
  <SectionHeader title="Section Name" />
  <div className="p-5">...</div>
</div>

// Panel within a page (no outer border, sits inside a card)
<div className="flex flex-col gap-4">
  <SectionHeader title="Panel Name" />
  {/* content */}
</div>
```

---

## Panel Header Pattern

```tsx
import { SectionHeader } from '@/components/section-header'

// Basic
<SectionHeader title="Contractors" />

// With actions
<SectionHeader title="Contractors" actions={<Button size="sm">Add</Button>} />

// Small variant (tighter padding)
<SectionHeader title="Details" size="sm" />
```

---

## Status/Priority Badge Pattern

```tsx
import { StatusBadge } from '@/components/status-badge'

// Always pass the raw string — StatusBadge handles formatting and colour
<StatusBadge status={ticket.display_stage} />
<StatusBadge status={ticket.priority} size="sm" />
<StatusBadge status="open" />
```

Colour is automatic. Never add `className` to override badge colours — that defeats the semantic token system.

---

## Icon Wrapper Pattern

Icons that sit inside a coloured circle/square use this pattern:
```tsx
// Wrapper
<div className="flex-shrink-0 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
  <SomeIcon className="h-6 w-6 text-primary" />
</div>

// Available wrapper/icon colour combinations:
// bg-primary/10 + text-primary    → blue
// bg-success/10 + text-success    → green
// bg-warning/10 + text-warning    → amber
// bg-danger/10  + text-danger     → red
// bg-muted      + text-muted-foreground → neutral
```

---

## What Must Never Be Hardcoded

❌ Never write:
- `text-blue-600`, `text-blue-400`, `dark:text-blue-400`
- `bg-gray-100`, `bg-zinc-800`
- `border-red-500`, `bg-green-500`
- `bg-white`, `text-black`
- Raw dark mode overrides: `dark:bg-...`, `dark:text-...`, `dark:border-...`
- Raw padding/gap values not from the spacing scale

✅ Always write:
- `text-primary`, `text-success`, `text-warning`, `text-danger`, `text-muted-foreground`, `text-foreground`
- `bg-card`, `bg-muted`, `bg-primary/10`, `bg-success/10`
- `border-border`, `border-primary/40`, `border-danger/40`
- Constants from `typography.ts` and `spacing.ts`
