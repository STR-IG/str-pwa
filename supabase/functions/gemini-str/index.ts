import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const CONNECTION_TEST_PROMPT = "Responde únicamente: conexión Gemini correcta";
const REQUEST_TIMEOUT_MS = 15_000;
const allowedOrigins = new Set(["https://str-ig.github.io", "http://localhost:8000"]);

type FieldSpec = { label: string; max: number; integer?: boolean };

const PAYROLL_FIELDS: Record<string, FieldSpec> = {
  plus_rotatividad: { label: "Plus rotatividad", max: 31, integer: true },
  comidas_can_guasch: { label: "0036 Comidas Can Guasch (CANTIDAD, nunca IMPORTE DIARIO ni DEVENGO)", max: 31, integer: true },
  plus_nocturno: { label: "Plus Nocturno", max: 200 },
  plus_turno: { label: "0010 Plus de turno", max: 31 },
  plus_festivo: { label: "Plus Festivo", max: 200 },
  plus_turno_12h: { label: "Plus de turno 12 horas", max: 31, integer: true },
  dietas_festivos: { label: "Dietas Festivos", max: 31, integer: true },
  pluses_vacaciones: { label: "Pluses Vacaciones", max: 31, integer: true },
};

const TIMESHEET_FIELDS: Record<string, FieldSpec> = {
  ...PAYROLL_FIELDS,
  plus_rotatividad_teor_pc30: { label: "Plus rotativid. teór. PC30", max: 31 },
  plus_nocturno_teor_pc30: { label: "Plus Nocturno teór. PC30", max: 200 },
  plus_turno_teor_pc30: { label: "Plus de turno teór. PC30", max: 31 },
  plus_festivo_teor_pc30: { label: "Plus Festivo teór. PC30", max: 200 },
  nopaga_pnocturn_teor: { label: "NOPAGA PNocturn teór", max: 24 },
  nopaga_pfestivo_teor: { label: "NOPAGA PFestivo teór", max: 24 },
};

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

function parseImageDataUrl(value: unknown) {
  const raw = String(value ?? "");
  const match = raw.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match || raw.length > 8_000_000) return null;
  return { mimeType: `image/${match[1].toLowerCase()}`, data: match[2] };
}

function fallbackSpecs(documentType: unknown) {
  if (documentType === "payroll") return PAYROLL_FIELDS;
  if (documentType === "timesheet") return TIMESHEET_FIELDS;
  return null;
}

function requestedFieldSpecs(documentType: unknown, requestedFields: unknown) {
  const specs = fallbackSpecs(documentType);
  if (!specs || !Array.isArray(requestedFields) || !requestedFields.length || requestedFields.length > 14) return null;
  const names = requestedFields.map((value) => String(value ?? ""));
  if (new Set(names).size !== names.length || names.some((name) => !specs[name])) return null;
  return Object.fromEntries(names.map((name) => [name, specs[name]])) as Record<string, FieldSpec>;
}

function fallbackResponseSchema(specs: Record<string, FieldSpec>) {
  const properties = Object.fromEntries(Object.keys(specs).map((name) => [name, {
    type: "object",
    properties: {
      value: { anyOf: [{ type: "number" }, { type: "null" }] },
      found: { type: "boolean" },
    },
    required: ["value", "found"],
    additionalProperties: false,
  }]));
  return {
    type: "object",
    properties: { fields: { type: "object", properties, required: Object.keys(specs), additionalProperties: false } },
    required: ["fields"],
    additionalProperties: false,
  };
}

function fallbackPrompt(documentType: string, specs: Record<string, FieldSpec>) {
  const fields = Object.entries(specs).map(([key, spec]) => `${key}: ${spec.label}`).join("\n");
  return `Extrae literalmente de esta imagen recortada únicamente la CANTIDAD visible de los campos solicitados.
Tipo de documento: ${documentType}.
Campos solicitados:\n${fields}

Reglas obligatorias:
- Lee solo texto y números visibles en la misma fila del concepto.
- No infieras, no calcules, no dividas importes y no completes campos ausentes.
- En nómina usa la columna CANTIDAD, nunca IMPORTE DIARIO, DEVENGOS ni DEDUCCIONES.
- Cada concepto es independiente. No mezcles una fila ordinaria con otra que incluya teór./teórico PC30 ni con NOPAGA.
- Si existe duda o el concepto exacto no aparece, devuelve found=false y value=null.
- Devuelve exclusivamente el JSON solicitado, sin explicaciones.`;
}

function validateFallbackResult(value: unknown, specs: Record<string, FieldSpec>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = (value as any).fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
  const expected = Object.keys(specs);
  const received = Object.keys(fields);
  if (received.length !== expected.length || received.some((name) => !specs[name])) return null;
  const validated: Record<string, { value: number | null; found: boolean }> = {};
  for (const name of expected) {
    const result = fields[name];
    if (!result || typeof result !== "object" || Array.isArray(result) || typeof result.found !== "boolean") return null;
    if (result.found === false) {
      if (result.value !== null) return null;
      validated[name] = { value: null, found: false };
      continue;
    }
    if (typeof result.value !== "number" || !Number.isFinite(result.value) || result.value < 0 || result.value > specs[name].max) return null;
    if (specs[name].integer && !Number.isInteger(result.value)) return null;
    validated[name] = { value: result.value, found: true };
  }
  return validated;
}

async function activeRow(admin: ReturnType<typeof createClient>, table: string, email: string) {
  const { data, error } = await admin.from(table).select("email").eq("email", email).eq("active", true).maybeSingle();
  if (error) throw new Error("AUTHORIZATION_CHECK_FAILED");
  return Boolean(data);
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

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const callerEmail = cleanEmail(userData.user.email);
    const callerIsAdmin = await activeRow(admin, "committee_admins", callerEmail);

    if (action === "connection_test" && !callerIsAdmin) return json(req, { error: "FORBIDDEN" }, 403);
    if (!['connection_test', 'read_document_fallback'].includes(action)) return json(req, { error: "INVALID_ACTION" }, 400);

    let fallbackInput: null | {
      documentType: "payroll" | "timesheet";
      image: { mimeType: string; data: string };
      specs: Record<string, FieldSpec>;
    } = null;
    if (action === "read_document_fallback") {
      const adminAffiliate = cleanEmail(body?.admin_affiliate);
      if (adminAffiliate) {
        if (!callerIsAdmin || !(await activeRow(admin, "private_access_allowlist", adminAffiliate))) {
          return json(req, { error: "FORBIDDEN" }, 403);
        }
      } else if (!(await activeRow(admin, "private_access_allowlist", callerEmail))) {
        return json(req, { error: "FORBIDDEN" }, 403);
      }
      const documentType = String(body?.document_type ?? "");
      const specs = requestedFieldSpecs(documentType, body?.requested_fields);
      const image = parseImageDataUrl(body?.image_data_url);
      if (!specs || !image) return json(req, { error: "INVALID_FALLBACK_REQUEST" }, 400);
      fallbackInput = { documentType: documentType as "payroll" | "timesheet", image, specs };
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
        body: JSON.stringify(action === "connection_test" ? {
          model: GEMINI_MODEL,
          input: CONNECTION_TEST_PROMPT,
          store: false,
          generation_config: { thinking_level: "low" },
        } : {
          model: GEMINI_MODEL,
          input: [
            { type: "text", text: fallbackPrompt(fallbackInput!.documentType, fallbackInput!.specs) },
            { type: "image", data: fallbackInput!.image.data, mime_type: fallbackInput!.image.mimeType },
          ],
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: fallbackResponseSchema(fallbackInput!.specs),
          },
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
    if (action === "connection_test") {
      if (!isExpectedTestResponse(response)) return json(req, { error: "GEMINI_UNEXPECTED_RESPONSE" }, 502);
      return json(req, { ok: true, model: GEMINI_MODEL, response });
    }

    let parsed: unknown;
    try { parsed = JSON.parse(response); }
    catch { return json(req, { error: "GEMINI_INVALID_RESPONSE" }, 502); }
    const fields = validateFallbackResult(parsed, fallbackInput!.specs);
    if (!fields) return json(req, { error: "GEMINI_INVALID_RESPONSE" }, 502);
    return json(req, { ok: true, model: GEMINI_MODEL, fields });
  } catch (error) {
    console.error("gemini-str", error instanceof Error ? error.name : "UNEXPECTED_ERROR");
    return json(req, { error: "UNEXPECTED_ERROR" }, 500);
  }
});
