import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Shared: Supabase Client ─────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createClient>;

function createSupabaseClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ─── Shared: Twilio ──────────────────────────────────────────────────────

const TWILIO_FROM = "whatsapp:+447463558759";

interface TwilioResult {
  ok: boolean;
  messageSid?: string;
  status?: string;
  body?: string;
  to?: string;
  direction?: string;
  error?: string;
  httpStatus?: number;
}

async function sendWhatsApp(
  to: string,
  templateSid: string,
  variables: Record<string, string>,
): Promise<TwilioResult> {
  const cleanVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (value === null || value === undefined) {
      console.warn(`[twilio] Variable "${key}" was ${value}, coercing to ""`);
      cleanVars[key] = "";
    } else {
      cleanVars[key] = String(value);
    }
  }

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();

  if (!accountSid || !authToken) {
    return { ok: false, error: "TWILIO credentials not configured" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const reqBody = new URLSearchParams({
    To: `whatsapp:+${to}`,
    From: TWILIO_FROM,
    ContentSid: templateSid,
    ContentVariables: JSON.stringify(cleanVars),
  });

  const headers = {
    Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: reqBody.toString(),
      });

      const data = await resp.json();

      if (!resp.ok) {
        if (attempt === 0 && (resp.status === 429 || resp.status >= 500)) {
          console.warn(`[twilio] ${resp.status} on attempt 1, retrying in 2s...`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return { ok: false, error: data.message || JSON.stringify(data), httpStatus: resp.status };
      }

      return {
        ok: true,
        messageSid: data.sid,
        status: data.status,
        body: data.body,
        to: data.to,
        direction: data.direction,
      };
    } catch (e) {
      if (attempt === 0) {
        console.warn(`[twilio] Network error on attempt 1, retrying in 2s:`, e);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return { ok: false, error: "Exhausted retries" };
}

// ─── Shared: Alerts ──────────────────────────────────────────────────────

interface AlertResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

async function alertTelegram(
  functionName: string,
  flowStep: string,
  error: string,
  extras?: Record<string, string>,
): Promise<AlertResult> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID")?.trim();

  if (!botToken || !chatId) {
    console.error("[alert] Telegram not configured:", functionName, flowStep, error);
    return { ok: false, error: "not_configured" };
  }

  const lines = [
    "\ud83d\udea8 <b>Edge Function Error</b>",
    "",
    `<b>Function:</b> ${functionName}`,
    `<b>Flow Step:</b> ${flowStep}`,
    `<b>Error:</b> ${error}`,
  ];

  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      if (value) lines.push(`<b>${key}:</b> ${value}`);
    }
  }

  lines.push(`<b>Time:</b> ${new Date().toISOString()}`);

  const text = lines.join("\n");

  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      },
    );
    const respBody = await resp.text();

    if (!resp.ok) {
      console.error("[alert] Telegram API error:", resp.status, respBody);
    }

    return { ok: resp.ok, status: resp.status, body: respBody };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[alert] Telegram send failed:", errMsg);
    return { ok: false, error: errMsg };
  }
}

// ─── Shared: Log + sendAndLog ────────────────────────────────────────────

interface LogParams {
  ticketId: string;
  messageType: string;
  recipientPhone: string;
  recipientRole: string;
  twilioSid: string | null;
  templateSid: string;
  contentVariables: Record<string, string>;
  twilioBody: string | null;
  status: string;
}

async function logOutbound(
  supabase: SupabaseClient,
  params: LogParams,
): Promise<void> {
  const { error } = await supabase.rpc("c1_log_outbound", {
    p_ticket_id: params.ticketId,
    p_message_type: params.messageType,
    p_recipient_phone: params.recipientPhone,
    p_recipient_role: params.recipientRole,
    p_twilio_sid: params.twilioSid,
    p_template_sid: params.templateSid,
    p_content_variables: params.contentVariables,
    p_body: params.twilioBody,
    p_status: params.status,
  });

  if (error) {
    console.error(`[log] Error for ticket ${params.ticketId}:`, error.message);
  }
}

interface SendAndLogParams {
  ticketId: string;
  recipientPhone: string;
  recipientRole: string;
  messageType: string;
  templateSid: string;
  variables: Record<string, string>;
}

async function sendAndLog(
  supabase: SupabaseClient,
  functionName: string,
  flowStep: string,
  params: SendAndLogParams,
): Promise<TwilioResult> {
  const result = await sendWhatsApp(
    params.recipientPhone,
    params.templateSid,
    params.variables,
  );

  await logOutbound(supabase, {
    ticketId: params.ticketId,
    messageType: params.messageType,
    recipientPhone: params.recipientPhone,
    recipientRole: params.recipientRole,
    twilioSid: result.messageSid || null,
    templateSid: params.templateSid,
    contentVariables: params.variables,
    twilioBody: result.body || null,
    status: result.ok ? (result.status || "queued") : "failed",
  });

  if (!result.ok) {
    await alertTelegram(functionName, flowStep, result.error || "Unknown Twilio error", {
      Ticket: params.ticketId,
      Recipient: `${params.recipientPhone} (${params.recipientRole})`,
      Template: params.templateSid,
      "Message Type": params.messageType,
      "HTTP Status": result.httpStatus ? String(result.httpStatus) : "N/A",
      Variables: JSON.stringify(params.variables),
    });
  }

  return result;
}

// ─── Function: yarro-job-reminder ────────────────────────────────────────

const FN = "yarro-job-reminder";
const TEMPLATE_SID = "HXf1caa05744ebf3204a8d92b83d38b915"; // 10_contractor_job_reminder

interface JobReminder {
  ticket_id: string;
  scheduled_date: string;
  property_address: string;
  contractor_phone: string;
  access_text: string;
  formatted_time: string;
  formatted_window: string;
}

Deno.serve(async (req: Request) => {
  try {
    // Auth: check cron secret if configured
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret) {
      const provided = req.headers.get("x-cron-secret");
      if (provided !== cronSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createSupabaseClient();
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

    // Send all reminders in parallel
    const results = await Promise.all(
      (reminders as JobReminder[]).map(async (reminder) => {
        const result = await sendAndLog(supabase, FN, "contractor_job_reminder", {
          ticketId: reminder.ticket_id,
          recipientPhone: reminder.contractor_phone,
          recipientRole: "contractor",
          messageType: "contractor_job_reminder",
          templateSid: TEMPLATE_SID,
          variables: {
            "1": reminder.formatted_window || "",
            "2": reminder.property_address || "",
            "3": reminder.access_text || "",
            "4": String(reminder.ticket_id),
            "5": String(reminder.ticket_id),
          },
        });

        return {
          ticket_id: reminder.ticket_id,
          sent: result.ok,
          messageSid: result.messageSid,
          error: result.error,
        };
      }),
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
