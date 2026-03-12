import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram } from "../_shared/telegram.ts";
import { sendAndLog } from "../_shared/twilio.ts";
import { TEMPLATES, formatUkPhone } from "../_shared/templates.ts";

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
  // 9a: Contractor hasn't responded to quote request
  "contractor-reminder-sms": {
    templateSid: TEMPLATES.contractor_reminder,
    messageType: "contractor_reminder",
    recipientRole: "contractor",
    getTo: (p) => p.contractor_phone,
    getVariables: (p) => ({
      "1": p.property_address || "Address not available",
      "2": p.issue_description || "Maintenance issue",
      "3": p.business_name || "Your property manager",
      "4": p.portal_token || "",
    }),
  },
  // 9b: Landlord hasn't responded to approval request
  "landlord-followup-sms": {
    templateSid: TEMPLATES.pm_contractor_timeout,
    messageType: "landlord_followup",
    recipientRole: "landlord",
    getTo: (p) => p.landlord_phone,
    getVariables: (p) => ({
      "1": p.property_address || "Address not available",
      "2": p.issue_description || "Maintenance issue",
      "3": p.contractor_name || "Contractor",
      "4": p.total_cost || "N/A",
      "5": String(p.hours_elapsed ?? "N/A"),
    }),
  },
  // 9c: Landlord timed out, escalate to PM
  "pm-landlord-timeout-sms": {
    templateSid: TEMPLATES.landlord_reminder,
    messageType: "pm_landlord_timeout",
    recipientRole: "manager",
    getTo: (p) => p.manager_phone,
    getVariables: (p) => ({
      "1": p.property_address || "Address not available",
      "2": p.issue_description || "Maintenance issue",
      "3": p.landlord_name || "Landlord",
      "4": p.landlord_phone ? formatUkPhone(p.landlord_phone) : "N/A",
      "5": p.contractor_name || "Contractor",
      "6": p.contractor_phone ? formatUkPhone(p.contractor_phone) : "N/A",
      "7": String(p.hours_elapsed ?? "N/A"),
    }),
  },
  // 9d: Contractor hasn't submitted completion form
  "contractor-completion-reminder-sms": {
    templateSid: TEMPLATES.completion_followup,
    messageType: "contractor_completion_reminder",
    recipientRole: "contractor",
    getTo: (p) => p.contractor_phone,
    getVariables: (p) => ({
      "1": p.property_address || "Address not available",
      "2": p.issue_description || "Maintenance issue",
      "3": p.scheduled_date || "N/A",
      "4": p.contractor_token || "",
    }),
  },
  // 9e: Job overdue, escalate to PM
  "pm-completion-overdue-sms": {
    templateSid: TEMPLATES.pm_completion_overdue,
    messageType: "pm_completion_overdue",
    recipientRole: "manager",
    getTo: (p) => p.manager_phone,
    getVariables: (p) => ({
      "1": p.property_address || "Address not available",
      "2": p.issue_description || "Maintenance issue",
      "3": p.contractor_name ? `${p.contractor_name} — ${p.contractor_phone ? formatUkPhone(p.contractor_phone) : "N/A"}` : "Contractor",
      "4": p.scheduled_date || "N/A",
      "5": String(p.hours_overdue ?? "N/A"),
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
