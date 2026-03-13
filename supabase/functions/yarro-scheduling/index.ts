import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient, type SupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram } from "../_shared/telegram.ts";
import { sendAndLog, logOutbound } from "../_shared/twilio.ts";
import { TEMPLATES, formatFriendlyDate, formatUkPhone, withArticle, timeOfDay, categoryDisplayName } from "../_shared/templates.ts";

// ─── Function: yarro-scheduling ──────────────────────────────────────────

const FN = "yarro-scheduling";

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

/** Ensure tenant_token exists — generate + persist if missing */
async function ensureTenantToken(
  supabase: SupabaseClient,
  ticketId: string,
  existing: string | null | undefined,
): Promise<string | null> {
  if (existing) return existing;
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const { error } = await supabase.from("c1_tickets").update({
    tenant_token: token,
    tenant_token_at: new Date().toISOString(),
  }).eq("id", ticketId);
  if (error) {
    await alertTelegram(FN, "ensureTenantToken", error.message, { Ticket: ticketId });
    return null;
  }
  return token;
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
    // 1. Generate contractor_token and build portal URL (replaces Fillout)
    const contractorToken = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    {
      const { error: tokenErr } = await supabase.from("c1_tickets").update({
        contractor_token: contractorToken,
        contractor_token_at: new Date().toISOString(),
      }).eq("id", ticketId);
      if (tokenErr) {
        await alertTelegram(FN, "finalize-job \u2192 set contractor_token", tokenErr.message, { Ticket: ticketId });
      }
    }
    const portalUrl = `https://app.yarro.ai/contractor/${contractorToken}`;
    const availText = formatAvailability(ticket.date_logged, ticket.availability);

    // Build access info for {{4}} — same dynamic pattern as contractor_quote
    let accessInfo = "Contact property manager for access details";
    if (ticket.access_granted) {
      const { data: propData } = await supabase
        .from("c1_properties")
        .select("access_instructions")
        .eq("id", property.id)
        .single();
      accessInfo = propData?.access_instructions || "Anytime access";
    } else {
      const slots = ticket.availability || "To be arranged with tenant";
      accessInfo = `Must be arranged with tenant. Available: ${slots}`;
    }

    const contrResult = await sendAndLog(supabase, FN, "finalize-job → contractor schedule SMS", {
      ticketId,
      recipientPhone: contractor.phone,
      recipientRole: "contractor",
      messageType: "contractor_job_schedule",
      templateSid: TEMPLATES.contractor_job_schedule,
      variables: {
        "1": property.address || "Address not available",
        "2": ticket.issue_description || "Maintenance issue",
        "3": contractor.quote || "N/A",
        "4": accessInfo,
        "5": contractorToken,
      },
    });

    // 2. PATCH ticket
    const quoteNum = parseCurrency(contractor.quote);
    const totalNum = parseCurrency(contractor.total);

    const { error: patchError } = await supabase
      .from("c1_tickets")
      .update({
        status: "open",
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

    // 3. Send PM approval notification — correct template based on path
    if (manager.phone) {
      const isAutoApprove = flags.auto_approve === true;
      await sendAndLog(supabase, FN, `finalize-job → PM ${isAutoApprove ? "auto" : "landlord"} approved SMS`, {
        ticketId,
        recipientPhone: manager.phone,
        recipientRole: "manager",
        messageType: isAutoApprove ? "pm_auto_approved" : "pm_landlord_approved",
        templateSid: isAutoApprove ? TEMPLATES.pm_auto_approved : TEMPLATES.pm_landlord_approved,
        variables: {
          "1": contractor.name || "Contractor",
          "2": property.address || "Address not available",
          "3": ticket.issue_description || "Maintenance issue",
          "4": landlord.name || "Landlord",
          "5": contractor.total || "£0",
          "6": contractor.quote || "£0",
          "7": contractor.markup || "£0",
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
          "1": property.address || "Address not available",
          "2": ticket.issue_description || "Maintenance issue",
          "3": contractor.total || "N/A",
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

/** Extract a URL parameter from multiple possible Fillout payload formats */
function getUrlParam(body: any, name: string): string | null {
  // Format 1: Standard Fillout array [{id, name, value}, ...]
  const urlParams = body?.urlParameters;
  if (Array.isArray(urlParams)) {
    const param = urlParams.find((p: any) => p.name === name || p.id === name);
    if (param?.value) return param.value;
  }
  // Format 2: Object format {name: {value}} or {name: value}
  if (urlParams && typeof urlParams === "object" && !Array.isArray(urlParams)) {
    if (urlParams[name]?.value) return urlParams[name].value;
    if (typeof urlParams[name] === "string") return urlParams[name];
  }
  // Format 3: Direct top-level field (Workflow custom mapping)
  if (body?.[name] && typeof body[name] === "string") return body[name];
  // Format 4: Nested under data (some webhook wrappers)
  if (body?.data?.[name] && typeof body.data[name] === "string") return body.data[name];
  return null;
}

/** Extract scheduling dates from multiple possible Fillout payload formats */
function extractSchedulingDates(body: any): { startIso: string | null; endIso: string | null } {
  // Format 1: Standard array [{id, name, value: {eventStartTime, eventEndTime}}, ...]
  const sched = body?.scheduling;
  if (Array.isArray(sched) && sched.length > 0) {
    const val = sched[0]?.value || {};
    if (val.eventStartTime) return { startIso: val.eventStartTime, endIso: val.eventEndTime || null };
  }
  // Format 2: Flat object {eventStartTime, eventEndTime}
  if (sched && typeof sched === "object" && !Array.isArray(sched)) {
    if (sched.eventStartTime) return { startIso: sched.eventStartTime, endIso: sched.eventEndTime || null };
  }
  // Format 3: Top-level fields
  if (body?.eventStartTime) return { startIso: body.eventStartTime, endIso: body.eventEndTime || null };
  // Format 4: Nested under data
  if (body?.data?.eventStartTime) return { startIso: body.data.eventStartTime, endIso: body.data.eventEndTime || null };
  // Format 5: Within questions array (Fillout puts all answers there)
  if (Array.isArray(body?.questions)) {
    for (const q of body.questions) {
      if (q.value?.eventStartTime) return { startIso: q.value.eventStartTime, endIso: q.value.eventEndTime || null };
    }
  }
  return { startIso: null, endIso: null };
}

async function handleFilloutScheduling(
  supabase: SupabaseClient,
  rawBody: Record<string, any>,
): Promise<Response> {
  // Fillout Workflows wrap data under body.submission — unwrap if present
  const body = rawBody.submission ?? rawBody;

  // Parse ticket_id from multiple possible locations
  const ticketId = getUrlParam(body, "ticket_id");
  const contractorId = getUrlParam(body, "contractor_id");
  const submissionId = body?.submissionId ?? body?.submission_id ?? rawBody?.submissionId ?? null;

  if (!ticketId) {
    console.error(`[${FN}] No ticket_id found. Body keys: ${Object.keys(body).join(",")}, urlParameters:`, JSON.stringify(body?.urlParameters)?.slice(0, 500));
    return new Response(
      JSON.stringify({ ok: false, error: "No ticket_id in Fillout URL parameters" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[${FN}] fillout scheduling for ticket ${ticketId}, submission ${submissionId}`);

  // Parse scheduling dates from multiple possible formats
  const { startIso, endIso } = extractSchedulingDates(body);

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

  // Dedup: reject if ticket already has a scheduled date or is closed
  const { data: currentTicket } = await supabase
    .from("c1_tickets")
    .select("status, scheduled_date, job_stage")
    .eq("id", ticketId)
    .maybeSingle();

  if (currentTicket && (currentTicket.status === 'closed' || currentTicket.scheduled_date)) {
    console.log(`[${FN}] Ticket ${ticketId} already has status "${currentTicket.status}", rejecting duplicate booking`);
    return new Response(
      JSON.stringify({ ok: true, duplicate: true, ticket_id: ticketId, current_status: currentTicket.status }),
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
      status: "open",
      scheduled_date: scheduledIso,
      job_stage: "Booked",
    })
    .eq("id", ticketId);

  if (patchError) {
    await alertTelegram(FN, "fillout → ticket PATCH", patchError.message, { Ticket: ticketId });
  }

  // Log cosmetic entry: contractor confirmed slot via Fillout form
  const contrPhone = ctx.contractor?.contractor_phone || "";
  await logOutbound(supabase, {
    ticketId,
    messageType: "contractor_job_confirmed",
    recipientPhone: contrPhone,
    recipientRole: "contractor",
    twilioSid: null,
    templateSid: "",
    contentVariables: {},
    twilioBody: `Contractor confirmed slot: ${formattedWindow}`,
    status: "cosmetic",
  });

  // Extract context for SMS
  const addr = ctx.property?.address || "Address not available";
  const contrName = ctx.contractor?.contractor_name || "Contractor";
  const issueTitle = ctx.ticket?.issue_title || ctx.ticket?.issue_description || "Maintenance issue";
  const mgrPhone = ctx.manager?.phone;
  const llPhone = ctx.property?.landlord_phone;
  const updatePhone = ctx.update_contact_phone;

  // Send 3 parallel SMS: tenant/update contact + PM + landlord
  const sends: Promise<any>[] = [];
  const results: Array<{ type: string; sent: boolean; error?: string }> = [];

  // Tenant / update contact
  if (updatePhone) {
    const tenantFirstName = (ctx.tenant?.name || "").split(" ")[0] || "there";
    const friendlyDate = formatFriendlyDate(startIso);
    const category = withArticle(ctx.ticket?.category || "contractor");
    const slot = timeOfDay(startIso);
    const contrPhone = ctx.contractor?.contractor_phone || "";
    const tenantToken = await ensureTenantToken(supabase, ticketId, ctx.ticket?.tenant_token);
    if (tenantToken) {
      sends.push((async () => {
        const r = await sendAndLog(supabase, FN, "fillout → tenant_job_booked", {
          ticketId,
          recipientPhone: updatePhone,
          recipientRole: "tenant",
          messageType: "tenant_job_booked",
          templateSid: TEMPLATES.tenant_job_booked,
          variables: {
            "1": tenantFirstName,
            "2": friendlyDate,
            "3": category,
            "4": contrName,
            "5": slot,
            "6": formatUkPhone(contrPhone),
            "7": tenantToken,
          },
        });
        results.push({ type: "tenant_job_booked", sent: r.ok, error: r.error });
      })());
    }
  }

  // PM
  if (mgrPhone) {
    const contrPhone = ctx.contractor?.contractor_phone || "";
    const contrDisplay = contrPhone ? `${contrName} — ${formatUkPhone(contrPhone)}` : contrName;
    sends.push((async () => {
      const r = await sendAndLog(supabase, FN, "fillout → pm_job_booked", {
        ticketId,
        recipientPhone: mgrPhone,
        recipientRole: "manager",
        messageType: "pm_job_booked",
        templateSid: TEMPLATES.pm_job_booked,
        variables: {
          "1": formattedWindow,
          "2": addr,
          "3": issueTitle,
          "4": contrDisplay,
        },
      });
      results.push({ type: "pm_job_booked", sent: r.ok, error: r.error });
    })());
  }

  // Landlord
  if (llPhone) {
    const llName = ctx.property?.landlord_name || "there";
    const category = categoryDisplayName(ctx.ticket?.category || "contractor");
    const mgrContact = ctx.manager?.phone ? formatUkPhone(ctx.manager.phone) : "your property manager";
    sends.push((async () => {
      const r = await sendAndLog(supabase, FN, "fillout → ll_job_booked", {
        ticketId,
        recipientPhone: llPhone,
        recipientRole: "landlord",
        messageType: "ll_job_booked",
        templateSid: TEMPLATES.ll_job_booked,
        variables: {
          "1": llName,
          "2": category,
          "3": formattedWindow,
          "4": issueTitle,
          "5": addr,
          "6": mgrContact,
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

// ─── Path: Portal Quote (contractor submits quote via portal) ────────────
async function handlePortalQuote(
  supabase: SupabaseClient,
  body: Record<string, any>,
): Promise<Response> {
  const { token, quote_amount, quote_notes } = body;

  if (!token || quote_amount === undefined || quote_amount === null) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing token or quote_amount" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Look up contractor by portal_token
  const { data: ctx, error: ctxError } = await supabase.rpc(
    "c1_get_contractor_quote_context",
    { p_token: token },
  );

  if (ctxError || !ctx) {
    const errMsg = ctxError?.message || "Invalid or expired token";
    await alertTelegram(FN, "portal-quote → lookup", errMsg, { Token: token });
    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Guard: don't allow double-submission
  if (ctx.contractor_status === "replied") {
    return new Response(
      JSON.stringify({ ok: false, error: "Quote already submitted", quote_amount: ctx.quote_amount }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  // Format quote amount
  const num = parseFloat(String(quote_amount));
  if (isNaN(num) || num <= 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid quote amount" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const numFmt = `\u00a3${num.toFixed(2)}`;

  // Merge quote into contractor JSONB entry
  const { error: mergeError } = await supabase.rpc("c1_msg_merge_contractor", {
    p_ticket_id: ctx.ticket_id,
    p_contractor_id: ctx.contractor_id,
    p_patch: {
      status: "replied",
      replied_at: new Date().toISOString(),
      quote_amount: numFmt,
      quote_notes: quote_notes || null,
      via_flows: false,
    },
  });

  if (mergeError) {
    await alertTelegram(FN, "portal-quote → merge", mergeError.message, {
      Ticket: ctx.ticket_id,
    });
    return new Response(
      JSON.stringify({ ok: false, error: mergeError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // Trigger state machine → dispatches PM notification automatically
  const { error: nextError } = await supabase.rpc("c1_message_next_action", {
    p_ticket_id: ctx.ticket_id,
  });

  if (nextError) {
    await alertTelegram(FN, "portal-quote → next_action", nextError.message, {
      Ticket: ctx.ticket_id,
    });
  }

  console.log(`[${FN}] portal-quote: contractor ${ctx.contractor_id} submitted ${numFmt} for ticket ${ctx.ticket_id}`);

  return new Response(
    JSON.stringify({
      ok: true,
      source: "portal-quote",
      ticket_id: ctx.ticket_id,
      quote_amount: numFmt,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Path C: Portal Scheduling (contractor books via portal) ─────────────
async function handlePortalSchedule(
  supabase: SupabaseClient,
  body: Record<string, any>,
): Promise<Response> {
  const { token, date, time_slot, notes } = body;

  if (!token || !date) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing token or date" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Call the RPC — it validates token, updates ticket, returns context
  const { data, error } = await supabase.rpc("c1_submit_contractor_schedule", {
    p_token: token,
    p_date: date,
    p_time_slot: time_slot || null,
    p_notes: notes || null,
  });

  if (error || (!data?.ok && !data?.success)) {
    const errMsg = error?.message || data?.error || "Schedule submission failed";
    await alertTelegram(FN, "portal-schedule \u2192 RPC", errMsg, { Token: token });
    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const ticketId = data.ticket_id;
  const scheduledDate = new Date(date);
  const formattedDate = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(scheduledDate);
  const formattedWindow = time_slot ? `the ${time_slot.toLowerCase()} of ${formattedDate}` : formattedDate;

  // Get full ticket context for notifications
  const { data: ctx, error: rpcError } = await supabase.rpc(
    "c1_job_reminder_payload",
    { p_ticket_id: ticketId },
  );

  if (rpcError || !ctx?.ok) {
    const errMsg = rpcError?.message || ctx?.reason || "c1_job_reminder_payload failed";
    await alertTelegram(FN, "portal-schedule \u2192 c1_job_reminder_payload", errMsg, { Ticket: ticketId });
    // Still return success — the schedule was saved, just notifications failed
    return new Response(
      JSON.stringify({ ok: true, ticket_id: ticketId, notifications_failed: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const addr = ctx.property?.address || "Address not available";
  const contrName = ctx.contractor?.contractor_name || "Contractor";
  const issueTitle = ctx.ticket?.issue_title || ctx.ticket?.issue_description || "Maintenance issue";
  const mgrPhone = ctx.manager?.phone;
  const llPhone = ctx.property?.landlord_phone;
  const updatePhone = ctx.update_contact_phone;

  // Send notifications in parallel (same as Fillout path)
  const sends: Promise<any>[] = [];
  const results: Array<{ type: string; sent: boolean; error?: string }> = [];

  if (updatePhone) {
    const tenantFirstName = (ctx.tenant?.name || "").split(" ")[0] || "there";
    const friendlyDate = formatFriendlyDate(date);
    const category = withArticle(ctx.ticket?.category || "contractor");
    const slot = timeOfDay(time_slot || date);
    const contrPhoneTenant = ctx.contractor?.contractor_phone || "";
    const tenantToken = await ensureTenantToken(supabase, ticketId, ctx.ticket?.tenant_token);
    if (tenantToken) {
    sends.push((async () => {
      const r = await sendAndLog(supabase, FN, "portal-schedule \u2192 tenant_job_booked", {
        ticketId,
        recipientPhone: updatePhone,
        recipientRole: "tenant",
        messageType: "tenant_job_booked",
        templateSid: TEMPLATES.tenant_job_booked,
        variables: {
          "1": tenantFirstName,
          "2": friendlyDate,
          "3": category,
          "4": contrName,
          "5": slot,
          "6": formatUkPhone(contrPhoneTenant),
          "7": tenantToken,
        },
      });
      results.push({ type: "tenant_job_booked", sent: r.ok, error: r.error });
    })());
    }
  }

  if (mgrPhone) {
    const contrPhone = ctx.contractor?.contractor_phone || "";
    const contrDisplay = contrPhone ? `${contrName} — ${formatUkPhone(contrPhone)}` : contrName;
    sends.push((async () => {
      const r = await sendAndLog(supabase, FN, "portal-schedule → pm_job_booked", {
        ticketId,
        recipientPhone: mgrPhone,
        recipientRole: "manager",
        messageType: "pm_job_booked",
        templateSid: TEMPLATES.pm_job_booked,
        variables: {
          "1": formattedWindow,
          "2": addr,
          "3": issueTitle,
          "4": contrDisplay,
        },
      });
      results.push({ type: "pm_job_booked", sent: r.ok, error: r.error });
    })());
  }

  if (llPhone) {
    const llName = ctx.property?.landlord_name || "there";
    const category = categoryDisplayName(ctx.ticket?.category || "contractor");
    const mgrContact = ctx.manager?.phone ? formatUkPhone(ctx.manager.phone) : "your property manager";
    sends.push((async () => {
      const r = await sendAndLog(supabase, FN, "portal-schedule → ll_job_booked", {
        ticketId,
        recipientPhone: llPhone,
        recipientRole: "landlord",
        messageType: "ll_job_booked",
        templateSid: TEMPLATES.ll_job_booked,
        variables: {
          "1": llName,
          "2": category,
          "3": formattedWindow,
          "4": issueTitle,
          "5": addr,
          "6": mgrContact,
        },
      });
      results.push({ type: "ll_job_booked", sent: r.ok, error: r.error });
    })());
  }

  await Promise.all(sends);

  return new Response(
    JSON.stringify({
      ok: true,
      path: "portal-schedule",
      ticket_id: ticketId,
      scheduled_date: date,
      notifications: results,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Path D: Portal Completion (contractor marks job complete via portal) ──
async function handlePortalCompletion(
  supabase: SupabaseClient,
  body: Record<string, any>,
): Promise<Response> {
  const { token, notes, photos, resolved } = body;

  if (!token) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing token" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Not Complete path: record reason, notify PM, don't change job_stage ──
  if (resolved === false) {
    const { data, error } = await supabase.rpc("c1_submit_contractor_not_completed", {
      p_token: token,
      p_reason: notes || "Contractor reported job not completed",
    });

    if (error || (!data?.ok && !data?.success)) {
      const errMsg = error?.message || data?.error || "Not-completed submission failed";
      await alertTelegram(FN, "portal-not-completed → RPC", errMsg, { Token: token });
      return new Response(
        JSON.stringify({ ok: false, error: errMsg }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const ticketId = data.ticket_id;
    const { data: ctx } = await supabase.rpc("c1_job_reminder_payload", { p_ticket_id: ticketId });

    if (ctx?.ok && ctx.manager?.phone) {
      const addr = ctx.property?.address || "Address not available";
      const issueTitle = ctx.ticket?.issue_title || ctx.ticket?.issue_description || "Maintenance issue";
      const contrName = ctx.contractor?.contractor_name || "Contractor";

      await sendAndLog(supabase, FN, "portal-not-completed → pm_job_not_completed", {
        ticketId,
        recipientPhone: ctx.manager.phone,
        recipientRole: "manager",
        messageType: "pm_job_not_completed",
        templateSid: TEMPLATES.pm_job_not_completed,
        variables: {
          "1": addr,
          "2": issueTitle,
          "3": contrName,
          "4": notes || "Contractor reported job not completed",
        },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, path: "portal-not-completed", ticket_id: ticketId }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Complete path: mark completed, notify PM + landlord ──
  const { data, error } = await supabase.rpc("c1_submit_contractor_completion", {
    p_token: token,
    p_notes: notes || null,
    p_photos: photos || null,
  });

  if (error || (!data?.ok && !data?.success)) {
    const errMsg = error?.message || data?.error || "Completion submission failed";
    await alertTelegram(FN, "portal-completion → RPC", errMsg, { Token: token });
    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const ticketId = data.ticket_id;

  // Get ticket context for notifications
  const { data: ctx, error: ctxError } = await supabase.rpc(
    "c1_job_reminder_payload",
    { p_ticket_id: ticketId },
  );

  if (ctxError || !ctx?.ok) {
    return new Response(
      JSON.stringify({ ok: true, ticket_id: ticketId, notifications_failed: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const addr = ctx.property?.address || "Address not available";
  const contrName = ctx.contractor?.contractor_name || "Contractor";
  const contrPhone = ctx.contractor?.phone || ctx.contractor?.contractor_phone || "";
  const contrDisplay = contrPhone ? `${contrName} — ${formatUkPhone(contrPhone)}` : contrName;
  const issueTitle = ctx.ticket?.issue_title || ctx.ticket?.issue_description || "Maintenance issue";
  const mgrPhone = ctx.manager?.phone;
  const llPhone = ctx.property?.landlord_phone;

  const sends: Promise<any>[] = [];
  const results: Array<{ type: string; sent: boolean; error?: string }> = [];

  // PM notification
  if (mgrPhone) {
    sends.push((async () => {
      const r = await sendAndLog(supabase, FN, "portal-completion → pm_job_completed", {
        ticketId,
        recipientPhone: mgrPhone,
        recipientRole: "manager",
        messageType: "pm_job_completed",
        templateSid: TEMPLATES.pm_job_completed,
        variables: {
          "1": addr,
          "2": issueTitle,
          "3": contrDisplay,
        },
      });
      results.push({ type: "pm_job_completed", sent: r.ok, error: r.error });
    })());
  }

  // Landlord notification
  if (llPhone) {
    sends.push((async () => {
      const r = await sendAndLog(supabase, FN, "portal-completion → ll_job_completed", {
        ticketId,
        recipientPhone: llPhone,
        recipientRole: "landlord",
        messageType: "ll_job_completed",
        templateSid: TEMPLATES.ll_job_completed,
        variables: {
          "1": addr,
          "2": issueTitle,
          "3": contrName,
        },
      });
      results.push({ type: "ll_job_completed", sent: r.ok, error: r.error });
    })());
  }

  // Tenant notification — CTA to leave feedback via tenant portal
  const tenantPhone = ctx.tenant?.phone;
  const tenantToken = await ensureTenantToken(supabase, ticketId, ctx.ticket?.tenant_token);
  if (tenantPhone && tenantToken) {
    const tenantFirstName = (ctx.tenant?.name || "").split(" ")[0] || "there";
    sends.push((async () => {
      const r = await sendAndLog(supabase, FN, "portal-completion → tenant_job_completed", {
        ticketId,
        recipientPhone: tenantPhone,
        recipientRole: "tenant",
        messageType: "tenant_job_completed",
        templateSid: TEMPLATES.tenant_job_completed,
        variables: {
          "1": tenantFirstName,
          "2": issueTitle,
          "3": tenantToken,
        },
      });
      results.push({ type: "tenant_job_completed", sent: r.ok, error: r.error });
    })());
  }

  await Promise.all(sends);

  return new Response(
    JSON.stringify({
      ok: true,
      path: "portal-completion",
      ticket_id: ticketId,
      notifications: results,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Path E: Reschedule Request (tenant requests via portal) ─────────────
async function handleRescheduleRequest(
  supabase: SupabaseClient,
  body: Record<string, any>,
): Promise<Response> {
  const { token, proposed_date, reason } = body;

  if (!token || !proposed_date) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing token or proposed_date" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // RPC validates token, sets reschedule fields on ticket
  const { data, error } = await supabase.rpc("c1_submit_reschedule_request", {
    p_token: token,
    p_proposed_date: proposed_date,
    p_reason: reason || null,
  });

  if (error || (!data?.ok && !data?.success)) {
    const errMsg = error?.message || data?.error || "Reschedule request failed";
    await alertTelegram(FN, "reschedule-request \u2192 RPC", errMsg, { Token: token });
    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const ticketId = data.ticket_id;

  // Fetch full context for notifications (RPC only returns ticket_id)
  const { data: ctx } = await supabase.rpc("c1_job_reminder_payload", { p_ticket_id: ticketId });

  const addr = ctx?.property?.address || "Address not available";
  const issueTitle = ctx?.ticket?.issue_title || "Maintenance issue";
  const proposedDateFormatted = proposed_date
    ? new Date(proposed_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : "a new date";

  // Notify contractor via WhatsApp — "tenant wants to reschedule, check your portal"
  // Variables: 1=address, 2=issue, 3=proposed_date, 4=reason, 5=contractor_token
  if (ctx?.ok && ctx.contractor?.contractor_phone && TEMPLATES.contractor_reschedule_request !== "PENDING_APPROVAL") {
    await sendAndLog(supabase, FN, "reschedule-request \u2192 contractor WhatsApp", {
      ticketId,
      recipientPhone: ctx.contractor.contractor_phone,
      recipientRole: "contractor",
      messageType: "contractor_reschedule_request",
      templateSid: TEMPLATES.contractor_reschedule_request,
      variables: {
        "1": addr,
        "2": issueTitle,
        "3": proposedDateFormatted,
        "4": reason || "No reason given",
        "5": ctx.ticket?.contractor_token || token,
      },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, path: "reschedule-request", ticket_id: ticketId }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Path F: Reschedule Decision (contractor approves/declines via portal) ──
async function handleRescheduleDecision(
  supabase: SupabaseClient,
  body: Record<string, any>,
): Promise<Response> {
  const { token, approved } = body;

  if (!token || typeof approved !== "boolean") {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing token or approved boolean" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // RPC validates token, updates reschedule_status + scheduled_date if approved
  const { data, error } = await supabase.rpc("c1_submit_reschedule_decision", {
    p_token: token,
    p_approved: approved,
  });

  if (error || (!data?.ok && !data?.success)) {
    const errMsg = error?.message || data?.error || "Reschedule decision failed";
    await alertTelegram(FN, "reschedule-decision \u2192 RPC", errMsg, { Token: token });
    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const ticketId = data.ticket_id;

  // Fetch full context for notifications (RPC only returns ticket_id + approved)
  const { data: ctx } = await supabase.rpc("c1_job_reminder_payload", { p_ticket_id: ticketId });
  const tenantPhone = ctx?.tenant?.phone;
  const tenantToken = await ensureTenantToken(supabase, ticketId, ctx?.ticket?.tenant_token);
  const mgrPhone = ctx?.manager?.phone;
  const addr = ctx?.property?.address || "Address not available";
  const issueTitle = ctx?.ticket?.issue_title || "Maintenance issue";
  const contrName = ctx?.contractor?.contractor_name || "Contractor";
  const tenantFirstName = (ctx?.tenant?.name || "").split(" ")[0] || "there";

  // Format the new appointment: "Saturday 15th Mar, morning"
  const newAppointment = data.new_date
    ? `${formatFriendlyDate(data.new_date)}, ${timeOfDay(data.new_date)}`
    : "the new appointment";

  if (approved) {
    // Tenant gets "reschedule confirmed"
    // 8b_tenant_reschedule_approved: 1=tenantName, 2=issue, 3=address, 4=appointment, 5=tenantToken (CTA)
    if (tenantPhone && tenantToken && TEMPLATES.tenant_reschedule_approved !== "PENDING_APPROVAL") {
      await sendAndLog(supabase, FN, "reschedule-decision \u2192 tenant approved", {
        ticketId,
        recipientPhone: tenantPhone,
        recipientRole: "tenant",
        messageType: "tenant_reschedule_approved",
        templateSid: TEMPLATES.tenant_reschedule_approved,
        variables: {
          "1": tenantFirstName,
          "2": issueTitle,
          "3": addr,
          "4": newAppointment,
          "5": tenantToken,
        },
      });
    }

    // PM gets info-only notification (approved only, per design)
    // 8d_pm_reschedule_approved: 1=contractor_name, 2=address, 3=issue, 4=appointment
    if (mgrPhone && TEMPLATES.pm_reschedule_approved !== "PENDING_APPROVAL") {
      await sendAndLog(supabase, FN, "reschedule-decision \u2192 PM approved", {
        ticketId,
        recipientPhone: mgrPhone,
        recipientRole: "manager",
        messageType: "pm_reschedule_approved",
        templateSid: TEMPLATES.pm_reschedule_approved,
        variables: {
          "1": contrName,
          "2": addr,
          "3": issueTitle,
          "4": newAppointment,
        },
      });
    }
  } else {
    // Tenant gets "reschedule declined"
    // 8c_tenant_reschedule_declined: 1=tenantName, 2=issue, 3=address, 4=originalAppointment, 5=tenantToken (CTA)
    const originalAppointment = ctx?.ticket?.scheduled_date
      ? `${formatFriendlyDate(ctx.ticket.scheduled_date)}, ${timeOfDay(ctx.ticket.scheduled_date)}`
      : "your original appointment";
    if (tenantPhone && tenantToken && TEMPLATES.tenant_reschedule_declined !== "PENDING_APPROVAL") {
      await sendAndLog(supabase, FN, "reschedule-decision \u2192 tenant declined", {
        ticketId,
        recipientPhone: tenantPhone,
        recipientRole: "tenant",
        messageType: "tenant_reschedule_declined",
        templateSid: TEMPLATES.tenant_reschedule_declined,
        variables: {
          "1": tenantFirstName,
          "2": issueTitle,
          "3": addr,
          "4": originalAppointment,
          "5": tenantToken,
        },
      });
    }
    // PM does NOT get notified on decline (per design — they see it in app)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      path: "reschedule-decision",
      ticket_id: ticketId,
      approved,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Path G: Tenant Confirmation (tenant confirms resolution via portal) ──
async function handleTenantConfirmation(
  supabase: SupabaseClient,
  body: Record<string, any>,
): Promise<Response> {
  const { token, resolved, notes } = body;

  if (!token || typeof resolved !== "boolean") {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing token or resolved boolean" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // RPC validates token, updates ticket
  const { data, error } = await supabase.rpc("c1_submit_tenant_confirmation", {
    p_token: token,
    p_resolved: resolved,
    p_notes: notes || null,
  });

  if (error || (!data?.ok && !data?.success)) {
    const errMsg = error?.message || data?.error || "Tenant confirmation failed";
    await alertTelegram(FN, "tenant-confirmation \u2192 RPC", errMsg, { Token: token });
    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const ticketId = data.ticket_id;

  // If NOT resolved, notify PM
  if (!resolved) {
    const { data: ctx } = await supabase.rpc("c1_job_reminder_payload", { p_ticket_id: ticketId });
    if (ctx?.ok && ctx.manager?.phone) {
      const addr = ctx.property?.address || "Address not available";
      const issueTitle = ctx.ticket?.issue_title || ctx.ticket?.issue_description || "Maintenance issue";
      const contrName = ctx.contractor?.contractor_name || "Contractor";

      await sendAndLog(supabase, FN, "tenant-confirmation \u2192 pm_job_not_completed", {
        ticketId,
        recipientPhone: ctx.manager.phone,
        recipientRole: "manager",
        messageType: "pm_job_not_completed",
        templateSid: TEMPLATES.pm_job_not_completed,
        variables: {
          "1": addr,
          "2": issueTitle,
          "3": contrName,
          "4": notes || "Tenant reported issue not resolved",
        },
      });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, path: "tenant-confirmation", ticket_id: ticketId, resolved }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Main Handler ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const url = new URL(req.url);

    // Safely parse JSON body
    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid or empty JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Source from URL param (external callers) or body (supabase.functions.invoke)
    const source = url.searchParams.get("source") || body.source || "finalize-job";

    console.log(`[${FN}] source=${source}, body keys: ${Object.keys(body).join(",")}`);

    const supabase = createSupabaseClient();

    switch (source) {
      case "fillout":
        return await handleFilloutScheduling(supabase, body);
      case "portal-schedule":
        return await handlePortalSchedule(supabase, body);
      case "portal-completion":
        return await handlePortalCompletion(supabase, body);
      case "portal-quote":
        return await handlePortalQuote(supabase, body);
      case "reschedule-request":
        return await handleRescheduleRequest(supabase, body);
      case "reschedule-decision":
        return await handleRescheduleDecision(supabase, body);
      case "tenant-confirmation":
        return await handleTenantConfirmation(supabase, body);
      default:
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
