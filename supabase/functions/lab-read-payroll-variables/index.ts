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

function normalizeSupplemental(items: any) {
  if (!Array.isArray(items)) return [];
  const number = (value: unknown, signed = false) => {
    let raw = String(value ?? '').trim();
    if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
    if (!/^-?\d+(?:\.\d{1,4})?$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isFinite(n) && (signed || n >= 0) && Math.abs(n) <= 1000000 ? n : null;
  };
  return ['7001', '7016', '7017'].flatMap(code => {
    const matches = items.filter((item: any) => String(item?.code) === code);
    if (matches.length !== 1) return [];
    return [{code, quantity:number(matches[0].quantity), amount:number(matches[0].amount, true)}];
  });
}

function normalizeOvertime(items: any) {
  if (!Array.isArray(items)) return null;
  const matches = items.filter((item: any) => item?.code === '0029');
  if (matches.length !== 1) return null;
  const number = (value: unknown) => {
    let raw = String(value ?? '').trim();
    if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(?:\.\d{1,4})?$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n <= 1000000 ? n : null;
  };
  return {code: '0029', quantity: number(matches[0].quantity), unitPrice: number(matches[0].unitPrice)};
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
    const includeSupplemental = body?.includeSupplemental === true;
    const includeOvertime = body?.includeOvertime === true;
    const imageDataUrl = String(body?.imageDataUrl ?? "");
    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(imageDataUrl)) {
      return json({ error: "INVALID_IMAGE" }, 400);
    }
    if (imageDataUrl.length > 12_000_000) return json({ error: "IMAGE_TOO_LARGE" }, 413);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "OPENAI_API_KEY_NOT_CONFIGURED" }, 503);

    const prompt = `Analiza esta imagen de una nómina. Queremos cruzarla con el "RESUMEN DE VARIABLES DEL MES" del registro de jornada.\n\nDevuelve SOLO JSON válido, sin markdown, con esta forma exacta:\n{"isPayroll":true,"concepts":[{"name":"texto del concepto en nómina","value":"cantidad/unidades"}]}\n\nReglas:\n- Extrae únicamente la CANTIDAD, UNIDADES u HORAS asociadas a cada concepto variable; NO extraigas el importe en euros ni el precio unitario.\n- Lee cada concepto por su nombre real en la nómina, no por posición fija.\n- Conceptos a buscar: Plus rotatividad, Comidas Can Guasch (puede aparecer como PRF COMIDAS C. GUASCH o similar), Plus nocturno, Plus de turno, Plus festivo, Plus de turno 12 horas, Dietas festivos y Pluses vacaciones.\n- Distingue "Plus de turno" de "Plus de turno 12 horas".\n- Distingue "Plus festivo" de "Dietas festivos".\n- Si un concepto no aparece en la nómina, NO lo inventes y NO lo incluyas.\n- Conserva decimales con coma cuando existan.\n- Si una fila muestra varias cifras, identifica cuál corresponde a cantidad/unidades/horas y evita importes monetarios.\n- Si no puedes reconocer que la imagen corresponde a una nómina o tabla de conceptos salariales, devuelve {"isPayroll":false,"concepts":[]}.\n- Si una cantidad no es legible con seguridad, omite esa fila.`;

    const supplementalPrompt = includeSupplemental ? `
Además, añade al JSON una propiedad independiente "supplemental": [{"code":"7001","quantity":"5","amount":"119,90"}]. El ejemplo solo ilustra el formato: nunca copies sus valores.
Busca exclusivamente 7001 Difer. Grupo Sup. Salario, 7016 Difer. Grup. Sup. Pl. Rotat. y 7017 Difer. Grup. Sup. Pl. Festivo. Verifica código y concepto; conserva cada fila por separado.
Para estas tres filas únicamente, extrae quantity de CANTIDAD y amount de DEVENGOS (importe abonado, no precio unitario ni deducciones). Conserva el signo y decimales. Usa null para una cifra ilegible. Si la fila no aparece, omítela de supplemental. No supongas unidades ni calcules importes. No incluyas datos personales.
Las diferencias de grupo superior NO pertenecen a concepts: no las confundas con Plus rotatividad ni Plus festivo normales. Nunca inventes ceros por ausencia. Si no se reconoce nómina, supplemental debe ser [].` : '';

    const overtimePrompt = includeOvertime ? `
Además, añade al JSON una propiedad independiente "overtime": [{"code":"0029","quantity":null,"unitPrice":null}].
Busca exclusivamente la fila 0029 Horas extras. Verifica el código y el nombre. En esa fila, quantity es el NÚMERO DE HORAS de CANTIDAD y unitPrice es su PRECIO POR HORA, que puede estar bajo IMPORTE DIARIO / PRECIO UNITARIO. Lee solo las cifras visibles de esta nómina.
Para esta fila únicamente se permite leer el precio unitario: NO lo confundas con el total de DEVENGOS, deducciones, porcentajes, bases o cotizaciones por horas extras. No derives el precio a partir del grupo profesional ni de otros recibos. No calcules nada ni inventes tarifas.
Si la fila aparece pero alguna cifra no es legible, devuelve null en esa cifra; nunca cero por falta de lectura. Si no aparece, devuelve overtime: []. Si hay varias filas 0029, conserva cada una en el array para señalar que necesita revisión manual, sin sumarlas ni elegir una. Si no es nómina, overtime: [].
Las horas extras no pertenecen a concepts: no las confundas con plus festivo, nocturno ni turno 12 horas. No extraigas compensaciones especiales 9G01 ni otros conceptos nuevos. No incluyas datos personales.` : '';

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
            { type: "input_text", text: prompt + supplementalPrompt + overtimePrompt },
            { type: "input_image", image_url: imageDataUrl, detail: "high" },
          ],
        }],
        max_output_tokens: includeOvertime ? 1400 : includeSupplemental ? 1200 : 700,
      }),
    });

    const openaiJson = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) {
      console.error("OpenAI payroll vision error", openaiResponse.status, openaiJson);
      return json({ error: "VISION_PROVIDER_ERROR", status: openaiResponse.status }, 502);
    }

    const parsed = parseModelJson(extractOutputText(openaiJson));
    if (parsed?.isPayroll !== true || !Array.isArray(parsed?.concepts)) {
      return json({ isPayroll: false, concepts: [] });
    }

    const concepts = parsed.concepts
      .map((item: any) => ({
        name: String(item?.name ?? "").trim(),
        normalizedName: normalizeConcept(item?.name),
        value: normalizeValue(item?.value),
      }))
      .filter((item: any) => item.name && item.value);

    if (includeOvertime) {
      const regular = concepts.filter((item: any) => !/\b(?:0029|7001|7016|7017)\b|horas?\s*extra|gru(?:po|p)?\s*sup|difer/.test(item.normalizedName));
      return json({isPayroll: true, concepts: regular, overtime: normalizeOvertime(parsed.overtime),
        ...(includeSupplemental ? {supplemental: normalizeSupplemental(parsed.supplemental)} : {})});
    }
    if (includeSupplemental) {
      const regular = concepts.filter((item: any) => !/\b(?:7001|7016|7017)\b|gru(?:po|p)?\s*sup|difer/.test(item.normalizedName));
      return json({isPayroll:true, concepts:regular, supplemental:normalizeSupplemental(parsed.supplemental)});
    }
    return json({ isPayroll: true, concepts });
  } catch (error) {
    console.error("Unexpected lab-read-payroll-variables error", error);
    return json({ error: "UNEXPECTED_ERROR" }, 500);
  }
});
