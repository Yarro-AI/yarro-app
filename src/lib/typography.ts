// src/lib/typography.ts
// ─────────────────────────────────────────────────────────────
// Yarro typography scale — single source of truth.
// Import these constants anywhere you need consistent text styles.
// NEVER write raw Tailwind text classes directly in components.
// ─────────────────────────────────────────────────────────────

export const typography = {
  // Page-level headings
  pageTitle:    'text-2xl font-bold text-foreground',
  pageSubtitle: 'text-sm text-muted-foreground mt-1',

  // Section and card headings
  sectionTitle:  'text-sm font-semibold text-muted-foreground uppercase tracking-widest',
  cardTitle:     'text-base font-semibold text-foreground',
  cardSubtitle:  'text-xs text-muted-foreground',

  // Data and body text
  dataLabel:    'text-sm font-semibold text-foreground',
  dataValue:    'text-sm text-foreground',
  bodyText:     'text-sm text-muted-foreground',

  // Metadata and supporting text
  metaText:     'text-xs text-muted-foreground',
  metaStrong:   'text-xs font-medium text-muted-foreground',
  microText:    'text-[11px] text-muted-foreground/70',

  // Tab labels
  tabActive:    'text-sm font-medium text-primary',
  tabInactive:  'text-sm font-medium text-muted-foreground',

  // Action labels
  actionLink:   'text-sm font-medium text-primary hover:text-primary/70 transition-colors',
  mutedLink:    'text-xs text-muted-foreground hover:text-foreground transition-colors',
} as const

export type TypographyKey = keyof typeof typography
