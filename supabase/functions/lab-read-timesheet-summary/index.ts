import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://str-ig.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function normalizeConcept(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTheoreticalPc30(value: unknown) {
  const normalized = normalizeConcept(value);
  return /\bteor(?:ico)?\b/.test(normalized) && /\bpc\s*3[0o]\b/.test(normalized);
}

function normalizeValue(value: unknown) {
  const raw = String(value ?? "").trim().replace(/\s+/g, "");
  if (!raw) return "";
  const match = raw.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return "";
  const n = Number(match[0].replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 500) return "";
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

function extractOutputText(response: any) {
  if (typeof response?.output_text === "string") return response.output_text;
  const chunks: string[] = [];
  for (const item of response?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function parseModelJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("MODEL_JSON_MISSING");
  return JSON.parse(cleaned.slice(start, end + 1));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "UNAUTHORIZED" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "SERVER_CONFIGURATION" }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData.user;
    if (userError || !user?.email) return json({ error: "UNAUTHORIZED" }, 401);

    const email = user.email.trim().toLowerCase();
    const { data: allowedRow, error: allowError } = await admin
      .from("private_access_allowlist")
      .select("email")
      .ilike("email", email)
      .eq("active", true)
      .maybeSingle();
    if (allowError) return json({ error: "AUTHORIZATION_CHECK_FAILED" }, 500);
    if (!allowedRow) return json({ error: "FORBIDDEN" }, 403);

    const body = await req.json().catch(() => ({}));
    const imageDataUrl = String(body?.imageDataUrl ?? "");
    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(imageDataUrl)) {
      return json({ error: "INVALID_IMAGE" }, 400);
    }
    if (imageDataUrl.length > 12_000_000) return json({ error: "IMAGE_TOO_LARGE" }, 413);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "OPENAI_API_KEY_NOT_CONFIGURED" }, 503);

    const prompt = `Analiza exclusivamente la tabla titulada "RESUMEN DE VARIABLES DEL MES" de esta imagen de registro de jornada.

Devuelve SOLO JSON válido, sin markdown, con esta forma exacta:
{"isMonthlySummary":true,"concepts":[{"name":"texto exacto del concepto","value":"cantidad"}]}

Reglas:
- Lee cada fila real por el NOMBRE DEL CONCEPTO, nunca por su posición ni por un número fijo de filas.
- La cantidad es la cifra de la columna CANTIDAD de esa misma fila.
- Conserva decimales con coma si aparecen (ej. 57,25 o 42,98).
- Si un concepto no aparece ese mes, NO lo inventes y NO lo incluyas.
- EXCLUYE cualquier fila cuyo nombre contenga a la vez una variante de "teór/teor/teórico/teorico" y "PC30". Son conceptos teóricos y NO son el plus ordinario.
- Aunque aparezca una fila teórica PC30, continúa recorriendo toda la tabla y devuelve la fila ordinaria independiente del mismo plus si existe. Ejemplo: ignora "Plus Nocturno teór. PC30 1,25" y devuelve "Plus Nocturno 56".
- Esta exclusión PC30 NO se aplica a los conceptos NOPAGA PNocturn teór o NOPAGA PFestivo teór.
- Distingue "Plus de turno" de "Plus de turno 12 horas".
- Distingue "Plus Festivo" de "Dietas Festivos".
- Pueden aparecer, entre otros: Plus Festivo, Plus rotatividad, Plus de turno, Comidas Can Guasch, Plus Nocturno, Plus de turno 12 horas, Dietas Festivos, Pluses Vacaciones y conceptos NOPAGA.
- Ignora completamente la tabla SALDOS y TOTAL HORAS PERIODO.
- Si no ves claramente el encabezado o la tabla de resumen mensual, devuelve {"isMonthlySummary":false,"concepts":[]}.
- No deduzcas cifras borrosas: si una cantidad no es legible con seguridad, omite esa fila.`;

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageDataUrl, detail: "high" },
          ],
        }],
        max_output_tokens: 700,
      }),
    });

    const openaiJson = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) {
      console.error("OpenAI response error", openaiResponse.status, openaiJson);
      return json({ error: "VISION_PROVIDER_ERROR", status: openaiResponse.status }, 502);
    }

    const parsed = parseModelJson(extractOutputText(openaiJson));
    if (parsed?.isMonthlySummary !== true || !Array.isArray(parsed?.concepts)) {
      return json({ isMonthlySummary: false, concepts: [] });
    }

    const concepts = parsed.concepts
      .map((item: any) => ({
        name: String(item?.name ?? "").trim(),
        normalizedName: normalizeConcept(item?.name),
        value: normalizeValue(item?.value),
      }))
      .filter((item: any) => item.name && item.value && !isTheoreticalPc30(item.name));

    return json({ isMonthlySummary: true, concepts });
  } catch (error) {
    console.error("Unexpected lab-read-timesheet-summary error", error);
    return json({ error: "UNEXPECTED_ERROR" }, 500);
  }
});
