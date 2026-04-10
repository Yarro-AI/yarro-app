# Sprint Plan 05: Table Scroll Debug + Fix

## Context
Tables reportedly don't scroll properly on entity pages. However, code review shows all three target pages (properties, tenants, contractors) already have the correct flex pattern: `flex-1 min-h-0 overflow-hidden` wrapper + `fillHeight` DataTable. The full flex chain from layout.tsx looks correct. **Must investigate before fixing.**

**Branch:** `fix/yar-227-table-scroll`
**Issues:** YAR-227

---

## Steps

### 1. Debug investigation (DO THIS FIRST)

Run `npm run dev` and test each page:

**Test matrix:**
| Page | Viewport 900px tall | Viewport 600px tall | With topBar open | Notes |
|------|---------------------|---------------------|------------------|-------|
| Properties | ? | ? | ? | |
| Tenants | ? | ? | ? | |
| Contractors | ? | ? | ? | |

For each failing case, use DevTools to:
1. Inspect `<main>` computed height — is it constrained?
2. Inspect PageShell outer div — does `h-full` resolve correctly?
3. Check if `pb-8` (PageShell line 90) pushes the table below fold
4. Check if `DashboardHeader` height is accounted for
5. Check if `topBar` / `headerExtra` content has `flex-shrink-0`

### 2. Identify root cause

Likely suspects based on code review:
- **`pb-8`** on PageShell content area (line 90) — adds 32px bottom padding that could push table past viewport
- **`DashboardHeader`** fixed height not accounted for in flex chain
- **`topBar` content** not constrained with `flex-shrink-0`
- **Specific page content** above the DataTable (search bars, filter rows) taking too much space

### 3. Fix the actual cause

Apply the minimal fix to the root cause. Do NOT:
- Rewrite the DataTable component
- Change the flex chain that already works
- Add hardcoded heights

---

## Files Potentially Modified
- `src/components/page-shell.tsx` — if pb-8 or flex issue
- Specific entity pages — if page-level content issue
- `src/app/(dashboard)/layout.tsx` — if header height issue

## Verification
1. `npm run build` passes
2. All three pages scroll correctly at 600px viewport height
3. Table headers stay sticky during scroll
4. No regression on other pages
