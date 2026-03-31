import { createSupabaseClient } from "../_shared/supabase.ts";
import { sendAndLog } from "../_shared/twilio.ts";
import { TEMPLATES } from "../_shared/templates.ts";

const FN = "yarro-demo-notify";

Deno.serve(async (req) => {
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
    const { pm_id, step } = await req.json();

    if (!pm_id || !step) {
      return new Response(JSON.stringify({ error: "pm_id and step required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createSupabaseClient();

    // Fetch PM details
    const { data: pm, error: pmError } = await supabase
      .from("c1_property_managers")
      .select("id, name, phone, business_name")
      .eq("id", pm_id)
      .single();

    if (pmError || !pm || !pm.phone) {
      return new Response(
        JSON.stringify({ error: "PM not found or no phone number" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Fetch demo ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("c1_tickets")
      .select("id, issue_description, issue_title, category, priority, date_logged, c1_properties(address)")
      .eq("property_manager_id", pm_id)
      .eq("is_demo", true)
      .limit(1)
      .single();

    if (ticketError || !ticket) {
      return new Response(
        JSON.stringify({ error: "No demo ticket found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const address = (ticket.c1_properties as unknown as { address: string })?.address || "Demo Property";
    const pmPhone = pm.phone.startsWith("44") ? pm.phone : `44${pm.phone}`;

    let result;

    if (step === 1) {
      // Step 1: New ticket notification
      result = await sendAndLog(supabase, FN, "demo → PM ticket notification", {
        ticketId: ticket.id,
        recipientPhone: pmPhone,
        recipientRole: "manager",
        messageType: "demo_ticket_created",
        templateSid: TEMPLATES.pm_ticket,
        variables: {
          "1": ticket.issue_description || "Boiler not heating — no hot water since this morning",
          "2": address,
          "3": "Sarah Mitchell (Room 1)",
          "4": new Date(ticket.date_logged).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      });
    } else if (step === 2) {
      // Step 2: Job scheduled notification
      result = await sendAndLog(supabase, FN, "demo → PM job approved", {
        ticketId: ticket.id,
        recipientPhone: pmPhone,
        recipientRole: "manager",
        messageType: "demo_job_approved",
        templateSid: TEMPLATES.pm_auto_approved,
        variables: {
          "1": "Mike's Plumbing",
          "2": address,
          "3": ticket.issue_description || "Boiler repair",
          "4": "-",
          "5": "£85",
          "6": "£85",
          "7": "£0",
        },
      });
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid step — use 1 or 2" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: result.ok,
        step,
        messageSid: result.messageSid,
        error: result.error,
      }),
      {
        status: result.ok ? 200 : 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error(`[${FN}] Error:`, err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
