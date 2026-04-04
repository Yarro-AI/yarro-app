# Architecture Decisions

Deliberate design choices in the Yarro codebase. Each exists for a specific reason — usually a real-world bug, security requirement, or third-party constraint. Changing any of these without understanding the reason will break things.

---

## AD-1: Two-Layer Auth Pattern

**File:** `src/contexts/pm-context.tsx`

**Decision:** Auth state is split into two layers:
- Layer 1: `authUser` — from Supabase session cookies (no network call)
- Layer 2: `propertyManager` — fetched separately via useEffect when `userId` changes

**Why:** Supabase GitHub issue #35754. If `onAuthStateChange` callbacks make async Supabase calls, the entire auth system can hang indefinitely. Faraaz hit this in production.

**Rules:**
- The `onAuthStateChange` callback (line ~89) must NEVER be async
- The callback must NEVER make Supabase calls (no `.from()`, no `.rpc()`, no `.auth.getUser()`)
- Use `getSession()` (reads cookies, no network) not `getUser()` (hits server, can hang) in the visibility handler

---

## AD-2: Middleware Uses `getUser()`, Not `getSession()`

**File:** `src/lib/supabase/middleware.ts:27`

**Decision:** Middleware calls `supabase.auth.getUser()` on every request.

**Why:** `getUser()` validates the JWT with the Supabase server AND refreshes expired tokens. `getSession()` only reads cookies without server validation. Middleware is the security boundary — it must server-validate.

**Consequence:** If Supabase is unreachable, the entire site returns errors. This is correct — the app can't function without Supabase anyway (every page fetches data from it). Do not add "fail open" logic.

---

## AD-3: Edge Functions Always Return 200

**Files:** All edge functions in `supabase/functions/`

**Decision:** Every edge function returns HTTP 200 even when internal processing fails.

**Why:** Twilio retries failed webhooks. A 500 response causes Twilio to resend the same WhatsApp message, which could create duplicate tickets, duplicate SMS, or infinite loops. Returning 200 tells Twilio "I handled it."

**Error handling instead:** All failures fire `alertTelegram()` which sends a structured message to the developer's phone with function name, error message, and context (phone number, conversation ID, etc.).

---

## AD-4: `verify_jwt = false` on Edge Functions

**File:** `supabase/config.toml`

**Decision:** JWT verification is disabled for all edge functions.

**Why:** These functions are called by:
- Supabase database triggers (no JWT)
- pg_cron scheduled jobs (no JWT)
- Internal webhooks from other edge functions (service_role_key, not user JWT)

They authenticate internally using `SERVICE_ROLE_KEY` to create admin Supabase clients. Requiring JWT would break all automated calls.

---

## AD-5: Portal Pages Skip Session Auth

**Files:** `src/lib/supabase/middleware.ts` (public routes), `src/contexts/pm-context.tsx:105-108` (visibility handler skip)

**Decision:** Routes `/contractor/[token]`, `/tenant/[token]`, `/landlord/[token]`, `/ooh/[token]` use token-based auth via RPCs, not Supabase session auth.

**Why:** External users (contractors, tenants, landlords) don't have Supabase accounts. They access the system via unique tokens embedded in SMS links. The portal RPCs (`c1_get_contractor_ticket`, `c1_get_tenant_ticket`, etc.) validate these tokens.

**The visibility handler** in pm-context.tsx explicitly skips these paths to prevent redirecting portal users to `/login`.

---

## AD-6: Twilio SMS Single-Retry with 2s Backoff

**File:** `supabase/functions/_shared/twilio.ts`

**Decision:** `sendAndLog()` retries once on 429/5xx errors with a 2-second delay.

**Why:** Twilio rate limits are common (429) and transient server errors (5xx) usually resolve on immediate retry. A single retry is sufficient — more retries risk sending duplicate messages or hitting rate limits harder.

**Pattern:** Returns `{ok, error}` object rather than throwing. Callers check `ok` and handle failure.

---

## AD-7: Two-Phase Ticket Creation (Finalize Then Create)

**File:** `supabase/functions/yarro-tenant-intake/index.ts:408-523`

**Decision:** Ticket creation is two sequential steps:
1. `c1_convo_finalize()` — closes the conversation (line 412)
2. `c1_create_ticket()` — creates the ticket (line 512)

**Why:** If ticket creation fails but the conversation stays open, the tenant could send another message that re-enters the conversation flow — creating confusion and potentially a second ticket attempt. Finalizing first ensures the conversation is cleanly closed regardless.

**Trade-off:** If step 2 fails after step 1 succeeds, the ticket is lost and the conversation can't be resumed. A Telegram alert fires for manual recovery. This is accepted as the safer failure mode.

---

## AD-8: `c1_context_logic` Is Monolithic (2,393 Lines)

**File:** Defined in `supabase/migrations/20260329000000_whatsapp_room_awareness.sql`

**Decision:** The WhatsApp conversation state machine is a single massive SQL function.

**Why:** It handles tenant identification, property matching, conversation routing, room awareness, and context assembly in one transaction. Breaking it into smaller functions would require passing complex intermediate state between them, and any failure in a sub-function would leave the conversation in an inconsistent state.

**Rule:** Do not modify this function without explicit approval. It has 9+ callers and drives the entire WhatsApp intake flow. A broken version silently breaks all tenant conversations.

---

## AD-9: Polymorphic Ticket Dispatch (Router + Sub-routines)

**Files:** `supabase/migrations/20260404400000_compute_next_action_router.sql` (router), `supabase/migrations/20260404300000_polymorphic_subroutines.sql` (5 sub-routines)

**Decision:** `c1_compute_next_action` was refactored from a 150-line monolithic function with 11 sequential IF/ELSE branches into a ~30-line router that dispatches to 5 domain-specific sub-routines.

**Why:** The monolithic function made every new ticket category (compliance, rent arrears) a risk to all existing branches. Adding compliance required scattering exceptions across other functions (`c1_contractor_timeout_check`). Rent arrears had no escalation path. Each new category would have increased the function's complexity and blast radius.

**Dispatch order:**
1. Universal states (archived, closed, on_hold) — inline in router
2. Category dispatch (`compliance_renewal` → compliance handler, `rent_arrears` → rent handler)
3. Lifecycle flags (`landlord_allocated`, `ooh_dispatched`) — flag-specific handlers
4. Simple flags (`handoff`, `pending_review`) — inline, single-state
5. Maintenance fallback — standard contractor dispatch

**Rules:**
- Never add IF/ELSE branches to the router itself — add logic to the appropriate sub-routine
- New ticket categories get a new sub-routine registered in the router
- Category dispatch runs before lifecycle flags — a `compliance_renewal` ticket that's also `landlord_allocated` routes to compliance, not landlord
- All sub-routines are SECURITY DEFINER and protected
- Rollback: `supabase/rollbacks/rollback_phase_c.sql` restores the original monolithic function
- CHECK constraint on `next_action_reason` enforces ~25 valid values at DB level

**Full architecture:** `docs/POLYMORPHIC-DISPATCH-PLAN.md`
