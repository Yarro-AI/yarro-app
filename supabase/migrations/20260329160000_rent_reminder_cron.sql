-- Schedule daily rent reminder at 09:00 UTC.
-- Calls the yarro-rent-reminder edge function which:
--   1. Queries get_rent_reminders_due() for ledger entries in the 3 reminder windows
--   2. Sends tenant WhatsApp reminders (3 days before, on due date, 3 days overdue)
--   3. Updates reminder_N_sent_at to prevent duplicates
--   4. Flips status to 'overdue' for entries 3+ days past due

SELECT cron.schedule(
  'rent-reminder-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qedsceehrrvohsjmbodc.supabase.co/functions/v1/yarro-rent-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
