import type { SupabaseClient } from "./supabase.ts";
import { alertTelegram } from "./telegram.ts";

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
    if (value === null || value === undefined) {
      console.warn(`[twilio] Variable "${key}" was ${value}, coercing to ""`);
      cleanVars[key] = "";
    } else {
      // Strip newlines + control chars — Twilio Content API rejects them with HTTP 400
      cleanVars[key] = String(value).replace(/[\r\n\t]+/g, " ").trim();
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

// ─── Log + sendAndLog ────────────────────────────────────────────────────

export interface LogParams {
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
  ticketId: string;
  recipientPhone: string;
  recipientRole: string;
  messageType: string;
  templateSid: string;
  variables: Record<string, string>;
}

export async function sendAndLog(
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
