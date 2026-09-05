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
  const canonicalCode = (value: unknown) => {
    const raw = String(value ?? '').replace(/\s+/g, '').toUpperCase();
    return /^\d{1,4}$/.test(raw) ? raw.padStart(4, '0') : raw;
  };
  const catalog = [
    {code:'0001', unitPrice:true}, {code:'0002', unitPrice:true},
    {code:'0003', unitPrice:true}, {code:'0004', unitPrice:true},
    {code:'0053', unitPrice:true}, {code:'7001', unitPrice:false},
    {code:'7016', unitPrice:false}, {code:'7017', unitPrice:false},
  ];
  return catalog.flatMap(({code, unitPrice}) => {
    const matches = items.filter((item: any) => canonicalCode(item?.code) === code);
    if (matches.length !== 1) return [];
    const row = {code, quantity:number(matches[0].quantity), amount:number(matches[0].amount, true),
      ...(unitPrice ? {unitPrice:number(matches[0].unitPrice, true)} : {})};
    return [row];
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

const discountKinds = new Set([
  "accrued_total_cc", "accrued_total_accidents", "extra_pay_proration", "march_pay_proration",
  "other_proration", "common_contingencies", "mei", "unemployment", "training",
  "solidarity_contribution", "irpf", "in_kind_irpf", "company_fogasa", "company_it",
  "company_ims", "company_pension_plan", "company_meals", "life_insurance", "christmas_lot",
  "total", "unknown",
]);

function normalizeDiscountNumber(value: unknown, maximum: number) {
  if (value === null || value === undefined || value === "") return null;
  let raw = String(value).trim();
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d{1,4})?$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) && Math.abs(number) <= maximum ? number : null;
}

function normalizeDiscountSourceText(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  if (!text) return "";
  const personal = /@|\b(?:dni|nif|nie|naf|domicilio|emplead[oa]|n[uú]mero de seguridad social)\b|\b\d{8}[a-z]\b/i.test(text);
  return personal ? "" : text;
}

function normalizeDiscountCode(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "").trim().toUpperCase().slice(0, 12);
}

function catalogDiscountKind(code: string, sourceText: string) {
  const concept = normalizeConcept(sourceText);
  const matches: Record<string, RegExp> = {
    "9102": /\bdevengado total cc\b/,
    "9105": /\bdevengado total acc(?:identes)? d fp\b/,
    "/341": /\bprorrata (?:de )?pagas? extras?\b/,
    "9044": /\bprorrata (?:de )?paga (?:de )?marzo\b/,
    "RDL": /\bprorrat/,
    "9350": /\bcontingencias? comunes?\b/,
    "9370": /\bdesempleo\b/,
    "9380": /\bformacion profesional\b/,
    "93C0": /\b(?:cuota )?solidaridad\b/,
    "9402": /^irpf$/,
    "/402": /\b(?:ret(?:encion)? )?especie\b.*\birpf\b|\birpf\b.*\bespecie\b/,
    "/361": /\b(?:empr )?fondo (?:de )?gar(?:antia)? salarial\b/,
    "/352": /\bempresa it\b/,
    "/353": /\bempresa ims\b/,
    "4001": /\baportacion empresa pp\b|\baportacion.*plan.*pensiones\b/,
    "9106": /\bcomedor (?:parte )?empresa\b/,
    "9117": /\bseguro (?:de )?vida\b/,
    "9108": /\blote (?:de )?navidad\b/,
  };
  if (!concept) return "unknown";
  if ((code === "SSIR" || !code) && /\btotal cotiz ss e irpf\b/.test(concept)) return "total";
  if (/\bmei\b|\bmecanismo (?:de )?equidad intergeneracional\b/.test(concept)) return "mei";
  if (!matches[code]?.test(concept)) return "unknown";

  const kindsByCode: Record<string, string> = {
    "9102": "accrued_total_cc",
    "9105": "accrued_total_accidents",
    "/341": "extra_pay_proration",
    "9044": "march_pay_proration",
    "RDL": "other_proration",
    "9350": "common_contingencies",
    "9370": "unemployment",
    "9380": "training",
    "93C0": "solidarity_contribution",
    "9402": "irpf",
    "/402": "in_kind_irpf",
    "/361": "company_fogasa",
    "/352": "company_it",
    "/353": "company_ims",
    "4001": "company_pension_plan",
    "9106": "company_meals",
    "9117": "life_insurance",
    "9108": "christmas_lot",
  };
  return kindsByCode[code] ?? "unknown";
}

function discountSide(kind: string, rawSide: unknown) {
  const side = String(rawSide ?? "").trim().toLowerCase();
  if (["accrued_total_cc", "accrued_total_accidents", "extra_pay_proration", "march_pay_proration", "other_proration"].includes(kind)) return "bases";
  if (["irpf", "in_kind_irpf"].includes(kind)) return "irpf";
  if (["company_fogasa", "company_it", "company_ims"].includes(kind)) return "company";
  if (["company_pension_plan", "company_meals", "life_insurance", "christmas_lot"].includes(kind)) return "contributions";
  if (["common_contingencies", "mei", "unemployment", "training", "solidarity_contribution"].includes(kind)) {
    return side === "worker" || side === "company" ? side : "unknown";
  }
  if (kind === "total") return side === "worker_total" || side === "company_total" ? side : "unknown";
  return "unknown";
}

function normalizeDiscountRows(items: unknown) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item: any) => {
    const code = normalizeDiscountCode(item?.code);
    const sourceText = normalizeDiscountSourceText(item?.sourceText);
    const catalogKind = catalogDiscountKind(code, sourceText);
    const kind = discountKinds.has(catalogKind) ? catalogKind : "unknown";
    const side = discountSide(kind, item?.side);
    const row = {
      kind: side === "unknown" ? "unknown" : kind,
      code,
      side,
      sourceText,
      value: normalizeDiscountNumber(item?.value, 1_000_000),
      base: normalizeDiscountNumber(item?.base, 1_000_000),
      rate: normalizeDiscountNumber(item?.rate, 100),
      amount: normalizeDiscountNumber(item?.amount, 1_000_000),
    };
    if (row.kind === "unknown" && !sourceText && !code) return [];
    if (row.kind !== "unknown" && row.value === null && row.base === null && row.rate === null && row.amount === null) return [];
    return [row];
  }).slice(0, 50);
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
    const readDiscounts = body?.readDiscounts === true;
    const includeSupplemental = body?.includeSupplemental === true;
    const includeOvertime = body?.includeOvertime === true;
    const imageDataUrl = String(body?.imageDataUrl ?? "");
    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(imageDataUrl)) {
      return json({ error: "INVALID_IMAGE" }, 400);
    }
    if (imageDataUrl.length > 12_000_000) return json({ error: "IMAGE_TOO_LARGE" }, 413);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "OPENAI_API_KEY_NOT_CONFIGURED" }, 503);

    if (readDiscounts) {
      const discountsPrompt = `Analiza únicamente la tabla o sección "Seguridad Social e IRPF" visible en esta captura de nómina.

Devuelve SOLO JSON válido, sin markdown, con esta forma exacta:
{"isDiscountsSection":true,"quality":"ok","rows":[{"code":"9350","sourceText":"Contingencias Comunes","side":"worker","value":null,"base":null,"rate":null,"amount":null}]}
El ejemplo solo define la estructura. Sustituye sus campos por lo que realmente veas y nunca copies datos que no estén en la captura.

Catálogo exacto por CÓDIGO + CONCEPTO:
- Bases y prorratas: 9102 Devengado Total CC; 9105 Devengado Total Acc/d/fp; /341 Prorrata pagas extras; 9044 Prorrata Paga de Marzo; RDL Otras prorratas.
- Seguridad Social: 9350 Contingencias Comunes; 9370 Desempleo; 9380 Formación Profesional; 93C0 Cuota solidaridad; MEI o Mecanismo de Equidad Intergeneracional cuando esté escrito expresamente.
- IRPF: 9402 IRPF; /402 Ret Especie Ingr cta IRPF.
- Seguridad Social empresa: /361 Empr. fondo gar. salarial; /352 Empresa IT; /353 Empresa IMS.
- Aportaciones o beneficios de empresa: 4001 Aportación Empresa PP; 9106 Comedor parte empresa; 9117 Seguro vida; 9108 Lote Navidad.
- Total: la fila titulada "Total Cotiz. SS e IRPF (*)", que puede llevar el código SSIR.

Reglas estrictas:
- Identifica primero el código y el texto del concepto. No clasifiques por importes ni porcentajes.
- Devuelve code con el código visible exacto y sourceText solo con el texto visible del concepto.
- side solo puede ser: bases, worker, irpf, company, contributions, worker_total, company_total o unknown.
- Las filas de bases y prorratas usan side "bases" y guardan su importe visible en value.
- Las aportaciones o beneficios de empresa usan side "contributions" y guardan su importe visible en value. No son descuentos de la persona trabajadora.
- Las filas de Seguridad Social con columnas de trabajador/a y empresa se devuelven dos veces cuando existan datos en ambos lados: mismo code y sourceText, una fila side "worker" y otra side "company".
- Para worker y company, base es la base visible, rate el porcentaje de ese lado y amount su cuota. Si no se ve el porcentaje, usa null aunque se vean base y cuota.
- 9402 usa side "irpf" con base, rate y amount como retención. /402 también usa side "irpf", pero debe conservarse como concepto distinto y amount es la retención en especie.
- /361, /352 y /353 usan side "company". No los mezcles con cuotas del trabajador.
- Para "Total Cotiz. SS e IRPF (*)", devuelve por separado side "worker_total" y side "company_total" cuando estén presentes, con cada total en amount. No los sumes.
- Una fila sin correspondencia segura con el catálogo usa side "unknown" y conserva code, sourceText y las cifras visibles en value, base, rate o amount.
- Usa null para cualquier dato ausente, ambiguo o ilegible. Si un concepto no aparece, no lo incluyas.
- No calcules valores, no completes operaciones y no inventes conceptos ni ceros.
- No extraigas ni devuelvas nombre, DNI/NIF/NIE, número de Seguridad Social, domicilio, cuenta bancaria, número de empleado, correo ni ningún otro identificador personal.
- Si la imagen está borrosa, cortada, no contiene esta sección o no permite leer al menos una cifra con seguridad, devuelve {"isDiscountsSection":false,"quality":"low","rows":[]}.
- quality solo puede ser "ok" cuando la sección es reconocible y existe al menos una cifra fiable.`;

      const discountsResponse = await fetch("https://api.openai.com/v1/responses", {
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
              { type: "input_text", text: discountsPrompt },
              { type: "input_image", image_url: imageDataUrl, detail: "high" },
            ],
          }],
          max_output_tokens: 2800,
        }),
      });

      const discountsJson = await discountsResponse.json().catch(() => ({}));
      if (!discountsResponse.ok) {
        console.error("OpenAI discounts vision error", discountsResponse.status, discountsJson);
        return json({ error: "VISION_PROVIDER_ERROR", status: discountsResponse.status }, 502);
      }

      const parsedDiscounts = parseModelJson(extractOutputText(discountsJson));
      const rows = normalizeDiscountRows(parsedDiscounts?.rows);
      if (parsedDiscounts?.isDiscountsSection !== true || parsedDiscounts?.quality !== "ok" || rows.length === 0) {
        return json({ isDiscountsSection: false, quality: "low", rows: [] });
      }
      return json({ isDiscountsSection: true, quality: "ok", rows });
    }

    const prompt = `Analiza esta imagen de una nómina. Queremos cruzarla con el "RESUMEN DE VARIABLES DEL MES" del registro de jornada.\n\nDevuelve SOLO JSON válido, sin markdown, con esta forma exacta:\n{"isPayroll":true,"concepts":[{"name":"texto del concepto en nómina","value":"cantidad/unidades"}]}\n\nReglas:\n- Extrae únicamente la CANTIDAD, UNIDADES u HORAS asociadas a cada concepto variable; NO extraigas el importe en euros ni el precio unitario.\n- Lee cada concepto por su nombre real en la nómina, no por posición fija.\n- Conceptos a buscar: Plus rotatividad, Comidas Can Guasch (puede aparecer como PRF COMIDAS C. GUASCH o similar), Plus nocturno, Plus de turno, Plus festivo, Plus de turno 12 horas, Dietas festivos y Pluses vacaciones.\n- Distingue "Plus de turno" de "Plus de turno 12 horas".\n- Distingue "Plus festivo" de "Dietas festivos".\n- Si un concepto no aparece en la nómina, NO lo inventes y NO lo incluyas.\n- Conserva decimales con coma cuando existan.\n- Si una fila muestra varias cifras, identifica cuál corresponde a cantidad/unidades/horas y evita importes monetarios.\n- Si no puedes reconocer que la imagen corresponde a una nómina o tabla de conceptos salariales, devuelve {"isPayroll":false,"concepts":[]}.\n- Si una cantidad no es legible con seguridad, omite esa fila.`;

    const supplementalPrompt = includeSupplemental ? `
Además, añade al JSON una propiedad independiente "supplemental": [{"code":"0001","quantity":null,"unitPrice":null,"amount":null},{"code":"7001","quantity":null,"amount":null}]. Los ejemplos solo ilustran la estructura: sustituye los null únicamente por cifras realmente visibles.

Busca exclusivamente estas filas, identificándolas siempre por CÓDIGO + CONCEPTO:
- 0001 Salario mín. garantizado / Salario mínimo garantizado.
- 0002 Plus convenio.
- 0003 Complemento Personal.
- 0004 Comp. Puesto Trabajo / Complemento Puesto de Trabajo.
- 0053 Antigüedad.
- 7001 Difer. Grupo Sup. Salario.
- 7016 Difer. Grup. Sup. Pl. Rotat.
- 7017 Difer. Grup. Sup. Pl. Festivo.

Para 0001, 0002, 0003, 0004 y 0053 extrae quantity de CANTIDAD, unitPrice de IMPORTE DIARIO o PRECIO UNITARIO y amount de DEVENGOS. Son conceptos fijos mensuales de la nómina: NO pertenecen a concepts y NO se comparan con el registro de jornada.
Para 7001, 7016 y 7017 extrae únicamente quantity de CANTIDAD y amount de DEVENGOS. No devuelvas unitPrice para estas filas. Son funciones de grupo superior y tampoco pertenecen a concepts: no las confundas con Plus rotatividad ni Plus festivo normales.
Conserva signos y hasta cuatro decimales. Usa null para una cifra ausente o ilegible. Si una fila no aparece, omítela de supplemental. No calcules, no completes operaciones, no supongas unidades y no inventes ceros por ausencia. No incluyas datos personales. Si no se reconoce una nómina, supplemental debe ser [].` : '';

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
        max_output_tokens: includeSupplemental ? 2200 : includeOvertime ? 1400 : 700,
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
      const regular = concepts.filter((item: any) => !/\b(?:0001|0002|0003|0004|0053|0029|7001|7016|7017)\b|horas?\s*extra|salario\s*min(?:imo)?\s*garantizado|plus\s*convenio|comp(?:l(?:emento)?)?\s*personal|comp(?:l(?:emento)?)?\s*puesto\s*(?:de\s*)?trabajo|antiguedad|gru(?:po|p)?\s*sup|difer/.test(item.normalizedName));
      return json({isPayroll: true, concepts: regular, overtime: normalizeOvertime(parsed.overtime),
        ...(includeSupplemental ? {supplemental: normalizeSupplemental(parsed.supplemental)} : {})});
    }
    if (includeSupplemental) {
      const regular = concepts.filter((item: any) => !/\b(?:0001|0002|0003|0004|0053|7001|7016|7017)\b|salario\s*min(?:imo)?\s*garantizado|plus\s*convenio|comp(?:l(?:emento)?)?\s*personal|comp(?:l(?:emento)?)?\s*puesto\s*(?:de\s*)?trabajo|antiguedad|gru(?:po|p)?\s*sup|difer/.test(item.normalizedName));
      return json({isPayroll:true, concepts:regular, supplemental:normalizeSupplemental(parsed.supplemental)});
    }
    return json({ isPayroll: true, concepts });
  } catch (error) {
    console.error("Unexpected lab-read-payroll-variables error", error);
    return json({ error: "UNEXPECTED_ERROR" }, 500);
  }
});
