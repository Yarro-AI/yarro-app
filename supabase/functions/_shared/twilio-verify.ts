/**
 * Twilio webhook signature verification for Deno edge functions.
 *
 * Validates the X-Twilio-Signature header using HMAC-SHA1 per:
 * https://www.twilio.com/docs/usage/security#validating-requests
 */

async function hmacSha1(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Verify an incoming Twilio webhook request.
 *
 * @param authToken  - Twilio Auth Token (from env)
 * @param signature  - Value of X-Twilio-Signature header
 * @param url        - The full URL Twilio posted to (your edge function URL)
 * @param params     - The POST body parameters as a sorted key-value map
 * @returns true if the signature is valid
 */
export async function verifyTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  // Build the data string: URL + sorted params concatenated as key+value
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = await hmacSha1(authToken, data);
  return expected === signature;
}

/**
 * Parse form-encoded body and verify Twilio signature in one step.
 * Returns the parsed params if valid, or null if verification fails.
 */
export async function parseAndVerifyTwilioWebhook(
  req: Request,
): Promise<{ params: URLSearchParams; raw: Record<string, string> } | null> {
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  if (!authToken) {
    console.error("[twilio-verify] TWILIO_AUTH_TOKEN not set");
    return null;
  }

  const signature = req.headers.get("X-Twilio-Signature");
  if (!signature) {
    console.warn("[twilio-verify] Missing X-Twilio-Signature header");
    return null;
  }

  const body = await req.text();
  const params = new URLSearchParams(body);

  // Build a plain object from the params for signature verification
  const raw: Record<string, string> = {};
  params.forEach((value, key) => {
    raw[key] = value;
  });

  const url = req.url;
  const valid = await verifyTwilioSignature(authToken, signature, url, raw);

  if (!valid) {
    console.warn("[twilio-verify] Invalid signature");
    return null;
  }

  return { params, raw };
}
