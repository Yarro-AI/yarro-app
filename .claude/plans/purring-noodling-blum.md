# Plan: Replace Dashboard Stat Cards with HMO-Focused Metrics

## Context
The 4 stat cards are weak for the demo. "Needs Attention" and "Jobs in Progress" duplicate the panels below. "Compliance" and "Rent" show raw counts instead of meaningful data. Replacing all 4 with metrics that make an HMO landlord immediately see value: occupancy, compliance %, income in pounds, and AI automation.

## New Cards

| # | Label | Icon | Value | Subtitle | Accent |
|---|-------|------|-------|----------|--------|
| 1 | **Occupancy** | `Users` | `4/5 rooms` | `1 vacant` / `1 ending soon` / `Fully let` | danger/warning/success |
| 2 | **Compliance** | `ShieldCheck` | `85%` | `2 expired` / `1 expiring` / `All valid` | danger/warning/success |
| 3 | **Monthly income** | `Banknote` | `£4,200` | `£1,400 of £5,600 outstanding` / `£800 overdue` / `All collected` | danger/warning/success |
| 4 | **AI actions** | `Zap` | `23` or `0` | `this month` / `No activity yet` | always `primary` |

Card 3 uses collected amount as the value and moves expected into subtitle to avoid mobile overflow.

---

## Step 1: Create migration with 3 new RPCs

**New file:** `supabase/migrations/20260330_dashboard_stat_rpcs.sql`

**RPC 1 — `get_occupancy_summary(p_pm_id uuid)` → json**
```sql
CREATE OR REPLACE FUNCTION public.get_occupancy_summary(p_pm_id uuid)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object(
    'total_rooms',   count(*),
    'occupied',      count(*) FILTER (WHERE NOT is_vacant),
    'vacant',        count(*) FILTER (WHERE is_vacant),
    'ending_soon',   count(*) FILTER (
      WHERE NOT is_vacant
        AND tenancy_end_date IS NOT NULL
        AND tenancy_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '30 days'
    )
  ) FROM c1_rooms WHERE property_manager_id = p_pm_id;
$$;
```
- `is_vacant` is a generated column (`current_tenant_id IS NULL`), so this is reliable
- `ending_soon` catches tenancies expiring within 30 days

**RPC 2 — `get_rent_income_summary(p_pm_id uuid)` → json**
```sql
CREATE OR REPLACE FUNCTION public.get_rent_income_summary(p_pm_id uuid)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object(
    'expected_amount',    COALESCE(sum(amount_due), 0),
    'collected_amount',   COALESCE(sum(amount_paid), 0),
    'outstanding_amount', COALESCE(sum(amount_due - amount_paid) FILTER (WHERE status IN ('pending','partial')), 0),
    'overdue_amount',     COALESCE(sum(amount_due - amount_paid) FILTER (
      WHERE status = 'overdue' OR (status = 'pending' AND due_date < CURRENT_DATE)
    ), 0)
  ) FROM c1_rent_ledger
  WHERE property_manager_id = p_pm_id
    AND due_date >= date_trunc('month', CURRENT_DATE)::date
    AND due_date < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date;
$$;
```

**RPC 3 — `get_ai_actions_count(p_pm_id uuid)` → json**
```sql
CREATE OR REPLACE FUNCTION public.get_ai_actions_count(p_pm_id uuid)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('count', count(*))
  FROM c1_events
  WHERE portfolio_id = p_pm_id
    AND actor_type IN ('SYSTEM', 'ai', 'AI')
    AND occurred_at >= date_trunc('month', CURRENT_DATE)
    AND occurred_at < date_trunc('month', CURRENT_DATE) + interval '1 month';
$$;
```
- `portfolio_id` maps to `property_manager_id` (confirmed via FK constraint)
- Shows 0 gracefully with "No activity yet" subtitle

## Step 2: Deploy migration & regenerate types
```bash
supabase db push
supabase gen types typescript --project-id qedsceehrrvohsjmbodc > src/types/database.ts
```

## Step 3: Update dashboard frontend

**File:** `src/app/(dashboard)/page.tsx`

### 3a — State changes
- **Add** `occupancySummary` state: `{ total_rooms: 0, occupied: 0, vacant: 0, ending_soon: 0 }`
- **Add** `incomeSummary` state: `{ expected_amount: 0, collected_amount: 0, outstanding_amount: 0, overdue_amount: 0 }`
- **Add** `aiActionsCount` state: `number` (default 0)
- **Remove** `rentSummary` state (lines 144-146) — replaced by `incomeSummary`

### 3b — Fetch changes (Promise.all block, lines 154-210)
- **Add** 3 new RPC calls: `get_occupancy_summary`, `get_rent_income_summary`, `get_ai_actions_count`
- **Remove** `get_rent_dashboard_summary` call (line 209) — replaced by `get_rent_income_summary`

### 3c — Processing changes (lines 212-229)
- **Remove** rent processing block (lines 222-229)
- **Add** processing for occupancy, income, and AI actions responses

### 3d — Card rendering (lines 443-471)
Replace all 4 `<StatCard>` components with new cards per the table above.

### 3e — Imports
- **Add** `Users`, `Zap` from lucide-react
- **Remove** `Wrench` (only used by "Jobs in progress" card being removed)
- **Keep** `AlertTriangle` — still used in handoff dialog at line 644

## Step 4: `npm run build`
Verify zero errors.

## Notes
- `StatCard` component (`src/components/dashboard/stat-card.tsx`) needs no changes — existing props cover all cases
- Demo data must have tenants assigned to rooms via `room_assign_tenant` RPC for occupancy to display correctly
- £ amounts formatted with `toLocaleString('en-GB')`
- Compliance `total === 0` handled with `'—'` fallback (avoids NaN%)

## Files Modified
| File | Change |
|------|--------|
| `supabase/migrations/20260330_dashboard_stat_rpcs.sql` | New — 3 RPCs |
| `src/types/database.ts` | Regenerated (auto) |
| `src/app/(dashboard)/page.tsx` | State, fetch, processing, card rendering, imports |
