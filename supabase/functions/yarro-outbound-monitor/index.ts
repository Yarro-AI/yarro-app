import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient } from "../_shared/supabase.ts";

// Handles ALL replies to the OUTBOUND WhatsApp number (+447463558759).
// Two jobs:
//   1. Process the reply through c1_inbound_reply (quote responses, approvals, completions)
//   2. Log the reply + send Telegram alert for visibility

const FN = "yarro-outbound-monitor";

Deno.serve(async (req: Request) => {
  try {
    // Parse Twilio form-encoded POST
    const formData = await req.text();
    const params = new URLSearchParams(formData);
    const body = params.get("Body") || "";
    const from = params.get("From") || "";
    const messageSid = params.get("MessageSid") || "";
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);
    const originalSid = params.get("OriginalRepliedMessageSid") || null;
    const interactiveData = params.get("InteractiveData") || null;

    const phone = from.replace("whatsapp:", "").replace("+", "");
    if (!phone) return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });

    const displayBody = body || (numMedia > 0 ? "(media only)" : "(empty)");
    console.log(`[${FN}] Reply from ${phone}: ${displayBody.slice(0, 120)}`);

    const supabase = createSupabaseClient();

    // 1. Process reply through c1_inbound_reply (handles quotes, approvals, completions)
    const { data: replyResult, error: replyError } = await supabase.rpc("c1_inbound_reply", {
      p_from: phone,
      p_body: body || "",
      p_message_sid: messageSid,
      p_num_media: numMedia,
      p_original_sid: originalSid,
      p_interactive_data: interactiveData,
    });

    if (replyError) {
      console.error(`[${FN}] c1_inbound_reply error:`, replyError.message);
    } else {
      console.log(`[${FN}] c1_inbound_reply result:`, JSON.stringify(replyResult)?.slice(0, 200));
    }

    // 2. Log to c1_outbound_log for audit trail
    const logEntry: Record<string, any> = {
      message_type: "outbound_reply",
      recipient_phone: phone,
      recipient_role: replyResult?.actor || "unknown",
      body: displayBody + (numMedia > 0 ? ` [+${numMedia} media]` : ""),
      twilio_sid: messageSid,
      status: "received",
      sent_at: new Date().toISOString(),
    };
    if (replyResult?.ticket_id) logEntry.ticket_id = replyResult.ticket_id;
    await supabase.from("c1_outbound_log").insert(logEntry);

    // 3. Telegram alert for visibility
    const replyStatus = replyError
      ? `Error: ${replyError.message}`
      : replyResult?.ticket_id
        ? `${replyResult.actor || "unknown"} → ticket ${replyResult.ticket_id}${replyResult.path ? ` (${replyResult.path})` : ""}`
        : replyResult?.path === "ignored-noise"
          ? "Ignored (no actionable content)"
          : "No ticket match";

    const text = [
      "\ud83d\udce9 <b>Outbound Number Reply</b>",
      "",
      `<b>From:</b> +${phone}`,
      `<b>Message:</b> ${displayBody.slice(0, 500)}`,
      numMedia > 0 ? `<b>Media:</b> ${numMedia} attachment(s)` : "",
      originalSid ? `<b>Reply to SID:</b> ${originalSid}` : "",
      `<b>Processing:</b> ${replyStatus}`,
      `<b>Time:</b> ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n");

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID")?.trim();
    if (botToken && chatId) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      }).catch((e) => console.error("[telegram]", e));
    }

    return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
  } catch (err) {
    console.error(`[${FN}] Error:`, err);
    return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } }); // Always 200 for Twilio
  }
});
