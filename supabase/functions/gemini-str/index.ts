import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const CONNECTION_TEST_PROMPT = "Responde únicamente: conexión Gemini correcta";
const REQUEST_TIMEOUT_MS = 15_000;
const allowedOrigins = new Set(["https://str-ig.github.io", "http://localhost:8000"]);

function headers(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://str-ig.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

const cleanEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();

function geminiErrorStatus(status: number) {
  if (status === 400 || status === 401 || status === 403) {
    return { code: "GEMINI_AUTH_FAILED", status: 502 };
  }
  if (status === 429) return { code: "GEMINI_RATE_LIMITED", status: 503 };
  return { code: "GEMINI_UNAVAILABLE", status: 502 };
}

function isExpectedTestResponse(value: string) {
  return value.trim().toLocaleLowerCase("es").replace(/[.!¡!]+$/g, "") ===
    "conexión gemini correcta";
}

function extractGeminiText(result: any) {
  if (typeof result?.output_text === "string" && result.output_text.trim()) {
    return result.output_text.trim();
  }
  if (!Array.isArray(result?.steps)) return "";
  return result.steps
    .filter((step: any) => step?.type === "model_output" && Array.isArray(step.content))
    .flatMap((step: any) => step.content)
    .filter((content: any) => content?.type === "text" && typeof content.text === "string")
    .map((content: any) => content.text)
    .join("")
    .trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json(req, { error: "UNAUTHORIZED" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json(req, { error: "SERVER_CONFIGURATION" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user?.email) return json(req, { error: "UNAUTHORIZED" }, 401);

    const { data: adminRole, error: adminError } = await admin
      .from("committee_admins")
      .select("email")
      .eq("email", cleanEmail(userData.user.email))
      .eq("active", true)
      .maybeSingle();
    if (adminError) return json(req, { error: "AUTHORIZATION_CHECK_FAILED" }, 500);
    if (!adminRole) return json(req, { error: "FORBIDDEN" }, 403);

    const body = await req.json().catch(() => ({}));
    if (String(body?.action ?? "") !== "connection_test") {
      return json(req, { error: "INVALID_ACTION" }, 400);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json(req, { error: "GEMINI_NOT_CONFIGURED" }, 503);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let geminiResponse: Response;
    try {
      geminiResponse = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          input: CONNECTION_TEST_PROMPT,
          store: false,
          generation_config: { thinking_level: "low" },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return json(req, { error: "GEMINI_TIMEOUT" }, 504);
      }
      console.error("gemini-str", "GEMINI_UNAVAILABLE");
      return json(req, { error: "GEMINI_UNAVAILABLE" }, 502);
    } finally {
      clearTimeout(timeout);
    }

    if (!geminiResponse.ok) {
      const failure = geminiErrorStatus(geminiResponse.status);
      console.error("gemini-str", failure.code, geminiResponse.status);
      return json(req, { error: failure.code }, failure.status);
    }

    const result = await geminiResponse.json().catch(() => ({}));
    const response = extractGeminiText(result);
    if (!response) return json(req, { error: "GEMINI_EMPTY_RESPONSE" }, 502);
    if (!isExpectedTestResponse(response)) {
      return json(req, { error: "GEMINI_UNEXPECTED_RESPONSE" }, 502);
    }

    return json(req, { ok: true, model: GEMINI_MODEL, response });
  } catch (error) {
    console.error("gemini-str", error instanceof Error ? error.name : "UNEXPECTED_ERROR");
    return json(req, { error: "UNEXPECTED_ERROR" }, 500);
  }
});
