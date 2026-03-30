import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only send errors in production
  enabled: process.env.NODE_ENV === "production",

  // Sample 100% of errors (free tier allows 5,000/month)
  tracesSampleRate: 0,

  // Don't send session replays (costs quota)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
