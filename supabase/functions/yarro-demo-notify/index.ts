import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEMPLATES: Record<string, string> = {
  pm_ticket: "HXae68475514259fc241bb14e303280420",
  pm_auto_approved: "HXe2f046212f2c4a9b7809e85cf0eb0816",
};

async function sendWhatsApp(
  to: string,
  templateSid: string,
  variables: Record<string, string>,
) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();

  if (!accountSid || !authToken) {
    return { ok: false, error: "TWILIO credentials not configured" };
  }

  const cleanVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    let cleaned = String(value ?? "-").replace(/[\r\n\t]+/g, " ").trim();
    if (!cleaned) cleaned = "-";
    cleanVars[key] = cleaned;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    From: "whatsapp:+447463558759",
    To: `whatsapp:+${to}`,
    ContentSid: templateSid,
    ContentVariables: JSON.stringify(cleanVars),
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("[twilio] Send failed:", data);
    return { ok: false, error: data.message || `HTTP ${res.status}` };
  }

  return { ok: true, messageSid: data.sid };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { pm_id, step } = await req.json();
    console.log("[demo-notify] pm_id:", pm_id, "step:", step);

    if (!pm_id || !step) {
      return new Response(JSON.stringify({ error: "pm_id and step required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pm } = await supabase
      .from("c1_property_managers")
      .select("id, name, phone")
      .eq("id", pm_id)
      .single();

    console.log("[demo-notify] PM phone:", pm?.phone);

    if (!pm?.phone) {
      return new Response(JSON.stringify({ error: "No PM or phone" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: ticket } = await supabase
      .from("c1_tickets")
      .select("id, issue_description, date_logged")
      .eq("property_manager_id", pm_id)
      .eq("is_demo", true)
      .limit(1)
      .single();

    console.log("[demo-notify] Ticket:", ticket?.id);

    if (!ticket) {
      return new Response(JSON.stringify({ error: "No demo ticket" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const phone = pm.phone.startsWith("44") ? pm.phone : `44${pm.phone}`;
    let result;

    // Hardcode clean descriptions — DB values have newlines that Twilio rejects
    const cleanDesc = "Boiler is not producing hot water since this morning. No heating either.";

    if (step === 1) {
      const vars = {
        "1": cleanDesc,
        "2": "14 Brixton Hill, London SW2 1QA",
        "3": "Sarah Mitchell (Room 1)",
        "4": "Today",
      };
      console.log("[demo-notify] Sending pm_ticket with vars:", JSON.stringify(vars));
      result = await sendWhatsApp(phone, TEMPLATES.pm_ticket, vars);
    } else if (step === 2) {
      const vars = {
        "1": "Mike's Plumbing",
        "2": "14 Brixton Hill, London SW2 1QA",
        "3": cleanDesc,
        "4": "-",
        "5": "85",
        "6": "85",
        "7": "0",
      };
      console.log("[demo-notify] Sending pm_auto_approved with vars:", JSON.stringify(vars));
      result = await sendWhatsApp(phone, TEMPLATES.pm_auto_approved, vars);
    } else {
      return new Response(JSON.stringify({ error: "Invalid step" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log("[demo-notify] Result:", result);

    return new Response(JSON.stringify({ ok: result.ok, step, error: result.error }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[demo-notify] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
