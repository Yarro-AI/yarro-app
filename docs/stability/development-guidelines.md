# Development Guidelines

Rules for building safely on the Yarro codebase. These exist because we've been developing directly against production Supabase — every migration hits live data immediately.

---

## 1. Local Development Setup (Active)

Local Supabase is set up and working. Use it to test migrations before deploying to production.

**Commands:**

```bash
# Start local Supabase (Docker must be running)
supabase start

# Apply all migrations to local DB (resets everything)
supabase db reset

# Run frontend against LOCAL Supabase (no env file swap needed)
npm run dev:local

# Run frontend against PRODUCTION Supabase (normal)
npm run dev

# Stop local Supabase when done
supabase stop
```

**Local URLs:**
- App: `http://localhost:3000`
- Supabase Studio (local DB admin): `http://127.0.0.1:54323`
- Local API: `http://127.0.0.1:54321`

**Daily workflow:**

1. Write migration SQL in `supabase/migrations/`
2. `supabase db reset` — applies all migrations to local DB from scratch
3. `npm run dev:local` — frontend hits local Supabase
4. Test the migration works correctly
5. When confident: `supabase db push` deploys to production
6. Verify in Supabase dashboard

**Important notes:**
- `npm run dev` = production Supabase. `npm run dev:local` = local Supabase. No file swapping needed.
- `.env.local` always points to production and is never changed.
- Edge functions require production secrets (OpenAI, Twilio, Telegram) that aren't available locally. Local env is for **migration and RPC testing only**.
- Local Supabase Studio at `http://127.0.0.1:54323` lets you browse tables and run SQL against the local DB.

**When to upgrade to Supabase Branching:** If the project gets multiple developers working on different features simultaneously. Branching creates isolated cloud DBs per git branch. For solo dev, local is sufficient and zero-cost.

---

## 2. Migration Safety

### Before writing any migration:

1. **Check `supabase/core-rpcs/README.md`** — 61 functions are protected. If your migration uses `CREATE OR REPLACE FUNCTION` on any of them, **STOP and get explicit approval**.
2. A `CREATE OR REPLACE` silently overwrites the existing function. There is no undo in production.
3. Use `IF NOT EXISTS` on `ALTER TABLE ADD COLUMN` to make migrations idempotent.
4. Use `ON CONFLICT DO NOTHING` on seed data to prevent duplicate inserts on re-run.

### After deploying a migration:

Verify it landed:
```sql
-- Check RPCs exist
SELECT proname FROM pg_proc WHERE proname = 'your_function_name';

-- Check columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'your_table' AND column_name = 'your_column';
```

### Migration workflow:

```
Write SQL → Test locally (supabase db reset) → Deploy (supabase db push) → Verify (SQL editor) → Regen types
```

Always regenerate types after schema changes:
```bash
supabase gen types typescript --project-id qedsceehrrvohsjmbodc > src/types/database.ts
```

---

## 3. Dashboard Data Fetching

The dashboard (`src/app/(dashboard)/page.tsx`) loads all data in a single `Promise.all` with 9 queries. When adding new queries:

1. **Add inside the existing `Promise.all`** — don't add a separate fetch
2. **Add the result to the destructured array** — maintain the ordering
3. **Use null coalescing (`?? defaultValue`)** when processing results — individual queries can return null without crashing
4. **The try/catch at the top catches network failures** — but individual RPC errors return as `{data: null, error: ...}`, not exceptions. Check `.error` if you need to handle specific RPC failures.

---

## 4. Edge Function Safety

See [Architecture Decisions](architecture-decisions.md) for the reasoning. The rules:

- **Always return 200** — prevents Twilio retries
- **Use `alertTelegram()`** for error reporting — it's the monitoring system
- **Never modify protected RPCs** called by edge functions without checking callers
- **Edge functions have a 60-second timeout** — budget time for OpenAI (10-20s) + RPCs + SMS sends
- **Test edge functions locally** with `supabase functions serve` before deploying

---

## 5. Auth Safety

See [AD-1 and AD-2](architecture-decisions.md) for the reasoning. The rules:

- **Never make `onAuthStateChange` async** — it will hang (Supabase issue #35754)
- **Never call Supabase inside `onAuthStateChange`** — same issue
- **Use `getSession()` for client-side checks** — reads cookies, no network call
- **Use `getUser()` only in middleware** — server validates, but can hang if used elsewhere
- **Portal routes skip auth** — they use token-based RPCs instead

---

## 6. Pre-Push Checklist

For additional detail, see the "Before Claiming Done" checklist in `CLAUDE.md`.

1. `npm run build` — zero errors (pre-push hook enforces this)
2. Feature works in browser
3. Data persists on page refresh
4. No console errors in DevTools
5. Check at 375px mobile and 1440px desktop
6. Dark mode works
7. No `any` types or `@ts-ignore`

---

## 7. Cross-References

- Environment setup: `.claude/docs/setup-guide.md`
- Git workflow: `.claude/docs/git-workflow.md`
- Protected RPCs (full list): `supabase/core-rpcs/README.md`
- Protected RPCs (dependency graph): `.claude/docs/protected-rpcs.md`
- Component patterns: `.claude/docs/patterns.md`
- System architecture: `.claude/docs/architecture.md`
