import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient, type SupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram, alertInfo } from "../_shared/telegram.ts";
import { sendAndLog } from "../_shared/twilio.ts";
import { TEMPLATES, shortRef } from "../_shared/templates.ts";

const FN = "yarro-ticket-notify";

// ─── Helper: Format caller info string ───────────────────────────────────
function formatCallerInfo(ctx: Record<string, any>): string {
  const name = ctx.caller_name || ctx.tenant_name || "Unknown";
  const phone = ctx.caller_phone || ctx.tenant_phone || "";
  const role = ctx.caller_role || ctx.reporter_role || "tenant";
  const roleCapitalized = role.charAt(0).toUpperCase() + role.slice(1);
  return `${name} (+${phone}, Role - ${roleCapitalized})`;
}

function formatCallerInfoHandoff(ctx: Record<string, any>): string {
  const name = ctx.caller_name || ctx.tenant_name || "Unknown";
  const phone = ctx.caller_phone || ctx.tenant_phone || "";
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

// ─── Source: intake (post-ticket-creation from M(1) or c1_create_ticket) ─
async function handleIntake(
  supabase: SupabaseClient,
  ticketId: string,
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

  if (ctx.handoff) {
    if (ctx.manager_phone) {
      const r = await sendAndLog(supabase, FN, "intake → handoff PM SMS", {
        ticketId,
        recipientPhone: ctx.manager_phone,
        recipientRole: "manager",
        messageType: "pm_handoff",
        templateSid: TEMPLATES.handoff,
        variables: {
          "1": shortRef(ticketId),
          "2": ctx.label || "Handoff",
          "3": ctx.property_address || "",
          "4": formatCallerInfoHandoff(ctx),
          "5": ctx.tenant_name || "Tenant not matched",
          "6": ctx.issue_description || "",
          "7": ctx.priority || "",
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
  } else {
    const sends: Promise<void>[] = [];

    if (ctx.manager_phone) {
      sends.push((async () => {
        const r = await sendAndLog(supabase, FN, "intake → PM ticket created SMS", {
          ticketId,
          recipientPhone: ctx.manager_phone,
          recipientRole: "manager",
          messageType: "pm_ticket_created",
          templateSid: TEMPLATES.ticket_created,
          variables: {
            "1": shortRef(ticketId),
            "2": ctx.property_address || "",
            "3": formatCallerInfo(ctx),
            "4": formatTenantInfo(ctx),
            "5": ctx.issue_description || "",
            "6": ctx.priority || "",
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
          messageType: "ll_ticket_created",
          templateSid: TEMPLATES.ticket_created,
          variables: {
            "1": shortRef(ticketId),
            "2": ctx.property_address || "",
            "3": formatCallerInfo(ctx),
            "4": formatTenantInfo(ctx),
            "5": ctx.issue_description || "",
            "6": ctx.priority || "",
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
    messageType: "ll_ticket_created",
    templateSid: TEMPLATES.ticket_created,
    variables: {
      "1": shortRef(ticketId),
      "2": ctx.property_address || "",
      "3": ctx.business_name || "",
      "4": ctx.tenant_name || "N/A",
      "5": ctx.issue_description || "",
      "6": ctx.priority || "",
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

    if (source === "manual-ll") {
      return await handleManualLandlord(supabase, ticketId);
    } else {
      return await handleIntake(supabase, ticketId);
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
