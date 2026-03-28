-- Schedule daily compliance reminder at 08:00 UTC.
-- Calls the yarro-compliance-reminder edge function which:
--   1. Queries get_compliance_expiring() for certs within their reminder window
--   2. Sends operator notifications (WhatsApp or email)
--   3. Creates renewal tickets when a contractor is assigned
--   4. Marks reminder_sent_at to prevent duplicates

SELECT cron.schedule(
  'compliance-reminder-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qedsceehrrvohsjmbodc.supabase.co/functions/v1/yarro-compliance-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
