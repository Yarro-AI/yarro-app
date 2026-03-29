# File Structure — Yarro PM Dashboard

Annotated repository tree. YELLOW = flag Faraaz before changing. RED = never include in prompts, never modify.

```
yarro-pm/
│
├── src/
│   │
│   ├── app/
│   │   ├── globals.css                        ⚠️ YELLOW — theme CSS vars, scoped edits OK
│   │   ├── icon.png
│   │   ├── layout.tsx                         Root layout (fonts, ThemeProvider, Toaster)
│   │   │
│   │   ├── (dashboard)/                       ✅ GREEN — all dashboard pages safe to edit
│   │   │   ├── layout.tsx                     ⚠️ YELLOW — sidebar + main area wrapper
│   │   │   ├── page.tsx                       Home dashboard (TodoPanel + ScheduledPanel)
│   │   │   │
│   │   │   ├── tickets/
│   │   │   │   └── page.tsx                   Tickets list + filter + detail modal
│   │   │   │
│   │   │   ├── properties/
│   │   │   │   ├── page.tsx                   Properties list + detail drawer
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx               Property detail page
│   │   │   │       └── loading.tsx            Loading skeleton
│   │   │   │
│   │   │   ├── tenants/
│   │   │   │   ├── page.tsx                   Tenants list + detail drawer
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx               Tenant detail page
│   │   │   │       └── loading.tsx
│   │   │   │
│   │   │   ├── contractors/
│   │   │   │   ├── page.tsx                   Contractors list + detail drawer
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx               Contractor detail page (active dot, action buttons)
│   │   │   │       └── loading.tsx
│   │   │   │
│   │   │   ├── landlords/
│   │   │   │   ├── page.tsx                   Landlords list + detail drawer
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx               Landlord detail page
│   │   │   │       └── loading.tsx
│   │   │   │
│   │   │   ├── settings/
│   │   │   │   └── page.tsx                   Account info + password change
│   │   │   │
│   │   │   ├── integrations/
│   │   │   │   ├── page.tsx                   Integration provider list
│   │   │   │   └── components/
│   │   │   │       ├── alto-connect-dialog.tsx
│   │   │   │       ├── import-status.tsx
│   │   │   │       └── provider-card.tsx
│   │   │   │
│   │   │   ├── import/
│   │   │   │   └── page.tsx                   Data import (OnboardingWizard wrapper)
│   │   │   │
│   │   │   ├── feedback/
│   │   │   │   └── page.tsx                   Feedback form + history
│   │   │   │
│   │   │   └── guide/
│   │   │       ├── page.tsx                   PM guide (Getting Started tab)
│   │   │       ├── tenant/page.tsx            Tenant guide
│   │   │       ├── landlord/page.tsx          Landlord guide
│   │   │       ├── contractor/page.tsx        Contractor guide
│   │   │       ├── rules/page.tsx             Rules & Preferences
│   │   │       └── import/page.tsx            Onboarding import wizard tab
│   │   │
│   │   ├── contractor/[token]/page.tsx        Public contractor portal (token-auth)
│   │   ├── tenant/[token]/page.tsx            Public tenant scheduling portal (token-auth)
│   │   ├── landlord/[token]/page.tsx          Public landlord approval portal (token-auth)
│   │   ├── ooh/[token]/page.tsx               Public OOH escalation portal (token-auth)
│   │   ├── i/[ticketId]/page.tsx              Public ticket image viewer
│   │   ├── login/page.tsx                     PM login
│   │   ├── update-password/page.tsx           Password reset
│   │   │
│   │   ├── api/
│   │   │   └── auth/logout/route.ts           Logout API route
│   │   │
│   │   └── auth/
│   │       ├── callback/route.ts              Auth callback handler
│   │       └── confirm/route.ts               Email confirmation handler
│   │
│   ├── components/
│   │   ├── page-shell.tsx                     ✅ Universal page wrapper (use on every page)
│   │   ├── section-header.tsx                 ✅ Card/panel header with optional actions
│   │   ├── data-table.tsx                     ✅ Sortable + searchable table
│   │   ├── status-badge.tsx                   ✅ Semantic status/priority badge
│   │   ├── kpi-card.tsx                       ✅ Dashboard metric card
│   │   ├── detail-drawer.tsx                  ✅ Slide-out detail/edit panel
│   │   ├── editable-field.tsx                 ✅ Polymorphic form field (text/select/textarea/boolean)
│   │   ├── command-search-input.tsx           ✅ Styled search input for top bar
│   │   ├── date-filter.tsx                    ✅ Date range picker
│   │   ├── handoff-alert-banner.tsx           ✅ Warning banner for handoff tickets
│   │   ├── sla-badge.tsx                      ✅ SLA timer badge
│   │   ├── priority-dot.tsx                   ✅ Priority dot indicator
│   │   ├── collapsible-section.tsx            ✅ Expandable/collapsible panel
│   │   ├── confirm-delete-dialog.tsx          ✅ Delete confirmation dialog
│   │   ├── chat-message.tsx                   ✅ WhatsApp message renderer
│   │   ├── guide-tabs.tsx                     ✅ Guide page tab navigation
│   │   ├── copyable-guide.tsx                 ✅ Copy-to-clipboard guide wrapper
│   │   ├── whatsapp-preview.tsx               ✅ Fake WhatsApp preview for guides
│   │   ├── kanban-board.tsx                   ✅ Drag-and-drop kanban (not currently used on main pages)
│   │   ├── review-dispatch-modal.tsx          ✅ Contractor dispatch review modal
│   │   ├── onboarding-wizard.tsx              ✅ Multi-step import wizard
│   │   ├── ticket-form.tsx                    ✅ Large ticket creation/edit form
│   │   ├── sidebar.tsx                        ⚠️ YELLOW — main navigation
│   │   ├── theme-provider.tsx                 Theme context (next-themes)
│   │   ├── theme-toggle.tsx                   Light/dark/blue switcher
│   │   ├── error-boundary.tsx                 React error boundary
│   │   │
│   │   ├── ticket-detail/                     ✅ Ticket detail modal tabs
│   │   │   ├── ticket-detail-modal.tsx        Main modal container
│   │   │   ├── ticket-overview-tab.tsx
│   │   │   ├── ticket-conversation-tab.tsx
│   │   │   ├── ticket-messages-tab.tsx
│   │   │   ├── ticket-dispatch-tab.tsx
│   │   │   ├── ticket-completion-tab.tsx
│   │   │   └── ticket-activity-tab.tsx
│   │   │
│   │   ├── onboarding/                        ✅ Onboarding wizard steps
│   │   │   ├── step-pm-details.tsx
│   │   │   ├── step-properties.tsx
│   │   │   ├── step-tenants.tsx
│   │   │   ├── step-contractors.tsx
│   │   │   ├── step-landlords.tsx
│   │   │   ├── csv-upload.tsx
│   │   │   ├── editable-table.tsx
│   │   │   └── progress-bar.tsx
│   │   │
│   │   └── ui/                                ✅ shadcn/ui primitives
│   │       ├── button.tsx
│   │       ├── input.tsx
│   │       ├── textarea.tsx
│   │       ├── select.tsx
│   │       ├── dialog.tsx
│   │       ├── sheet.tsx
│   │       ├── table.tsx
│   │       ├── tooltip.tsx
│   │       ├── badge.tsx
│   │       ├── card.tsx
│   │       ├── popover.tsx
│   │       ├── dropdown-menu.tsx
│   │       ├── avatar.tsx
│   │       ├── tabs.tsx
│   │       ├── switch.tsx
│   │       ├── separator.tsx
│   │       ├── calendar.tsx
│   │       ├── command.tsx
│   │       ├── combobox.tsx
│   │       ├── multi-combobox.tsx
│   │       └── interactive-hover-button.tsx   Animated CTA button (Yarro blue sweep)
│   │
│   ├── contexts/
│   │   ├── pm-context.tsx                     🔴 RED — auth state, never touch
│   │   └── date-range-context.tsx             ⚠️ YELLOW — date range state for filters
│   │
│   ├── hooks/
│   │   ├── use-edit-mode.ts                   ⚠️ YELLOW — edit/create mode hook
│   │   └── use-ticket-detail.ts               ⚠️ YELLOW — ticket detail state hook
│   │
│   ├── lib/
│   │   ├── utils.ts                           ✅ cn() helper for class merging
│   │   ├── typography.ts                      ✅ Typography scale constants
│   │   ├── constants.ts                       ⚠️ YELLOW — must match DB values
│   │   ├── normalize.ts                       ✅ Phone/address formatting
│   │   ├── validate.ts                        ✅ Input validation
│   │   ├── postcode.ts                        ✅ UK postcode utilities
│   │   └── supabase/                          🔴 RED — never touch
│   │       ├── client.ts
│   │       ├── server.ts
│   │       └── middleware.ts
│   │
│   ├── styles/
│   │   └── spacing.ts                         ✅ Spacing scale constants
│   │
│   ├── proxy.ts                               🔴 RED — auth session management
│   │
│   └── types/
│       └── database.ts                        🔴 RED — auto-generated Supabase types
│
├── supabase/                                  🔴 RED — never include in prompts
│   ├── config.toml
│   └── functions/                             🔴 RED — Deno edge functions
│       ├── _shared/
│       ├── yarro-tenant-intake/
│       ├── yarro-ticket-notify/
│       ├── yarro-dispatcher/
│       ├── yarro-scheduling/
│       ├── yarro-completion/
│       ├── yarro-followups/
│       ├── yarro-job-reminder/
│       ├── yarro-ooh-escalation/
│       ├── yarro-outbound-monitor/
│       └── yarro-alto-import/
│
├── .github/                                   🔴 RED — CI/CD
├── .env.local                                 🔴 RED — environment variables
├── next.config.ts                             Framework config
├── tsconfig.json                              TypeScript strict mode
├── package.json                               ⚠️ YELLOW — ask Faraaz before adding deps
└── public/                                    ✅ Static assets
```

---

## Zone Summary

| Zone | Paths | Rule |
|------|-------|------|
| ✅ GREEN | `src/app/(dashboard)/`, `src/components/` (non-auth), `src/lib/utils.ts`, `src/lib/normalize.ts`, `src/lib/validate.ts`, `src/styles/`, `public/` | Edit freely |
| ⚠️ YELLOW | `src/app/globals.css`, `src/app/(dashboard)/layout.tsx`, `src/components/sidebar.tsx`, `src/hooks/`, `src/lib/constants.ts`, `src/contexts/date-range-context.tsx`, `package.json` | Flag to Faraaz first |
| 🔴 RED | `supabase/`, `.github/`, `src/proxy.ts`, `src/contexts/pm-context.tsx`, `src/lib/supabase/`, `src/types/database.ts`, `.env.local`, `supabase/config.toml` | Never include in prompts, never modify |
