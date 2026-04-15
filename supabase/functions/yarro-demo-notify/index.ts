import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TEMPLATES: Record<string, string> = {
  pm_ticket: "HXae68475514259fc241bb14e303280420",
  pm_auto_approved: "HXe2f046212f2c4a9b7809e85cf0eb0816",
};

// Plain-text SMS fallbacks (no template approval needed)
const SMS_MESSAGES: Record<number, (desc: string) => string> = {
  1: (desc) =>
    `TENANT ALERT: ${desc} at 123 Demo Street. Yarro is matching a contractor now...`,
  2: (_desc) =>
    `UPDATE: Demo Repairs Ltd has been dispatched to 123 Demo Street. Quote: £85. Auto-approved by Yarro.`,
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

  const url =
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
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
    console.error("[twilio] WhatsApp send failed:", data);
    return {
      ok: false,
      error: data.message || `HTTP ${res.status}`,
      code: data.code,
    };
  }

  return { ok: true, messageSid: data.sid, channel: "whatsapp" };
}

async function sendSMS(to: string, body: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  const smsFrom = Deno.env.get("TWILIO_SMS_FROM")?.trim();

  if (!accountSid || !authToken) {
    return { ok: false, error: "TWILIO credentials not configured" };
  }

  if (!smsFrom) {
    return { ok: false, error: "TWILIO_SMS_FROM not configured" };
  }

  const url =
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({
    From: smsFrom,
    To: `+${to}`,
    Body: body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("[twilio] SMS send failed:", data);
    return { ok: false, error: data.message || `HTTP ${res.status}` };
  }

  return { ok: true, messageSid: data.sid, channel: "sms" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { pm_id, step } = await req.json();
    console.log("[demo-notify] pm_id:", pm_id, "step:", step);

    if (!pm_id || !step) {
      return new Response(
        JSON.stringify({ error: "pm_id and step required" }),
        {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    // ── Auth validation: verify caller owns this PM record ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Use service role for data queries (RLS doesn't apply to edge functions by default)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pm } = await supabase
      .from("c1_property_managers")
      .select("id, name, phone, user_id")
      .eq("id", pm_id)
      .single();

    if (!pm?.phone) {
      return new Response(JSON.stringify({ error: "No PM or phone" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Verify ownership
    if (pm.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
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
    const desc = (ticket.issue_description || "Maintenance issue reported")
      .replace(/[\r\n\t]+/g, " ")
      .trim();

    let result;

    if (step === 1) {
      const vars = {
        "1": desc,
        "2": "123 Demo Street, London SW1A 1AA",
        "3": "Jane Doe (Room 1)",
        "4": "Today",
      };
      console.log(
        "[demo-notify] Sending pm_ticket with vars:",
        JSON.stringify(vars),
      );
      result = await sendWhatsApp(phone, TEMPLATES.pm_ticket, vars);

      // Fallback to SMS if WhatsApp fails (opt-in issues, etc.)
      if (!result.ok) {
        console.log(
          "[demo-notify] WhatsApp failed, trying SMS fallback:",
          result.error,
        );
        const smsBody = SMS_MESSAGES[1](desc);
        result = await sendSMS(phone, smsBody);
      }
    } else if (step === 3) {
      // ── Interactive approval: generate token, upsert row, send SMS with link ──
      const token = crypto.randomUUID();

      const { error: upsertErr } = await supabase
        .from("demo_approvals")
        .upsert(
          { pm_id, token, approved: false, created_at: new Date().toISOString() },
          { onConflict: "pm_id" },
        );

      if (upsertErr) {
        console.error("[demo-notify] Approval upsert failed:", upsertErr);
        return new Response(
          JSON.stringify({ ok: false, error: "Failed to create approval" }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const approvalLink = `${supabaseUrl}/functions/v1/yarro-demo-approval?token=${token}`;
      const smsBody = `Yarro: A contractor quoted \u00a385 for the boiler repair at 123 Demo St. Tap to approve: ${approvalLink}`;

      console.log("[demo-notify] Sending approval SMS with link");
      result = await sendSMS(phone, smsBody);

    } else if (step === 2) {
      const vars = {
        "1": "Demo Repairs Ltd",
        "2": "123 Demo Street, London SW1A 1AA",
        "3": desc,
        "4": "-",
        "5": "85",
        "6": "85",
        "7": "0",
      };
      console.log(
        "[demo-notify] Sending pm_auto_approved with vars:",
        JSON.stringify(vars),
      );
      result = await sendWhatsApp(phone, TEMPLATES.pm_auto_approved, vars);

      // Fallback to SMS
      if (!result.ok) {
        console.log(
          "[demo-notify] WhatsApp failed, trying SMS fallback:",
          result.error,
        );
        const smsBody = SMS_MESSAGES[2](desc);
        result = await sendSMS(phone, smsBody);
      }
    } else {
      return new Response(JSON.stringify({ error: "Invalid step" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log("[demo-notify] Result:", result);

    return new Response(
      JSON.stringify({
        ok: result.ok,
        step,
        channel: result.channel,
        error: result.error,
      }),
      {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[demo-notify] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
