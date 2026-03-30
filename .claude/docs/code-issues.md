# Yarro PM — Code Quality Audit

Full audit of the codebase across security, reliability, performance, code duplication, error handling, accessibility, and architecture.

Backend Edge Functions (`supabase/functions/`) are Faraaz's domain — the backend section lists issues found from reading the code, but only Faraaz should fix them.

---

## CRITICAL — Fix First

### 1. Silent Supabase query failures (all dashboard pages)

Every list page and the main dashboard ignore Supabase errors. If a query fails, users see a blank table with no error message, no retry button, nothing.

| Page | Lines | Pattern |
|------|-------|---------|
| `src/app/(dashboard)/page.tsx` | 419-475 | `const tickets = ticketsRes.data` — no check on `.error` |
| `properties/page.tsx` | 284-293 | `const { data } = await query` — error ignored |
| `tenants/page.tsx` | 236-253 | Same pattern |
| `contractors/page.tsx` | 281-294 | Same pattern |
| `landlords/page.tsx` | 207-228 | Same pattern |
| `tickets/page.tsx` | 150-196 | Same pattern |

**Impact:** If network drops or Supabase is briefly unavailable, PM sees empty dashboard and thinks there's no data. No way to recover without manually refreshing.

**Fix:** Add error state + "Something went wrong, try again" with retry button on each page.

---

### 2. Missing `supabase` dependency in useEffect (all list pages)

All list pages reference `supabase` inside fetch functions called from `useEffect`, but `supabase` isn't in the dependency array:

```tsx
// Every list page has this pattern:
useEffect(() => {
  if (!propertyManager) return
  fetchItems()        // uses `supabase` internally
}, [propertyManager]) // supabase missing from deps
```

Pages affected: `properties/page.tsx:266`, `tenants/page.tsx:214-218`, `contractors/page.tsx:228-233`, `landlords/page.tsx`

**Impact:** Potential stale closures — if the Supabase client instance changes, the fetch uses the old one.

---

### 3. No timeout on external API calls

`src/lib/postcode.ts:73` — `fetch()` to postcodes.io has no timeout. If API is down, the onboarding wizard hangs indefinitely.

**Fix:** Add `AbortController` with 5-second timeout.

---

## HIGH — Should Fix

### 4. Ticket detail fetches everything upfront

`src/hooks/use-ticket-detail.ts` makes 5-7 parallel network requests when opening any ticket detail, regardless of which tab the user views:
- Basic info + context (needed)
- Conversation history (needed for conversation tab only)
- Completion data (needed for completion tab only)
- Ledger (needed for audit tab only)
- Outbound log (needed for audit tab only)

**Impact:** Slower drawer open, unnecessary network traffic. For tickets with 100+ messages, this is noticeably slow.

**Fix:** Progressive loading — fetch basic + context immediately, fetch tab-specific data only when user clicks that tab.

---

### 5. Ticket form loads all records on mount without pagination

`src/components/ticket-form.tsx:177-205` — fetches ALL properties, tenants, and contractors on mount. If a PM has 1,000+ records, UI freezes during the initial load.

**Fix:** Implement search-as-you-type with server-side filtering, or paginated loading.

---

### 6. Dashboard filters same array 10+ times

`src/app/(dashboard)/page.tsx:486-501`:
```tsx
const handoffTickets = tickets.filter(t => t.next_action_reason === 'handoff_review').length
const awaitingManager = tickets.filter(t => t.next_action_reason === 'manager_approval').length
// ... 8 more .filter() calls on same array
```

**Impact:** O(10n) instead of O(n). For 500 tickets, this is 5,000 iterations instead of 500.

**Fix:** Single `.reduce()` pass that counts all categories at once.

---

### 7. Full list re-fetched after every CRUD operation

Every list page calls `fetchItems()` after create/update/delete instead of updating local state:
- Create a tenant → re-fetch ALL tenants
- Edit one property → re-fetch ALL properties
- Delete one contractor → re-fetch ALL contractors

**Impact:** Unnecessary network traffic. Noticeable with 100+ records.

**Fix:** Update local state directly after successful mutation. Only re-fetch on mount or manual refresh.

---

### 8. No cleanup on ticket detail close

`src/components/ticket-detail/ticket-detail-modal.tsx:126-131` — when the sheet closes, the hook data isn't cleaned up. If a PM opens 10 different tickets in a session, all 10 hook instances remain in memory.

**Fix:** Clear state when `open` transitions to `false`.

---

## MEDIUM — Code Quality

### 9. ~35-45% code duplication across list pages

The four list pages (properties, tenants, contractors, landlords) share ~70-80% identical structure:
- Same state variables: `items`, `selectedItem`, `loading`, `drawerOpen`, `validationErrors`, `search`
- Same hooks: `useEditMode`, `useCreateMode`
- Same methods: `handleSave`, `handleCreate`, `handleDelete`, `handleRowClick`
- Same render pattern: DataTable + DetailDrawer
- Same search input (with TODO comments at lines 504, 570, 668, 415 saying "TODO: replace with shared SearchInput component")

**Estimated duplication:** 3,000-4,000 lines out of 8,696 total dashboard code.

**Fix options:**
- Extract shared `SearchInput` component (quick win, handles the 4 TODOs)
- Extract `useListPage` hook with shared CRUD logic
- Create generic `ListPage` wrapper component

---

### 10. Onboarding wizard makes sequential API calls

`src/components/onboarding-wizard.tsx:114-120` — city lookups for properties fire sequentially, one at a time. If a PM imports 50 properties, that's 50 sequential API calls.

**Fix:** Batch with `Promise.all()` in groups of 10.

---

### 11. Onboarding wizard has duplicated insertion logic

Lines 284-309 (landlords), 357-370 (properties), 484-491 (tenants), 618-626 (contractors) all follow the same pattern: normalize → insert → check error → add to state.

**Fix:** Extract `insertWithNormalization()` helper — saves ~100 lines.

---

### 12. Ticket form has console.error in production

`src/components/ticket-form.tsx:588`:
```tsx
console.error('Dispatcher webhook failed:', webhookErr)
```

Debug logging that shouldn't be in production builds.

---

### 13. Contractor sorting not memoized

`src/components/ticket-form.tsx:256-269` — contractor sort runs on every `formData.category` or `formData.property_id` change. O(n log n) for potentially 100+ contractors.

**Fix:** Wrap in `useMemo`.

---

### 14. Conversation tab regex is fragile

`src/components/ticket-detail/ticket-conversation-tab.tsx`:
- Line 62-92: `parseFlowReply()` manually parses JSON from regex with hardcoded `' · '` separator
- Line 94-110: `formatBody()` strips markdown with `/\*([^*]+)\*/g` but doesn't handle `**bold**` (double asterisks)

**Fix:** Update regex to `/\*{1,2}([^*]+)\*{1,2}/g` and use structured data instead of string parsing where possible.

---

### 15. Normalize function edge cases

`src/lib/normalize.ts`:
- `normalizePhone()` returns empty string for invalid input like "abc" instead of `null` — callers can't distinguish "no phone" from "invalid phone"
- `normalizeName()` breaks names like "McDonald" → "Mcdonald"
- Postcode regex is loose — matches some invalid UK postcodes

---

### 16. validate.ts is too minimal

`src/lib/validate.ts:10` — email regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` matches `a@b.c`. Missing phone validation entirely despite phones being critical to the system.

---

## ACCESSIBILITY

### 17. Missing keyboard/screen reader support

| Issue | Where |
|-------|-------|
| Data table search input has no `<label>` | `data-table.tsx:145-150` |
| Empty `<TableHead>` cell for actions column — no screen reader text | `data-table.tsx:194` |
| Message thread has no `aria-live` for new messages | `ticket-conversation-tab.tsx:246-254` |
| Clickable table rows have no visible focus indicator | `data-table.tsx` |
| Icon-only buttons in sidebar missing `aria-label` | `sidebar.tsx` |
| No `:focus-visible` styles defined in CSS | `globals.css` |
| No `prefers-reduced-motion` media query | `globals.css` |

---

### 18. Generic image alt text

- `ticket-form.tsx:891` — alt is "Upload 1", "Upload 2" instead of descriptive text
- `sidebar.tsx:182` — logo alt is just "Yarro"

---

## STYLING

### 19. page-shell.tsx layout issues

- Line 34: `h-dvh` causes layout shift when mobile keyboard appears on iOS. Should be `min-h-dvh`.
- Lines 48, 59: Inconsistent border tokens — sometimes `border-foreground/10`, sometimes `border-b`. Should standardize to `border-border`.

---

## SECURITY (Backend — Faraaz's Domain)

| Issue | Where | Impact |
|-------|-------|--------|
| No webhook signature verification | `yarro-tenant-intake`, `yarro-outbound-monitor`, `yarro-completion` | Anyone who knows the function URL can POST fake data |
| Portal tokens never expire | All portal pages | Leaked link = permanent access to ticket data |
| `/i/[ticketId]` is publicly accessible | `src/app/i/[ticketId]/page.tsx` | Ticket images viewable if UUID guessed |
| No rate limiting on portal token lookups | Portal RPC calls | Brute-force theoretically possible |
| No redirect URL validation on `next` param | `/auth/callback`, `/auth/confirm` | Open redirect possible |
| No RLS policies on database | Supabase tables | Data isolation is frontend-only |
| Password minimum is 6 characters | Login/update-password | Industry standard is 12+ |

---

## RELIABILITY (Backend — Faraaz's Domain)

| Issue | Where | Impact |
|-------|-------|--------|
| No retry queue for failed messages | `_shared/twilio.ts` | Failed messages never retried |
| No idempotency on Twilio webhooks | `yarro-tenant-intake` | Twilio retry on timeout could create duplicate tickets |
| Partial notification sends | `yarro-completion` | If PM notification fails, tenant still gets notified |
| Media upload failures don't block completion | `yarro-tenant-intake`, `yarro-completion` | Job marked complete even if photos failed |
| Telegram alerts can fail silently | `_shared/telegram.ts` | If bot token revoked, no alerts at all |
| No circuit breaker on external services | All Edge Functions | If Twilio is down, every function keeps failing |
| Midway failure leaves inconsistent state | Function chain | Ticket created but nobody notified |

---

## DATA (Backend — Faraaz's Domain)

| Issue | Where | Impact |
|-------|-------|--------|
| Data grows forever — no cleanup | `c1_outbound_log`, `c1_conversations`, `c1_ledger`, Storage | Could hit plan limits |
| Contractor portal token can't be regenerated | `yarro-dispatcher` | Lost link = no recovery |
| `contact_method="email"` with null email | `_shared/twilio.ts` | Falls back to WhatsApp silently |
| AI branch detection depends on string match order | `yarro-tenant-intake` | Could misclassify if multiple keywords match |
| Category display mapping is hardcoded | `_shared/templates.ts` | New category shows raw DB value |
| Conversation history limited to 15 messages | `yarro-tenant-intake` | Long conversations lose context |
| Edge Function logs only retained ~7 days | Supabase | Can't debug old issues |

---

## ARCHITECTURE

| Issue | Where | Impact |
|-------|-------|--------|
| Handoff decision is prompt-controlled, not code-enforced | `yarro-tenant-intake/prompts.ts` | Prompt edit could bypass manual review |
| No test suite | Entire codebase | Every change is a leap of faith |
| UK timezone hardcoded everywhere | Multiple Edge Functions | Breaks if expanding beyond UK |
| Lead time uses browser's local timezone | Contractor portal | Wrong slots for non-UK contractors |
| No realtime subscriptions | Frontend | PM must manually refresh |
| All pages are `use client` | Dashboard pages | Could benefit from server components for initial data fetch |
| No lazy loading of conditional components | DetailDrawer, ConfirmDeleteDialog | Loaded eagerly even when not rendered |

---

## SUMMARY BY PRIORITY

**Fix first (user-facing bugs):**
1. Silent query failures — blank pages with no error (all 6 list pages + dashboard)
2. Missing useEffect dependencies — potential stale data
3. No API timeout on postcode lookup — hangs forever if down

**Fix next (performance):**
4. Ticket detail fetches everything upfront — slow drawer open
5. Ticket form loads all records without pagination — freezes on large datasets
6. Dashboard filters array 10x — O(10n) instead of O(n)
7. Full list re-fetch after every CRUD — unnecessary network traffic

**Clean up (code quality):**
8. 35-45% duplication across list pages — 3,000-4,000 lines
9. Shared SearchInput component (4 TODOs already exist)
10. console.error in production code
11. Accessibility gaps (labels, focus indicators, aria-live)

**Backend (escalate to Faraaz):**
12. No webhook signature verification
13. Portal tokens never expire
14. No RLS policies
15. No retry queue for failed messages
