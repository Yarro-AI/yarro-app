import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram } from "../_shared/telegram.ts";
import { sendAndLog } from "../_shared/twilio.ts";
import { TEMPLATES, formatUkPhone } from "../_shared/templates.ts";
import { logEvent } from "../_shared/events.ts";

// ─── Function: yarro-followups ───────────────────────────────────────────

const FN = "yarro-followups";

interface RouteConfig {
  templateSid: string;
  messageType: string;
  recipientRole: string;
  confirmType: string;
  getTo: (p: Record<string, any>) => string;
  getVariables: (p: Record<string, any>) => Record<string, string>;
}

const ROUTES: Record<string, RouteConfig> = {
  // 9a: Contractor hasn't responded to quote request
  "contractor-reminder-sms": {
    templateSid: TEMPLATES.contractor_reminder,
    messageType: "contractor_reminder",
    recipientRole: "contractor",
    confirmType: "contractor_reminder",
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
    confirmType: "landlord_followup",
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
    confirmType: "landlord_timeout",
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
    confirmType: "completion_reminder",
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
    confirmType: "completion_escalation",
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

    // Resolve recipient ID for contractor/landlord channel lookup
    const recipientId = config.recipientRole === "contractor"
      ? payload.contractor_id
      : config.recipientRole === "landlord"
        ? payload.landlord_id
        : undefined;

    const result = await sendAndLog(supabase, FN, route, {
      ticketId: payload.ticket_id,
      recipientPhone: to,
      recipientRole: config.recipientRole,
      recipientId,
      messageType: config.messageType,
      templateSid: config.templateSid,
      variables: config.getVariables(payload),
    });

    // Log event for tracking
    if (result.ok) {
      const EVENT_MAP: Record<string, string> = {
        "contractor-reminder-sms": "CONTRACTOR_REMINDED",
        "landlord-followup-sms": "LANDLORD_FOLLOWUP_SENT",
        "pm-landlord-timeout-sms": "LANDLORD_TIMEOUT",
        "contractor-completion-reminder-sms": "COMPLETION_REMINDER_SENT",
        "pm-completion-overdue-sms": "COMPLETION_PM_ESCALATED",
      };
      const eventType = EVENT_MAP[route];
      if (eventType) {
        await logEvent(supabase, payload.ticket_id, eventType, {
          route,
          recipient_role: config.recipientRole,
          message_sid: result.messageSid,
        });
      }
    }

    // Confirm delivery in DB (mark-after-send — prevents lost messages on 503)
    if (result.ok && config.confirmType) {
      const confirmParams: Record<string, unknown> = {
        p_ticket_id: payload.ticket_id,
        p_confirm_type: config.confirmType,
      };
      if (payload.contractor_id) {
        confirmParams.p_contractor_id = payload.contractor_id;
      }
      const { error: confirmErr } = await supabase.rpc("c1_confirm_followup_sent", confirmParams);
      if (confirmErr) {
        console.error(`[${FN}] Confirm failed for ${route}:`, confirmErr.message);
        await alertTelegram(FN, `${route} → confirm`, `Message sent but DB confirm failed: ${confirmErr.message}`, {
          Ticket: payload.ticket_id,
          "Confirm Type": config.confirmType,
        });
      }
    }

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
