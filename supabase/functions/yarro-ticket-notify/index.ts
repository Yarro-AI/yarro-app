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

// ─── Function: yarro-ticket-notify ───────────────────────────────────────

const FN = "yarro-ticket-notify";

const TEMPLATES = {
  ticket_created: "HX9440a56f69282e80e3c064d23c36fcf2",   // PM + LL normal ticket
  handoff: "HX7dbca3663f1864cec8c0ad3fd8933ad7",           // PM handoff ticket
};

// ─── Helper: Format caller info string ───────────────────────────────────
function formatCallerInfo(ctx: Record<string, any>): string {
  const name = ctx.caller_name || ctx.tenant_name || "Unknown";
  const phone = ctx.caller_phone || ctx.tenant_phone || "";
  const role = ctx.caller_role || ctx.reporter_role || "tenant";
  const roleCapitalized = role.charAt(0).toUpperCase() + role.slice(1);
  return `${name} (+${phone}, Role - ${roleCapitalized})`;
}

function formatCallerInfoHandoff(ctx: Record<string, any>): string {
  const name = ctx.caller_name || ctx.tenant_name || "Unknown";
  const phone = ctx.caller_phone || ctx.tenant_phone || "";
  const role = ctx.caller_role || ctx.reporter_role || "tenant";
  const tag = ctx.caller_tag || "";
  const roleCapitalized = role.charAt(0).toUpperCase() + role.slice(1);

  let info = `${name} (+${phone}) - ${roleCapitalized}`;
  if (tag && tag.toLowerCase() !== role.toLowerCase()) {
    info += ` - ${tag.charAt(0).toUpperCase() + tag.slice(1)}`;
  }
  return info;
}

function formatTenantInfo(ctx: Record<string, any>): string {
  const name = ctx.tenant_name || "Tenant not matched";
  const verified = ctx.tenant_verified_by || "Auto-verified";
  return ctx.is_matched_tenant
    ? `${name} (Verification: ${verified})`
    : "Tenant not matched";
}

// ─── Source: intake (post-ticket-creation from M(1) or c1_create_ticket) ─
async function handleIntake(
  supabase: SupabaseClient,
  ticketId: string,
): Promise<Response> {
  // Load full ticket context
  const { data: ctxRows, error: ctxError } = await supabase.rpc(
    "c1_ticket_context",
    { ticket_uuid: ticketId },
  );

  if (ctxError || !ctxRows || ctxRows.length === 0) {
    const errMsg = ctxError?.message || "c1_ticket_context returned empty";
    await alertTelegram(FN, "intake → c1_ticket_context", errMsg, { Ticket: ticketId });
    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const ctx = ctxRows[0];
  const results: Array<{ type: string; sent: boolean; error?: string }> = [];

  if (ctx.handoff) {
    // ── Handoff ticket: PM only ──
    if (ctx.manager_phone) {
      const r = await sendAndLog(supabase, FN, "intake → handoff PM SMS", {
        ticketId,
        recipientPhone: ctx.manager_phone,
        recipientRole: "manager",
        messageType: "pm_handoff",
        templateSid: TEMPLATES.handoff,
        variables: {
          "1": ticketId,
          "2": ctx.label || "Handoff",
          "3": ctx.property_address || "",
          "4": formatCallerInfoHandoff(ctx),
          "5": ctx.tenant_name || "Tenant not matched",
          "6": ctx.issue_description || "",
          "7": ctx.priority || "",
        },
      });
      results.push({ type: "pm_handoff", sent: r.ok, error: r.error });
    }

    // Handoff tickets do NOT trigger dispatch — PM handles manually
  } else {
    // ── Normal ticket: PM + LL, then trigger dispatch ──
    const sends: Promise<void>[] = [];

    // PM notification
    if (ctx.manager_phone) {
      sends.push((async () => {
        const r = await sendAndLog(supabase, FN, "intake → PM ticket created SMS", {
          ticketId,
          recipientPhone: ctx.manager_phone,
          recipientRole: "manager",
          messageType: "pm_ticket_created",
          templateSid: TEMPLATES.ticket_created,
          variables: {
            "1": ticketId,
            "2": ctx.property_address || "",
            "3": formatCallerInfo(ctx),
            "4": formatTenantInfo(ctx),
            "5": ctx.issue_description || "",
            "6": ctx.priority || "",
          },
        });
        results.push({ type: "pm_ticket_created", sent: r.ok, error: r.error });
      })());
    }

    // LL notification
    if (ctx.landlord_phone) {
      sends.push((async () => {
        const r = await sendAndLog(supabase, FN, "intake → LL ticket created SMS", {
          ticketId,
          recipientPhone: ctx.landlord_phone,
          recipientRole: "landlord",
          messageType: "ll_ticket_created",
          templateSid: TEMPLATES.ticket_created,
          variables: {
            "1": ticketId,
            "2": ctx.property_address || "",
            "3": formatCallerInfo(ctx),
            "4": formatTenantInfo(ctx),
            "5": ctx.issue_description || "",
            "6": ctx.priority || "",
          },
        });
        results.push({ type: "ll_ticket_created", sent: r.ok, error: r.error });
      })());
    }

    await Promise.all(sends);

    // Trigger dispatch chain: c1_contractor_context creates c1_messages
    // and calls c1_message_next_action → yarro-dispatcher
    const { error: dispatchError } = await supabase.rpc(
      "c1_contractor_context",
      { ticket_uuid: ticketId },
    );

    if (dispatchError) {
      await alertTelegram(FN, "intake → c1_contractor_context (dispatch trigger)", dispatchError.message, {
        Ticket: ticketId,
        Note: "Dispatch chain NOT triggered — contractors NOT contacted",
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      source: "intake",
      ticket_id: ticketId,
      handoff: ctx.handoff,
      notifications: results,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Source: manual-ll (manual landlord notification, replaces M(2.1)) ───
async function handleManualLandlord(
  supabase: SupabaseClient,
  ticketId: string,
): Promise<Response> {
  // Load context
  const { data: ctxRows, error: ctxError } = await supabase.rpc(
    "c1_ticket_context",
    { ticket_uuid: ticketId },
  );

  if (ctxError || !ctxRows || ctxRows.length === 0) {
    const errMsg = ctxError?.message || "c1_ticket_context returned empty";
    await alertTelegram(FN, "manual-ll → c1_ticket_context", errMsg, { Ticket: ticketId });
    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const ctx = ctxRows[0];

  if (!ctx.landlord_phone) {
    await alertTelegram(FN, "manual-ll → no landlord phone", `Ticket ${ticketId} has no landlord phone`, {
      Ticket: ticketId,
    });
    return new Response(
      JSON.stringify({ ok: false, error: "No landlord phone number" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const r = await sendAndLog(supabase, FN, "manual-ll → LL ticket created SMS", {
    ticketId,
    recipientPhone: ctx.landlord_phone,
    recipientRole: "landlord",
    messageType: "ll_ticket_created",
    templateSid: TEMPLATES.ticket_created,
    variables: {
      "1": ticketId,
      "2": ctx.property_address || "",
      "3": ctx.business_name || "",
      "4": ctx.tenant_name || "N/A",
      "5": ctx.issue_description || "",
      "6": ctx.priority || "",
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      source: "manual-ll",
      ticket_id: ticketId,
      sent: r.ok,
      messageSid: r.messageSid,
      error: r.error,
    }),
    { status: r.ok ? 200 : 500, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Main Handler ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const body = await req.json();
    const source = url.searchParams.get("source") || body.source || "intake";

    const ticketId = body.ticket_id || body.payload?.ticket_id || null;

    if (!ticketId) {
      return new Response(
        JSON.stringify({ ok: false, error: "No ticket_id in request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[${FN}] source=${source} ticket=${ticketId}`);

    const supabase = createSupabaseClient();

    if (source === "manual-ll") {
      return await handleManualLandlord(supabase, ticketId);
    } else {
      return await handleIntake(supabase, ticketId);
    }
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
