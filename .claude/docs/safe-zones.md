# Safe Zones — What You Can and Can't Touch

## GREEN — Safe to Modify Freely

These files can be changed without risk of breaking core system flows.

| Path | What It Is | Notes |
|------|-----------|-------|
| `src/app/(dashboard)/*.tsx` | Dashboard pages | Main work area — tickets, properties, tenants, contractors, settings |
| `src/components/*.tsx` | UI components | Data tables, drawers, forms, badges, cards |
| `src/components/ui/*.tsx` | shadcn/ui primitives | Buttons, cards, dialogs, etc. |
| `src/components/ticket-detail/*.tsx` | Ticket detail tabs | Overview, conversation, dispatch, completion, activity |
| `src/components/onboarding/*.tsx` | Onboarding wizard steps | Account, property, success cards |
| `src/components/dashboard/*.tsx` | Dashboard display components | Todo cards, onboarding checklist cards |
| `src/lib/normalize.ts` | Phone/address formatting | Pure utility functions |
| `src/lib/validate.ts` | Input validation | Pure utility functions |
| `src/lib/postcode.ts` | UK postcode utilities | Pure utility functions |
| `src/lib/export.ts` | CSV export logic | Pure utility functions |
| `src/lib/reason-display.ts` | REASON_DISPLAY mapping | Pure display text — safe to modify labels. Adding/removing keys must match CHECK constraint. |
| `src/hooks/use-ticket-detail.ts` | Ticket detail hook | After refactor: 1 RPC + 1 events query. Simple data fetching. |
| `docs/`, `.claude/docs/` | Documentation | No code impact |
| `public/` | Static assets | Images, icons, favicon |
| `.github/workflows/ci.yml` | CI lint+test+build checks | Safe to modify — only runs on PRs |
| `vitest.config.ts` | Vitest test config | Path alias config for `@/*` |
| `src/lib/__tests__/` | Unit tests (Vitest) | Add tests here for any `src/lib/` utility |

## YELLOW — Proceed with Caution

Read the file thoroughly before modifying. Understand the existing pattern. Test after changes.

| Path | What It Is | Why Caution |
|------|-----------|-------------|
| `src/app/(dashboard)/page.tsx` | Dashboard data fetching | 9 queries in `Promise.all` with try/catch. Adding a new query must follow the pattern. |
| `src/app/(dashboard)/layout.tsx` | Dashboard layout | Auth guards, onboarding redirect, trial expiry check — ordering matters |
| `src/hooks/use-ticket-detail.ts` | Ticket data fetching | 600+ lines, 5-7 parallel queries, tightly coupled to DB schema |
| `src/hooks/use-edit-mode.ts` | Edit/save state | Used by multiple components — changes ripple |
| `src/lib/constants.ts` | Category and priority values | Values MUST match database exactly (case-sensitive) |
| `src/contexts/date-range-context.tsx` | Date filter state | Shared across all dashboard pages |
| `src/components/sidebar.tsx` | Navigation sidebar | Minor text/icon changes OK, structural changes need testing |
| `src/app/globals.css` | Theme CSS variables | Affects entire app appearance |
| `package.json` | Dependencies | New packages affect bundle size and build |
| `supabase/migrations/` (new files) | Database migrations | Check `supabase/core-rpcs/README.md` FIRST. Use `IF NOT EXISTS`. Test locally. |
| `src/types/database.ts` | Auto-generated types | Manual edits get overwritten. Regenerate with `supabase gen types typescript`. |
| `c1_rent_payments` trigger (`trg_rent_payment_update_ledger`) | Auto-computes rent ledger totals | Modifying changes payment accounting behavior — test accumulation logic before pushing |

## RED — Hard Stop (Do Not Touch Without Approval)

A bad change here takes down WhatsApp intake, breaks tenant conversations, or corrupts data.

| Path | What It Is | Why It's Dangerous |
|------|-----------|-------------------|
| `c1_trigger_recompute_next_action` | State recompute trigger | Writes 4 fields on every state change. Breaking it breaks every ticket. |
| `c1_compute_priority_score` | Shared scoring function | Used by both RPCs. Changing scoring affects every ticket's sort order. |
| **69 Protected RPCs** | Listed in `supabase/core-rpcs/README.md` | `CREATE OR REPLACE` silently overwrites. No undo. `get_pm_id` used by 33+ RLS policies. |
| **3 Sub-routines + rent RPCs** | `compute_maintenance/compliance/rent_arrears_next_action`, `create_rent_arrears_ticket`, `record_rent_payment` | Protected. `compute_landlord/ooh_next_action` were DROPPED — logic moved into `compute_maintenance_next_action`. |
| `supabase/migrations/20260327041845_remote_schema.sql` | Core schema (72 functions) | Original production definitions of all RPCs, triggers, RLS. |
| `supabase/migrations/20260329000000_whatsapp_room_awareness.sql` | c1_context_logic + c1_create_ticket | Current production versions of the 2 most critical RPCs. |
| `supabase/functions/yarro-tenant-intake/` | WhatsApp intake state machine | AI + Twilio + RPCs. Load-bearing phrases in `prompts.ts` — backend parses exact emoji + phrases. See `.claude/docs/hmo-pivot-plan.md` Section 10 for the full list. See AD-8. |
| `supabase/functions/yarro-ticket-notify/` | SMS notification dispatch | PM, tenant, landlord, contractor notifications |
| `supabase/functions/yarro-dispatcher/` | Contractor dispatch | SMS sending + mark_sent tracking |
| `supabase/functions/_shared/twilio.ts` | SMS send + retry logic | Used by all edge functions. See AD-6. |
| `supabase/functions/_shared/telegram.ts` | Error alerting | Used by all edge functions. Only monitoring channel. |
| `src/contexts/pm-context.tsx` | Auth state provider | Two-layer pattern (AD-1). Race-condition fixes for Supabase issue #35754. |
| `src/lib/supabase/middleware.ts` | Auth middleware | Uses `getUser()` deliberately (AD-2). Security boundary. |
| `src/lib/supabase/client.ts`, `server.ts` | Supabase client setup | Session management, cookie refresh |
| `src/proxy.ts` | Request proxy | Routes to middleware for session refresh |
| `supabase/config.toml` | Edge function config | `verify_jwt = false` is intentional (AD-4) |
| `.env.local` | Environment variables | Keys and config. Never commit. |
| `.github/workflows/deploy-functions.yml` | Edge function deploy | Auto-deploys on push to main — don't break the trigger |

## Rule of Thumb

- If the file is about **how things look** → probably Green
- If the file is about **how data flows** → probably Yellow
- If the file is about **auth, backend, or infrastructure** → definitely Red
- When in doubt: check `docs/stability/architecture-decisions.md` for the reasoning behind each design choice
