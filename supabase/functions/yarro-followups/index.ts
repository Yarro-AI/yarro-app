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

// ─── Function: yarro-followups ───────────────────────────────────────────

const FN = "yarro-followups";

interface RouteConfig {
  templateSid: string;
  messageType: string;
  recipientRole: string;
  getTo: (p: Record<string, any>) => string;
  getVariables: (p: Record<string, any>) => Record<string, string>;
}

const ROUTES: Record<string, RouteConfig> = {
  // Chain 13: Contractor hasn't responded to quote request
  "contractor-reminder-sms": {
    templateSid: "HXfca88665335df9e9ffd37b19cd582563",
    messageType: "contractor_reminder",
    recipientRole: "contractor",
    getTo: (p) => p.contractor_phone,
    getVariables: (p) => ({
      "1": p.business_name || "",
      "2": p.property_address || "",
      "3": p.issue_description || "",
    }),
  },
  // Chain 14: Landlord hasn't responded to approval request
  "landlord-followup-sms": {
    templateSid: "HXd746635799ab8ae73c7506abf6ddade1",
    messageType: "landlord_followup",
    recipientRole: "landlord",
    getTo: (p) => p.landlord_phone,
    getVariables: (p) => ({
      "1": p.property_address || "",
      "2": p.issue_description || "",
      "3": p.contractor_name || "",
      "4": p.total_cost || "",
      "5": String(p.hours_elapsed ?? ""),
    }),
  },
  // Chain 15: Landlord timed out, escalate to PM
  "pm-landlord-timeout-sms": {
    templateSid: "HX88fb8839c2c64835c171ea8d915d0a17",
    messageType: "pm_landlord_timeout",
    recipientRole: "manager",
    getTo: (p) => p.manager_phone,
    getVariables: (p) => ({
      "1": p.property_address || "",
      "2": p.issue_description || "",
      "3": p.landlord_name || "",
      "4": p.landlord_phone || "",
      "5": p.contractor_name || "",
      "6": p.contractor_phone || "",
      "7": String(p.hours_elapsed ?? ""),
    }),
  },
  // Chain 16: Contractor hasn't submitted completion form
  "contractor-completion-reminder-sms": {
    templateSid: "HX0889c61928c4b71a155956ec5ca35287",
    messageType: "contractor_completion_reminder",
    recipientRole: "contractor",
    getTo: (p) => p.contractor_phone,
    getVariables: (p) => ({
      "1": p.property_address || "",
      "2": p.issue_description || "",
      "3": p.scheduled_date || "",
    }),
  },
  // Chain 17: Job overdue, escalate to PM
  "pm-completion-overdue-sms": {
    templateSid: "HX3efeb8176e339042febe28ba44e9c4c2",
    messageType: "pm_completion_overdue",
    recipientRole: "manager",
    getTo: (p) => p.manager_phone,
    getVariables: (p) => ({
      "1": p.property_address || "",
      "2": p.issue_description || "",
      "3": `${p.contractor_name || ""} / ${p.contractor_phone || ""}`,
      "4": p.scheduled_date || "",
      "5": String(p.hours_overdue ?? ""),
    }),
  },
};

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const route = url.searchParams.get("route");

    if (!route || !ROUTES[route]) {
      return new Response(
        JSON.stringify({ error: `Unknown route: ${route}`, valid_routes: Object.keys(ROUTES) }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const config = ROUTES[route];
    const body = await req.json();
    const payload = body.payload;

    if (!payload) {
      return new Response(
        JSON.stringify({ error: "Missing payload in request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const to = config.getTo(payload);
    if (!to) {
      await alertTelegram(FN, `${route} → get recipient`, "No phone number in payload", {
        Ticket: payload.ticket_id || "unknown",
      });
      return new Response(
        JSON.stringify({ error: "No recipient phone number in payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[${FN}] ${route} for ticket ${payload.ticket_id} to ${to}`);

    const supabase = createSupabaseClient();

    const result = await sendAndLog(supabase, FN, route, {
      ticketId: payload.ticket_id,
      recipientPhone: to,
      recipientRole: config.recipientRole,
      messageType: config.messageType,
      templateSid: config.templateSid,
      variables: config.getVariables(payload),
    });

    return new Response(
      JSON.stringify({
        route,
        ticket_id: payload.ticket_id,
        sent: result.ok,
        messageSid: result.messageSid,
        error: result.error,
      }),
      { status: result.ok ? 200 : 500, headers: { "Content-Type": "application/json" } },
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
