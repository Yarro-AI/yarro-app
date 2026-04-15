import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sendEmail } from "../_shared/resend.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "adam@yarro.ai";

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug Report",
  feature: "Feature Request",
  improvement: "Improvement",
  general: "General Feedback",
};

function buildFeedbackHtml(
  category: string,
  message: string,
  pmName: string,
  pmEmail: string,
  ticketDesc: string | null,
): string {
  const catLabel = CATEGORY_LABELS[category] || category;
  const ticketBlock = ticketDesc
    ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;font-weight:600;">Related Ticket</td></tr>
       <tr><td style="padding:0 0 16px;color:#374151;font-size:14px;">${escapeHtml(ticketDesc)}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:#1e40af;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">Yarro — New Feedback</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:0 0 4px;color:#6b7280;font-size:14px;font-weight:600;">Category</td></tr>
            <tr><td style="padding:0 0 16px;color:#374151;font-size:14px;">${escapeHtml(catLabel)}</td></tr>
            <tr><td style="padding:0 0 4px;color:#6b7280;font-size:14px;font-weight:600;">From</td></tr>
            <tr><td style="padding:0 0 16px;color:#374151;font-size:14px;">${escapeHtml(pmName)} (${escapeHtml(pmEmail)})</td></tr>
            <tr><td style="padding:0 0 4px;color:#6b7280;font-size:14px;font-weight:600;">Message</td></tr>
            <tr><td style="padding:0 0 16px;color:#111827;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(message)}</td></tr>
            ${ticketBlock}
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">Yarro Feedback Notification</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { category, message, pm_name, pm_email, ticket_description } =
      await req.json();

    if (!category || !message) {
      return new Response(
        JSON.stringify({ error: "category and message required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const catLabel = CATEGORY_LABELS[category] || category;
    const subject = `[Yarro Feedback] ${catLabel} from ${pm_name || "a user"}`;
    const html = buildFeedbackHtml(
      category,
      message,
      pm_name || "Unknown",
      pm_email || "N/A",
      ticket_description || null,
    );

    const result = await sendEmail(ADMIN_EMAIL, subject, html);

    console.log("[feedback-notify]", result.ok ? "sent" : "failed", result);

    return new Response(JSON.stringify({ ok: result.ok, error: result.error }), {
      status: result.ok ? 200 : 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[feedback-notify] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
