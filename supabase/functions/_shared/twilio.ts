import type { SupabaseClient } from "./supabase.ts";
import { alertTelegram } from "./telegram.ts";
import { sendEmail } from "./resend.ts";
import { buildEmail } from "./email-templates.ts";

const TWILIO_FROM = "whatsapp:+447463558759";

export interface TwilioResult {
  ok: boolean;
  messageSid?: string;
  status?: string;
  body?: string;
  to?: string;
  direction?: string;
  error?: string;
  httpStatus?: number;
}

export async function sendWhatsApp(
  to: string,
  templateSid: string,
  variables: Record<string, string>,
): Promise<TwilioResult> {
  const cleanVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    let cleaned: string;
    if (value === null || value === undefined) {
      console.warn(`[twilio] Variable "${key}" was ${value}, defaulting to "-"`);
      cleaned = "-";
    } else {
      // Strip newlines + control chars — Twilio Content API rejects them with HTTP 400
      cleaned = String(value).replace(/[\r\n\t]+/g, " ").trim();
    }
    // Twilio Content API rejects empty string variables with HTTP 400
    if (!cleaned) {
      console.warn(`[twilio] Variable "${key}" was empty after sanitization, defaulting to "-"`);
      cleaned = "-";
    }
    cleanVars[key] = cleaned;
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

// ─── Log + sendAndLog ────────────────────────────────────────────────────

export interface LogParams {
  ticketId: string | null;
  messageType: string;
  recipientPhone: string;
  recipientRole: string;
  twilioSid: string | null;
  templateSid: string;
  contentVariables: Record<string, string>;
  twilioBody: string | null;
  status: string;
}

export async function logOutbound(
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

export interface SendAndLogParams {
  ticketId: string | null;
  recipientPhone: string;
  recipientRole: string;
  messageType: string;
  templateSid: string;
  variables: Record<string, string>;
  /** Optional: override channel. If omitted, defaults to WhatsApp. */
  channel?: "whatsapp" | "email";
  /** Required when channel is "email" */
  recipientEmail?: string;
  /** Optional: contractor/landlord ID for accurate channel lookup */
  recipientId?: string;
}

export async function sendAndLog(
  supabase: SupabaseClient,
  functionName: string,
  flowStep: string,
  params: SendAndLogParams,
): Promise<TwilioResult> {
  // ─── Auto-detect channel from DB when not explicitly set ───
  let channel = params.channel || "whatsapp";
  let recipientEmail = params.recipientEmail;

  if (!params.channel && (params.recipientRole === "contractor" || params.recipientRole === "landlord")) {
    try {
      const table = params.recipientRole === "contractor" ? "c1_contractors" : "c1_landlords";
      const emailCol = params.recipientRole === "contractor" ? "contractor_email" : "email";

      let query = supabase
        .from(table)
        .select(`contact_method, ${emailCol}`)
        .eq("contact_method", "email")
        .limit(1);

      // Use ID when available (accurate), fall back to phone lookup
      if (params.recipientId) {
        query = query.eq("id", params.recipientId);
      } else {
        const phoneCol = params.recipientRole === "contractor" ? "contractor_phone" : "phone";
        query = query.eq(phoneCol, params.recipientPhone);
      }

      const { data } = await query.maybeSingle();
      if (data && data[emailCol]) {
        channel = "email";
        recipientEmail = data[emailCol];
      }
    } catch (e) {
      console.warn(`[sendAndLog] Channel lookup failed for ${params.recipientRole}, defaulting to WhatsApp:`, e);
    }
  }

  let result: TwilioResult;

  if (channel === "email" && recipientEmail) {
    // ─── Email path via Resend ───
    const emailContent = buildEmail(params.messageType, params.variables);
    if (!emailContent) {
      console.warn(`[sendAndLog] No email template for "${params.messageType}", falling back to WhatsApp`);
      channel = "whatsapp"; // Reset so log reflects actual channel
      result = await sendWhatsApp(params.recipientPhone, params.templateSid, params.variables);
    } else {
      const emailResult = await sendEmail(recipientEmail, emailContent.subject, emailContent.html);
      result = {
        ok: emailResult.ok,
        messageSid: emailResult.emailId || undefined,
        status: emailResult.ok ? "sent" : "failed",
        body: emailContent.subject,
        to: recipientEmail,
        error: emailResult.error,
        httpStatus: emailResult.httpStatus,
      };
    }
  } else {
    // ─── WhatsApp path via Twilio ───
    result = await sendWhatsApp(params.recipientPhone, params.templateSid, params.variables);
  }

  await logOutbound(supabase, {
    ticketId: params.ticketId,
    messageType: params.messageType,
    recipientPhone: params.recipientPhone,
    recipientRole: params.recipientRole,
    twilioSid: result.messageSid || null,
    templateSid: channel === "email" ? `email:${params.messageType}` : params.templateSid,
    contentVariables: params.variables,
    twilioBody: result.body || null,
    status: result.ok ? (result.status || "queued") : "failed",
  });

  if (!result.ok) {
    await alertTelegram(functionName, flowStep, result.error || `Unknown ${channel} error`, {
      Ticket: params.ticketId,
      Channel: channel,
      Recipient: channel === "email"
        ? `${recipientEmail} (${params.recipientRole})`
        : `${params.recipientPhone} (${params.recipientRole})`,
      Template: channel === "email" ? params.messageType : params.templateSid,
      "Message Type": params.messageType,
      "HTTP Status": result.httpStatus ? String(result.httpStatus) : "N/A",
      Variables: JSON.stringify(params.variables),
    });
  }

  return result;
}
