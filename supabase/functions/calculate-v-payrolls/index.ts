import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://str-ig.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const includedCodes = new Set(["0010", "0013", "0080", "0017", "7013", "7017"]);
const excludedCodes = new Set(["0016", "0034", "0024", "7001", "7016"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCode(value: unknown) {
  const raw = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const digits = raw.match(/\d{1,4}/)?.[0] ?? "";
  return digits ? digits.padStart(4, "0") : raw.slice(0, 16);
}

function decimal(value: unknown, maximum: number) {
  let raw = String(value ?? "").trim().replace(/\s+/g, "").replace(/[€]/g, "");
  if (!raw) return null;
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  else {
    const parts = raw.split(".");
    if (parts.length > 2) raw = parts.slice(0, -1).join("") + "." + parts.at(-1);
  }
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  if (!Number.isFinite(number) || number < 0 || number > maximum) return null;
  return number;
}

function monthIndex(value: unknown) {
  const match = String(value ?? "").match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function isExcluded(code: string, name: string) {
  if (excludedCodes.has(code)) return true;
  return name.includes("rotatividad")
    || name.includes("dieta festivo")
    || name.includes("dietas festivo")
    || name.includes("pluses vacaciones")
    || name.includes("plus vacaciones")
    || name.includes("difer grupo sup salario")
    || name.includes("diferencial grupo superior salario")
    || name.includes("difer grup sup pl rotat");
}

function isIncluded(code: string, name: string) {
  if (includedCodes.has(code)) return true;
  return name.includes("plus de turno")
    || name.includes("plus turno")
    || name.includes("plus nocturno")
    || name.includes("nocturnidad")
    || name.includes("plus festivo")
    || name.includes("turnicidad")
    || name.includes("plus sabado")
    || name.includes("plus sabados")
    || name.includes("flexibilizacion")
    || name.includes("sabado domingo")
    || name.includes("festivo local")
    || name.includes("difer grupo sup nocturno")
    || name.includes("difer grupo sup festivo")
    || name.includes("diferencial grupo superior nocturno")
    || name.includes("diferencial grupo superior festivo");
}

function suppliesDays(code: string, name: string) {
  if (code === "0010" || code === "0080") return true;
  if (name.includes("difer") || name.includes("rotatividad")) return false;
  return name.includes("plus de turno") || name.includes("plus turno");
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

    const { data: adminRole, error: adminError } = await admin
      .from("committee_admins")
      .select("email")
      .ilike("email", email)
      .eq("active", true)
      .maybeSingle();
    if (adminError) return json({ error: "AUTHORIZATION_CHECK_FAILED" }, 500);

    const body = await req.json().catch(() => ({}));
    const payrolls = Array.isArray(body?.payrolls) ? body.payrolls : [];
    if (payrolls.length !== 3) return json({ error: "INSUFFICIENT_DATA" }, 400);

    const indexes = payrolls.map((payroll: any) => monthIndex(payroll?.month));
    if (indexes.some((index: number | null) => index === null)) {
      return json({ error: "INVALID_MONTH" }, 400);
    }
    if (indexes[1] !== indexes[0] + 1 || indexes[2] !== indexes[1] + 1) {
      return json({ error: "MONTHS_NOT_CONSECUTIVE" }, 400);
    }

    const expectedVMonthIndex = (indexes[2] as number) + 1;
    const requestedVMonth = typeof body?.vMonth === "string" ? body.vMonth : "";
    const requestedVMonthIndex = requestedVMonth ? monthIndex(requestedVMonth) : expectedVMonthIndex;
    if (requestedVMonthIndex === null || requestedVMonthIndex !== expectedVMonthIndex) {
      return json({ error: "INVALID_MONTH" }, 400);
    }
    const usageYear = Math.floor(expectedVMonthIndex / 12);
    const usageMonthNumber = (expectedVMonthIndex % 12) + 1;
    const usageMonth = `${usageYear}-${String(usageMonthNumber).padStart(2, "0")}-01`;

    if (body?.adminContext !== undefined) {
      if (!adminRole) return json({ error: "FORBIDDEN" }, 403);
      const targetEmail = String(body.adminContext?.affiliate ?? "").trim().toLowerCase();
      if (!targetEmail || body.adminContext?.vMonth !== requestedVMonth) {
        return json({ error: "INVALID_ADMIN_CONTEXT" }, 400);
      }
      const { data: targetAffiliate, error: targetError } = await admin
        .from("private_access_allowlist")
        .select("email")
        .ilike("email", targetEmail)
        .eq("active", true)
        .maybeSingle();
      if (targetError) return json({ error: "AUTHORIZATION_CHECK_FAILED" }, 500);
      if (!targetAffiliate) return json({ error: "AFFILIATE_NOT_FOUND" }, 404);
    }

    if (payrolls.some((payroll: any) => Array.isArray(payroll?.specialFlags) && payroll.specialFlags.length > 0)) {
      return json({ error: "CASE_REQUIRES_REVIEW" }, 422);
    }

    const hasSpecialConcept = payrolls.some((payroll: any) =>
      Array.isArray(payroll?.concepts) && payroll.concepts.some((concept: any) => {
        const name = normalizeText(concept?.name);
        return name.includes("teorico")
          || name.includes("acumulado")
          || name.includes("incapacidad temporal")
          || name.includes("baja it")
          || name.includes("jornada reducida")
          || name.includes("reduccion jornada");
      })
    );
    if (hasSpecialConcept) return json({ error: "CASE_REQUIRES_REVIEW" }, 422);

    let totalDays = 0;
    let totalCents = 0;

    for (const payroll of payrolls) {
      if (!Array.isArray(payroll?.concepts)) return json({ error: "INSUFFICIENT_DATA" }, 400);
      let monthDays = 0;
      let monthCents = 0;

      for (const concept of payroll.concepts.slice(0, 100)) {
        const code = normalizeCode(concept?.code);
        const name = normalizeText(concept?.name);
        if (!code && !name) continue;
        if (isExcluded(code, name)) continue;

        if (suppliesDays(code, name)) {
          const quantity = decimal(concept?.quantity, 500);
          if (quantity !== null) monthDays += quantity;
        }

        if (isIncluded(code, name)) {
          const devengos = decimal(concept?.devengos, 100_000);
          if (devengos !== null) monthCents += Math.round(devengos * 100);
        }
      }

      if (!(monthDays > 0) || !(monthCents > 0)) {
        return json({ error: "INSUFFICIENT_DATA" }, 422);
      }
      totalDays += monthDays;
      totalCents += monthCents;
    }

    if (!(totalDays > 0) || !(totalCents > 0)) return json({ error: "INSUFFICIENT_DATA" }, 422);
    const dailyValue = Math.round((totalCents / totalDays)) / 100;
    if (!Number.isFinite(dailyValue) || dailyValue <= 0) return json({ error: "INSUFFICIENT_DATA" }, 422);

    if (!adminRole) {
      const { error: usageError } = await admin
        .from("v_calculation_usage")
        .insert({
          user_id: user.id,
          environment: "production",
          v_month: usageMonth,
        });

      if (usageError) {
        if (usageError.code === "23505") {
          return json({ error: "ALREADY_CALCULATED" }, 409);
        }
        console.error("Unable to record V calculation usage", usageError.code);
        return json({ error: "USAGE_RECORD_FAILED" }, 500);
      }
    }

    return json({ dailyValue });
  } catch (error) {
    console.error("Unexpected calculate-v-payrolls error", error);
    return json({ error: "UNEXPECTED_ERROR" }, 500);
  }
});
