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

// ─── Function: yarro-completion ──────────────────────────────────────────

const FN = "yarro-completion";

const TEMPLATES = {
  pm_job_completed: "HXb9f0020d18249c54127269eca94bf039",
  ll_job_completed: "HXe71c39364f6a2d1c7185629bbb2308ed",
  pm_job_not_completed: "HXe727b41671d3fe7564f5480de1c98934",
};

// ─── Fillout Parser ──────────────────────────────────────────────────────
interface ParsedCompletion {
  ticket_id: string;
  completed: boolean;
  notes: string | null;
  reason: string | null;
  media_urls: string[];
  source: "fillout" | "webhook";
  fillout_submission_id: string | null;
  inbound_sid: string | null;
  completion_text: string | null;
}

function parseFillout(body: Record<string, any>): ParsedCompletion | null {
  const ticket_id = body?.urlParameters?.ticket_id?.value ?? null;
  if (!ticket_id) return null;

  const questions = body?.questions ? Object.values(body.questions) as any[] : [];

  const statusQ = questions.find((q: any) => q.name?.toLowerCase().includes("status"));
  const statusVal = Array.isArray(statusQ?.value) ? statusQ.value[0] : statusQ?.value;
  const completed = statusVal === "Completed" || statusVal === true;

  const notesQ = questions.find((q: any) => q.name?.toLowerCase().includes("notes"));
  const reasonQ = questions.find((q: any) => q.name?.toLowerCase().includes("reason"));
  const uploadQ = questions.find((q: any) => q.name?.toLowerCase().includes("upload"));

  const uploads = uploadQ?.value || [];
  const media_urls = Array.isArray(uploads)
    ? uploads.map((f: any) => f.url).filter(Boolean)
    : [];

  return {
    ticket_id,
    completed,
    notes: notesQ?.value || null,
    reason: reasonQ?.value || null,
    media_urls,
    source: "fillout",
    fillout_submission_id: body?.submissionId || null,
    inbound_sid: null,
    completion_text: null,
  };
}

function parseWebhook(body: Record<string, any>): ParsedCompletion | null {
  const payload = body?.payload || body;
  const ticket_id = payload?.ticket?.id || null;
  if (!ticket_id) return null;

  return {
    ticket_id,
    completed: true,
    notes: null,
    reason: null,
    media_urls: [],
    source: "webhook",
    fillout_submission_id: null,
    inbound_sid: payload?.inbound?.sid || null,
    completion_text: payload?.inbound?.text || "complete",
  };
}

// ─── Media Upload (Fillout S3 → Supabase Storage) ───────────────────────
async function uploadMedia(
  supabase: ReturnType<typeof createClient>,
  ticketId: string,
  mediaUrls: string[],
): Promise<string[]> {
  const storedUrls: string[] = [];
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  // Upload all media in parallel
  const uploads = mediaUrls.map(async (url, i) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`[media] Download failed for ${url}: ${resp.status}`);
        return null;
      }

      const blob = await resp.blob();
      const ext = blob.type.split("/")[1] || "jpg";
      const path = `completion-${ticketId}-${i}.${ext}`;

      const { error } = await supabase.storage
        .from("ticket-images")
        .upload(path, blob, { contentType: blob.type, upsert: true });

      if (error) {
        console.error(`[media] Upload failed for ${path}:`, error.message);
        return null;
      }

      return `${supabaseUrl}/storage/v1/object/public/ticket-images/${path}`;
    } catch (e) {
      console.error(`[media] Error processing ${url}:`, e);
      return null;
    }
  });

  const results = await Promise.all(uploads);
  return results.filter((url): url is string => url !== null);
}

// ─── Main Handler ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const source = url.searchParams.get("source") || "fillout";
    const body = await req.json();

    const parsed = source === "webhook" ? parseWebhook(body) : parseFillout(body);

    if (!parsed) {
      return new Response(
        JSON.stringify({ ok: false, error: "Could not parse ticket_id from submission" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[${FN}] ${parsed.source} for ticket ${parsed.ticket_id}, completed=${parsed.completed}`);

    const supabase = createSupabaseClient();

    // Handle media uploads (Fillout S3 → Supabase Storage) — parallel
    let finalMediaUrls = parsed.media_urls;
    if (parsed.media_urls.length > 0) {
      console.log(`[${FN}] Uploading ${parsed.media_urls.length} media files`);
      finalMediaUrls = await uploadMedia(supabase, parsed.ticket_id, parsed.media_urls);
    }

    // Call RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "c1_process_job_completion",
      {
        p_ticket_id: parsed.ticket_id,
        p_source: parsed.source,
        p_completed: parsed.completed,
        p_notes: parsed.notes,
        p_reason: parsed.reason,
        p_media_urls: finalMediaUrls,
        p_fillout_submission_id: parsed.fillout_submission_id,
        p_inbound_sid: parsed.inbound_sid,
        p_completion_text: parsed.completion_text,
      },
    );

    if (rpcError) {
      await alertTelegram(FN, "RPC c1_process_job_completion", rpcError.message, {
        Ticket: parsed.ticket_id,
        Source: parsed.source,
      });
      return new Response(
        JSON.stringify({ ok: false, error: rpcError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Guard: RPC returned ok=false (e.g. ticket_not_found)
    if (!rpcResult?.ok) {
      const reason = rpcResult?.error || "unknown";
      console.log(`[${FN}] RPC returned ok=false: ${reason}`);
      await alertTelegram(FN, "RPC result not ok", reason, {
        Ticket: parsed.ticket_id,
        Source: parsed.source,
        Completed: String(parsed.completed),
      });
      return new Response(
        JSON.stringify({ ok: false, error: reason, ticket_id: parsed.ticket_id }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Send notifications if RPC says we should
    const results: Array<{ type: string; sent: boolean; error?: string }> = [];

    if (rpcResult.should_notify) {
      const ticketId = rpcResult.ticket_id || parsed.ticket_id;
      const addr = rpcResult.property_address || "";
      const contrName = rpcResult.contractor_name || "";
      const contrPhone = rpcResult.contractor_phone || "";
      const issue = rpcResult.issue_description || "";
      const mgrPhone = rpcResult.manager_phone;
      const llPhone = rpcResult.landlord_phone;
      const reason = rpcResult.reason || parsed.reason || "";

      if (rpcResult.completed) {
        // ── Completed: notify PM + Landlord in parallel ──
        const sends: Promise<void>[] = [];

        if (mgrPhone) {
          sends.push((async () => {
            const r = await sendAndLog(supabase, FN, "pm_job_completed", {
              ticketId,
              recipientPhone: mgrPhone,
              recipientRole: "manager",
              messageType: "pm_job_completed",
              templateSid: TEMPLATES.pm_job_completed,
              variables: {
                "1": ticketId,
                "2": addr,
                "3": `${contrName} / ${contrPhone}`,
                "4": issue,
              },
            });
            results.push({ type: "pm_job_completed", sent: r.ok, error: r.error });
          })());
        }

        if (llPhone) {
          sends.push((async () => {
            const r = await sendAndLog(supabase, FN, "ll_job_completed", {
              ticketId,
              recipientPhone: llPhone,
              recipientRole: "landlord",
              messageType: "ll_job_completed",
              templateSid: TEMPLATES.ll_job_completed,
              variables: {
                "1": ticketId,
                "2": addr,
                "3": `${contrName} / ${contrPhone}`,
                "4": issue,
              },
            });
            results.push({ type: "ll_job_completed", sent: r.ok, error: r.error });
          })());
        }

        await Promise.all(sends);
      } else {
        // ── Not completed: notify PM only ──
        if (mgrPhone) {
          const r = await sendAndLog(supabase, FN, "pm_job_not_completed", {
            ticketId,
            recipientPhone: mgrPhone,
            recipientRole: "manager",
            messageType: "pm_job_not_completed",
            templateSid: TEMPLATES.pm_job_not_completed,
            variables: {
              "1": ticketId,
              "2": addr,
              "3": contrName,
              "4": reason,
            },
          });
          results.push({ type: "pm_job_not_completed", sent: r.ok, error: r.error });
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        ticket_id: parsed.ticket_id,
        completed: rpcResult.completed,
        should_notify: rpcResult.should_notify,
        media_uploaded: finalMediaUrls.length,
        notifications: results,
      }),
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
