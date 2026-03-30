# When Things Go Wrong

One-page runbook for the most likely production failures. Read this at 2am, act fast, fix later.

---

## 1. Site Is Down (Users Can't Load Dashboard)

**How you'll know:** UptimeRobot alert, or users report blank page / 500 error.

**Check in order:**
1. **Vercel status** — https://www.vercel-status.com/ — is Vercel itself down?
2. **Supabase status** — https://status.supabase.com/ — is Supabase down?
3. **Sentry** — https://sentry.io — any spike in frontend errors?
4. **Browser DevTools** — load the site, check Console and Network tabs

**If Vercel is down:** Wait. Nothing you can do. Vercel recovers automatically. Post in any customer channels that you're aware and monitoring.

**If Supabase is down:** Wait. The app can't function without it. Every page fetches from Supabase. Check Supabase status page for ETA.

**If both are up but site is broken:**
- Check if a recent deploy caused it: Vercel dashboard → Deployments → compare latest vs previous
- **Rollback:** Vercel dashboard → Deployments → find last working deploy → click "..." → "Promote to Production"
- This instantly reverts the frontend. Takes ~30 seconds.

---

## 2. Telegram Error Alerts (Edge Function Failures)

**How you'll know:** Telegram messages with `🚨 Edge Function Error` or `⚠️ Yarro Alert`.

**Read the alert carefully. It tells you:**
- **Function:** Which edge function failed (yarro-tenant-intake, yarro-ticket-notify, yarro-dispatcher)
- **Flow Step:** Exactly what operation failed
- **Error:** The error message
- **Ticket/Phone:** Which ticket or tenant is affected

**Common errors and what to do:**

| Error | Cause | Action |
|-------|-------|--------|
| `The 'To' number whatsapp:++44...` | Double `+` in phone number | Known bug (P1 in known-issues.md). Fix the phone number in the database: `UPDATE c1_landlords SET phone = '+447...' WHERE phone = '++447...'` |
| `c1_context_logic` failure | WhatsApp state machine error | Check Supabase logs. Tenant's message wasn't processed. They'll need to resend. |
| `OpenAI call` failure | OpenAI API down or rate limited | Tenant received fallback "try again" message. Will auto-resolve when OpenAI recovers. |
| `c1_create_ticket` failure | Ticket creation failed after conversation finalized | **DATA LOSS RISK.** Conversation is closed, ticket was not created. Manually create the ticket from the conversation log in Supabase. |
| `Twilio send` failure | SMS/WhatsApp delivery failed | Check Twilio console for rate limits or account issues. |

**If Telegram alerts stop completely:** The Telegram bot may be down. Check the bot token is still valid. This is a known single point of failure (A2 in known-issues.md). Check Sentry for errors instead.

---

## 3. Bad Deploy (Just Shipped Broken Code)

**Frontend (Vercel):**
1. Go to Vercel dashboard → Deployments
2. Find the last working deployment (green, before your broken push)
3. Click "..." → "Promote to Production"
4. This reverts instantly. Your git history is unchanged.
5. Fix the code on your branch, push again when ready.

**Edge Functions (Supabase):**
1. Edge functions are deployed via GitHub Actions on push to main
2. To rollback: find the last good commit, redeploy from there
3. `git log --oneline supabase/functions/` to find the last known-good commit
4. Push a revert commit: `git revert <bad-commit> && git push origin main`
5. GitHub Actions will auto-deploy the reverted functions

**Database Migration (most dangerous):**
1. Migrations CANNOT be automatically rolled back. `CREATE OR REPLACE` overwrites functions permanently.
2. If a bad migration was pushed: write a new migration that undoes the damage
3. For functions: check `.backups/supabase-export-2026-03-26/` for original definitions
4. For columns: `ALTER TABLE ... DROP COLUMN IF EXISTS ...` (only if no data depends on it)
5. **Always test migrations locally first** (`supabase db reset`) before `supabase db push`

---

## 4. Database Issue (Data Missing or Corrupted)

**Check first:**
1. Supabase dashboard → Table Editor → look at the affected table
2. Is RLS blocking the query? Try with service_role key in SQL Editor
3. Run `SELECT count(*) FROM <table> WHERE property_manager_id = '<pm_id>'` to verify data exists

**If data was accidentally deleted:**
- Check `.backups/supabase-export-2026-03-26/` for the last manual export
- Supabase Pro plan includes daily backups — check project settings → Database → Backups
- Restore specific records manually via SQL INSERT

**If an RPC is returning wrong results:**
- Check the function definition: `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'function_name'`
- Compare against the migration file in `supabase/migrations/`
- If it was overwritten by a bad migration, restore from the migration file that originally defined it

---

## 5. Auth Issues (Users Can't Log In)

**Symptoms:** Login page loops, "Redirecting to login..." forever, blank page after login.

**Check:**
1. Supabase dashboard → Authentication → Users — is the user's account active?
2. Is the JWT secret correct? Compare `.env.local` `NEXT_PUBLIC_SUPABASE_URL` with the Supabase dashboard URL
3. Check middleware: `src/lib/supabase/middleware.ts` — `getUser()` validates with Supabase server. If Supabase auth is down, all auth fails.
4. Check browser cookies — clear `sb-*` cookies and retry

**If PM record is missing (user logged in but sees "Loading..." forever):**
- Query: `SELECT * FROM c1_property_managers WHERE user_id = '<auth_user_id>'`
- If no row: the onboarding flow should create one. Check if they completed onboarding.

---

## Contacts

- **Vercel:** Adam's account (see `.claude/docs/infrastructure.md`)
- **Supabase:** Adam's account, project ref `qedsceehrrvohsjmbodc`
- **Twilio:** Adam's account
- **Faraaz:** For edge function / WhatsApp state machine issues
