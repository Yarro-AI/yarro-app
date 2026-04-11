import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient, type SupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram, alertInfo } from "../_shared/telegram.ts";
import { sendAndLog } from "../_shared/twilio.ts";
import { TEMPLATES, formatFriendlyDate } from "../_shared/templates.ts";
import { logEvent } from "../_shared/events.ts";

const FN = "yarro-compliance-reminder";

// Certificate type labels — duplicated from src/lib/constants.ts
// because edge functions can't import from the Next.js app
const CERT_LABELS: Record<string, string> = {
  hmo_license: "HMO Licence",
  gas_safety: "Gas Safety (CP12)",
  eicr: "EICR",
  epc: "EPC",
  fire_risk: "Fire Risk Assessment",
  pat: "PAT Testing",
  legionella: "Legionella Risk Assessment",
  smoke_alarms: "Smoke Alarms",
  co_alarms: "CO Alarms",
};

interface ExpiringCert {
  cert_id: string;
  property_id: string;
  property_manager_id: string;
  certificate_type: string;
  expiry_date: string;
  reminder_days_before: number;
  contractor_id: string | null;
  days_remaining: number;
  property_address: string;
  pm_name: string;
  pm_phone: string | null;
  pm_email: string | null;
  contractor_name: string | null;
  contractor_phone: string | null;
  contractor_email: string | null;
  contractor_contact_method: string | null;
  reminder_count: number;
}

interface CertResult {
  cert_id: string;
  certificate_type: string;
  property_address: string;
  sent: boolean;
  dispatched: boolean;
  error?: string;
}

// ─── Build notification variables for PM ────────────────────────────────

function getUrgencyPrefix(cert: ExpiringCert): string {
  if (cert.days_remaining > 0) return "";
  if (cert.reminder_count === 0) return "";
  if (cert.reminder_count === 1) return "EXPIRED — ";
  if (cert.reminder_count === 2) return "URGENT — ";
  return "CRITICAL — ";
}

function buildVariables(cert: ExpiringCert): Record<string, string> {
  const certLabel = CERT_LABELS[cert.certificate_type] || cert.certificate_type;
  const expiryFormatted = formatFriendlyDate(cert.expiry_date);
  const urgency = getUrgencyPrefix(cert);
  const actionText = cert.contractor_id && cert.contractor_name
    ? `Your contractor ${cert.contractor_name} has been notified to arrange renewal.`
    : "No contractor assigned — log in to arrange renewal.";

  return {
    "1": `${urgency}${certLabel}`,
    "2": cert.property_address || "Unknown property",
    "3": String(Math.abs(cert.days_remaining)),
    "4": expiryFormatted,
    "5": actionText,
  };
}

// ─── Process a single certificate ───────────────────────────────────────

async function processCert(
  supabase: SupabaseClient,
  cert: ExpiringCert,
): Promise<CertResult> {
  const certLabel = CERT_LABELS[cert.certificate_type] || cert.certificate_type;
  const variables = buildVariables(cert);
  let dispatched = false;
  let ticketId: string | null = null;

  // ─── PATH A: Contractor assigned → create ticket + dispatch ───
  if (cert.contractor_id) {
    // Create a compliance renewal ticket via c1_create_manual_ticket
    const priority = cert.days_remaining < 14 ? "high" : "medium";
    const { data: newTicketId, error: ticketError } = await supabase.rpc(
      "c1_create_manual_ticket",
      {
        p_property_manager_id: cert.property_manager_id,
        p_property_id: cert.property_id,
        p_contractor_ids: [cert.contractor_id],
        p_issue_title: `${certLabel} renewal`,
        p_issue_description: `Automated compliance renewal — ${certLabel} at ${cert.property_address} expires on ${variables["3"]} (${cert.days_remaining} days remaining).`,
        p_category: "compliance_renewal",
        p_priority: priority,
        p_compliance_certificate_id: cert.cert_id,
        p_deadline_date: cert.expiry_date,
      },
    );

    if (ticketError) {
      console.error(`[${FN}] Failed to create ticket for cert ${cert.cert_id}:`, ticketError.message);
      await alertTelegram(FN, "create_ticket", ticketError.message, {
        cert_id: cert.cert_id,
        certificate_type: cert.certificate_type,
        property: cert.property_address,
      });
      // Fall through to Path B — still send notification email to PM
    } else {
      ticketId = newTicketId as string;
      dispatched = true;
      console.log(`[${FN}] Created ticket ${ticketId} for ${certLabel} at ${cert.property_address}`);
      // Dispatcher auto-triggers from c1_messages insert in c1_create_manual_ticket
    }
  }

  // ─── Send PM notification ───
  let sent = false;

  if (ticketId) {
    // PATH A: We have a real ticket_id — use sendAndLog for full audit trail
    const result = await sendAndLog(supabase, FN, "compliance_reminder", {
      ticketId: ticketId,
      recipientPhone: cert.pm_phone || "",
      recipientRole: "property_manager",
      messageType: "compliance_expiry_operator",
      templateSid: TEMPLATES.compliance_expiry_operator,
      variables,
      recipientEmail: cert.pm_email || undefined,
    });

    sent = result.ok;

    if (result.ok) {
      await logEvent(supabase, ticketId, "COMPLIANCE_REMINDER_SENT", {
        cert_id: cert.cert_id,
        certificate_type: cert.certificate_type,
        days_remaining: cert.days_remaining,
        contractor_dispatched: true,
      });
    }
  } else {
    // PATH B: No ticket — send via sendAndLog for consistent audit trail
    const result = await sendAndLog(supabase, FN, "compliance_reminder_no_ticket", {
      ticketId: null,
      recipientPhone: cert.pm_phone || "",
      recipientRole: "property_manager",
      messageType: "compliance_expiry_operator",
      templateSid: TEMPLATES.compliance_expiry_operator,
      variables,
      recipientEmail: cert.pm_email || undefined,
    });
    sent = result.ok;

    // Log to c1_events via the generic system event RPC (no ticket_id required)
    const { error: logError } = await supabase.rpc("c1_log_system_event", {
      p_pm_id: cert.property_manager_id,
      p_event_type: "COMPLIANCE_REMINDER_SENT",
      p_property_label: cert.property_address,
      p_metadata: {
        cert_id: cert.cert_id,
        certificate_type: cert.certificate_type,
        days_remaining: cert.days_remaining,
        contractor_dispatched: false,
        notification_sent: sent,
      },
    });

    if (logError) {
      console.error(`[${FN}] Failed to log event for cert ${cert.cert_id}:`, logError.message);
    }
  }

  // ─── Increment reminder count ───
  const { error: updateError } = await supabase
    .from("c1_compliance_certificates")
    .update({
      reminder_count: cert.reminder_count + 1,
      last_reminder_at: new Date().toISOString(),
      reminder_sent_at: new Date().toISOString(), // keep for backward compat
    })
    .eq("id", cert.cert_id);

  if (updateError) {
    console.error(`[${FN}] Failed to update reminder for cert ${cert.cert_id}:`, updateError.message);
  }

  return {
    cert_id: cert.cert_id,
    certificate_type: cert.certificate_type,
    property_address: cert.property_address,
    sent,
    dispatched,
  };
}

// ─── Main handler ───────────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
  const supabase = createSupabaseClient();

  try {
    // Fetch all certificates approaching expiry with no reminder sent
    const { data: certs, error: rpcError } = await supabase.rpc(
      "get_compliance_expiring",
      {},
    );

    if (rpcError) {
      await alertTelegram(FN, "RPC get_compliance_expiring", rpcError.message);
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!certs || certs.length === 0) {
      console.log(`[${FN}] No expiring certificates found`);
      return new Response(
        JSON.stringify({ message: "No expiring certificates", count: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[${FN}] Processing ${certs.length} expiring certificates`);

    // Process each cert independently — one failure doesn't stop the batch
    const results: CertResult[] = [];
    for (const cert of certs as ExpiringCert[]) {
      try {
        const result = await processCert(supabase, cert);
        results.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[${FN}] Error processing cert ${cert.cert_id}:`, msg);
        await alertTelegram(FN, `cert_${cert.cert_id}`, msg, {
          certificate_type: cert.certificate_type,
          property: cert.property_address,
        });
        results.push({
          cert_id: cert.cert_id,
          certificate_type: cert.certificate_type,
          property_address: cert.property_address,
          sent: false,
          dispatched: false,
          error: msg,
        });
      }
    }

    const sent = results.filter((r) => r.sent).length;
    const dispatched = results.filter((r) => r.dispatched).length;
    const failed = results.filter((r) => !r.sent).length;

    const summary = {
      total: results.length,
      sent,
      dispatched,
      failed,
      results,
    };

    console.log(`[${FN}] Done: ${sent} notified, ${dispatched} dispatched, ${failed} failed`);

    if (sent > 0 || dispatched > 0) {
      await alertInfo(FN, `Compliance reminders: ${sent} sent, ${dispatched} dispatched, ${failed} failed`);
    }

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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
