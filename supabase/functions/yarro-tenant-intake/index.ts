import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildSystemPrompt,
  buildUserPrompt,
  getIssueAISystemPrompt,
  buildIssueAIUserPrompt,
  type ContextForPrompt,
  type MessageContext,
  type IssueAIContext,
} from "./prompts.ts";

// ─── Shared: Supabase Client ─────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createClient>;

function createSupabaseClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ─── Shared: Alerts ──────────────────────────────────────────────────────

async function alertTelegram(
  flowStep: string,
  error: string,
  extras?: Record<string, string>,
): Promise<void> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID")?.trim();
  if (!botToken || !chatId) {
    console.error("[alert] Not configured:", flowStep, error);
    return;
  }

  const lines = [
    "\ud83d\udea8 <b>Edge Function Error</b>",
    "",
    `<b>Function:</b> yarro-tenant-intake`,
    `<b>Flow Step:</b> ${flowStep}`,
    `<b>Error:</b> ${error}`,
  ];
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      if (v) lines.push(`<b>${k}:</b> ${v}`);
    }
  }
  lines.push(`<b>Time:</b> ${new Date().toISOString()}`);

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" }),
    });
  } catch (e) {
    console.error("[alert] Failed:", e);
  }
}

// ─── Twilio: Send freeform WhatsApp (tenant-facing) ─────────────────────

const TWILIO_TENANT_FROM = "whatsapp:+447446904822";

async function sendFreeformWhatsApp(to: string, message: string): Promise<boolean> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  if (!accountSid || !authToken) return false;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    To: to.startsWith("whatsapp:") ? to : `whatsapp:+${to}`,
    From: TWILIO_TENANT_FROM,
    Body: message,
  });

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    if (!resp.ok) {
      const data = await resp.json();
      console.error("[twilio] Freeform send failed:", resp.status, data.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[twilio] Freeform error:", e);
    return false;
  }
}

// ─── Twilio: Fetch media URLs from inbound message ──────────────────────

async function fetchTwilioMedia(accountSid: string, messageSid: string): Promise<string[]> {
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  if (!authToken || !messageSid) return [];

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}/Media.json`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        },
      },
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    const mediaList = data.media_list || [];
    return mediaList.map((m: any) =>
      `https://api.twilio.com${String(m.uri || "").replace(".json", "")}`
    );
  } catch {
    return [];
  }
}

// ─── OpenAI: Call GPT-4o ─────────────────────────────────────────────────

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callOpenAI(
  messages: OpenAIMessage[],
  temperature = 0.3,
  jsonMode = false,
): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const body: Record<string, any> = {
    model: "gpt-4o",
    messages,
    temperature,
  };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── Normalise: Parse AI response + detect branch ───────────────────────

interface NormalisedResponse {
  message: string;
  imageURLs: string;
  branch: "normal" | "final" | "handoff" | "emergency" | "duplicate" | "nomatch";
  caller_role: string | null;
  caller_tag: string | null;
  caller_name: string | null;
  caller_phone: string | null;
  handoff: boolean | null;
  updates_recipient: string | null;
  availability: any;
}

function normaliseResponse(raw: string): NormalisedResponse {
  // Clean code fences
  let cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/```$/m, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = { output: cleaned };
  }

  let message = parsed.output != null ? String(parsed.output).trim() : "";
  let imageURLs = parsed.imageURLs ?? "unprovided";
  if (Array.isArray(imageURLs)) {
    imageURLs = imageURLs.length > 0 ? imageURLs.join(", ") : "unprovided";
  }
  if (!message) message = "(no response)";

  // Normalise handoff to boolean | null
  let handoff: boolean | null = null;
  if (typeof parsed.handoff === "boolean") handoff = parsed.handoff;
  else if (typeof parsed.handoff === "string") {
    const h = parsed.handoff.toLowerCase().trim();
    if (h === "true") handoff = true;
    else if (h === "false") handoff = false;
  }

  // Branch detection (exact same logic as n8n Normalise node)
  const norm = message.normalize("NFKC").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').toLowerCase();
  let branch: NormalisedResponse["branch"] = "normal";

  if (norm.includes("\ud83d\udd0e") || norm.includes("no tenancy match")) {
    branch = "nomatch";
  } else if (handoff === true) {
    branch = "handoff";
  } else if (norm.includes("\ud83d\udea8") || norm.includes("priority: emergency")) {
    branch = "emergency";
  } else if (
    norm.includes("\u2705") &&
    (norm.includes("your request has been submitted") || norm.includes("your report has been submitted"))
  ) {
    branch = "final";
  } else if (
    norm.includes("updated your existing ticket") ||
    norm.includes("ive updated your existing ticket") ||
    norm.includes("i've updated your existing ticket") ||
    norm.includes("your existing ticket is already in progress") ||
    norm.includes("i'll close this chat now")
  ) {
    branch = "duplicate";
  }

  return {
    message,
    imageURLs,
    branch,
    caller_role: parsed.caller_role ?? null,
    caller_tag: parsed.caller_tag ?? null,
    caller_name: parsed.caller_name ?? null,
    caller_phone: parsed.caller_phone ?? null,
    handoff,
    updates_recipient: parsed.updates_recipient ?? null,
    availability: parsed.availability ?? null,
  };
}

// ─── Conversation History → OpenAI Messages ─────────────────────────────

function buildConversationMessages(
  systemPrompt: string,
  conversationLog: any[],
  currentUserPrompt: string,
): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add conversation history (last 15 messages, matching n8n buffer window)
  const recent = (conversationLog || []).slice(-15);
  for (const entry of recent) {
    if (entry.direction === "inbound") {
      messages.push({ role: "user", content: entry.message || "" });
    } else if (entry.direction === "out" || entry.direction === "outbound") {
      messages.push({ role: "assistant", content: entry.message || "" });
    }
  }

  // Add current message with full context
  messages.push({ role: "user", content: currentUserPrompt });

  return messages;
}

// ─── Image Upload (Twilio → Supabase Storage) ───────────────────────────

async function uploadImages(
  supabase: SupabaseClient,
  ticketId: string,
  mediaUrls: string[],
): Promise<string[]> {
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const storedUrls: string[] = [];

  const uploads = mediaUrls.map(async (url, i) => {
    try {
      // Download from Twilio (needs auth)
      const resp = await fetch(url, {
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        },
      });
      if (!resp.ok) return null;

      const blob = await resp.blob();
      const ext = blob.type.split("/")[1] || "jpg";
      const path = `${ticketId}-${i}.${ext}`;

      const { error } = await supabase.storage
        .from("ticket-images")
        .upload(path, blob, { contentType: blob.type, upsert: true });

      if (error) {
        console.error(`[media] Upload failed for ${path}:`, error.message);
        return null;
      }

      return `${supabaseUrl}/storage/v1/object/public/ticket-images/${path}`;
    } catch (e) {
      console.error(`[media] Error:`, e);
      return null;
    }
  });

  const results = await Promise.all(uploads);
  return results.filter((u): u is string => u !== null);
}

// ─── Main Handler ────────────────────────────────────────────────────────

const FN = "yarro-tenant-intake";

Deno.serve(async (req: Request) => {
  try {
    // 1. Parse Twilio form-encoded POST
    const formData = await req.text();
    const params = new URLSearchParams(formData);
    const twilioBody = params.get("Body") || "(image attached)";
    const twilioFrom = params.get("From") || "";
    const accountSid = params.get("AccountSid") || "";
    const messageSid = params.get("MessageSid") || "";

    const phone = twilioFrom.replace("whatsapp:", "").replace("+", "");
    if (!phone) {
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    console.log(`[${FN}] Inbound from ${phone}: ${twilioBody.slice(0, 80)}`);

    // 2. Fetch media URLs from Twilio
    const images = await fetchTwilioMedia(accountSid, messageSid);

    // 3. Call c1_context_logic (the state machine)
    const supabase = createSupabaseClient();
    const { data: ctxData, error: ctxError } = await supabase.rpc("c1_context_logic", {
      _phone: phone,
      _message: {
        message: twilioBody,
        direction: "inbound",
        timestamp: new Date().toISOString(),
        images,
      },
    });

    if (ctxError) {
      await alertTelegram("c1_context_logic", ctxError.message, { Phone: phone });
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    const ctx = ctxData;
    if (!ctx || !ctx.conversation) {
      await alertTelegram("c1_context_logic", "No conversation returned", { Phone: phone });
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    // 4. Build system prompt with context values
    const contextForPrompt: ContextForPrompt = {
      property: ctx.property,
      property_manager: ctx.property_manager,
      tenant: ctx.tenant,
    };
    const systemPrompt = buildSystemPrompt(contextForPrompt);

    // 5. Build user prompt with full context
    const messageContext: MessageContext = {
      message: twilioBody,
      images,
      tenant: ctx.tenant,
      property: ctx.property,
      property_manager: ctx.property_manager,
      conversation: ctx.conversation,
      ai_instruction: ctx.ai_instruction,
      recent_tickets: ctx.recent_tickets,
      tenant_verified: ctx.tenant_verified,
    };
    const userPrompt = buildUserPrompt(messageContext);

    // 6. Build conversation messages (system + history + current)
    const conversationLog = ctx.conversation?.log || [];
    const messages = buildConversationMessages(systemPrompt, conversationLog, userPrompt);

    // 7. Call OpenAI GPT-4o
    let aiRaw: string;
    try {
      aiRaw = await callOpenAI(messages, 0.3, true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await alertTelegram("OpenAI call", msg, { Phone: phone, Stage: ctx.ai_instruction });
      // Send fallback message to tenant
      await sendFreeformWhatsApp(phone, "Sorry, I'm having a temporary issue. Please try again in a moment.");
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    // 8. Normalise response + detect branch
    const result = normaliseResponse(aiRaw);
    console.log(`[${FN}] Branch: ${result.branch}, Stage: ${ctx.ai_instruction}`);

    // 9. Build outbound log entry
    const outboundEntry = {
      direction: "outbound",
      message: result.message,
      timestamp: new Date().toISOString(),
      images: result.imageURLs,
      caller_role: result.caller_role,
      caller_tag: result.caller_tag,
      caller_name: result.caller_name,
      caller_phone: result.caller_phone,
      handoff: result.handoff,
      updates_recipient: result.updates_recipient,
      availability: result.availability,
    };

    // 10. Branch handling
    if (result.branch === "normal") {
      // ── Normal: send reply + append to conversation ──
      await sendFreeformWhatsApp(phone, result.message);
      await supabase.rpc("c1_convo_append_outbound", {
        _conversation_id: ctx.conversation.id,
        _entry: outboundEntry,
      });

    } else if (["final", "handoff", "emergency"].includes(result.branch)) {
      // ── Final/Handoff/Emergency: send reply + finalize + create ticket ──
      await sendFreeformWhatsApp(phone, result.message);

      const { data: finalizeData, error: finalizeError } = await supabase.rpc("c1_convo_finalize", {
        _conversation_id: ctx.conversation.id,
        _entry: outboundEntry,
      });

      if (finalizeError) {
        await alertTelegram("c1_convo_finalize", finalizeError.message, {
          Phone: phone,
          ConvoId: ctx.conversation.id,
        });
        return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
      }

      const finalized = finalizeData;

      // Get contractor categories for IssueAI
      const { data: contractors } = await supabase
        .from("c1_contractors")
        .select("category")
        .eq("property_manager_id", finalized?.property_manager_id || ctx.property_manager?.id)
        .eq("active", true);

      const categories = [...new Set((contractors || []).map((c: any) => c.category).filter(Boolean))].join(", ");

      // Build conversation log string for IssueAI
      const fullLog = (finalized?.conversation?.log || conversationLog || [])
        .map((e: any) => `[${e.direction}] ${e.message || ""}`)
        .join("\n");

      // Call IssueAI (structured classification)
      const issueAIContext: IssueAIContext = {
        label: finalized?.label || "",
        close_type: finalized?.close_type || "",
        handoff: finalized?.handoff || result.handoff || false,
        is_new_contact: finalized?.is_new_contact || false,
        conversation: finalized?.conversation || ctx.conversation,
        tenant_id: finalized?.tenant_id || null,
        property_id: finalized?.property_id || ctx.property?.id || null,
        property_manager_id: finalized?.property_manager_id || ctx.property_manager?.id || null,
        categories,
        availability: finalized?.availability || result.availability,
        last_message: finalized?.last_message || { message: twilioBody },
        conversation_log: fullLog,
      };

      let issueData: any;
      try {
        const issueAIResponse = await callOpenAI([
          { role: "system", content: getIssueAISystemPrompt() },
          { role: "user", content: buildIssueAIUserPrompt(issueAIContext) },
        ], 0.3, true);

        issueData = JSON.parse(issueAIResponse);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await alertTelegram("IssueAI classification", msg, {
          Phone: phone,
          ConvoId: ctx.conversation.id,
        });
        // Fall back to basic issue data so ticket still gets created
        issueData = {
          issue_summary: twilioBody,
          issue_title: "Maintenance request",
          category: "General / Handyman",
          priority: "Standard",
          access: "UNCLEAR",
          availability: "",
          has_images: images.length > 0,
          pretty_for_manager: twilioBody,
          pretty_for_contractor: twilioBody,
          tenant_id: issueAIContext.tenant_id,
          caller_name: result.caller_name || ctx.conversation?.caller_name,
          caller_role: result.caller_role || ctx.conversation?.caller_role,
          caller_tag: result.caller_tag || ctx.conversation?.caller_tag,
          caller_phone: result.caller_phone || phone,
          property_id: issueAIContext.property_id,
          property_manager_id: issueAIContext.property_manager_id,
          label: issueAIContext.label,
          close_type: issueAIContext.close_type,
          handoff: issueAIContext.handoff,
          is_new_contact: issueAIContext.is_new_contact,
        };
      }

      // Create ticket
      const { data: ticket, error: ticketError } = await supabase.rpc("c1_create_ticket", {
        _conversation_id: ctx.conversation.id,
        _issue: issueData,
      });

      if (ticketError) {
        await alertTelegram("c1_create_ticket", ticketError.message, {
          Phone: phone,
          ConvoId: ctx.conversation.id,
        });
        return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
      }

      const ticketId = ticket?.id;
      console.log(`[${FN}] Ticket created: ${ticketId}`);

      // Upload images in parallel (if any)
      if (images.length > 0 && ticketId) {
        const storedUrls = await uploadImages(supabase, ticketId, images);
        if (storedUrls.length > 0) {
          await supabase
            .from("c1_tickets")
            .update({ images: storedUrls })
            .eq("id", ticketId);
        }
      }

      // Trigger notification chain via yarro-ticket-notify
      if (ticketId) {
        const notifyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/yarro-ticket-notify?source=intake`;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const notifyResp = await fetch(notifyUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ticket_id: ticketId }),
        });

        if (!notifyResp.ok) {
          const errText = await notifyResp.text();
          await alertTelegram("yarro-ticket-notify call", errText, {
            Ticket: ticketId,
            Status: String(notifyResp.status),
          });
        }
      }

    } else if (["duplicate", "nomatch"].includes(result.branch)) {
      // ── Duplicate/Nomatch: send status reply + quick finalize ──
      await sendFreeformWhatsApp(phone, result.message);
      await supabase.rpc("c1_convo_finalize_quick", {
        _conversation_id: ctx.conversation.id,
        _entry: outboundEntry,
      });
    }

    // Return 200 to Twilio
    return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${FN}] Unhandled error:`, msg);
    await alertTelegram("Unhandled exception", msg);
    return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } }); // Always 200 to prevent Twilio retries
  }
});
