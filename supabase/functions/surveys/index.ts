import "jsr:@supabase/functions-js@2.118.0/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  cleanEmail,
  CONSENT_VERSION,
  hmac,
  randomCode,
  uuid,
  validateSurvey,
} from "../_shared/survey-core.mjs";

const origins = new Set(["https://str-ig.github.io", "http://localhost:8000"]);
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "Access-Control-Allow-Origin": origins.has(origin)
      ? origin
      : "https://str-ig.github.io",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) {
    return reply({ error: "ORIGIN_DENIED" }, 403);
  }
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 12000) return reply({ error: "BODY_TOO_LARGE" }, 413);
    const body = JSON.parse(raw);
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!url || !key) return reply({ error: "SERVER_CONFIGURATION" }, 503);
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rpc = async (name: string, args: Record<string, unknown> = {}) => {
      const { data, error } = await db.rpc(name, args);
      if (error) throw new Error("DATABASE_ERROR");
      return data;
    };
    let isAdmin = false;
    const token = (req.headers.get("authorization") ?? "").replace(
      /^Bearer /,
      "",
    );
    if (token) {
      const { data, error } = await db.auth.getUser(token);
      if (!error && data.user?.email && data.user.email_confirmed_at) {
        const { data: row, error: adminError } = await db.from(
          "committee_admins",
        ).select("email")
          .eq("email", cleanEmail(data.user.email)).eq("active", true)
          .maybeSingle();
        if (adminError) throw new Error("DATABASE_ERROR");
        isAdmin = !!row;
      }
    }
    const action = body.action;
    if (action === "authorize") {
      return isAdmin ? reply({ ok: true }) : reply({ error: "FORBIDDEN" }, 403);
    }
    if (action === "list") {
      return reply({ surveys: await rpc("survey_list", { p_admin: isAdmin }) });
    }
    if (["create", "activate", "close", "results"].includes(action)) {
      if (!isAdmin) return reply({ error: "FORBIDDEN" }, 403);
      if (action === "create") {
        const survey = validateSurvey(body);
        return reply(
          await rpc("survey_create", {
            p_title: survey.title,
            p_description: survey.description,
            p_options: survey.options,
            p_admin_only: survey.adminOnly,
          }),
        );
      }
      return reply(
        await rpc("survey_admin_action", {
          p_id: uuid(body.surveyId),
          p_action: action,
        }),
      );
    }
    if (!["request", "vote"].includes(action)) {
      return reply({ error: "INVALID_ACTION" }, 400);
    }
    const surveyId = uuid(body.surveyId);
    const email = cleanEmail(body.email);
    const secret = Deno.env.get("SURVEY_HMAC_SECRET");
    if (!secret || secret.length < 32) {
      return reply({ error: "SERVER_CONFIGURATION" }, 503);
    }
    const emailKey = await hmac(secret, `email:${email}`);
    if (action === "request") {
      const mailKey = Deno.env.get("SURVEY_RESEND_API_KEY");
      const from = Deno.env.get("SURVEY_MAIL_FROM");
      if (!mailKey || !from) {
        return reply({ error: "MAIL_NOT_CONFIGURED" }, 503);
      }
      const id = crypto.randomUUID();
      const code = randomCode();
      // Never trust arbitrary client-supplied IP headers. Email and global quotas
      // remain effective even when network addresses are unavailable/spoofed.
      const result = await rpc("survey_challenge", {
        p_survey: surveyId,
        p_email_key: emailKey,
        p_id: id,
        p_code_hash: await hmac(secret, `code:${id}:${code}`),
        p_admin: isAdmin,
      });
      if (result.error) return reply(result, 400);
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mailKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": id,
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "Tu código para las encuestas STR",
          text:
            `Tu código es ${code}. Caduca en 10 minutos. Si no lo has solicitado, ignora este correo.`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!sent.ok) return reply({ error: "MAIL_FAILED" }, 503);
      return reply({ challengeId: id });
    }
    if (
      !/^\d{6}$/.test(String(body.code)) || typeof body.consent !== "boolean"
    ) return reply({ error: "INVALID_VOTE" }, 400);
    const challengeId = uuid(body.challengeId);
    const result = await rpc("survey_vote", {
      p_survey: surveyId,
      p_email_key: emailKey,
      p_challenge: challengeId,
      p_code_hash: await hmac(secret, `code:${challengeId}:${body.code}`),
      p_option: uuid(body.optionId),
      p_admin: isAdmin,
      p_contact: body.consent ? email : null,
      p_consent_version: CONSENT_VERSION,
    });
    return reply(result, result.error ? 400 : 200);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return reply({
      error: ["INVALID_EMAIL", "INVALID_ID", "INVALID_SURVEY"].includes(code)
        ? code
        : "REQUEST_FAILED",
    }, 400);
  }
});
