// src/styles/spacing.ts
// ─────────────────────────────────────────────────────────────
// Yarro spacing scale — single source of truth.
// Import these instead of writing raw px-N/pt-N/gap-N values.
// ─────────────────────────────────────────────────────────────

export const spacing = {
  // Page-level
  pagePaddingX:         'px-8',
  pagePaddingTop:       'pt-8',
  pagePaddingTopMobile: 'pt-5',
  pagePaddingBottom:    'pb-8',

  // Section gaps — vertical space between major page sections
  sectionGap: 'gap-6',
  itemGap:    'gap-4',
  tightGap:   'gap-3',

  // Card / panel internals
  cardPaddingX:       'px-5',
  cardPaddingY:       'py-3',
  cardHeaderPadding:  'px-5 py-3',
  cardContentPadding: 'p-5',

  // Row internals — list items, table rows
  rowPaddingX:     'px-5',
  rowPaddingY:     'py-3',
  rowPaddingXWide: 'px-8',
} as const

export type SpacingKey = keyof typeof spacing
