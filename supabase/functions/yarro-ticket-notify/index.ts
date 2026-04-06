import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient, type SupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram, alertInfo } from "../_shared/telegram.ts";
import { sendAndLog } from "../_shared/twilio.ts";
import { TEMPLATES, shortRef } from "../_shared/templates.ts";
import { signedImageUrl } from "../_shared/image-url.ts";

const FN = "yarro-ticket-notify";

// ─── Helper: Format caller info string ───────────────────────────────────
function formatCallerInfo(ctx: Record<string, any>): string {
  const name = ctx.caller_name || ctx.tenant_name || "Unknown";
  const phone = ctx.caller_phone || ctx.tenant_phone || "N/A";
  const role = ctx.caller_role || ctx.reporter_role || "tenant";
  const roleCapitalized = role.charAt(0).toUpperCase() + role.slice(1);
  return `${name} (+${phone}, Role - ${roleCapitalized})`;
}

function formatCallerInfoHandoff(ctx: Record<string, any>): string {
  const name = ctx.caller_name || ctx.tenant_name || "Unknown";
  const phone = ctx.caller_phone || ctx.tenant_phone || "N/A";
  const role = ctx.caller_role || ctx.reporter_role || "tenant";
  const tag = ctx.caller_tag || "";
  const roleCapitalized = role.charAt(0).toUpperCase() + role.slice(1);

  let info = `${name} (+${phone}) - ${roleCapitalized}`;
  if (tag && tag.toLowerCase() !== role.toLowerCase()) {
    info += ` - ${tag.charAt(0).toUpperCase() + tag.slice(1)}`;
  }
  return info;
}

function formatTenantInfo(ctx: Record<string, any>): string {
  const name = ctx.tenant_name || "Tenant not matched";
  const verified = ctx.tenant_verified_by || "Auto-verified";
  return ctx.is_matched_tenant
    ? `${name} (Verification: ${verified})`
    : "Tenant not matched";
}

function formatReportTime(dateLogged: string | null): string {
  if (!dateLogged) return "recently";
  const d = new Date(dateLogged);
  const hh = d.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" });
  const dd = d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/London" });
  return `${hh} on ${dd}`;
}

function reporterName(ctx: Record<string, any>): string {
  return ctx.caller_name || ctx.tenant_name || "the tenant";
}

// ─── Helper: Calculate next 9am UK (Mon-Fri) ─────────────────────────────
function getNext9amUk(): Date {
  // Get current UK time
  const now = new Date();
  const ukStr = now.toLocaleString("en-GB", { timeZone: "Europe/London", hour12: false });
  // Parse UK time components
  const [datePart, timePart] = ukStr.split(", ");
  const [day, month, year] = datePart.split("/").map(Number);
  const [hour] = timePart.split(":").map(Number);

  // Start from tomorrow if after 9am UK, otherwise today
  const ukNow = new Date(Date.UTC(year, month - 1, day, hour));
  const target = new Date(Date.UTC(year, month - 1, day, 9, 0, 0));

  // If it's before 9am UK on a weekday, dispatch today at 9am
  // Otherwise, find the next weekday
  let candidate = new Date(target);
  if (hour >= 9) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  // Skip weekends (0=Sun, 6=Sat)
  while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  // Convert from UK 9am to UTC — check if UK is in BST
  // Use Intl to get the actual UTC offset for the target date
  const testDate = new Date(candidate);
  const utcHour = parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(Date.UTC(testDate.getUTCFullYear(), testDate.getUTCMonth(), testDate.getUTCDate(), 9)))
  );

  // If formatting UTC 9:00 as UK time gives 10, UK is UTC+1 (BST), so 9am UK = 8am UTC
  // If it gives 9, UK is UTC+0 (GMT), so 9am UK = 9am UTC
  if (utcHour === 10) {
    // BST: 9am UK = 8am UTC
    candidate.setUTCHours(8, 0, 0, 0);
  } else {
    // GMT: 9am UK = 9am UTC
    candidate.setUTCHours(9, 0, 0, 0);
  }

  return candidate;
}

// ─── Source: morning-dispatch (pg_cron delayed OOH tickets) ───────────────
async function handleMorningDispatch(
  supabase: SupabaseClient,
  ticketId: string,
): Promise<Response> {
  // Fetch ticket context using the same RPC as intake
  const { data: ctxRows, error: ctxError } = await supabase.rpc(
    "c1_ticket_context",
    { ticket_uuid: ticketId },
  );

  if (ctxError || !ctxRows || ctxRows.length === 0) {
    const errMsg = ctxError?.message || "c1_ticket_context returned empty";
    await alertTelegram(FN, "morning-dispatch → c1_ticket_context", errMsg, { Ticket: ticketId });
    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const ctx = ctxRows[0];
  const results: Array<{ type: string; sent: boolean; error?: string }> = [];

  // ── Send notifications to all parties (PM, landlord, tenant portal) ──
  const sends: Promise<void>[] = [];

  if (ctx.manager_phone) {
    sends.push((async () => {
      const r = await sendAndLog(supabase, FN, "morning-dispatch → PM ticket created SMS", {
        ticketId,
        recipientPhone: ctx.manager_phone,
        recipientRole: "manager",
        messageType: "pm_ticket_created",
        templateSid: TEMPLATES.pm_ticket,
        variables: {
          "1": ctx.issue_description || "Maintenance issue reported",
          "2": ctx.property_address || "Address not available",
          "3": reporterName(ctx),
          "4": formatReportTime(ctx.date_logged),
        },
      });
      results.push({ type: "pm_ticket_created", sent: r.ok, error: r.error });
    })());
  }

  if (ctx.landlord_phone) {
    sends.push((async () => {
      const r = await sendAndLog(supabase, FN, "morning-dispatch → LL ticket created SMS", {
        ticketId,
        recipientPhone: ctx.landlord_phone,
        recipientRole: "landlord",
        recipientId: ctx.landlord_id,
        messageType: "ll_ticket_created",
        templateSid: TEMPLATES.ll_ticket,
        variables: {
          "1": ctx.issue_description || "Maintenance issue reported",
          "2": ctx.property_address || "Address not available",
          "3": reporterName(ctx),
          "4": formatReportTime(ctx.date_logged),
        },
      });
      results.push({ type: "ll_ticket_created", sent: r.ok, error: r.error });
    })());
  }

  await Promise.all(sends);

  // ── Trigger contractor dispatch ──
  const { error: dispatchError } = await supabase.rpc(
    "c1_contractor_context",
    { ticket_uuid: ticketId },
  );

  if (dispatchError) {
    await alertTelegram(FN, "morning-dispatch → c1_contractor_context", dispatchError.message, {
      Ticket: ticketId,
      Note: "Dispatch chain NOT triggered — contractors NOT contacted",
    });
  }

  // ── Clear the delayed dispatch flags ──
  const { error: clearErr } = await supabase
    .from("c1_tickets")
    .update({ pending_review: false, dispatch_after: null })
    .eq("id", ticketId);

  if (clearErr) {
    await alertTelegram(FN, "morning-dispatch → clear flags", clearErr.message, { Ticket: ticketId });
  }

  console.log(`[${FN}] Morning dispatch complete for ticket ${ticketId}: ${results.length} notifications sent`);

  return new Response(
    JSON.stringify({
      ok: true,
      source: "morning-dispatch",
      ticket_id: ticketId,
      notifications: results,
      dispatch_triggered: !dispatchError,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Source: intake (post-ticket-creation from M(1) or c1_create_ticket) ─
async function handleIntake(
  supabase: SupabaseClient,
  ticketId: string,
  aiFallback = false,
): Promise<Response> {
  const { data: ctxRows, error: ctxError } = await supabase.rpc(
    "c1_ticket_context",
    { ticket_uuid: ticketId },
  );

  if (ctxError || !ctxRows || ctxRows.length === 0) {
    const errMsg = ctxError?.message || "c1_ticket_context returned empty";
    await alertTelegram(FN, "intake → c1_ticket_context", errMsg, { Ticket: ticketId });
    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const ctx = ctxRows[0];
  const results: Array<{ type: string; sent: boolean; error?: string }> = [];

  // ── Generate tenant_token on every ticket creation ──
  const tenantToken = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  {
    const { error: tokenErr } = await supabase.from("c1_tickets").update({
      tenant_token: tenantToken,
      tenant_token_at: new Date().toISOString(),
    }).eq("id", ticketId);
    if (tokenErr) {
      await alertTelegram(FN, "intake → set tenant_token", tokenErr.message, { Ticket: ticketId });
    }
  }

  // Get PM settings (ticket_mode + OOH config)
  let isReviewMode = false;
  let pmId: string | null = null;
  let pmSettings: { ticket_mode?: string; ooh_enabled?: boolean; ooh_routine_action?: string } = {};
  {
    const { data: ticketData } = await supabase
      .from("c1_tickets")
      .select("property_manager_id")
      .eq("id", ticketId)
      .single();
    pmId = ticketData?.property_manager_id || null;
    if (pmId) {
      const { data: pmData } = await supabase
        .from("c1_property_managers")
        .select("ticket_mode, ooh_enabled, ooh_routine_action")
        .eq("id", pmId)
        .single();
      pmSettings = pmData || {};
      isReviewMode = pmData?.ticket_mode === "review";
    }
  }

  // ── OOH CHECK: route emergencies to OOH contacts outside business hours ──
  // Note: emergencies from AI always have handoff=true, so we must NOT exclude them
  if (pmId && pmSettings.ooh_enabled) {
    const { data: withinHours, error: hoursErr } = await supabase.rpc("c1_is_within_business_hours", {
      p_pm_id: pmId,
    });
    if (hoursErr) {
      await alertTelegram(FN, "intake → business hours check", hoursErr.message, { Ticket: ticketId });
    }

    if (!withinHours) {
      const priority = (ctx.priority || "").toLowerCase();
      const isEmergencyOrUrgent = priority === "emergency" || priority === "urgent";

      if (isEmergencyOrUrgent) {
        const { data: contacts, error: contactsErr } = await supabase.rpc("c1_get_ooh_contacts", {
          p_pm_id: pmId,
        });
        if (contactsErr) {
          await alertTelegram(FN, "intake → OOH contacts fetch", contactsErr.message, { Ticket: ticketId });
        }

        if (contacts && contacts.length > 0) {
          // Generate token and mark ticket as OOH-dispatched
          const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
          const { error: updateErr } = await supabase.from("c1_tickets").update({
            ooh_dispatched: true,
            ooh_dispatched_at: new Date().toISOString(),
            ooh_contact_id: contacts[0].id,
            ooh_token: token,
            handoff: false, // Clear handoff so ticket is exclusively OOH-routed
          }).eq("id", ticketId);

          if (updateErr) {
            await alertTelegram(FN, "intake \u2192 OOH mark dispatched", updateErr.message, { Ticket: ticketId });
          }

          // Send OOH template to each contact
          for (const contact of contacts) {
            const r = await sendAndLog(supabase, FN, "intake \u2192 OOH contact dispatch", {
              ticketId,
              recipientPhone: contact.phone,
              recipientRole: "ooh_contact",
              messageType: "ooh_emergency_dispatch",
              templateSid: TEMPLATES.ooh_emergency_dispatch,
              variables: {
                "1": ctx.business_name || "Your property manager",
                "2": ctx.property_address || "Address not available",
                "3": ctx.issue_description || "Emergency maintenance issue",
                "4": ctx.has_images ? await signedImageUrl(ticketId) : "No photos or videos provided",
                "5": `${ctx.tenant_name || "Tenant not matched"} — ${ctx.tenant_phone ? `+${ctx.tenant_phone}` : "N/A"}`,
                "6": ctx.access_instructions || "Contact property manager for access details",
                "7": token,
              },
            });
            results.push({ type: `ooh_contact_${contact.name}`, sent: r.ok, error: r.error });
          }

          // Notify PM too (standard ticket_created template so they know)
          if (ctx.manager_phone) {
            const r = await sendAndLog(supabase, FN, "intake \u2192 PM OOH notification", {
              ticketId,
              recipientPhone: ctx.manager_phone,
              recipientRole: "manager",
              messageType: "pm_ticket_created",
              templateSid: TEMPLATES.pm_ticket,
              variables: {
                "1": (ctx.issue_description || "Maintenance issue reported") + " (Sent to OOH contact)",
                "2": ctx.property_address || "Address not available",
                "3": reporterName(ctx),
                "4": formatReportTime(ctx.date_logged)
              },
            });
            results.push({ type: "pm_ooh_notify", sent: r.ok, error: r.error });
          }

          // Send tenant portal link alongside OOH dispatch
          const tenantPhone = ctx.tenant_phone || ctx.caller_phone;
          if (tenantPhone) {
            const tenantFirstName = (ctx.tenant_name || "").split(" ")[0] || "there";
            const tResult = await sendAndLog(supabase, FN, "intake → OOH tenant portal link", {
              ticketId,
              recipientPhone: tenantPhone,
              recipientRole: "tenant",
              messageType: "tenant_portal_link",
              templateSid: TEMPLATES.tenant_portal_link,
              variables: { "1": tenantFirstName, "2": tenantToken },
            });
            results.push({ type: "tenant_portal_link", sent: tResult.ok, error: tResult.error });
          }

          return new Response(
            JSON.stringify({
              ok: true,
              source: "intake",
              ticket_id: ticketId,
              ooh_dispatched: true,
              contacts_notified: contacts.length,
              notifications: results,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        // No OOH contacts set — fall through to existing handoff/dispatch flow
      } else {
        // Routine ticket outside hours
        if (pmSettings.ooh_routine_action === "queue_review") {
          // Calculate next 9am UK business day
          const nextDispatch = getNext9amUk();
          const { error: queueErr } = await supabase
            .from("c1_tickets")
            .update({ pending_review: true, dispatch_after: nextDispatch.toISOString() })
            .eq("id", ticketId);

          if (queueErr) {
            await alertTelegram(FN, "intake \u2192 OOH queue routine", queueErr.message, { Ticket: ticketId });
          }

          console.log(`[${FN}] OOH queued ticket ${ticketId} for morning dispatch at ${nextDispatch.toISOString()}`);

          return new Response(
            JSON.stringify({
              ok: true,
              source: "intake",
              ticket_id: ticketId,
              ooh_queued_for_review: true,
              dispatch_after: nextDispatch.toISOString(),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        // ooh_routine_action = 'dispatch' — fall through to normal dispatch
      }
    }
  }

  if (aiFallback) {
    // ── AI CLASSIFICATION FAILED — force review mode, skip handoff ──
    const { error: reviewFlagErr } = await supabase
      .from("c1_tickets")
      .update({ pending_review: true })
      .eq("id", ticketId);

    if (reviewFlagErr) {
      await alertTelegram(FN, "intake → set pending_review (ai_fallback)", reviewFlagErr.message, { Ticket: ticketId });
    }

    if (ctx.manager_phone) {
      const r = await sendAndLog(supabase, FN, "intake → AI fallback review SMS", {
        ticketId,
        recipientPhone: ctx.manager_phone,
        recipientRole: "manager",
        messageType: "pm_ticket_review",
        templateSid: TEMPLATES.ticket_review,
        variables: {
          "1": ctx.issue_description || "Maintenance issue reported",
          "2": ctx.property_address || "Address not available",
          "3": reporterName(ctx),
          "4": formatReportTime(ctx.date_logged),
        },
      });
      results.push({ type: "pm_ticket_review", sent: r.ok, error: r.error });
    }
    // NO contractor dispatch — ticket stays in pending_review until PM triages
  } else if (ctx.handoff) {
    // ── HANDOFF — classify reason and prefix for PM ──
    let handoffPrefix = "";
    if (!ctx.property_id) {
      handoffPrefix = "[Property not matched] ";
    } else if (!ctx.category || ctx.category === "") {
      handoffPrefix = "[Issue type unclear] ";
    } else {
      const mapping = ctx.contractor_mapping as Record<string, any> | null;
      const mapped = mapping?.[ctx.category];
      if (!mapped || (Array.isArray(mapped) && mapped.length === 0)) {
        handoffPrefix = `[No ${ctx.category} contractor mapped] `;
      }
    }

    if (ctx.manager_phone) {
      const r = await sendAndLog(supabase, FN, "intake → handoff PM SMS", {
        ticketId,
        recipientPhone: ctx.manager_phone,
        recipientRole: "manager",
        messageType: "pm_handoff",
        templateSid: TEMPLATES.handoff,
        variables: {
          "1": handoffPrefix + (ctx.issue_description || "Issue details unavailable"),
          "2": ctx.property_address || "Address not available",
          "3": reporterName(ctx),
          "4": formatReportTime(ctx.date_logged),
        },
      });
      results.push({ type: "pm_handoff", sent: r.ok, error: r.error });
    } else {
      // No PM phone — property not matched. Send urgent Telegram alert.
      const isEmergency = (ctx.label || "").toUpperCase().includes("EMERGENCY")
        || (ctx.priority || "").toLowerCase() === "emergency";
      const extras = {
        Ticket: ticketId,
        Label: ctx.label || "N/A",
        Priority: ctx.priority || "N/A",
        "Caller Phone": ctx.caller_phone || ctx.tenant_phone || "Unknown",
        "Caller Name": ctx.caller_name || ctx.tenant_name || "Unknown",
        Issue: (ctx.issue_description || "").slice(0, 200),
        "Property Address": ctx.property_address || "NOT MATCHED",
      };
      if (isEmergency) {
        await alertTelegram(FN, "EMERGENCY handoff — no property manager found",
          "No PM phone — property not matched. Ticket created, needs manual review.", extras);
      } else {
        await alertInfo(FN, "Handoff ticket — no property manager found", extras);
      }
      results.push({ type: "telegram_fallback", sent: true });
    }
  } else if (isReviewMode) {
    // ── REVIEW MODE: flag ticket for PM triage, skip auto-dispatch ──
    const { error: reviewFlagErr } = await supabase
      .from("c1_tickets")
      .update({ pending_review: true })
      .eq("id", ticketId);

    if (reviewFlagErr) {
      await alertTelegram(FN, "intake → set pending_review", reviewFlagErr.message, { Ticket: ticketId });
    }

    // Send PM the review notification template
    if (ctx.manager_phone) {
      const r = await sendAndLog(supabase, FN, "intake → PM review SMS", {
        ticketId,
        recipientPhone: ctx.manager_phone,
        recipientRole: "manager",
        messageType: "pm_ticket_review",
        templateSid: TEMPLATES.ticket_review,
        variables: {
          "1": ctx.issue_description || "Maintenance issue reported",
          "2": ctx.property_address || "Address not available",
          "3": reporterName(ctx),
          "4": formatReportTime(ctx.date_logged)
        },
      });
      results.push({ type: "pm_ticket_review", sent: r.ok, error: r.error });
    }

    // NO landlord notification in review mode — PM triages first, decides what happens
    // NO c1_contractor_context call — ticket stays in pending_review until PM dispatches
  } else {
    // ── AUTO MODE: existing flow — notify + dispatch ──
    const sends: Promise<void>[] = [];

    if (ctx.manager_phone) {
      sends.push((async () => {
        const r = await sendAndLog(supabase, FN, "intake → PM ticket created SMS", {
          ticketId,
          recipientPhone: ctx.manager_phone,
          recipientRole: "manager",
          messageType: "pm_ticket_created",
          templateSid: TEMPLATES.pm_ticket,
          variables: {
            "1": ctx.issue_description || "Maintenance issue reported",
            "2": ctx.property_address || "Address not available",
            "3": reporterName(ctx),
            "4": formatReportTime(ctx.date_logged)
          },
        });
        results.push({ type: "pm_ticket_created", sent: r.ok, error: r.error });
      })());
    }

    if (ctx.landlord_phone) {
      sends.push((async () => {
        const r = await sendAndLog(supabase, FN, "intake → LL ticket created SMS", {
          ticketId,
          recipientPhone: ctx.landlord_phone,
          recipientRole: "landlord",
          recipientId: ctx.landlord_id,
          messageType: "ll_ticket_created",
          templateSid: TEMPLATES.ll_ticket,
          variables: {
            "1": ctx.issue_description || "Maintenance issue reported",
            "2": ctx.property_address || "Address not available",
            "3": reporterName(ctx),
            "4": formatReportTime(ctx.date_logged)
          },
        });
        results.push({ type: "ll_ticket_created", sent: r.ok, error: r.error });
      })());
    }

    await Promise.all(sends);

    // Safety net: if neither PM nor landlord could be reached, alert Telegram
    if (!ctx.manager_phone && !ctx.landlord_phone) {
      await alertInfo(FN, "Ticket created but no PM or landlord phone found", {
        Ticket: ticketId,
        Priority: ctx.priority || "N/A",
        Issue: (ctx.issue_description || "").slice(0, 200),
        "Caller Phone": ctx.caller_phone || ctx.tenant_phone || "Unknown",
      });
    }

    const { error: dispatchError } = await supabase.rpc(
      "c1_contractor_context",
      { ticket_uuid: ticketId },
    );

    if (dispatchError) {
      await alertTelegram(FN, "intake → c1_contractor_context (dispatch trigger)", dispatchError.message, {
        Ticket: ticketId,
        Note: "Dispatch chain NOT triggered — contractors NOT contacted",
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      source: "intake",
      ticket_id: ticketId,
      handoff: ctx.handoff,
      review_mode: isReviewMode,
      notifications: results,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Source: manual-ll (manual landlord notification) ────────────────────
async function handleManualLandlord(
  supabase: SupabaseClient,
  ticketId: string,
): Promise<Response> {
  const { data: ctxRows, error: ctxError } = await supabase.rpc(
    "c1_ticket_context",
    { ticket_uuid: ticketId },
  );

  if (ctxError || !ctxRows || ctxRows.length === 0) {
    const errMsg = ctxError?.message || "c1_ticket_context returned empty";
    await alertTelegram(FN, "manual-ll → c1_ticket_context", errMsg, { Ticket: ticketId });
    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const ctx = ctxRows[0];

  if (!ctx.landlord_phone) {
    await alertTelegram(FN, "manual-ll → no landlord phone", `Ticket ${ticketId} has no landlord phone`, {
      Ticket: ticketId,
    });
    return new Response(
      JSON.stringify({ ok: false, error: "No landlord phone number" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const r = await sendAndLog(supabase, FN, "manual-ll → LL ticket created SMS", {
    ticketId,
    recipientPhone: ctx.landlord_phone,
    recipientRole: "landlord",
    recipientId: ctx.landlord_id,
    messageType: "ll_ticket_created",
    templateSid: TEMPLATES.ll_ticket,
    variables: {
      "1": ctx.issue_description || "Maintenance issue reported",
      "2": ctx.property_address || "Address not available",
      "3": reporterName(ctx),
      "4": formatReportTime(ctx.date_logged)
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      source: "manual-ll",
      ticket_id: ticketId,
      sent: r.ok,
      messageSid: r.messageSid,
      error: r.error,
    }),
    { status: r.ok ? 200 : 500, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Main Handler ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Handle CORS preflight from browser-based supabase.functions.invoke()
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

    // Safely parse JSON body (empty body from preflight/bad request = 400, not 500)
    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid or empty JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const source = url.searchParams.get("source") || body.source || "intake";

    const ticketId = body.ticket_id || body.payload?.ticket_id || null;

    if (!ticketId) {
      return new Response(
        JSON.stringify({ ok: false, error: "No ticket_id in request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[${FN}] source=${source} ticket=${ticketId}`);

    const supabase = createSupabaseClient();

    if (source === "morning-dispatch") {
      return await handleMorningDispatch(supabase, ticketId);
    } else if (source === "manual-ll") {
      return await handleManualLandlord(supabase, ticketId);
    } else {
      const aiFallback = body.ai_fallback === true;
      return await handleIntake(supabase, ticketId, aiFallback);
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
