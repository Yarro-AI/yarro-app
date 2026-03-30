## PRD: Onboarding — Account + Property Cards
**Date:** 2026-03-31
**Branch:** feat/onboarding-cards
**Status:** In Progress
**Journey:** Operator Onboarding — Slice 2 of 8
**Scope:** New user signs up → card-based flow to set up account details and first property. Replaces existing /import wizard.

### Goal
Replace the existing multi-step onboarding wizard with a focused card-based flow. After signup, the user fills in two cards — account details then property setup — and their data is stored via RPCs. This is the foundation that the tenant/room cards (slice 3) will build on.

### User Story
As a new HMO operator, I want to set up my account and first property quickly after signing up, so that I can start managing my rooms and tenants.

### Technical Plan

**1. Create RPCs (migration)**
- `onboarding_create_account(name, email, whatsapp, preferred_contact, business_name, role)` — inserts into `c1_property_managers`, sets `subscription_status = 'trialing'`, `trial_starts_at = now()`, `trial_ends_at = now() + 14 days`. Returns the PM record.
- `onboarding_create_property(pm_id, address, city, postcode, room_count, property_type)` — inserts into `c1_properties`, auto-creates `room_count` rows in `c1_rooms` (numbered Room 1, Room 2, etc.), inserts default compliance requirements based on `property_type`. Returns the property record.

**2. Regenerate types**
`supabase gen types typescript --project-id qedsceehrrvohsjmbodc > src/types/database.ts`

**3. Build the card-based onboarding UI**
- New component: `src/components/onboarding/onboarding-flow.tsx` — manages card state (account → property → done placeholder)
- New component: `src/components/onboarding/account-card.tsx` — fields: full name, email (pre-filled from auth), WhatsApp number, preferred contact method (WhatsApp/email/phone), business name (optional), role (owner/manager)
- New component: `src/components/onboarding/property-card.tsx` — fields: postcode (triggers address autofill), address (auto-populated, editable), city (auto-populated), room count (number input), property type (HMO/single-let selector)
- Postcode lookup: use existing pattern or `api.postcodes.io` for free UK postcode → address lookup

**4. Wire into the existing route**
- Replace the wizard at `/import` (`src/app/(dashboard)/import/page.tsx`) with the new card flow
- Keep the existing routing: signup → login redirect → `/import` → new card flow
- After property card: show a "Next" placeholder (dead end for now, will connect to tenant cards in slice 3)

**5. Delete dead code**
- Remove old wizard steps that are replaced (PM details step, properties step)
- Keep landlord, tenant, contractor steps for now (they'll be replaced in later slices)

### Acceptance Criteria
- [ ] New user signup → redirected to `/import` → sees account card (not old wizard)
- [ ] Account card: all fields present, email pre-filled from auth session
- [ ] Account card submit → PM record created in `c1_property_managers` with correct trial dates
- [ ] Property card: postcode input auto-populates address and city
- [ ] Property card submit → property created in `c1_properties`, N rooms created in `c1_rooms`, compliance requirements seeded based on property type
- [ ] Data persists on page refresh — navigate to dashboard, property shows in properties list
- [ ] Cards flow logically: account → property → placeholder "next step coming soon"
- [ ] Existing users (already have PM record) are NOT affected — they go straight to dashboard

### Test Plan
| # | Step | Expected Result | Pass? |
|---|------|-----------------|-------|
| 1 | Sign up with a new email (incognito) | Redirected to `/import` after email confirmation | |
| 2 | See account card | Card shows with name, email (pre-filled), WhatsApp, contact method, business name, role fields | |
| 3 | Fill in account details, click Next | Card transitions to property card. Check `c1_property_managers` — new row with `subscription_status = 'trialing'` | |
| 4 | Enter postcode (e.g. "SW2 1AA") | Address and city auto-populate | |
| 5 | Set room count to 5, type to HMO, submit | Check `c1_properties` — new row. Check `c1_rooms` — 5 rows (Room 1–5). Check `c1_compliance_requirements` — 9 HMO requirements seeded | |
| 6 | See placeholder "next step" screen | Shows message indicating tenant setup is coming next | |
| 7 | Navigate to `/properties` | New property visible in the list with 5 rooms showing "0/5" occupied | |
| 8 | Log in as existing user (Adam's account) | Goes straight to dashboard, does NOT see onboarding flow | |
| 9 | `npm run build` | Zero errors | |

### Out of Scope
- Tenant creation / room linking (slice 3)
- Tenant verification messages (slice 4)
- Success screen / confetti (slice 5)
- Landlord setup during onboarding (removed from journey)
- Contractor setup (slice 6)
- Landing page (deferred to website/marketing journey)

### Constraints
- Do NOT modify `src/contexts/pm-context.tsx` (caution zone — auth race condition fixes)
- Do NOT modify `src/proxy.ts` or `src/lib/supabase/` (auth layer)
- Check `supabase/core-rpcs/README.md` before naming new RPCs — avoid collisions
- Use `api.postcodes.io` or similar free service for postcode lookup (no API key needed)
- Follow card styling from `.claude/docs/patterns.md` and frontend-design skill

### Done When
- [ ] All acceptance criteria pass
- [ ] Test plan passes
- [ ] `npm run build` passes
- [ ] Committed, merged to main, pushed
- [ ] SESSION_LOG.md updated
- [ ] Journey file updated (slice 2 marked complete)
