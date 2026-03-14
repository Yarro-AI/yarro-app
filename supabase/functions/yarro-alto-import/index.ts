import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient, type SupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram } from "../_shared/telegram.ts";

const FN = "yarro-alto-import";
const ALTO_TOKEN_URL = "https://api.alto.zoopladev.co.uk/token";
const ALTO_API_BASE = "https://api.alto.zoopladev.co.uk";

// ─── Alto Token Exchange ─────────────────────────────────────────────────

async function getAltoToken(
  clientId: string,
  clientSecret: string,
): Promise<{ token: string; expiresAt: Date } | { error: string }> {
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(ALTO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const body = await res.text();
    return { error: `Token exchange failed (${res.status}): ${body}` };
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
  return { token: data.access_token, expiresAt };
}

// ─── Alto API Call ───────────────────────────────────────────────────────

async function altoGet(
  path: string,
  token: string,
  agencyRef: string,
): Promise<{ data: any } | { error: string }> {
  const res = await fetch(`${ALTO_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      AgencyRef: agencyRef,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    return { error: `Alto API ${path} failed (${res.status}): ${body}` };
  }

  return { data: await res.json() };
}

// ─── Action: test-connection ─────────────────────────────────────────────

async function testConnection(
  sb: SupabaseClient,
  propertyManagerId: string,
  credentials: { client_id: string; client_secret: string; agency_ref: string },
) {
  // 1. Exchange for token
  const tokenResult = await getAltoToken(credentials.client_id, credentials.client_secret);
  if ("error" in tokenResult) {
    return { success: false, error: tokenResult.error };
  }

  // 2. Test API access with /inventory
  const apiResult = await altoGet("/inventory", tokenResult.token, credentials.agency_ref);
  if ("error" in apiResult) {
    // Token works but API fails — likely wrong AgencyRef
    // Still save credentials so user doesn't have to re-enter
    await sb.from("c1_integrations").upsert(
      {
        property_manager_id: propertyManagerId,
        provider: "alto",
        credentials: {
          client_id: credentials.client_id,
          client_secret: credentials.client_secret,
          agency_ref: credentials.agency_ref,
        },
        access_token: tokenResult.token,
        token_expires_at: tokenResult.expiresAt.toISOString(),
        status: "error",
        error_message: `Token OK but API returned error. Check AgencyRef. ${apiResult.error}`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_manager_id,provider" },
    );

    return {
      success: false,
      error: `Token exchange succeeded but API call failed. The AgencyRef may be incorrect. Detail: ${apiResult.error}`,
      token_ok: true,
    };
  }

  // 3. Full success — upsert integration record
  await sb.from("c1_integrations").upsert(
    {
      property_manager_id: propertyManagerId,
      provider: "alto",
      credentials: {
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        agency_ref: credentials.agency_ref,
      },
      access_token: tokenResult.token,
      token_expires_at: tokenResult.expiresAt.toISOString(),
      status: "connected",
      connected_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "property_manager_id,provider" },
  );

  return { success: true, message: "Connected to Alto" };
}

// ─── Action: import-data ─────────────────────────────────────────────────

async function importData(
  sb: SupabaseClient,
  propertyManagerId: string,
  integrationId: string,
) {
  // Phase 2 — blocked on correct AgencyRef
  // Skeleton: creates a job record and returns placeholder
  const { data: job, error: jobErr } = await sb
    .from("c1_import_jobs")
    .insert({
      integration_id: integrationId,
      property_manager_id: propertyManagerId,
      status: "failed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      counts: {},
      errors: [{ message: "Import not yet implemented — waiting for correct AgencyRef from Amco" }],
    })
    .select("id")
    .single();

  if (jobErr) {
    return { success: false, error: `Failed to create import job: ${jobErr.message}` };
  }

  return {
    success: false,
    error: "Import not yet implemented — Phase 2 (blocked on AgencyRef)",
    job_id: job.id,
  };
}

// ─── Main Handler ────────────────────────────────────────────────────────

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
    const body = await req.json();
    const { action, property_manager_id, credentials, integration_id } = body;
    const sb = createSupabaseClient();

    if (!action || !property_manager_id) {
      return Response.json({ success: false, error: "Missing action or property_manager_id" }, { status: 400 });
    }

    let result;

    switch (action) {
      case "test-connection":
        if (!credentials?.client_id || !credentials?.client_secret || !credentials?.agency_ref) {
          return Response.json({ success: false, error: "Missing credentials" }, { status: 400 });
        }
        result = await testConnection(sb, property_manager_id, credentials);
        break;

      case "import-data":
        if (!integration_id) {
          return Response.json({ success: false, error: "Missing integration_id" }, { status: 400 });
        }
        result = await importData(sb, property_manager_id, integration_id);
        break;

      default:
        return Response.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    return Response.json(result, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${FN}] Error:`, msg);
    await alertTelegram(FN, "Unhandled exception", msg);
    return Response.json(
      { success: false, error: msg },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
});
