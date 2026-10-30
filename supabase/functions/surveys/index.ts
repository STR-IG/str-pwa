import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  cleanEmail,
  CONSENT_VERSION,
  hmac,
  isCorporateEmail,
  randomCode,
  uuid,
  validateSurvey,
} from "../_shared/survey-core.mjs";

import { surveyCodeMessage } from "../_shared/survey-mail.mjs";

const origins = new Set(["https://str-ig.github.io", "http://localhost:8000"]);
async function surveySecret() {
  const configured = Deno.env.get("SURVEY_HMAC_SECRET");
  if (configured && configured.length >= 32) return configured;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey || serviceKey.length < 32) {
    throw new Error("SERVER_CONFIGURATION");
  }
  // Domain separation keeps survey HMACs independent from Supabase JWT use.
  return await hmac(serviceKey, "str-surveys:hmac-key:v1");
}
function participantEmail(value: unknown) {
  const email = cleanEmail(value);
  if (isCorporateEmail(email)) throw new Error("CORPORATE_EMAIL_NOT_ALLOWED");
  return email;
}

const surveyMailKey = () =>
  Deno.env.get("SURVEY_RESEND_API_KEY") ?? Deno.env.get("RESEND_API_KEY");
const surveyMailFrom = () =>
  Deno.env.get("SURVEY_MAIL_FROM") ?? "STR-IG <acceso@str-ig.es>";

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
    let actorId: string | null = null;
    const token = (req.headers.get("authorization") ?? "").replace(
      /^Bearer /,
      "",
    );
    if (token) {
      const { data, error } = await db.auth.getUser(token);
      if (!error && data.user?.email && data.user.email_confirmed_at) {
        actorId = data.user.id;
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

    const weatherCall = async (
      weatherAction: string,
      surveyId: string | null,
      data: Record<string, unknown> = {},
    ) =>
      await rpc("weather_action", {
        p_action: weatherAction,
        p_survey: surveyId,
        p_actor: actorId,
        p_data: data,
      });
    const weatherId = () => uuid(body.surveyId);

    if (action === "weather_list") {
      return reply({ surveys: await weatherCall("list", null) });
    }
    if (action === "weather_get") {
      return reply(await weatherCall("get", weatherId()));
    }
    if (action === "weather_results") {
      if (!isAdmin) return reply({ error: "FORBIDDEN" }, 403);
      return reply(
        await weatherCall("results", weatherId(), {
          test: body.test === true,
        }),
      );
    }
    if (action === "weather_cleanup") {
      if (!isAdmin) return reply({ error: "FORBIDDEN" }, 403);
      return reply(await weatherCall("cleanup", weatherId()));
    }
    if (action === "weather_publish") {
      if (!isAdmin) return reply({ error: "FORBIDDEN" }, 403);
      if (body.confirm !== true) {
        return reply({ error: "CONFIRMATION_REQUIRED" }, 400);
      }
      return reply(await weatherCall("publish", weatherId()));
    }
    if (action === "weather_close") {
      if (!isAdmin) return reply({ error: "FORBIDDEN" }, 403);
      return reply(await weatherCall("close", weatherId()));
    }
    if (action === "weather_cancel") {
      return reply(
        await weatherCall("cancel", weatherId(), { id: uuid(body.challengeId) }),
      );
    }

    const weatherSurveyId = () => uuid(body.surveyId);
    const weatherSecret = surveySecret;
    if (action === "weather_request") {
      const email = participantEmail(body.email);
      const secret = await weatherSecret();
      const mailKey = surveyMailKey();
      const from = surveyMailFrom();
      if (!mailKey || !from) return reply({ error: "MAIL_NOT_CONFIGURED" }, 503);
      const surveyId = weatherSurveyId();
      const id = crypto.randomUUID();
      const code = randomCode();
      const forwarded = req.headers.get("cf-connecting-ip") ??
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
        "unknown";
      const result = await weatherCall("request", surveyId, {
        id,
        email_key: await hmac(secret, `email:${email}`),
        ip_key: await hmac(secret, `weather-ip:${forwarded}`),
        code_hash: await hmac(secret, `code:${id}:${code}`),
      });
      if (result?.error) return reply(result, 400);
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
          ...surveyCodeMessage(code, {
            minutes: 5,
            subject: "Tu código para la encuesta sobre alertas meteorológicas",
          }),
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!sent.ok) {
        await weatherCall("cancel", surveyId, { id });
        return reply({ error: "MAIL_FAILED" }, 503);
      }
      return reply({ challengeId: id });
    }
    if (action === "weather_verify") {
      const email = participantEmail(body.email);
      const secret = await weatherSecret();
      const challengeId = uuid(body.challengeId);
      if (!/^\d{6}$/.test(String(body.code))) {
        return reply({ error: "INVALID_CODE" }, 400);
      }
      const permit = crypto.randomUUID() + crypto.randomUUID();
      const result = await weatherCall("verify", weatherSurveyId(), {
        id: challengeId,
        email_key: await hmac(secret, `email:${email}`),
        code_hash: await hmac(secret, `code:${challengeId}:${body.code}`),
        permit: await hmac(secret, `permit:${permit}`),
      });
      return reply(result?.error ? result : { permit }, result?.error ? 400 : 200);
    }
    if (action === "weather_submit") {
      const secret = weatherSecret();
      if (typeof body.consent !== "boolean") {
        return reply({ error: "INVALID_CONSENT" }, 400);
      }
      let contact: string | undefined;
      let emailKey: string | undefined;
      if (body.consent) {
        contact = participantEmail(body.email);
        emailKey = await hmac(secret, `email:${contact}`);
      }
      if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
        return reply({ error: "INVALID_ANSWERS" }, 400);
      }
      const permit = String(body.permit ?? "");
      if (permit.length < 32 || permit.length > 128) {
        return reply({ error: "INVALID_PERMIT" }, 400);
      }
      const result = await weatherCall("submit", weatherSurveyId(), {
        permit: await hmac(secret, `permit:${permit}`),
        answers: body.answers,
        consent: body.consent,
        ...(body.consent ? { contact, email_key: emailKey } : {}),
      });
      return reply(result, result?.error ? 400 : 200);
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
    const email = participantEmail(body.email);
    let secret: string;
    try {
      secret = await surveySecret();
    } catch {
      return reply({ error: "SERVER_CONFIGURATION" }, 503);
    }
    const emailKey = await hmac(secret, `email:${email}`);
    if (action === "request") {
      const mailKey = surveyMailKey();
      const from = surveyMailFrom();
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
          ...surveyCodeMessage(code),
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
      error: ["INVALID_EMAIL", "INVALID_ID", "INVALID_SURVEY", "CORPORATE_EMAIL_NOT_ALLOWED"].includes(code)
        ? code
        : code === "SERVER_CONFIGURATION"
        ? "SERVER_CONFIGURATION"
        : "REQUEST_FAILED",
    }, 400);
  }
});
