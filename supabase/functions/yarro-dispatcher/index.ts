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

async function alertInfo(
  functionName: string,
  message: string,
  extras?: Record<string, string>,
): Promise<AlertResult> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID")?.trim();

  if (!botToken || !chatId) {
    console.error("[alert] Telegram not configured:", functionName, message);
    return { ok: false, error: "not_configured" };
  }

  const lines = [
    "\u26a0\ufe0f <b>Yarro Alert</b>",
    "",
    `<b>Function:</b> ${functionName}`,
    `<b>Message:</b> ${message}`,
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
    return { ok: resp.ok };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
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

// ─── Function: yarro-dispatcher ──────────────────────────────────────────

const FN = "yarro-dispatcher";

const TEMPLATES = {
  contractor_quote: "HXa0110e2b69a0abe9352d47cd38e7b9ca",  // 3_5_contractor_quote
  pm_quote: "HXb2f9170ecf59525e230c1cb688455f42",           // 4_5_pm_quote_sms
  landlord_quote: "HXb57fad098013e5b3f5d1a13f7df93c1c",     // 5_4_landlord_quote
  no_more_contractors: "HX75fb4cc68b9f1fea2f243cbe41ef3a57", // 6_no_more_contractors
};

// ─── Instruction: contractor-sms ─────────────────────────────────────────
async function handleContractorSms(
  supabase: SupabaseClient,
  payload: Record<string, any>,
): Promise<Response> {
  const ticket = payload.ticket || {};
  const contractor = payload.contractor || {};
  const manager = payload.manager || {};

  // Images check (mirrors n8n "Images" IF node)
  const images: string[] = ticket.images || [];
  const hasImages = images.length > 0 && images[0] !== "unprovided";

  // Media summary — gallery link or fallback
  const mediaSummary = hasImages
    ? `https://app.yarro.ai/i/${ticket.id}`
    : "No photos or videos provided";

  const variables: Record<string, string> = {
    "1": manager.business_name || "",
    "2": contractor.property_address || "",
    "3": contractor.issue_description || "",
    "4": mediaSummary,
  };

  // Send + log + alert via sendAndLog
  const result = await sendAndLog(supabase, FN, "contractor-sms → Twilio send", {
    ticketId: ticket.id,
    recipientPhone: contractor.phone,
    recipientRole: "contractor",
    messageType: "contractor_dispatch",
    templateSid: TEMPLATES.contractor_quote,
    variables,
  });

  // c1_contractor_mark_sent — records Twilio response on the contractor entry
  const { error: markError } = await supabase.rpc("c1_contractor_mark_sent", {
    p_ticket_id: ticket.id,
    p_contractor_id: contractor.id,
    p_twilio_sid: result.messageSid || null,
    p_body: result.body || null,
    p_to: result.to || null,
    p_has_image: hasImages,
    p_direction: result.direction || "outbound-api",
    p_status: result.status || null,
  });

  if (markError) {
    await alertTelegram(FN, "contractor-sms → c1_contractor_mark_sent", markError.message, {
      Ticket: ticket.id,
    });
  }

  return new Response(
    JSON.stringify({
      instruction: "contractor-sms",
      ticket_id: ticket.id,
      sent: result.ok,
      messageSid: result.messageSid,
      error: result.error,
    }),
    { status: result.ok ? 200 : 500, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Instruction: pm-sms ─────────────────────────────────────────────────
async function handlePmSms(
  supabase: SupabaseClient,
  payload: Record<string, any>,
): Promise<Response> {
  const ticket = payload.ticket || {};
  const contractor = payload.contractor || {};
  const manager = payload.manager || {};

  const result = await sendAndLog(supabase, FN, "pm-sms → Twilio send", {
    ticketId: ticket.id,
    recipientPhone: manager.phone,
    recipientRole: "manager",
    messageType: "pm_quote",
    templateSid: TEMPLATES.pm_quote,
    variables: {
      "1": contractor.property_address || "",
      "2": contractor.issue_description || "",
      "3": `${contractor.name || ""} - ${contractor.category || ""}`,
      "4": contractor.quote_amount || "",
      "5": contractor.quote_notes || "N/A",
    },
  });

  // c1_pm_mark_sent — records review_request_sent_at + Twilio data
  const { error: markError } = await supabase.rpc("c1_pm_mark_sent", {
    p_ticket_id: ticket.id,
    p_contractor_id: contractor.id,
    p_twilio_sid: result.messageSid || null,
    p_body: result.body || null,
    p_to: result.to || null,
    p_direction: result.direction || "outbound-api",
    p_status: result.status || null,
  });

  if (markError) {
    await alertTelegram(FN, "pm-sms → c1_pm_mark_sent", markError.message, {
      Ticket: ticket.id,
    });
  }

  return new Response(
    JSON.stringify({
      instruction: "pm-sms",
      ticket_id: ticket.id,
      sent: result.ok,
      messageSid: result.messageSid,
      error: result.error,
    }),
    { status: result.ok ? 200 : 500, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Instruction: landlord-sms ───────────────────────────────────────────
async function handleLandlordSms(
  supabase: SupabaseClient,
  payload: Record<string, any>,
): Promise<Response> {
  const ticket = payload.ticket || {};

  // Step 1: Call c1_prepare_landlord_sms
  const { data: prepData, error: prepError } = await supabase.rpc(
    "c1_prepare_landlord_sms",
    { p_ticket_id: ticket.id },
  );

  if (prepError || !prepData || prepData.ok === false) {
    const errMsg = prepError?.message || prepData?.reason || "prepare_landlord_sms failed";
    await alertTelegram(FN, "landlord-sms → c1_prepare_landlord_sms", errMsg, {
      Ticket: ticket.id,
    });
    return new Response(
      JSON.stringify({ instruction: "landlord-sms", error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // Step 2: Auto-approve check
  if (prepData.auto_approve === true) {
    const { error: finalizeError } = await supabase.rpc("c1_finalize_job", {
      p_ticket_id: prepData.ticket_id,
    });

    if (finalizeError) {
      await alertTelegram(FN, "landlord-sms → auto-approve → c1_finalize_job", finalizeError.message, {
        Ticket: ticket.id,
      });
    }

    console.log(`[${FN}] landlord-sms auto-approved for ticket ${ticket.id}`);
    return new Response(
      JSON.stringify({
        instruction: "landlord-sms",
        ticket_id: ticket.id,
        auto_approved: true,
        finalized: !finalizeError,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Step 3: Not auto-approve → send landlord quote SMS
  const result = await sendAndLog(supabase, FN, "landlord-sms → Twilio send", {
    ticketId: ticket.id,
    recipientPhone: prepData.landlord_phone,
    recipientRole: "landlord",
    messageType: "landlord_quote",
    templateSid: TEMPLATES.landlord_quote,
    variables: {
      "1": prepData.property_address || "",
      "2": prepData.contractor_name || "",
      "3": prepData.total_cost || "",
      "4": prepData.issue || "",
      "5": prepData.quote_notes || "",
    },
  });

  // c1_landlord_mark_sent
  const { error: markError } = await supabase.rpc("c1_landlord_mark_sent", {
    p_ticket_id: ticket.id,
    p_twilio_sid: result.messageSid || null,
    p_body: result.body || null,
    p_to: result.to || null,
    p_direction: result.direction || "outbound-api",
    p_status: result.status || null,
  });

  if (markError) {
    await alertTelegram(FN, "landlord-sms → c1_landlord_mark_sent", markError.message, {
      Ticket: ticket.id,
    });
  }

  return new Response(
    JSON.stringify({
      instruction: "landlord-sms",
      ticket_id: ticket.id,
      sent: result.ok,
      messageSid: result.messageSid,
      error: result.error,
    }),
    { status: result.ok ? 200 : 500, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Instruction: pm-nomorecontractors-sms ───────────────────────────────
async function handleNoMoreContractors(
  supabase: SupabaseClient,
  payload: Record<string, any>,
): Promise<Response> {
  const ticket = payload.ticket || {};
  const manager = payload.manager || {};
  const property = payload.property || {};

  const result = await sendAndLog(supabase, FN, "pm-nomorecontractors-sms → Twilio send", {
    ticketId: ticket.id,
    recipientPhone: manager.phone,
    recipientRole: "manager",
    messageType: "no_more_contractors",
    templateSid: TEMPLATES.no_more_contractors,
    variables: {
      "1": String(ticket.id || ""),
      "2": ticket.issue_description || "",
      "3": property.address || "",
    },
  });

  return new Response(
    JSON.stringify({
      instruction: "pm-nomorecontractors-sms",
      ticket_id: ticket.id,
      sent: result.ok,
      messageSid: result.messageSid,
      error: result.error,
    }),
    { status: result.ok ? 200 : 500, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Main Handler ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  try {
    const body = await req.json();
    const instruction = body.instruction;
    const payload = body.payload || {};

    console.log(`[${FN}] instruction=${instruction} ticket=${payload?.ticket?.id}`);

    const supabase = createSupabaseClient();

    switch (instruction) {
      case "contractor-sms":
        return await handleContractorSms(supabase, payload);

      case "pm-sms":
        return await handlePmSms(supabase, payload);

      case "landlord-sms":
        return await handleLandlordSms(supabase, payload);

      case "pm-nomorecontractors-sms":
        return await handleNoMoreContractors(supabase, payload);

      case "no-action": {
        await alertInfo(FN, `Dispatcher returned no-action for T-${payload?.ticket?.id || "unknown"}`, {
          Ticket: payload?.ticket?.id || "unknown",
          Note: "Check Edge Function logs for context",
        });
        return new Response(
          JSON.stringify({ instruction: "no-action", ticket_id: payload?.ticket?.id }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown instruction: ${instruction}` }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
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
