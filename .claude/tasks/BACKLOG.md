# Backlog

Items captured during sessions that are not today's task.
Review each morning when writing the day's PRD.

## Rules
- If Adam starts a session with "backlog", treat everything that follows as backlog entries. Don't ask for confirmation — just add them.

## Format
- [date] [brief description] [priority: high/medium/low]

## Items

<!-- Add items below this line -->
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
