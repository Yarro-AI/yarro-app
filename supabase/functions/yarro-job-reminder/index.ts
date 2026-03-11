import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient, type SupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram } from "../_shared/telegram.ts";
import { sendAndLog } from "../_shared/twilio.ts";
import { TEMPLATES } from "../_shared/templates.ts";

const FN = "yarro-job-reminder";

interface JobReminder {
  ticket_id: string;
  scheduled_date: string;
  property_address: string;
  contractor_phone: string;
  access_text: string;
  formatted_time: string;
  formatted_window: string;
  issue_title: string;
  contractor_token: string;
  arrival_slot: string;
}

// ─── Send a single reminder (reused by both cron and direct modes) ────────
async function sendReminder(
  supabase: SupabaseClient,
  reminder: JobReminder,
): Promise<{ ticket_id: string; sent: boolean; messageSid?: string; error?: string }> {
  const result = await sendAndLog(supabase, FN, "contractor_job_reminder", {
    ticketId: reminder.ticket_id,
    recipientPhone: reminder.contractor_phone,
    recipientRole: "contractor",
    messageType: "contractor_job_reminder",
    templateSid: TEMPLATES.contractor_job_reminder,
    variables: {
      "1": reminder.property_address || "Address not available",
      "2": reminder.issue_title || "Maintenance issue",
      "3": reminder.arrival_slot || "Time not confirmed",
      "4": reminder.access_text || "No access instructions",
      "5": reminder.contractor_token || "",
    },
  });

  return {
    ticket_id: reminder.ticket_id,
    sent: result.ok,
    messageSid: result.messageSid,
    error: result.error,
  };
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const source = url.searchParams.get("source") || "cron";
    const supabase = createSupabaseClient();

    // ── Direct mode: single reminder from DB trigger (same-day booking) ──
    if (source === "direct") {
      const body = await req.json();
      const reminder = body as JobReminder;

      if (!reminder.ticket_id || !reminder.contractor_phone) {
        return new Response(
          JSON.stringify({ ok: false, error: "Missing ticket_id or contractor_phone" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      console.log(`[${FN}] Direct reminder for ticket ${reminder.ticket_id}`);
      const result = await sendReminder(supabase, reminder);

      return new Response(
        JSON.stringify({ source: "direct", ...result }),
        { status: result.sent ? 200 : 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── Cron mode: send all reminders for today ──
    const today = new Date().toISOString().split("T")[0];

    const { data: reminders, error: rpcError } = await supabase.rpc(
      "c1_job_reminder_list",
      { p_run_date: today },
    );

    if (rpcError) {
      await alertTelegram(FN, "RPC c1_job_reminder_list", rpcError.message);
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!reminders || reminders.length === 0) {
      console.log(`[${FN}] No reminders for ${today}`);
      return new Response(
        JSON.stringify({ message: "No reminders to send", date: today, count: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[${FN}] Sending ${reminders.length} reminders for ${today}`);

    const results = await Promise.all(
      (reminders as JobReminder[]).map((reminder) => sendReminder(supabase, reminder)),
    );

    const sent = results.filter((r) => r.sent).length;
    const failed = results.filter((r) => !r.sent).length;
    console.log(`[${FN}] Done: ${sent} sent, ${failed} failed`);

    return new Response(
      JSON.stringify({ date: today, total: results.length, sent, failed, results }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${FN}] Unhandled error:`, msg);
    await alertTelegram(FN, "Unhandled exception", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
