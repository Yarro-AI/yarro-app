# Monitoring Setup

What we monitor, where alerts go, and what a healthy system looks like.

---

## Tools

| Tool | What It Does | Where Alerts Go | Free Tier |
|------|-------------|-----------------|-----------|
| **Sentry** | Frontend error tracking — catches every unhandled JS error, groups them, shows stack traces | Sentry dashboard + email | 5,000 errors/month |
| **UptimeRobot** | Uptime monitoring — pings the site every 5 min, alerts if it's down | Email + Telegram (configurable) | 50 monitors |
| **Telegram Bot** | Edge function error alerts — structured messages from Supabase functions | Faraaz's phone (Telegram) | Unlimited |
| **Vercel Dashboard** | Deployment status, build logs, function logs | Vercel web UI | Included |
| **Supabase Dashboard** | Database health, auth logs, edge function logs (7-day retention) | Supabase web UI | Included |

---

## What Each Tool Catches

```
User hits a bug in the browser        → Sentry
Site is completely down                → UptimeRobot
WhatsApp/SMS processing fails          → Telegram alert
Edge function crashes                  → Telegram alert + Supabase logs
Deploy breaks the build                → CI checks (GitHub Actions)
Slow queries or high error rate        → Supabase dashboard (manual check)
```

---

## What "Healthy" Looks Like

- **Sentry:** 0 unresolved errors (check weekly)
- **UptimeRobot:** 100% uptime, no alerts in last 24 hours
- **Telegram:** Only `⚠️ Yarro Alert` info messages (compliance reminders). No `🚨 Edge Function Error` messages
- **Vercel:** Latest deployment succeeded (green)
- **Supabase:** Edge function invocations graph is steady, no error spikes

---

## What "Unhealthy" Looks Like

- **Sentry spike:** Sudden increase in errors = bad deploy or Supabase issue
- **UptimeRobot down alert:** Site unreachable = check Vercel + Supabase status
- **Telegram `🚨` flood:** Multiple edge function errors = check Supabase logs, likely RPC failure or Twilio issue
- **Telegram silence:** If you normally see compliance reminders but they stopped = Telegram bot may be down, check Sentry instead
- **Vercel build failure:** Push to main failed to build = check build logs for TypeScript or lint errors

---

## Setup Instructions

### Sentry (already integrated)

1. Go to https://sentry.io → Create free account → Create project (Next.js)
2. Copy the DSN (looks like `https://xxx@o123.ingest.sentry.io/456`)
3. Add to `.env.local`: `NEXT_PUBLIC_SENTRY_DSN=<your DSN>`
4. Add to Vercel environment variables: Settings → Environment Variables → add `NEXT_PUBLIC_SENTRY_DSN`
5. Deploy. Sentry starts capturing errors automatically.

### UptimeRobot

1. Go to https://uptimerobot.com → Create free account
2. Add monitor: HTTP(s), URL = `https://yarro-pm.vercel.app`, check every 5 min
3. Add alert contact: your email + optionally Telegram
4. Done. You'll get an email if the site goes down.

---

## Alert Response

When you get an alert, refer to [When Things Go Wrong](when-things-go-wrong.md) for step-by-step response procedures.
