import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient, type SupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram, alertInfo } from "../_shared/telegram.ts";
import { sendAndLog } from "../_shared/twilio.ts";
import { TEMPLATES, shortRef } from "../_shared/templates.ts";

// ─── Function: yarro-dispatcher ──────────────────────────────────────────

const FN = "yarro-dispatcher";

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
    "1": manager.business_name || "Your property manager",
    "2": contractor.property_address || "Address not available",
    "3": contractor.issue_description || "Maintenance issue reported",
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
      "1": contractor.property_address || "Address not available",
      "2": contractor.issue_description || "Maintenance issue reported",
      "3": `${contractor.name || "Contractor"} - ${contractor.category || "General"}`,
      "4": contractor.quote_amount || "N/A",
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
      "1": prepData.property_address || "Address not available",
      "2": prepData.contractor_name || "Contractor",
      "3": prepData.total_cost || "N/A",
      "4": prepData.issue || "Maintenance issue",
      "5": prepData.quote_notes || "N/A",
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

// ─── Instruction: landlord-allocate ──────────────────────────────────────
async function handleLandlordAllocate(
  supabase: SupabaseClient,
  payload: Record<string, any>,
): Promise<Response> {
  const ticket = payload.ticket || {};
  const property = payload.property || {};
  const tenant = payload.tenant || {};
  const landlord = payload.landlord || {};
  const manager = payload.manager || {};
  const token = payload.token || "";

  const result = await sendAndLog(supabase, FN, "landlord-allocate \u2192 Twilio send", {
    ticketId: ticket.id,
    recipientPhone: landlord.phone,
    recipientRole: "landlord",
    messageType: "landlord_allocate",
    templateSid: TEMPLATES.allocate_landlord,
    variables: {
      "1": shortRef(String(ticket.id || "unknown")),
      "2": property.address || "Address not available",
      "3": ticket.issue_description || "Maintenance issue reported",
      "4": tenant.name || "Unknown",
      "5": tenant.phone || "N/A",
      "6": manager.business_name || "Your property manager",
      "7": token,
    },
  });

  return new Response(
    JSON.stringify({
      instruction: "landlord-allocate",
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
      "1": shortRef(String(ticket.id || "unknown")),
      "2": ticket.issue_description || "Maintenance issue reported",
      "3": property.address || "Address not available",
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

      case "landlord-allocate":
        return await handleLandlordAllocate(supabase, payload);

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
