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

// ─── Function: yarro-scheduling ──────────────────────────────────────────

const FN = "yarro-scheduling";

const TEMPLATES = {
  contractor_job_schedule: "HX3115ee07982bbbeeba4fcbb4997bff78",
  pm_landlord_approved: "HXc6e017eef871b6874d33812822f95b19",
  landlord_declined: "HXc00be101015bb4abbfce401d5643b7b1",
  tenant_job_booked: "HX49fc2526186b36632036aa8769273c11",
  pm_ll_job_booked: "HXdcfd3555975ba92d35a1e1c1e74cae16",
};

// ─── Date Formatting Helpers ─────────────────────────────────────────────

/** Format a UK-timezone scheduling window: "12:00-13:00 03/11/25" */
function formatSchedulingWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const tz = "Europe/London";

  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const dateFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

  return `${timeFmt.format(start)}-${timeFmt.format(end)} ${dateFmt.format(start)}`;
}

/** Format availability: "Recorded on 19/02/2026 10:30: Morning preferred" */
function formatAvailability(dateLogged: string | null, availability: string | null): string {
  if (!dateLogged) return availability || "Not specified";

  const d = new Date(dateLogged);
  const tz = "Europe/London";

  const dateFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `Recorded on ${dateFmt.format(d)} ${timeFmt.format(d)}: ${availability || "Not specified"}`;
}

/** Strip currency symbol and parse to number */
function parseCurrency(val: string | null): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ─── Path A: Finalize Job (from c1_finalize_job SQL function) ────────────
async function handleFinalizeJob(
  supabase: SupabaseClient,
  body: Record<string, any>,
): Promise<Response> {
  const payload = body.payload || body;
  const ticket = payload.ticket || {};
  const property = payload.property || {};
  const manager = payload.manager || {};
  const landlord = payload.landlord || {};
  const contractor = payload.contractor || {};
  const jobFormParams = payload.job_form_params || {};
  const flags = payload.flags || {};

  const ticketId = String(ticket.id || "");

  if (!ticketId) {
    return new Response(
      JSON.stringify({ ok: false, error: "No ticket_id in payload" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[${FN}] finalize-job for ticket ${ticketId}, flags:`, JSON.stringify(flags));

  // ── Approved path (auto_approve or landlord_approved) ──
  if (flags.auto_approve === true || flags.landlord_approved === true) {
    // 1. Send contractor schedule SMS
    const filloutUrl = `https://yarroforms.fillout.com/maintenance-task?ticket_id=${jobFormParams.ticket_id || ticketId}&contractor_id=${jobFormParams.contractor_id || contractor.id}`;
    const availText = formatAvailability(ticket.date_logged, ticket.availability);

    const contrResult = await sendAndLog(supabase, FN, "finalize-job → contractor schedule SMS", {
      ticketId,
      recipientPhone: contractor.phone,
      recipientRole: "contractor",
      messageType: "contractor_job_schedule",
      templateSid: TEMPLATES.contractor_job_schedule,
      variables: {
        "1": contractor.quote || "",
        "2": property.address || "",
        "3": ticket.issue_description || "",
        "4": availText,
        "5": filloutUrl,
      },
    });

    // 2. PATCH ticket
    const quoteNum = parseCurrency(contractor.quote);
    const totalNum = parseCurrency(contractor.total);

    const { error: patchError } = await supabase
      .from("c1_tickets")
      .update({
        status: "Job Sent",
        contractor_id: contractor.id,
        contractor_quote: quoteNum,
        final_amount: totalNum,
        landlord_approved_on: landlord.replied_at || new Date().toISOString(),
        job_stage: "Sent",
      })
      .eq("id", ticketId);

    if (patchError) {
      await alertTelegram(FN, "finalize-job → ticket PATCH", patchError.message, {
        Ticket: ticketId,
      });
    }

    // 3. Send PM landlord approved notification
    if (manager.phone) {
      await sendAndLog(supabase, FN, "finalize-job → PM landlord approved SMS", {
        ticketId,
        recipientPhone: manager.phone,
        recipientRole: "manager",
        messageType: "pm_landlord_approved",
        templateSid: TEMPLATES.pm_landlord_approved,
        variables: {
          "1": property.address || "",
          "2": ticket.issue_description || "",
          "3": landlord.name || "",
          "4": contractor.name || "",
          "5": contractor.total || "",
          "6": contractor.quote || "",
          "7": contractor.markup || "",
        },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        path: "approved",
        ticket_id: ticketId,
        contractor_sms_sent: contrResult.ok,
        auto_approve: flags.auto_approve,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Declined path (landlord_approved = false) ──
  if (flags.landlord_approved === false) {
    if (manager.phone) {
      await sendAndLog(supabase, FN, "finalize-job → PM landlord declined SMS", {
        ticketId,
        recipientPhone: manager.phone,
        recipientRole: "manager",
        messageType: "landlord_declined",
        templateSid: TEMPLATES.landlord_declined,
        variables: {
          "1": ticketId,
          "2": property.address || "",
          "3": ticket.issue_description || "",
          "4": contractor.total || "",
        },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        path: "declined",
        ticket_id: ticketId,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Fallback: flags unclear ──
  await alertTelegram(FN, "finalize-job → unknown approval state", JSON.stringify(flags), {
    Ticket: ticketId,
  });

  return new Response(
    JSON.stringify({ ok: false, error: "Unknown approval state", flags }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Path B: Fillout Scheduling Form ─────────────────────────────────────
async function handleFilloutScheduling(
  supabase: SupabaseClient,
  body: Record<string, any>,
): Promise<Response> {
  // Parse Fillout webhook
  const ticketId = body?.urlParameters?.ticket_id?.value ?? null;
  const contractorId = body?.urlParameters?.contractor_id?.value ?? null;
  const submissionId = body?.submissionId ?? null;

  if (!ticketId) {
    return new Response(
      JSON.stringify({ ok: false, error: "No ticket_id in Fillout URL parameters" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[${FN}] fillout scheduling for ticket ${ticketId}, submission ${submissionId}`);

  // Parse scheduling dates
  const scheduling = body?.scheduling || {};
  const startIso = scheduling.eventStartTime || null;
  const endIso = scheduling.eventEndTime || null;

  if (!startIso) {
    await alertTelegram(FN, "fillout → no eventStartTime", `ticket ${ticketId}`, {
      Ticket: ticketId,
      "Submission ID": submissionId || "unknown",
    });
    return new Response(
      JSON.stringify({ ok: false, error: "No scheduling dates in Fillout submission" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const formattedWindow = formatSchedulingWindow(startIso, endIso || startIso);
  const scheduledIso = new Date(startIso).toISOString();

  // Dedup: skip if ticket already scheduled for this exact date (Fillout retry)
  const { data: currentTicket } = await supabase
    .from("c1_tickets")
    .select("status, scheduled_date")
    .eq("id", ticketId)
    .maybeSingle();

  if (
    currentTicket?.status === "Job Scheduled" &&
    currentTicket?.scheduled_date &&
    new Date(currentTicket.scheduled_date).toISOString() === scheduledIso
  ) {
    console.log(`[${FN}] Duplicate scheduling for ticket ${ticketId} (same date ${scheduledIso}), skipping`);
    return new Response(
      JSON.stringify({ ok: true, duplicate: true, ticket_id: ticketId }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Get full ticket context via RPC
  const { data: ctx, error: rpcError } = await supabase.rpc(
    "c1_job_reminder_payload",
    { p_ticket_id: ticketId },
  );

  if (rpcError || !ctx?.ok) {
    const errMsg = rpcError?.message || ctx?.reason || "c1_job_reminder_payload failed";
    await alertTelegram(FN, "fillout → c1_job_reminder_payload", errMsg, { Ticket: ticketId });
    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // PATCH ticket — update status + scheduled date
  const { error: patchError } = await supabase
    .from("c1_tickets")
    .update({
      status: "Job Scheduled",
      scheduled_date: scheduledIso,
      job_stage: "Booked",
    })
    .eq("id", ticketId);

  if (patchError) {
    await alertTelegram(FN, "fillout → ticket PATCH", patchError.message, { Ticket: ticketId });
  }

  // Extract context for SMS
  const addr = ctx.property?.address || "";
  const contrName = ctx.contractor?.contractor_name || "";
  const issueTitle = ctx.ticket?.issue_title || ctx.ticket?.issue_description || "";
  const mgrPhone = ctx.manager?.phone;
  const llPhone = ctx.property?.landlord_phone;
  const updatePhone = ctx.update_contact_phone;

  // Send 3 parallel SMS: tenant/update contact + PM + landlord
  const sends: Promise<any>[] = [];
  const results: Array<{ type: string; sent: boolean; error?: string }> = [];

  // Tenant / update contact
  if (updatePhone) {
    sends.push((async () => {
      const r = await sendAndLog(supabase, FN, "fillout → tenant_job_booked", {
        ticketId,
        recipientPhone: updatePhone,
        recipientRole: "tenant",
        messageType: "tenant_job_booked",
        templateSid: TEMPLATES.tenant_job_booked,
        variables: {
          "1": formattedWindow,
          "2": addr,
          "3": ticketId,
          "4": contrName,
          "5": issueTitle,
        },
      });
      results.push({ type: "tenant_job_booked", sent: r.ok, error: r.error });
    })());
  }

  // PM
  if (mgrPhone) {
    sends.push((async () => {
      const r = await sendAndLog(supabase, FN, "fillout → pm_job_booked", {
        ticketId,
        recipientPhone: mgrPhone,
        recipientRole: "manager",
        messageType: "pm_job_booked",
        templateSid: TEMPLATES.pm_ll_job_booked,
        variables: {
          "1": formattedWindow,
          "2": addr,
          "3": contrName,
          "4": ticketId,
          "5": issueTitle,
        },
      });
      results.push({ type: "pm_job_booked", sent: r.ok, error: r.error });
    })());
  }

  // Landlord
  if (llPhone) {
    sends.push((async () => {
      const r = await sendAndLog(supabase, FN, "fillout → ll_job_booked", {
        ticketId,
        recipientPhone: llPhone,
        recipientRole: "landlord",
        messageType: "ll_job_booked",
        templateSid: TEMPLATES.pm_ll_job_booked,
        variables: {
          "1": formattedWindow,
          "2": addr,
          "3": contrName,
          "4": ticketId,
          "5": issueTitle,
        },
      });
      results.push({ type: "ll_job_booked", sent: r.ok, error: r.error });
    })());
  }

  await Promise.all(sends);

  return new Response(
    JSON.stringify({
      ok: true,
      path: "fillout",
      ticket_id: ticketId,
      scheduled_date: scheduledIso,
      formatted_window: formattedWindow,
      notifications: results,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Main Handler ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const source = url.searchParams.get("source") || "finalize-job";
    const body = await req.json();

    const supabase = createSupabaseClient();

    if (source === "fillout") {
      return await handleFilloutScheduling(supabase, body);
    } else {
      return await handleFinalizeJob(supabase, body);
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
