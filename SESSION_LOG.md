# Yarro PM — Session Log

> This file provides continuity between coding sessions. Claude reads it at the start of every session to know where you left off.
>
> **How it works:** After each session, update the "Latest" entry below. When you start a new session, Claude will check "Next Session Pickup" and pick up where you left off.

---

## Latest: 2026-04-01 — Sidebar Badge Bug Fix

### Summary
Fixed backlog bug #1: sidebar notification badges (Jobs, Certificates) were hardcoded to always show `!` regardless of data. Made them data-driven — Jobs badge now shows count of open tickets needing PM attention (handoff or pending_review), Certificates badge shows count of expired/expiring/missing certs via the `compliance_get_all_statuses` RPC. Badges disappear when counts are zero and reset on account switch. Also added red notification dots on collapsed group headers so you can see alerts even when accordion sections are closed. Added `yarro_*` localStorage cleanup on sign out to prevent stale onboarding state leaking across accounts.

### Changes Made
- `src/components/sidebar.tsx` — replaced hardcoded `badge: true` with data-driven `badgeKey` system, added `BadgeCounts` state, added ticket + compliance queries to `fetchCounts`, added `groupHasBadge` helper + red dot on collapsed group icons
- `src/contexts/pm-context.tsx` — added `yarro_*` localStorage cleanup in `signOut()`

### Status
- [x] Build passes (portal type error is from parallel session, not this fix)
- [x] Committed and pushed to `feat/contractor-onboarding`
- [ ] Needs visual testing in browser

### Next Session Pickup
1. **Visual test** — sign in, check sidebar badges reflect real data, sign out and back in to verify cleanup
2. **Portal session** — continue from previous session log entry below (tenant v2 polish, PortalShell subtitle type error)
3. **Compliance onboarding session** — separate parallel track
4. **Remaining bugs** — 8 more in backlog, next highest impact: tenant count off-by-one, ghost notifications, table scroll fix

---

## 2026-04-01 — Portal Template System + Tenant Portal v2

### Summary
Built a full portal component system from scratch: shared components (PortalShell, PortalCard, PortalBanner, InfoRows, MiniCalendar, OutcomeButton), container/presenter split for all 4 portal pages (tenant, contractor, landlord, OOH), shared types and utils, dev preview route at `/portal-preview/[type]` with state variant switcher. Then redesigned the tenant portal per PRD: two-column layout with navy identity card (bg-sidebar) + white tabbed content card (Details/Updates/Contact). Semantic tokens adopted across all portal components (bg-card, border-border, text-foreground etc.).

### Changes Made
- `src/components/portal/` — 10 new files: portal-shell, portal-card, portal-banner, info-rows, mini-calendar, outcome-button, tenant-portal, landlord-portal, ooh-portal, contractor-portal, tenant-portal-v2
- `src/lib/portal-types.ts` — all portal ticket types + new TenantPortalData + PortalActivityEntry
- `src/lib/portal-utils.ts` — shared formatters (formatDate, formatPhone, formatScheduledSlot, etc.)
- `src/lib/portal-mock-data.ts` — realistic UK mock data with state variants for all portal types + v2 tenant mocks
- `src/app/(dashboard)/portal-preview/[type]/page.tsx` — dev preview route with type switcher + variant dropdown
- `src/app/tenant/[token]/page.tsx` — refactored to thin container
- `src/app/landlord/[token]/page.tsx` — refactored to thin container
- `src/app/ooh/[token]/page.tsx` — refactored to thin container
- `src/app/contractor/[token]/page.tsx` — refactored to thin container

### Status
- [x] Build passes
- [x] Preview route works for all 4 portal types
- [x] Tenant v2 two-column layout built
- [ ] Not yet committed
- [ ] Not yet tested in browser (need visual review)

### Next Session Pickup
1. **Visual review** — run `npm run dev`, visit `/portal-preview/tenant`, check all 4 variants look correct (navy card, tracker, tabs, availability editor)
2. **Polish** — adjust spacing/colours based on visual review, compare to PRD spec
3. **Commit** — all portal template work is on `feat/portal-template` branch, uncommitted
4. **Plan file** — `.claude/plans/woolly-riding-rainbow.md` has the tenant v2 PRD implementation plan
5. **After tenant is polished** — consider applying similar two-column treatment to other portal types
6. **Broader context** — portal refactor is Slice A in the build order (see `project_workflow_audit_20260401.md`)

---

## 2026-04-01 — Workflow Audit & Build Order Planning

### Summary
Full audit of all core workflows (WhatsApp flows, reminders/cron, dashboard data flow). Mapped what's complete vs broken vs missing. Identified 7 buildable slices prioritized for operational readiness. Portal refactor (feat/contractor-onboarding) must ship first — 4 portal pages rewritten into shared components. Twilio templates for entity verification need submitting ASAP (days to approve).

### Changes Made
- `.claude/plans/nested-tinkering-sunset.md` — full workflow audit plan with 7 slices
- `.claude/tasks/2026-03-31-onboarding-account-property.md` — marked Complete (was In Progress)
- `.claude/tasks/journey-operator-onboarding.md` — Slice 2 marked Shipped

### Status
- [x] Audit complete
- [x] Build order agreed
- [ ] No code changes — planning session only

### Next Session Pickup
1. **Ship portal refactor** — merge `feat/contractor-onboarding` branch (4 portal pages rewritten into shared components in `src/components/portal/`)
2. **Submit Twilio templates** for entity verification messages (long lead time)
3. **Regression test (Slice E)** — 1hr time-box, test portal changes + core flows
4. **Dashboard to-do wiring (Slice C)** — route compliance/rent/tenancy items by source_type
5. Full build order in memory: `project_workflow_audit_20260401.md`
6. Plan details: `.claude/plans/nested-tinkering-sunset.md`

---

## 2026-04-01 — Simplified Demo Walkthrough + Cleanup

### Summary
Simplified the demo flow to video+copy cards only. Removed all seeded demo data, edge function (yarro-demo-notify), issue picker, interactive WhatsApp approval experiment. Final flow: account card → confetti welcome → 5-page video walkthrough → "You're ready to go" → dashboard with Getting Started. Set up GitHub Actions auto-deploy for edge functions. Fixed stale property data from old accounts.

### Changes Made
- `src/components/onboarding/demo-walkthrough.tsx` — 5 benefit-driven pages: tenant reports, contractors assigned, access coordinated, photo-verified completion, audit trail. Video placeholders on left, copy on right. No progress dots, flush video, spacious layout.
- `src/components/onboarding/onboarding-flow.tsx` — removed seed RPC call, removed supabase client import. Clean: account → welcome → demo → ready → done.
- Deleted `src/components/onboarding/demo-issues.ts` — issue picker removed
- Deleted `supabase/functions/yarro-demo-notify/` — WhatsApp demo sends removed
- `supabase/migrations/20260401000000_demo_seed.sql` — removed demo cleanup from onboarding_create_property, removed is_demo filters from checklist RPC
- `supabase/config.toml` — removed yarro-demo-notify entry
- `src/app/(dashboard)/page.tsx` — task counter matches visible items only
- `public/demos/demo-tenant-reports.mp4` — first demo video added
- Set up GitHub Actions secrets for auto edge function deploy
- `docs/stability/postmortem-demo-notify-500.md` — post-mortem from edge function debugging

### Status
- [x] Build passes
- [x] Committed and pushed
- [x] RPCs deployed to Supabase (clean versions without is_demo filters)
- [x] Edge function auto-deploy working via GitHub Actions

### Next Session Pickup
1. **Contractor onboarding** — same first-visit pattern as tenant onboarding for `/contractors` page
2. **Record remaining demo videos** — 4 more needed for walkthrough pages 2-5
3. **Test full flow end-to-end** on Vercel production
4. Compliance onboarding after contractors
5. `is_demo` columns still exist on 4 tables (harmless, DEFAULT false) — clean up later if desired
6. `onboarding_seed_demo` RPC dropped from Supabase but migration file still references it — cosmetic only

---

## 2026-03-31 — Demo-First Onboarding + Edge Function + Full Flow Rework

### Summary
Major rework of the onboarding flow to "demo first, setup after." New flow: sign up → account card (name, contact method, contact detail, role) → confetti welcome → 5-page split-screen demo walkthrough → dashboard with Getting Started. Built `yarro-demo-notify` edge function for real WhatsApp sends during demo. Created `onboarding_seed_demo` RPC that creates demo property/tenants/contractor/ticket. Added `is_demo` flag to 4 tables. Fixed multiple loop bugs in the onboarding routing. Getting Started now shows only "Add your property" until a real property exists.

### Changes Made
- `src/components/onboarding/account-card.tsx` — reworked: name → contact method → contact detail (phone OR email) → role
- `src/components/onboarding/onboarding-flow.tsx` — new flow: account → welcome → demo → done. Synchronous demo_seen check, render null for done state
- `src/components/onboarding/demo-walkthrough.tsx` — 5-page split-screen (video placeholder + bullets), WhatsApp triggers on pages 2 & 4
- `src/components/onboarding/success-card.tsx` — generic with heading/subtext/buttonLabel props
- `src/components/onboarding/tenant-onboarding.tsx` — room-by-room tenant entry with summary card
- `src/app/(dashboard)/import/page.tsx` — smart routing: no PM → onboarding, PM + demo seen → property card
- `src/app/(dashboard)/layout.tsx` — removed property count redirect, dashboard always accessible
- `src/app/(dashboard)/page.tsx` — Getting Started filters: only property item until real property exists
- `supabase/functions/yarro-demo-notify/index.ts` — NEW: sends pm_ticket + pm_auto_approved templates during demo
- `supabase/migrations/20260401000000_demo_seed.sql` — is_demo columns, seed RPC, updated checklist + property RPCs
- `supabase/migrations/20260331400000_onboarding_tenants_rpc.sql` — batch tenant creation RPC

### Status
- [x] Build passes
- [x] Committed (NOT pushed)
- [ ] Edge function deployment needs verification
- [ ] Demo seed not creating data — needs debugging
- [ ] WhatsApp sends not firing — blocked by above two issues

### Next Session Pickup — EXACT STATE
1. **Debug demo seed RPC** — `onboarding_seed_demo` exists in Supabase but isn't creating data. Run these queries to check:
   ```sql
   SELECT id FROM c1_property_managers ORDER BY created_at DESC LIMIT 1;
   -- Then with that ID:
   SELECT * FROM c1_properties WHERE property_manager_id = 'ID' AND is_demo = true;
   SELECT * FROM c1_tickets WHERE property_manager_id = 'ID' AND is_demo = true;
   ```
   If empty: the RPC is being called but failing (likely `auth.uid()` check). Check browser console for `Demo seed error:` messages. May need to remove the auth check or fix the timing.

2. **Deploy edge function** — `yarro-demo-notify` may not have deployed. Run in terminal:
   ```bash
   supabase functions deploy yarro-demo-notify
   ```
   Verify it appears in Supabase dashboard → Edge Functions.

3. **Test full flow** — delete account, sign up fresh, verify: account → confetti → demo → dashboard (no loop)

4. **After demo flow works:** Push to Vercel, then continue with contractor onboarding + compliance onboarding

5. **Backlog:** Bulk CSV overlay bug, tenant verification flow, property page polish

---

## 2026-03-31 (earlier) — Full Onboarding Flow + Category Dashboard + Tenant Onboarding

### Summary
Extended session building the complete onboarding experience. Card-based onboarding (account → property → confetti → dashboard), category-based dashboard to-dos with Getting Started glow card + spotlight, centralized onboarding state via `onboarding_completed_at` on PM record, and tenant onboarding flow (intro → room-by-room entry → summary card → dashboard). Smart greeting counts only visible tasks. Compliance/Finance categories hidden during onboarding.

### Changes Made
- `src/components/onboarding/onboarding-flow.tsx` — simplified flow: account → property → confetti → dashboard
- `src/components/onboarding/success-card.tsx` — generic confetti card with heading/subtext/buttonLabel props
- `src/components/onboarding/account-card.tsx` — auto-title-case name, updated phone placeholder
- `src/components/onboarding/property-card.tsx` — auto-title-case address, simplified onComplete
- `src/components/onboarding/tenant-onboarding.tsx` — NEW: full tenant onboarding (intro, room-by-room, summary)
- `src/components/dashboard/todo-category-card.tsx` — collapsible category card with icon, count, accordion
- `src/components/dashboard/onboarding-category-card.tsx` — Getting Started card with animated blue glow, z-50 spotlight
- `src/components/dashboard/todo-row.tsx` — extracted reusable todo row from dashboard inline rendering
- `src/app/(dashboard)/page.tsx` — category grouping, onboarding state, spotlight overlay, smart greeting count
- `src/app/(dashboard)/tenants/page.tsx` — shows tenant onboarding overlay on first visit
- `src/components/ui/input.tsx` — removed md:text-sm, inputs now 16px everywhere
- `src/components/ui/collapsible.tsx` — added via shadcn CLI
- `supabase/migrations/20260331200000_onboarding_checklist_rpc.sql` — checklist RPC with auto-completion stamp
- `supabase/migrations/20260331300000_onboarding_completed_column.sql` — onboarding_completed_at column
- `supabase/migrations/20260331400000_onboarding_tenants_rpc.sql` — batch tenant creation + updated checklist link
- Installed `canvas-confetti`, `@radix-ui/react-collapsible`

### Status
- [x] Build passes
- [x] Tested locally
- [x] Committed (NOT pushed — needs test plan completion first)
- [ ] Production deployment

### Next Session Pickup
1. **Test full flow end-to-end** — delete account, sign up, onboard, add tenants, verify dashboard
2. **Push to Vercel** once tests pass
3. **Contractor onboarding** — same pattern as tenant onboarding for contractors page first-visit
4. **Compliance onboarding** — first-visit experience on compliance tab
5. **Tenant verification flow** — build WhatsApp/email message templates (backlogged, high priority)
6. **Bulk CSV overlay bug** — tenant onboarding overlay persists when navigating to /import (backlogged, high priority)
7. Journey file: `.claude/tasks/journey-operator-onboarding.md`

---

## 2026-03-30 — Production Rollout + Scope Guard System + Journey Planning

### Summary
Major session covering three areas: (1) Rolled out 112 commits to production in two waves — Wave 1 (core HMO pivot) and Wave 2 (self-serve onboarding). All migrations confirmed applied, builds passed, deployed to Vercel. (2) Built the Scope Guard system to prevent commit pileups — `/scope` skill (journey-driven PRD builder), `/ship` skill (test-merge-push ritual), Session Discipline rules in CLAUDE.md. Replaced the old `morning-prd` skill. (3) Mapped the operator onboarding journey (landing page → useful dashboard) with 8 vertical slices ready for tomorrow.

### Changes Made
- Merged `feat/profile-pages` (112 commits) into main via `--no-ff` — tagged `pre-hmo-rollout` for rollback
- Merged `feat/self-serve-onboarding` (4 commits) into main — signup, billing, compliance wizard, trial gate
- Created `.claude/skills/scope/SKILL.md` — lean PRD builder with journey awareness, adaptive questioning
- Created `.claude/skills/scope/scope-guide.md` — reference material for vertical slice thinking
- Created `.claude/skills/ship/SKILL.md` — shipping ritual (test plan, build, merge, push, log)
- Created `.claude/templates/prd-template.md` and `journey-template.md`
- Updated `CLAUDE.md` — replaced Daily Workflow with 5 Session Discipline rules, branch-from-main strategy
- Deleted `morning-prd` skill and `task-template.md`
- Created `.claude/tasks/journey-operator-onboarding.md` — 8-slice journey from landing to useful dashboard

### Status
- [x] Build passes
- [x] Tested locally
- [x] Committed and pushed
- [x] Production deployment live on Vercel

### Next Session Pickup
1. **Run `/scope`** — journey will auto-detect. Start with **Slice 1: Landing page**
2. Journey file at `.claude/tasks/journey-operator-onboarding.md` has full detail
3. Stale stashes to clean up: `stash@{0}` through `stash@{3}` (old branches, safe to drop)
4. Untracked files on disk: 5 deleted components still on filesystem (kanban-board, kpi-card, section-header, theme-provider, theme-toggle) — can delete

---

## 2026-03-30 — API Strategy Discussion + CSV Import/Export Scaffolding

### Summary
Discussed whether building a public API or Zapier integration is worth it for Yarro's ICP. Conclusion: skip Zapier and public API for now. Instead build CSV import (onboarding), CSV/PDF export (reporting), and native Google Sheets push (ongoing sync via service account). Built the initial CSV import flow and export utilities, but the import page needs more work — Adam flagged it as not working well ("a bit dead").

### Changes Made
- Created `supabase/migrations/20260330160000_bulk_import_rpcs.sql` — `bulk_import_properties` and `bulk_import_tenants` RPCs with dedup, validation, batch tracking
- Created `src/app/(dashboard)/integrations/import/page.tsx` — multi-step CSV import flow (select type → upload → preview → import → results)
- Modified `src/app/(dashboard)/integrations/page.tsx` — added "Spreadsheet Import" card
- Created `src/lib/export.ts` — CSV export utility with pre-built column configs
- Modified `src/app/(dashboard)/properties/page.tsx` — added Export button
- Modified `src/app/(dashboard)/tenants/page.tsx` — added Export button
- Installed `papaparse` + `@types/papaparse`
- Added Zapier CLI integration idea to BACKLOG.md

### Strategy Decisions (saved in plan file)
- **No public API** — no demand from ICP, high maintenance cost
- **No Zapier** — ICP doesn't know what it is, premature
- **CSV import** — solves onboarding friction (properties + tenants from spreadsheet)
- **CSV/PDF export** — solves reporting (compliance for council, costs for accountant)
- **Google Sheets push** — operator shares sheet with Yarro service account, events auto-push rows
- Full plan at `.claude/plans/sunny-gathering-pie.md`

### Status
- [x] Build passes
- [ ] Tested locally — import page needs UX work
- [ ] Committed and pushed

### Next Session Pickup
1. **Fix CSV import page** — Adam said it's "a bit dead" / doesn't work how it should. Needs UX review, test the full flow end-to-end, likely needs visual polish and interaction fixes
2. **Deploy bulk import RPCs** — run `supabase db push` to deploy the migration
3. **Test import RPCs** — verify in Supabase SQL editor before trusting the UI
4. **Google Sheets push integration** (Days 2-3 of plan) — GCP service account setup, edge function, database trigger, settings UI
5. **Plan file** — `.claude/plans/sunny-gathering-pie.md` has the full 3-day integration strategy

---

## 2026-03-29 — Demo Test Plan Execution + Compliance Overhaul

### Summary
Started executing the integrated test plan (`.claude/tasks/2026-03-30-test-plan.md`) on `style/demo-polish` branch. Completed Phase 0 (environment check), Phase 1 (auth & nav), Phase 2 (CRUD smoke tests), and partial Phase 3 (rent flow, dashboard). Hit three compliance blockers and fixed them all — this turned into a significant compliance feature build.

**What was built:**
- **Certificate verification system** — new status flow: Missing → Review → Valid. Certs need human verification (Verify button) before showing as valid. Only appears when both expiry date AND document are present.
- **Edit certificate** — detail page now has Edit button, opens pre-filled form. Handles the RPC's delete-and-reinsert pattern by redirecting to the new cert ID.
- **Add certificate from compliance list** — Add button on compliance page with property picker dropdown. Property picker only shows when adding from list page (hidden on property detail page where property is known).
- **Review hint banner** — blue info banner on detail page tells you exactly what's missing before you can verify ("add an expiry date", "the document", or both).
- **Document deletion resets verification** — removing a doc flips cert back to Review status.
- **Dashboard compliance % tied to verification** — RPC updated to only count verified certs as "valid". Unverified certs reduce the compliance percentage. Card subtitle shows "X needs review".

### Changes Made
- Modified `src/components/certificate-form-dialog.tsx` — added `initialData`, `propertyId` props, property picker, edit mode
- Modified `src/app/(dashboard)/compliance/[id]/page.tsx` — Edit button, Verify button, review hint, doc delete resets status, redirect after edit
- Modified `src/app/(dashboard)/compliance/page.tsx` — Add button with property picker, status computation includes review/verified
- Modified `src/components/property-compliance-section.tsx` — passes `propertyId` to form dialog
- Modified `src/components/status-badge.tsx` — added `review` style (blue)
- Modified `src/app/(dashboard)/page.tsx` — compliance card accounts for review count
- Created `supabase/migrations/20260330010000_compliance_status_review.sql` — added review/verified to status constraint
- Created `supabase/migrations/20260330020000_compliance_summary_review.sql` — updated compliance_get_summary RPC
- Updated `.claude/tasks/2026-03-30-test-plan.md` — fixed `cert_type` → `certificate_type`, added review tweaks

### Test Plan Progress
- [x] Phase 0 — Environment & Data Readiness (all pass)
- [x] Phase 1 — Auth & Navigation (all pass, dark mode N/A — removed)
- [x] Phase 2 — CRUD Smoke Tests (all pass)
- [~] Phase 3 — Integrated Scenarios (Rent flow pass, Compliance blocked → fixed, Dashboard partial)
- [ ] Phase 4 — Demo Rehearsal
- [ ] Phase 5 — Visual Sweep

### Failure Log (from testing)
| Test # | Issue | Bucket | Severity | Fixed? |
|--------|-------|--------|----------|--------|
| 2.2 | Property detail shows "AdamEkubia" as landlord instead of "James Okafor" | VISUAL | M | No |
| 2.32 | Extra certs from duplicate property "7 Elm Grove / 14 medow lande" | VISUAL | M | No |
| E.2–E.6 | StatCard labels/numbers don't convey practical meaning | VISUAL | M | No |
| A.1 | No edit/verify/add for compliance certs | BLOCKER | H | Yes |

### Status
- [x] Build passes
- [x] Tested locally
- [ ] Committed and pushed

### Next Session Pickup
1. **Resume test plan at Phase 3 Scenario A** — compliance lifecycle (trigger cron, check audit trail)
2. **Phase 3 Scenarios C & D** — WhatsApp intake + manual ticket lifecycle (may skip C if Twilio not set up)
3. **Phase 4** — full 10-minute demo rehearsal
4. **Phase 5** — visual sweep + batch fix the 3 VISUAL issues logged
5. **Commit all changes** — compliance overhaul + test plan fixes on `style/demo-polish`
6. **Existing certs need marking as verified** — run `UPDATE c1_compliance_certificates SET status = 'verified' WHERE expiry_date IS NOT NULL;` if not done yet

---

## 2026-03-29 — Dashboard UI Redesign (PRD v3) — Halfway Point

### Summary
Major dashboard redesign session on `style/demo-polish` branch. Analysed PRD v2 against the codebase, found significant errors (wrong palette, duplicate components, hardcoded values), and rewrote as PRD v3. Then built the first half of the redesign through multiple feedback rounds with Adam.

**What was built:**
- **Rethemed** from warm stone to cool blue palette (`#F4F8FC` canvas, `#E2E8F0` borders, `#64748B` muted text)
- **Sidebar redesigned** — dark navy (`#162B45`), collapsible nested groups (Portfolio, Maintenance, Finances, Documents, Automation), per-child border-l active indicator, icons on group parents only, account avatar at bottom, starts collapsed
- **Dashboard layout** — replaced PageShell with direct layout, added 4 StatCards (needs attention, in progress, compliance, rent), replaced tabbed TodoPanel + 4 right-column cards with two equal panels (Needs Action + In Progress)
- **Header bar** — bg-secondary for contrast, search bar with hover Cmd+K, labeled Help + Feedback icons, create button far right
- **Greeting** — task-count based ("Good morning. You've got 2 tasks today.")
- **Extracted** TodoPanel to `src/components/dashboard/todo-panel.tsx`, created `StatCard` at `src/components/dashboard/stat-card.tsx`

### Changes Made
- Modified `src/app/globals.css` — cool blue palette, dark navy sidebar tokens, scrollbar colours
- Modified `src/lib/typography.ts` — added `statValue` token
- Rewritten `src/components/sidebar.tsx` — dark navy, collapsible groups, per-child active line
- Modified `src/components/dashboard-header.tsx` — labeled Help/Feedback icons, bg-secondary, h-14
- Created `src/components/dashboard/stat-card.tsx` — stat row card component
- Created `src/components/dashboard/todo-panel.tsx` — extracted from page.tsx with filter helpers
- Modified `src/app/(dashboard)/page.tsx` — replaced PageShell, added stat row, two-column Needs Action + In Progress layout, removed old right-column panels
- Created `docs/yarro-dashboard-prd-v2.md` — original PRD (preserved)
- Created `docs/yarro-dashboard-prd-v3.md` — corrected PRD with design system references

### Status
- [x] Build passes
- [x] Tested locally with Adam — iterative feedback applied
- [x] Committed and pushed to `style/demo-polish`

### Next Session Pickup
1. **Continue dashboard polish** — Adam had more feedback items queued. This is the halfway point.
2. **Other pages** may need checking with new cool blue palette (properties, tickets, compliance, tenants, forms)
3. **Page-by-page design system migration** — raw typography/spacing/colors still need converting to tokens across the app
4. **Demo prep** — full demo flow rehearsal once UI is polished

---

## 2026-03-28 — UI Redesign: Warm Palette + Global Header

### Summary
Major UI overhaul on `style/demo-polish` branch. Two phases completed:

**Phase A — Warm Palette (complete):** Swapped cold zinc palette to warm stone tones (GoCardless-inspired). Removed dark/blue themes entirely, deleted ThemeProvider + theme-toggle, uninstalled next-themes. Updated all shadcn primitives (card rounded-2xl no shadow, button rounded-lg, inputs rounded-lg, tooltip semantic tokens). Stripped all `dark:` classes from 22+ files. Added `--info` semantic token. Increased base radius to 0.625rem.

**Phase B — Global Header + Cleanup (complete):** Added `DashboardHeader` component with Cmd+K command palette and `+` create dropdown. Wired into dashboard layout. Removed CTA pill button variant. Deleted 5 stale components. Added `?create=true` handling on 4 list pages.

### Status
- [x] Build passes
- [x] Committed and pushed

---

## 2026-03-28 — Twilio Rent Reminder Templates

### Summary
Drafted copy for 3 rent reminder WhatsApp templates (before, due, overdue). Adam created 2 of 3 in Twilio Console. Replaced placeholder SIDs for `rent_reminder_before` and `rent_reminder_overdue` in `templates.ts`. Added full Section 10 (Rent Reminders) to `TEMPLATES.md` with all 3 entries documented. `rent_reminder_due` still has a placeholder SID — awaiting Twilio creation.

### Changes Made
- Modified `supabase/functions/_shared/templates.ts` — replaced 2 of 3 placeholder SIDs with real Twilio Content Template SIDs
- Modified `supabase/functions/_shared/TEMPLATES.md` — added Section 10 (Rent Reminders) with all 3 template entries

### Status
- [x] Build passes
- [x] Committed and pushed to `style/demo-polish`

### Adam's Pending Task
Create `rent_reminder_due` template in Twilio Console and replace the last PLACEHOLDER SID in `templates.ts`.
Then redeploy: `supabase functions deploy yarro-rent-reminder`

### Next Session Pickup
1. Replace last placeholder SID (`rent_reminder_due`) when Adam creates it in Twilio
2. Redeploy `yarro-rent-reminder` edge function after all 3 SIDs are live
3. Day 10: QA + demo prep — full demo flow rehearsal
4. Final polish before demo deadline (~11 April 2026)

---

## 2026-03-28 — Rent Reminder Cron + Compliance Cron Cleanup

### Summary
Confirmed compliance reminder cron was already deployed (migration just untracked in git — committed it). Then built the rent reminder cron: renamed `c1_log_compliance_event` → `c1_log_system_event` for reuse across ticket-less events, created `get_rent_reminders_due()` RPC with 3-window UNION query (3 days before, due date, 3 days overdue), built `yarro-rent-reminder` edge function with placeholder guard for missing Twilio templates, and registered `pg_cron` job at 09:00 UTC. All deployed and merged to `feat/hmo-compliance`.

### Changes Made
- Committed `supabase/migrations/20260329120000_compliance_reminder_cron.sql` (was applied but untracked)
- Created `supabase/migrations/20260329140000_rename_log_system_event.sql` — rename generic event logger
- Created `supabase/migrations/20260329150000_rent_reminder_rpc.sql` — `get_rent_reminders_due()` RPC
- Created `supabase/migrations/20260329160000_rent_reminder_cron.sql` — pg_cron at 09:00 UTC
- Created `supabase/functions/yarro-rent-reminder/index.ts` — edge function with placeholder guard
- Modified `supabase/functions/_shared/templates.ts` — 3 placeholder rent reminder SIDs
- Modified `supabase/functions/yarro-compliance-reminder/index.ts` — updated to use renamed `c1_log_system_event`

### Status
- [x] Build passes
- [x] Tested locally
- [x] Migrations applied to remote
- [x] Edge functions deployed (yarro-rent-reminder + yarro-compliance-reminder)
- [x] Cron jobs verified (compliance 08:00 UTC, rent 09:00 UTC)
- [x] Committed and pushed to `feat/hmo-compliance`

### Next Session Pickup
1. Day 10: QA + demo prep — full demo flow rehearsal
2. Create Twilio rent reminder templates (Adam task)
3. Final polish before demo deadline (~11 April 2026)

---

## 2026-03-28 — Rent Tracking (Days 8-9)

### Summary
Built room-level rent tracking for HMO properties. Created `c1_rent_ledger` table with RLS, `ON DELETE RESTRICT` to protect financial records, and unique constraint on `(room_id, due_date)` for idempotent generation. Built 3 RPCs: `create_rent_ledger_entries` (idempotent via ON CONFLICT DO NOTHING), `get_rent_summary_for_property` (pure read with derived `effective_status` — no write side-effects), and `mark_rent_paid` (ownership check, partial/full detection). Built `PropertyRentSection` component with month navigation, generate button, summary stats, status badges (paid/overdue/pending/partial/vacant), and "Mark Paid" action. Built `RentPaymentDialog` with pre-filled amount, payment method select, and notes. Wired into property detail page after Rooms section.

### Changes Made
- Created `supabase/migrations/20260329100000_rent_ledger.sql` — c1_rent_ledger table, RLS, indexes, grants, trigger
- Created `supabase/migrations/20260329110000_rent_rpcs.sql` — 3 RPCs (create_rent_ledger_entries, get_rent_summary_for_property, mark_rent_paid)
- Created `src/components/property-rent-section.tsx` — rent section with month nav, generate, table, status badges
- Created `src/components/rent-payment-dialog.tsx` — payment recording dialog
- Modified `src/app/(dashboard)/properties/[id]/page.tsx` — added PropertyRentSection after Rooms
- Regenerated `src/types/database.ts`

### Status
- [x] Build passes
- [x] Tested locally
- [x] Migrations applied to remote
- [x] Committed and pushed to `feat/hmo-compliance`

### Next Session Pickup
1. Set up compliance-reminder cron (Days 6-7) — daily at 08:00 UTC
2. Dashboard rent card — portfolio-wide paid/outstanding/overdue for current month
3. Day 10: QA + demo prep — full demo flow rehearsal

---

## 2026-03-28 — WhatsApp Room Awareness + Demo Seed (Day 5)

### Summary
Seeded demo data (1 HMO property at 14 Brixton Hill, 5 rooms, 4 tenants, 5 compliance certs with mixed statuses). Fixed property detail page layout — sections were overlapping due to flex overflow constraints. Then built Day 5: WhatsApp room awareness. Extended c1_context_logic to return room data for known tenants, extended c1_create_ticket to auto-populate room_id from tenant's current room assignment (with INNER JOIN to prevent FK violations on stale room_ids), and threaded room context through the edge function to GPT-4o's user prompt. Live WhatsApp test confirmed: ticket created with room_id populated correctly.

### Changes Made
- Created `supabase/seed-demo-data.sql` — demo seed script for SQL editor
- Created `supabase/migrations/20260329000000_whatsapp_room_awareness.sql` — full CREATE OR REPLACE for c1_context_logic (room lookup + return) and c1_create_ticket (room_id in INSERT)
- Modified `supabase/functions/yarro-tenant-intake/prompts.ts` — extended ContextForPrompt + MessageContext interfaces, added room to buildUserPrompt
- Modified `supabase/functions/yarro-tenant-intake/index.ts` — pass ctx.room to both prompt builders
- Modified `src/app/(dashboard)/properties/[id]/page.tsx` — fixed overflow-hidden → overflow-y-auto, removed flex-1 min-h-0 from view-mode wrapper

### Status
- [x] Build passes
- [x] Tested locally
- [x] Migration applied to remote
- [x] Edge function deployed
- [x] Live WhatsApp test passed (room_id on ticket confirmed)
- [x] Committed and pushed to `feat/hmo-compliance`

### Next Session Pickup
1. Days 8-9: Rent tracking — c1_rent_ledger table, per-room rent config, payment logging, rent summary UI
2. Set up cron schedule for compliance-reminder (daily at 08:00 UTC)
3. Day 10: QA + demo prep

---

## 2026-03-28 — Room Layer Complete (Phase 2, Days 1-4)

### Summary
Built the full room layer for HMO support. Created c1_rooms table with generated is_vacant column, 5 RPCs (get, upsert, delete, assign_tenant, remove_tenant) with row locking and dual-sync between c1_rooms.current_tenant_id and c1_tenants.room_id. Built rooms section on property detail page (table with vacancy styling, orange badges for expiring tenancies), tenant assignment dialog, rooms column on properties list, read-only room display on tenant detail, and room_number display in ticket overview. Extended v_properties_hub view with room counts. All merged into feat/hmo-compliance and pushed.

### Changes Made
- Created migration `20260328000000_add_rooms_table.sql` — c1_rooms table, RLS, indexes, updated_at trigger, room_id on tenants/tickets
- Created migration `20260328010000_room_rpcs.sql` — 5 RPCs with ownership checks, row locking, dual-sync
- Created migration `20260328020000_extend_properties_hub_rooms.sql` — room counts on v_properties_hub
- Created `src/components/property-rooms-section.tsx` — rooms table with add/edit/delete/assign/remove
- Created `src/components/room-form-dialog.tsx` — room form with validation
- Created `src/components/tenant-assign-dialog.tsx` — tenant picker with tenancy dates
- Modified `src/app/(dashboard)/properties/[id]/page.tsx` — embedded rooms section
- Modified `src/app/(dashboard)/properties/page.tsx` — rooms column (occupied/total)
- Modified `src/app/(dashboard)/tenants/[id]/page.tsx` — read-only room display
- Modified `src/hooks/use-ticket-detail.ts` — room_id + c1_rooms join
- Modified `src/components/ticket-detail/ticket-overview-tab.tsx` — room row in People section
- Regenerated `src/types/database.ts`
- Merged `feat/compliance-automation` (which included room layer + compliance automation) into `feat/hmo-compliance`

### Status
- [x] Build passes
- [x] Tested locally
- [x] Committed and pushed to `feat/hmo-compliance`
- [x] All migrations applied to remote

### Next Session Pickup
1. Seed demo data — 1 property, 5 rooms, 4 tenants assigned, 1 vacant (run in Supabase SQL editor)
2. Day 5: WhatsApp room awareness — extend c1_context_logic to return ctx.room
3. Remaining: rent tracking (Days 8-9), QA + demo prep (Day 10)
4. Days 8-9: Rent tracking (c1_rent_ledger, per-room config, payment logging)
5. Set up cron schedule for compliance-reminder (daily at 08:00 UTC)

---

## 2026-03-27 — Compliance RPC Migration, Phase 1 Sign-Off, Compliance UI Build-Out

### Summary
Full compliance session. Migrated all compliance business logic to 4 Supabase RPCs (backend-first rule). Signed off Phase 1 — all deliverables verified. Fixed Vercel build issue (module-level Supabase client in `/i/[ticketId]`). Set up Vercel preview deployment on `feat/hmo-compliance` branch. Then built out three compliance UI features: sidebar nav item, all-compliance page with searchable/sortable table, and certificate detail page with document upload via Supabase Storage (bucket + RLS policies via migration).

### Changes Made
- Created migration `20260327131027_compliance_rpcs.sql` with 4 RPCs
- Updated `property-compliance-section.tsx`, `page.tsx`, `certificate-row.tsx` to use RPCs
- Regenerated `src/types/database.ts`
- Marked Phase 1 complete in `.claude/docs/hmo-pivot-plan.md`
- Merged `refactor/compliance-rpcs` into `feat/hmo-compliance`
- Fixed `src/app/i/[ticketId]/page.tsx` — moved Supabase client inside function (Vercel build fix)
- Added Compliance to sidebar nav (`src/components/sidebar.tsx`)
- Created `/compliance` page with summary counts + data table (`src/app/(dashboard)/compliance/page.tsx`)
- Created `/compliance/[id]` detail page with doc upload (`src/app/(dashboard)/compliance/[id]/page.tsx`)
- Created migration `20260327192008_compliance_storage_policies.sql` — storage bucket + RLS policies
- Set up Vercel preview deployment for `feat/hmo-compliance` (env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

### Status
- [x] Build passes
- [x] Tested locally
- [x] Committed and pushed
- [x] Phase 1 signed off
- [x] Vercel preview deployment live

### Next Session Pickup
1. Phase 2: Room layer — start with database (c1_rooms table, room CRUD RPCs)
2. Remaining backlog: property detail page UI fixes, properties page compliance column refinement, UI warmth pass

---

## Archive

### First Session (initial setup)
Fresh workspace on the new `Yarro-AI/yarro-app` org repo. Environment being set up — no code changes made.
