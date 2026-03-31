# Backlog

Items captured during sessions that are not today's task.
Review each morning when writing the day's PRD.

## Rules
- If Adam starts a session with "backlog", treat everything that follows as backlog entries. Don't ask for confirmation — just add them.

## Format
- [date] [brief description] [priority: high/medium/low]

## Items

<!-- Add items below this line -->
- [2026-03-31] Bulk CSV upload doesn't dismiss tenant onboarding overlay — navigating to /import while onboarding overlay is active leaves the overlay mounted. Need to gate the overlay off when navigating away or use a layout-level state [priority: high]
- [2026-03-31] Tenant verification onboarding — build WhatsApp/email verification message templates + send flow. "Verify contact details" button on tenant summary card is currently a dead end [priority: high]
- [2026-03-27] Dashboard compliance summary card — aggregate expiring/expired certs across all properties, new card on main dashboard [priority: high]
- [2026-03-27] Phase 1 sign-off — run full done checklist, verify compliance end-to-end, mark Phase 1 complete in hmo-pivot-plan.md [priority: high]
- [2026-03-28] Build context compression save hook [priority: high]
- [2026-03-28] Build completion notification hooks [priority: medium]
- [2026-03-27] Remove alternate themes — strip Yarro Blue and Dark mode, light mode only, remove theme toggle and ThemeProvider [priority: low]
- [2026-03-27] Property detail page UI fixes — fix auto-approval section display bugs, add page shell, clearer section dividers between property details and compliance, make page scrollable [priority: medium]
- [2026-03-27] Compliance detail page — clickable compliance items open a detail page per certificate, support document upload (Supabase Storage), export functionality [priority: high]
- [2026-03-27] Properties page compliance column — refine column badges/counters, improve "all compliant" state display [priority: medium]
- [2026-03-27] CLAUDE.md branch cleanup commands — add branch delete commands after merge and rollback note to Branch Commands section [priority: low]
- [2026-03-27] Add Compliance page to sidebar — new top-level nav item for compliance overview across all properties [priority: high]
- [2026-03-27] Global search bar — replace current search with app-wide search across properties, tenants, tickets, compliance items [priority: medium]
- [2026-03-27] Migrate compliance CRUD to RPCs — move insert/update/delete from property-compliance-section.tsx to Supabase RPCs (backend-first rule) [priority: high]
- [2026-03-27] Migrate certificate status computation to RPC — replace client-side computeCertificateStatus with DB-level status, return expiring/expired counts from RPC [priority: high]
- [2026-03-27] Migrate dashboard compliance summary to RPC — replace direct query + client-side aggregation with a single RPC returning expired/expiring/valid counts [priority: high]
- [2026-03-27] UI warmth pass — soften corporate feel, friendlier tone/copy, approachable styling for landlords and smaller agencies (aligned with new ICP) [priority: medium]
- [2026-03-27] Repo cleanup — prune stale branches (local + remote), tidy GitHub repo settings/description [priority: low]
- [2026-03-28] Warning/error system for Adam — surface build errors, RPC failures, compliance alerts, and system warnings in a unified notification/alert system in the dashboard [priority: medium]
- [2026-03-28] Dashboard colour cohesion pass — warm bg clashes with Yarro blue; try warmer blue for branding OR colder bg; green/yellow bg tones could complement the blue better [priority: medium]
- [2026-03-28] Global search bugs — can't trigger full site-wide search, clicking results doesn't navigate properly; needs full diagnosis [priority: high]
- [2026-03-29] Ghost button component — no bg, Yarro blue border, for use across create/action flows. New Button variant in shadcn/ui [priority: medium]
- [2026-03-29] AI intake handoff visibility — when WhatsApp AI can't handle a ticket automatically and hands off to manual, surface WHY it couldn't handle it (no contractor available? couldn't categorise? confidence too low?). PM needs to see the reason so they can fix the gap. [priority: high]
- [2026-03-29] Category mismatch warning is too strict — warns even when contractor has a matching category (e.g. ticket "Plumbing" vs contractor categories ["General", "Plumbing", "Electrical"]). Should check if ANY contractor category matches, not exact string match. [priority: high]
- [2026-03-29] Access details in ticket form should auto-fill from property record when a property is selected, and be read-only — prevents PM entering wrong access details. [priority: medium]
- [2026-03-29] Audit trail event ordering bug — CONTRACTOR_ASSIGNED timestamp comes before ISSUE_CREATED on the same ticket. Events should be logged in causal order (created → assigned → dispatched). [priority: high]
- [2026-03-29] Dashboard real-time updates — auto-refresh dashboard data when tickets/events change instead of requiring manual page refresh. Use Supabase Realtime subscriptions or short polling. [priority: medium]
- [2026-03-29] Compliance card rethink — current % + "all valid" is misleading (80% with missing cert still shows green/all valid). Green should ONLY appear when there are zero action items. Need a proper status model: expired → must renew, expiring → schedule renewal, missing → obtain cert. Once a renewal is scheduled (e.g. contractor assigned, date booked), it can go amber/in-progress instead of red. Card should surface actionable next steps, not just a %. Needs product design thinking. [priority: high]
- [2026-03-29] SSO / social sign-on — add Google (and potentially Apple, Microsoft) OAuth via Supabase Auth. Supabase supports this natively. Needs a full session to design the onboarding flow: sign up → create PM account → seed demo data → first dashboard experience. Goal: let prospects try Yarro from a single "Sign in with Google" click. [priority: high]
- [2026-03-29] Property profile page UI overhaul — redesign layout, sections, and styling [priority: high]
- [2026-03-29] Portal UI overhaul — redesign portal page layout and styling [priority: high]
- [2026-03-29] Landlord profile page UI overhaul — redesign layout and styling [priority: high]
- [2026-03-29] Tenant profile page UI overhaul — redesign layout and styling [priority: high]
- [2026-03-29] Audit trail UI overhaul — redesign timeline/event display and styling [priority: high]
- [2026-03-29] Properties page — remove Tenants column, update Rooms column to show occupancy (e.g. "3/5 filled") so tenant count is visible from room info [priority: medium]
- [2026-03-29] Ghost notifications on Jobs & Compliance after data wipe — pages still show notification badges/counts even though all tickets and certs have been deleted. Likely stale cache, client-side state, or queries not returning empty correctly. Diagnose and fix. [priority: high]
- [2026-03-30] Zapier CLI integration — download Zapier CLI, build custom API integration for Yarro (expose key actions/triggers to Zapier ecosystem) [priority: medium]
- [2026-03-30] Onboarding role selection — capture whether the user is a property manager or a landlord during onboarding. Use this to tailor what's shown in the app (e.g. landlords may not need contractor dispatch, PMs need multi-property views). Ties into SSO/onboarding flow design. [priority: high]
- [2026-03-30] Table scroll / page scroll fix — tenants page (and likely all table pages) has broken scroll behaviour. Table should scroll independently or page should scroll naturally. Key pre-demo UI fix. [priority: high]
- [2026-03-30] Compliance onboarding flow — focus on ONE property: pick a property → select which certs are needed → upload those certs (they may only have 1-2 to hand, option to add rest later) → complete that property's compliance in full. Then send a test reminder message (WhatsApp/email) showing what happens when a cert is about to expire. Gets them to the "aha" moment fast — see the full loop on one property before scaling to the rest. [priority: high]

### Engineering Maturity (from 2026-03-30 stability audit)
- [2026-03-30] Commit validation — install commitlint + Husky pre-commit hook to enforce conventional commits. Prevents bad commit messages from new devs. [priority: medium]
- [2026-03-30] PR template — create `.github/PULL_REQUEST_TEMPLATE.md` with What/Why/How to test/Checklist sections [priority: low]
- [2026-03-30] Branch cleanup — delete 30+ stale remote branches, set up auto-delete after merge in GitHub repo settings [priority: low]
- [2026-03-30] Structured logging in edge functions — replace raw console.log/error with JSON format + traceId per invocation. Enables filtering all logs for one WhatsApp message. [priority: medium]
- [2026-03-30] Zod input validation — replace minimal validate.ts with Zod schemas for forms that submit to Supabase. Prevents malformed data. [priority: medium]
- [2026-03-30] Security headers — add CSP, X-Frame-Options, HSTS, X-Content-Type-Options to next.config.ts [priority: medium]
- [2026-03-30] Dependabot — create `.github/dependabot.yml` for automated dependency update PRs [priority: low]
- [2026-03-30] Vitest test framework — install Vitest, add npm test script, write tests for critical RPCs (onboarding, dashboard). Add test step to CI pipeline. [priority: high]
- [2026-03-30] Source map upload to Sentry — set up SENTRY_AUTH_TOKEN, enable sourcemaps in next.config.ts for better stack traces [priority: low]
