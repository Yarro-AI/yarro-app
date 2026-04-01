import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient, type SupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram, alertInfo } from "../_shared/telegram.ts";
import { sendWhatsApp, logOutbound } from "../_shared/twilio.ts";
import { TEMPLATES } from "../_shared/templates.ts";

const FN = "yarro-onboarding-send";
const TENANT_INTAKE_NUMBER = "+44 7446 904822";

// ─── Types ──────────────────────────────────────────────────────────────

type EntityType = "tenant" | "contractor" | "landlord";

interface RequestBody {
  entity_type: EntityType;
  entity_ids: string[];
  pm_id: string;
}

interface TokenResult {
  id: string;
  name: string | null;
  phone: string | null;
  token: string | null;
  status: string;
}

interface SendResult {
  entity_id: string;
  name: string | null;
  sent: boolean;
  skipped: boolean;
  error?: string;
}

// ─── CORS headers ───────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Template + variable mapping ────────────────────────────────────────

const TEMPLATE_MAP: Record<EntityType, keyof typeof TEMPLATES> = {
  tenant: "onboarding_tenant",
  contractor: "onboarding_contractor",
  landlord: "onboarding_landlord",
};

function isPlaceholder(sid: string): boolean {
  return sid.startsWith("PLACEHOLDER_");
}

function buildVariables(
  entityType: EntityType,
  name: string,
  businessName: string,
  propertyAddress?: string,
): Record<string, string> {
  if (entityType === "tenant") {
    // Template: Hi {{1}}, Adam from Yarro here. {{2}} has added you as a tenant at {{3}}. ...message {{4}}...
    return {
      "1": name,
      "2": businessName,
      "3": propertyAddress || "your property",
      "4": TENANT_INTAKE_NUMBER,
    };
  }

  if (entityType === "contractor") {
    // Template: Hi {{1}}, Adam from Yarro here. You've been added as a contractor by {{2}}...
    return {
      "1": name,
      "2": businessName,
    };
  }

  // landlord
  // Template: Hi {{1}}, Adam from Yarro here. {{2}} has added you as a landlord...
  return {
    "1": name,
    "2": businessName,
  };
}

// ─── Fetch property address for tenant/landlord context ─────────────────

async function getPropertyAddress(
  supabase: SupabaseClient,
  entityType: EntityType,
  entityId: string,
): Promise<string | undefined> {
  if (entityType === "contractor") return undefined;

  if (entityType === "tenant") {
    const { data } = await supabase
      .from("c1_tenants")
      .select("property_id, c1_properties(address)")
      .eq("id", entityId)
      .maybeSingle();
    return data?.c1_properties?.address || undefined;
  }

  // landlord — find first property linked to this landlord
  if (entityType === "landlord") {
    const { data } = await supabase
      .from("c1_properties")
      .select("address")
      .eq("landlord_id", entityId)
      .limit(1)
      .maybeSingle();
    return data?.address || undefined;
  }

  return undefined;
}

// ─── Process a single entity ────────────────────────────────────────────

async function processEntity(
  supabase: SupabaseClient,
  entityType: EntityType,
  entry: TokenResult,
  businessName: string,
  templateSid: string,
): Promise<SendResult> {
  // Skip if no phone
  if (!entry.phone || entry.status === "skipped_no_phone") {
    console.warn(`[${FN}] Skipping ${entry.id} — no phone number`);
    return { entity_id: entry.id, name: entry.name, sent: false, skipped: true };
  }

  // Skip if entity not found or already verified
  if (entry.status === "skipped_not_found_or_verified") {
    console.warn(`[${FN}] Skipping ${entry.id} — not found or already verified`);
    return { entity_id: entry.id, name: entry.name, sent: false, skipped: true };
  }

  // Skip if no token generated
  if (!entry.token) {
    console.warn(`[${FN}] Skipping ${entry.id} — no token generated`);
    return { entity_id: entry.id, name: entry.name, sent: false, skipped: true };
  }

  // Fetch property address for context (tenant/landlord only)
  const propertyAddress = await getPropertyAddress(supabase, entityType, entry.id);

  const variables = buildVariables(
    entityType,
    entry.name || "there",
    businessName,
    propertyAddress,
  );

  // Send WhatsApp
  const result = await sendWhatsApp(entry.phone, templateSid, variables);

  // Log to outbound log (ticketId is null for onboarding messages)
  await logOutbound(supabase, {
    ticketId: null,
    messageType: `onboarding_${entityType}`,
    recipientPhone: entry.phone,
    recipientRole: entityType,
    twilioSid: result.messageSid || null,
    templateSid,
    contentVariables: variables,
    twilioBody: result.body || null,
    status: result.ok ? (result.status || "queued") : "failed",
  });

  if (!result.ok) {
    console.error(`[${FN}] WhatsApp failed for ${entry.id}:`, result.error);
    await alertTelegram(FN, `send_${entityType}`, result.error || "unknown", {
      "Entity ID": entry.id,
      Name: entry.name || "N/A",
      Phone: entry.phone,
    });

    return {
      entity_id: entry.id,
      name: entry.name,
      sent: false,
      skipped: false,
      error: result.error,
    };
  }

  return { entity_id: entry.id, name: entry.name, sent: true, skipped: false };
}

// ─── Main handler ───────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const supabase = createSupabaseClient();

  try {
    // Parse and validate request
    const body: RequestBody = await req.json();

    if (!body.entity_type || !["tenant", "contractor", "landlord"].includes(body.entity_type)) {
      return new Response(
        JSON.stringify({ error: "Invalid entity_type. Must be tenant, contractor, or landlord." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (!body.entity_ids || !Array.isArray(body.entity_ids) || body.entity_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "entity_ids must be a non-empty array of UUIDs." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (!body.pm_id) {
      return new Response(
        JSON.stringify({ error: "pm_id is required." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Verify PM exists and get business name
    const { data: pm, error: pmError } = await supabase
      .from("c1_property_managers")
      .select("id, business_name")
      .eq("id", body.pm_id)
      .maybeSingle();

    if (pmError || !pm) {
      return new Response(
        JSON.stringify({ error: "Property manager not found." }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Check template SID
    const templateKey = TEMPLATE_MAP[body.entity_type];
    const templateSid = TEMPLATES[templateKey];

    if (!templateSid || isPlaceholder(templateSid)) {
      console.warn(`[${FN}] Template ${templateKey} is a placeholder — skipping all sends`);
      return new Response(
        JSON.stringify({
          ok: true,
          warning: `Template ${templateKey} is a placeholder. No messages sent. Submit the template to Twilio and replace the PLACEHOLDER SID.`,
          total: body.entity_ids.length,
          sent: 0,
          skipped: body.entity_ids.length,
          failed: 0,
          results: [],
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Generate tokens in batch
    const { data: tokenResults, error: tokenError } = await supabase.rpc(
      "generate_verification_tokens_batch",
      {
        p_entity_type: body.entity_type,
        p_entity_ids: body.entity_ids,
        p_pm_id: body.pm_id,
      },
    );

    if (tokenError) {
      await alertTelegram(FN, "generate_verification_tokens_batch", tokenError.message, {
        PM: body.pm_id,
        "Entity Type": body.entity_type,
        Count: String(body.entity_ids.length),
      });
      return new Response(
        JSON.stringify({ error: `Token generation failed: ${tokenError.message}` }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const entries = (tokenResults as TokenResult[]) || [];
    console.log(`[${FN}] Processing ${entries.length} ${body.entity_type} onboarding messages`);

    // Sequential send loop (rate-safe, matches rent-reminder pattern)
    const results: SendResult[] = [];
    for (const entry of entries) {
      try {
        const result = await processEntity(supabase, body.entity_type, entry, pm.business_name, templateSid);
        results.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[${FN}] Error processing entity ${entry.id}:`, msg);
        await alertTelegram(FN, `entity_${entry.id}`, msg, {
          Name: entry.name || "N/A",
          Phone: entry.phone || "N/A",
        });
        results.push({
          entity_id: entry.id,
          name: entry.name,
          sent: false,
          skipped: false,
          error: msg,
        });
      }
    }

    const sent = results.filter((r) => r.sent).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.sent && !r.skipped).length;

    const summary = { ok: true, total: results.length, sent, skipped, failed, results };

    console.log(`[${FN}] Done: ${sent} sent, ${skipped} skipped, ${failed} failed`);

    if (sent > 0 || failed > 0) {
      await alertInfo(
        FN,
        `Onboarding blast (${body.entity_type}): ${sent} sent, ${skipped} skipped, ${failed} failed`,
        { PM: pm.business_name, "PM ID": body.pm_id },
      );
    }

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${FN}] Unhandled error:`, msg);
    await alertTelegram(FN, "Unhandled exception", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
