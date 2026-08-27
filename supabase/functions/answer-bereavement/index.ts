import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://str-ig.github.io",
  "http://localhost:8000",
]);
const workShifts = new Set(["morning", "afternoon", "night-start", "night-previous", "rest"]);
const relationshipScopes = new Set(["eligible", "review"]);

function isAllowedOrigin(origin: string) {
  if (allowedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    return (url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.protocol === "http:";
  } catch {
    return false;
  }
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "https://str-ig.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function cleanEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isIsoDate(value: unknown): value is string {
  const text = String(value ?? "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
}

function isTime(value: unknown): value is string {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ""));
}

function secretKey() {
  const modernKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modernKeys) {
    try {
      const parsed = JSON.parse(modernKeys);
      if (parsed?.default) return String(parsed.default);
    } catch {
      // Use the legacy key below when the modern key set is unavailable or malformed.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

async function safetyIdentifier(userId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 64);
}

function extractOutputText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(`${value}T12:00:00+02:00`));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(req, { error: "UNAUTHORIZED" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const adminKey = secretKey();
    const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (!supabaseUrl || !adminKey || !openAiKey) return json(req, { error: "SERVER_CONFIGURATION" }, 500);

    const admin = createClient(supabaseUrl, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData.user;
    if (userError || !user?.id || !user.email) return json(req, { error: "UNAUTHORIZED" }, 401);

    const { data: accessRow, error: accessError } = await admin.from("private_access_allowlist").select("email").eq("email", cleanEmail(user.email)).eq("active", true).maybeSingle();
    if (accessError) return json(req, { error: "AUTHORIZATION_CHECK_FAILED" }, 500);
    if (!accessRow) return json(req, { error: "FORBIDDEN" }, 403);

    const body = await req.json().catch(() => ({}));
    const relationship = String(body?.relationship ?? "").trim().slice(0, 100);
    const relationshipScope = String(body?.relationshipScope ?? "");
    const deathDate = String(body?.deathDate ?? "");
    const deathTime = String(body?.deathTime ?? "");
    const workShift = String(body?.workShift ?? "");
    const travel = String(body?.travel ?? "");
    const leaveDays = Array.isArray(body?.leaveDays) ? body.leaveDays.map((value: unknown) => String(value)) : [];
    const duration = travel === "yes" ? 4 : 2;

    const validCore = Boolean(relationship) && relationshipScopes.has(relationshipScope) && isIsoDate(deathDate) && isTime(deathTime) && workShifts.has(workShift) && (travel === "yes" || travel === "no");
    const validDays = leaveDays.length === duration && leaveDays.every(isIsoDate) && new Set(leaveDays).size === duration && leaveDays.every((day: string) => day >= deathDate) && leaveDays.every((day: string, index: number) => index === 0 || day > leaveDays[index - 1]);
    if (!validCore || !validDays) return json(req, { error: "INVALID_QUESTIONNAIRE" }, 400);

    const facts = { relationship, relationshipScope, deathDate, deathTime, workShift, travel, applicableDuration: duration, leaveDays };
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 700,
        safety_identifier: await safetyIdentifier(user.id),
        instructions: `Eres un asistente informativo de la sección sindical STR-IG. Analiza exclusivamente datos estructurados de un permiso por fallecimiento familiar. La referencia es el artículo 37.3.b bis del Estatuto de los Trabajadores y el artículo 50.4 del XXI Convenio General de la Industria Química: dos días laborables, ampliados en dos cuando existe necesidad de desplazamiento. La norma no fija una distancia mínima para este supuesto. No inventes pactos, horarios, documentos ni criterios empresariales. Los familiares consanguíneos de una pareja de hecho marcados como review no están incluidos expresamente en la cláusula de fallecimiento y requieren revisión de STR-IG. La hora, el turno y el calendario pueden afectar al inicio del cómputo. Da una orientación clara, prudente y breve, nunca una garantía jurídica. Responde en español y no incluyas datos personales.`,
        input: JSON.stringify(facts),
        text: { verbosity: "low", format: { type: "json_schema", name: "bereavement_guidance", strict: true, schema: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["compatible", "review", "not_compatible"] },
            title: { type: "string" },
            summary: { type: "string" },
            reasons: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } }
          },
          required: ["status", "title", "summary", "reasons", "recommendations"], additionalProperties: false
        } } }
      }),
    });

    const aiData = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) {
      console.error("OpenAI bereavement guidance failed", aiResponse.status, aiData?.error?.code ?? "unknown");
      return json(req, { error: "AI_UNAVAILABLE" }, 502);
    }
    const outputText = extractOutputText(aiData);
    if (!outputText) return json(req, { error: "AI_EMPTY_RESPONSE" }, 502);
    const aiGuidance = JSON.parse(outputText);

    const documentation = [
      "Documento o justificante del fallecimiento.",
      "Documento que acredite el parentesco, matrimonio o pareja de hecho.",
    ];
    if (travel === "yes") documentation.push("Justificación del desplazamiento, si la empresa la solicita.");

    return json(req, { guidance: {
      ...aiGuidance,
      status: relationshipScope === "review" ? "review" : aiGuidance.status,
      duration: `${duration} días laborables`,
      anticipatedDays: leaveDays.map(formatDate),
      documentation,
      warning: "El cómputo puede variar según el momento del fallecimiento, el turno asignado y el calendario laboral. Confirma las fechas con STR-IG si existe cualquier duda.",
    } });
  } catch (error) {
    console.error("Unexpected answer-bereavement error", error instanceof Error ? error.message : "unknown");
    return json(req, { error: "UNEXPECTED_ERROR" }, 500);
  }
});
