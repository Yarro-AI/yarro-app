## Fix: Critical Quality & Security Fixes for Live Users
**Date:** 2026-04-04  |  **Branch:** fix/critical-quality  |  **Status:** In Progress

### Goal
Fix the 3 critical issues that would break the experience for real users: silent query failures, portal token expiry, and postcode API timeout.

### Done When
- [ ] All 6 dashboard list pages handle Supabase query errors with user-visible error state
- [ ] Portal token RPCs enforce a 30-day TTL (contractor + tenant tokens)
- [ ] `lookupPostcodeCity` has an AbortController timeout (5s)
- [ ] `npm run build` passes
- [ ] Committed, merged to main, pushed

### Out of Scope
- Webhook signature verification (edge functions are shared code)
- Loading skeletons (backlog item)
- Mobile responsive (backlog item)
- Compliance data consistency (backlog item)
