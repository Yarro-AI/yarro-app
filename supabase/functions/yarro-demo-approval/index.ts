import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function html(body: string, status = 200) {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Yarro</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #F8FAFC; color: #1a1a1a;
      padding: 24px;
    }
    .card {
      background: white; border-radius: 16px; padding: 40px 32px;
      max-width: 380px; width: 100%; text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 15px; color: #64748B; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`,
    {
      status,
      headers: { ...CORS, "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return html(
        `<div class="icon">&#128279;</div>
         <h1>Missing link</h1>
         <p>This approval link is incomplete. Please use the link from your SMS.</p>`,
        400,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up the token
    const { data: approval, error: selectErr } = await supabase
      .from("demo_approvals")
      .select("pm_id, approved")
      .eq("token", token)
      .single();

    if (selectErr || !approval) {
      console.warn("[demo-approval] Token not found:", token);
      return html(
        `<div class="icon">&#9203;</div>
         <h1>Link expired</h1>
         <p>This approval link has expired or was already used. Return to your demo to continue.</p>`,
        404,
      );
    }

    if (approval.approved) {
      return html(
        `<div class="icon">&#9989;</div>
         <h1>Already approved</h1>
         <p>You've already approved this quote. Return to your demo to see what happens next.</p>`,
      );
    }

    // Set approved = true (triggers Realtime → frontend resumes)
    const { error: updateErr } = await supabase
      .from("demo_approvals")
      .update({ approved: true })
      .eq("pm_id", approval.pm_id);

    if (updateErr) {
      console.error("[demo-approval] Update failed:", updateErr);
      return html(
        `<div class="icon">&#9888;&#65039;</div>
         <h1>Something went wrong</h1>
         <p>Please return to your demo and use the skip button to continue.</p>`,
        500,
      );
    }

    console.log("[demo-approval] Approved for PM:", approval.pm_id);

    return html(
      `<div class="icon">&#9989;</div>
       <h1>Quote approved!</h1>
       <p>Return to your demo to see Yarro coordinate the contractor in real time.</p>`,
    );
  } catch (err) {
    console.error("[demo-approval] Error:", err);
    return html(
      `<div class="icon">&#9888;&#65039;</div>
       <h1>Something went wrong</h1>
       <p>Please return to your demo and use the skip button to continue.</p>`,
      500,
    );
  }
});
