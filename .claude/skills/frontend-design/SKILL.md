---
name: frontend-design
description: Build polished, on-brand Yarro UI — pages, components, layouts, and styling work. Use when building new screens, designing components, or improving visual quality.
---

# Yarro Frontend Design Skill

## When To Use
When the user asks to build, design, style, or polish any UI — pages, components, layouts, cards, dashboards, forms, or visual improvements.

---

## Brand & Design Principles

Yarro's users are landlords and independent HMO agency owners. They're typically stressed — chasing tenants, tracking compliance, juggling maintenance. Their software shouldn't add to that stress. It should feel like a **breath of fresh air**.

Every design decision flows from this:

- **Approachable** — friendly, never intimidating or enterprise-heavy. This isn't Bloomberg Terminal, it's a tool that makes someone's day easier.
- **Light & breathable** — generous whitespace, clean surfaces, nothing cramped. The screen should feel open, not dense.
- **User-friendly** — obvious interactions, clear hierarchy, zero confusion. If a user has to think about how to use it, it's too complicated.
- **Supporting, not disrupting** — the UI stays out of the way, surfaces what matters, doesn't demand attention. Information appears when needed, hides when it doesn't.
- **Never heavy** — no dense data walls, no dark oppressive panels, no visual noise. Every element earns its place.

---

## Design Thinking (before coding)

Before writing any UI code, answer these three questions:

1. **What problem does this screen solve for a stressed landlord?** — If you can't answer in one sentence, the scope is too broad. Split it.
2. **What's the minimum the user needs to see?** — Start sparse. Add only what earns its place. A card with 3 clear numbers beats one with 12 cramped stats.
3. **How does this connect to existing pages?** — Consistency > novelty. A new page should feel like it belongs in the same app. Same spacing, same card shapes, same interaction patterns.

---

## Design System Reference

Use these. Don't reinvent them.

| System | File | What it handles |
|--------|------|-----------------|
| Typography scale | `src/lib/typography.ts` | All text styles — pageTitle, sectionTitle, bodyText, metaText, etc. |
| Spacing scale | `src/styles/spacing.ts` | All spacing — pagePaddingX, cardPaddingY, sectionGap, etc. |
| Page wrapper | `src/components/page-shell.tsx` | Every page — padding, title, actions slot, scroll |
| Section headers | `src/components/section-header.tsx` | Card/panel headers — border, padding, label |
| Data tables | `src/components/data-table.tsx` | Sortable, searchable list views |
| Detail panels | `src/components/detail-drawer.tsx` | Side panel for viewing/editing records |
| Form fields | `src/components/editable-field.tsx` | Fields that toggle display/edit mode |
| Status indicators | `src/components/status-badge.tsx` | Colored badges for status/priority |
| Metric cards | `src/components/kpi-card.tsx` | Dashboard KPI display |
| Class merging | `cn()` from `src/lib/utils` | Conditional Tailwind class merging |
| Toasts | `sonner` — `toast.success()`, `toast.error()` | Notifications |
| Icons | `lucide-react` | Every icon in the app |
| UI primitives | `shadcn/ui` — add via `npx shadcn@latest add [name]` | Buttons, dialogs, dropdowns, etc. |

Before creating any new component, check this table. If something similar exists, extend it — don't duplicate it.

---

## Brand Palette

| Token | Value | Use for |
|-------|-------|---------|
| `--yarro` / `bg-yarro` | `#0059FF` | Primary brand blue — CTAs, active states, links |
| `--yarro-cyan` | `#00cdd4` | Accent highlights, secondary emphasis |
| `--yarro-light` | `#a6e1ff` | Light accent backgrounds, selected states |
| `--yarro-dark` | `#101011` | Strong text when needed |
| `bg-card` | white | Card and panel surfaces |
| `bg-muted` | light gray | Subtle backgrounds, alternating rows |
| `bg-background` | off-white | Page background |
| `text-foreground` | near-black | Primary text |
| `text-muted-foreground` | gray | Secondary/supporting text |
| `border-border` | light gray | Card borders, dividers |
| `--success` | `#10b981` | Positive states — compliant, paid, resolved |
| `--warning` | amber | Attention states — expiring soon, overdue |
| `--danger` | red | Error/urgent states — expired, failed |

The primary blue (`--yarro`) is the only strong color. Use it sparingly — for CTAs and active states. Everything else is neutral. The UI should feel predominantly white and light gray, with blue as a purposeful accent.

---

## Aesthetic Guidelines

### Typography
Use the scale from `typography.ts`. Geist Sans is the brand font — it's already configured, never introduce others. Maintain clear hierarchy: `pageTitle` > `sectionTitle` > `cardTitle` > `bodyText` > `metaText`. When something feels off, check that you're using the right level in the hierarchy, not inventing a new size.

### Color
Stick to semantic tokens — `text-foreground`, `bg-card`, `bg-muted`, `border-border`. Never write raw Tailwind colors (`text-gray-500`, `bg-blue-600`). The brand blue appears only on interactive elements and active indicators. If a design feels bland, improve spacing and hierarchy before reaching for more color.

### Spacing
Generous. Always use the spacing scale from `spacing.ts`. When in doubt, add more whitespace, not less. Cramped layouts stress people out — Yarro should feel roomy. Cards breathe with `cardContentPadding` (`p-5`). Sections separate with `sectionGap` (`gap-6`). Pages have consistent `pagePaddingX` (`px-8`).

### Motion
Subtle and purposeful only. Gentle fade-ins on page load (`150-200ms`, `ease-out`). Smooth hover transitions on interactive elements (`transition-colors`, `150ms`). No bouncing, no dramatic reveals, no spring physics, no gratuitous animation. The UI should feel calm — motion confirms an action happened, it doesn't perform for the user.

### Layout
Clean grid-based layouts. Consistent card shapes (`bg-card rounded-xl border border-border`). Predictable page structure — `PageShell` handles the wrapper, you handle the content grid. No asymmetry for its own sake. Predictability is a feature for stressed users who visit the same screens daily.

### Density
Show less, not more. Group related information. Hide secondary details behind expandable sections, drawers, or tooltips. A dashboard card with 3 clear numbers beats one with 12 cramped stats. If a screen feels busy, remove elements before trying to rearrange them.

### Empty States
Always handle them gracefully. A friendly message with a clear next action, not a blank void or a sad illustration. These are moments to reassure: *"No overdue items — you're all caught up"* or *"Add your first property to get started."* Keep the tone warm and practical.

### Microcopy
Write real, context-specific copy. Not "No data available" — instead "No tickets this week." Not "Error" — instead "Couldn't load properties. Try refreshing." The words matter as much as the layout. They should feel like a helpful colleague, not a system message.

---

## Never Do This

- **Raw Tailwind text classes** — always import from `typography.ts`
- **Raw spacing values** (`px-4`, `gap-2`) — always import from `spacing.ts`
- **Raw color classes** (`text-gray-500`, `bg-blue-600`) — always use semantic tokens
- **Icons from anything other than `lucide-react`**
- **New color variables or one-off hex values** — use the existing palette
- **Dense data walls or cramped layouts** — Yarro breathes
- **Heavy shadows, dark panels, or dramatic gradients** — keep it light
- **Gratuitous animation** — no bounce, no spring, no attention-seeking motion
- **Creating components that duplicate existing ones** — check the design system table first
- **Generic placeholder copy** — write real, friendly, context-specific text
- **New fonts** — Geist Sans is the brand font, full stop

---

## Quality Checklist

Before finishing any UI work:

- [ ] Uses existing components from the design system (check the reference table)
- [ ] All text styles use `typography.ts` imports
- [ ] All spacing uses `spacing.ts` imports
- [ ] All colors use semantic tokens (no raw hex or Tailwind color classes)
- [ ] Only `lucide-react` icons
- [ ] Responsive: checked at 375px mobile and 1440px desktop
- [ ] Empty states handled with friendly, specific copy
- [ ] Interactive elements have hover/focus states
- [ ] Layout feels light and breathable — not cramped or dense
- [ ] `npm run build` passes with zero errors
