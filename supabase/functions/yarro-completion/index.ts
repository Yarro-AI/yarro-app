import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient, type SupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram } from "../_shared/telegram.ts";
import { sendAndLog } from "../_shared/twilio.ts";
import { TEMPLATES, shortRef } from "../_shared/templates.ts";

// ─── Function: yarro-completion ──────────────────────────────────────────

const FN = "yarro-completion";

// ─── Fillout Parser ──────────────────────────────────────────────────────
interface ParsedCompletion {
  ticket_id: string;
  completed: boolean;
  notes: string | null;
  reason: string | null;
  media_urls: string[];
  source: "fillout" | "webhook";
  fillout_submission_id: string | null;
  inbound_sid: string | null;
  completion_text: string | null;
}

/** Extract a URL parameter from Fillout's array format: [{name, value}, ...] */
function getUrlParam(urlParams: any, name: string): string | null {
  if (Array.isArray(urlParams)) {
    const param = urlParams.find((p: any) => p.name === name || p.id === name);
    return param?.value ?? null;
  }
  // Fallback: object format
  if (urlParams && typeof urlParams === "object") {
    return urlParams[name]?.value ?? urlParams[name] ?? null;
  }
  return null;
}

function parseFillout(rawBody: Record<string, any>): ParsedCompletion | null {
  // Fillout Workflows wrap data under body.submission — unwrap if present
  const body = rawBody.submission ?? rawBody;

  const ticket_id = getUrlParam(body?.urlParameters, "ticket_id") || body?.ticket_id || null;
  if (!ticket_id) return null;

  const questions = Array.isArray(body?.questions)
    ? body.questions
    : body?.questions ? Object.values(body.questions) as any[] : [];

  const statusQ = questions.find((q: any) => q.name?.toLowerCase().includes("status"));
  const statusVal = Array.isArray(statusQ?.value) ? statusQ.value[0] : statusQ?.value;
  const completed = statusVal === "Completed" || statusVal === true;

  const notesQ = questions.find((q: any) => q.name?.toLowerCase().includes("notes"));
  const reasonQ = questions.find((q: any) => q.name?.toLowerCase().includes("reason"));
  const uploadQ = questions.find((q: any) => q.name?.toLowerCase().includes("upload"));

  const uploads = uploadQ?.value || [];
  const media_urls = Array.isArray(uploads)
    ? uploads.map((f: any) => f.url).filter(Boolean)
    : [];

  return {
    ticket_id,
    completed,
    notes: notesQ?.value || null,
    reason: reasonQ?.value || null,
    media_urls,
    source: "fillout",
    fillout_submission_id: body?.submissionId || rawBody?.submissionId || null,
    inbound_sid: null,
    completion_text: null,
  };
}

function parseWebhook(body: Record<string, any>): ParsedCompletion | null {
  const payload = body?.payload || body;
  const ticket_id = payload?.ticket?.id || null;
  if (!ticket_id) return null;

  return {
    ticket_id,
    completed: true,
    notes: null,
    reason: null,
    media_urls: [],
    source: "webhook",
    fillout_submission_id: null,
    inbound_sid: payload?.inbound?.sid || null,
    completion_text: payload?.inbound?.text || "complete",
  };
}

// ─── Media Upload (Fillout S3 → Supabase Storage) ───────────────────────
async function uploadMedia(
  supabase: SupabaseClient,
  ticketId: string,
  mediaUrls: string[],
): Promise<string[]> {
  const storedUrls: string[] = [];
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  // Upload all media in parallel
  const uploads = mediaUrls.map(async (url, i) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`[media] Download failed for ${url}: ${resp.status}`);
        return null;
      }

      const blob = await resp.blob();
      const ext = blob.type.split("/")[1] || "jpg";
      const path = `completion-${ticketId}-${i}.${ext}`;

      const { error } = await supabase.storage
        .from("ticket-images")
        .upload(path, blob, { contentType: blob.type, upsert: true });

      if (error) {
        console.error(`[media] Upload failed for ${path}:`, error.message);
        return null;
      }

      return `${supabaseUrl}/storage/v1/object/public/ticket-images/${path}`;
    } catch (e) {
      console.error(`[media] Error processing ${url}:`, e);
      return null;
    }
  });

  const results = await Promise.all(uploads);
  return results.filter((url): url is string => url !== null);
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
    const source = url.searchParams.get("source") || "fillout";

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid or empty JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[${FN}] source=${source}, body keys: ${Object.keys(body).join(",")}`);

    const parsed = source === "webhook" ? parseWebhook(body) : parseFillout(body);

    if (!parsed) {
      return new Response(
        JSON.stringify({ ok: false, error: "Could not parse ticket_id from submission" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[${FN}] ${parsed.source} for ticket ${parsed.ticket_id}, completed=${parsed.completed}`);

    const supabase = createSupabaseClient();

    // Dedup: skip if we already processed this exact Fillout submission
    if (parsed.fillout_submission_id) {
      const { data: existing } = await supabase
        .from("c1_job_completions")
        .select("fillout_submission_id")
        .eq("fillout_submission_id", parsed.fillout_submission_id)
        .maybeSingle();
      if (existing) {
        console.log(`[${FN}] Duplicate Fillout submission ${parsed.fillout_submission_id}, skipping`);
        return new Response(
          JSON.stringify({ ok: true, duplicate: true, submission_id: parsed.fillout_submission_id }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Handle media uploads (Fillout S3 → Supabase Storage) — parallel
    let finalMediaUrls = parsed.media_urls;
    if (parsed.media_urls.length > 0) {
      console.log(`[${FN}] Uploading ${parsed.media_urls.length} media files`);
      finalMediaUrls = await uploadMedia(supabase, parsed.ticket_id, parsed.media_urls);
    }

    // Call RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "c1_process_job_completion",
      {
        p_ticket_id: parsed.ticket_id,
        p_source: parsed.source,
        p_completed: parsed.completed,
        p_notes: parsed.notes,
        p_reason: parsed.reason,
        p_media_urls: finalMediaUrls,
        p_fillout_submission_id: parsed.fillout_submission_id,
        p_inbound_sid: parsed.inbound_sid,
        p_completion_text: parsed.completion_text,
      },
    );

    if (rpcError) {
      await alertTelegram(FN, "RPC c1_process_job_completion", rpcError.message, {
        Ticket: parsed.ticket_id,
        Source: parsed.source,
      });
      return new Response(
        JSON.stringify({ ok: false, error: rpcError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Guard: RPC returned ok=false (e.g. ticket_not_found)
    if (!rpcResult?.ok) {
      const reason = rpcResult?.error || "unknown";
      console.log(`[${FN}] RPC returned ok=false: ${reason}`);
      await alertTelegram(FN, "RPC result not ok", reason, {
        Ticket: parsed.ticket_id,
        Source: parsed.source,
        Completed: String(parsed.completed),
      });
      return new Response(
        JSON.stringify({ ok: false, error: reason, ticket_id: parsed.ticket_id }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Send notifications if RPC says we should
    const results: Array<{ type: string; sent: boolean; error?: string }> = [];

    if (rpcResult.should_notify) {
      const ticketId = rpcResult.ticket_id || parsed.ticket_id;
      const addr = rpcResult.property_address || "";
      const contrName = rpcResult.contractor_name || "";
      const contrPhone = rpcResult.contractor_phone || "";
      const issue = rpcResult.issue_description || "";
      const mgrPhone = rpcResult.manager_phone;
      const llPhone = rpcResult.landlord_phone;
      const reason = rpcResult.reason || parsed.reason || "";

      if (rpcResult.completed) {
        // ── Completed: notify PM + Landlord in parallel ──
        const sends: Promise<void>[] = [];

        if (mgrPhone) {
          sends.push((async () => {
            const r = await sendAndLog(supabase, FN, "pm_job_completed", {
              ticketId,
              recipientPhone: mgrPhone,
              recipientRole: "manager",
              messageType: "pm_job_completed",
              templateSid: TEMPLATES.pm_job_completed,
              variables: {
                "1": shortRef(ticketId),
                "2": addr,
                "3": `${contrName} / ${contrPhone}`,
                "4": issue,
              },
            });
            results.push({ type: "pm_job_completed", sent: r.ok, error: r.error });
          })());
        }

        if (llPhone) {
          sends.push((async () => {
            const r = await sendAndLog(supabase, FN, "ll_job_completed", {
              ticketId,
              recipientPhone: llPhone,
              recipientRole: "landlord",
              messageType: "ll_job_completed",
              templateSid: TEMPLATES.ll_job_completed,
              variables: {
                "1": shortRef(ticketId),
                "2": addr,
                "3": `${contrName} / ${contrPhone}`,
                "4": issue,
              },
            });
            results.push({ type: "ll_job_completed", sent: r.ok, error: r.error });
          })());
        }

        await Promise.all(sends);
      } else {
        // ── Not completed: notify PM only ──
        if (mgrPhone) {
          const r = await sendAndLog(supabase, FN, "pm_job_not_completed", {
            ticketId,
            recipientPhone: mgrPhone,
            recipientRole: "manager",
            messageType: "pm_job_not_completed",
            templateSid: TEMPLATES.pm_job_not_completed,
            variables: {
              "1": shortRef(ticketId),
              "2": addr,
              "3": contrName,
              "4": reason,
            },
          });
          results.push({ type: "pm_job_not_completed", sent: r.ok, error: r.error });
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        ticket_id: parsed.ticket_id,
        completed: rpcResult.completed,
        should_notify: rpcResult.should_notify,
        media_uploaded: finalMediaUrls.length,
        notifications: results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
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
