// Real Supabase client, mocked HTTP boundary: never contacts a remote project.
Deno.test("survey Edge authorization, mail privacy and forged admin flags", async () => {
  const assert = (value: unknown, label: string) => {
    if (!value) throw new Error(label);
  };
  const originalFetch = globalThis.fetch, originalServe = Deno.serve;
  const names = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SURVEY_HMAC_SECRET",
    "SURVEY_RESEND_API_KEY",
    "SURVEY_MAIL_FROM",
  ];
  const originalEnv = names.map((name) => Deno.env.get(name));
  let handler: (req: Request) => Promise<Response>;
  let admin = false, mailOk = true;
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const survey = "11111111-1111-4111-8111-111111111111",
    option = "22222222-2222-4222-8222-222222222222";
  try {
    for (
      const [name, value] of Object.entries({
        SUPABASE_URL: "https://survey-test.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
        SURVEY_HMAC_SECRET: "s".repeat(32),
        SURVEY_RESEND_API_KEY: "test-mail-key",
        SURVEY_MAIL_FROM: "STR <test@example.com>",
      })
    ) Deno.env.set(name, value);
    // Capture the entrypoint without starting an HTTP listener.
    Deno.serve = ((fn: typeof handler) => {
      handler = fn;
      return {} as Deno.HttpServer;
    }) as typeof Deno.serve;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input),
        body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url, body });
      if (url.includes("/auth/v1/user")) {
        return Response.json({
          id: "admin-id",
          email: "admin@example.com",
          email_confirmed_at: "2026-10-20T00:00:00Z",
        });
      }
      if (url.includes("/committee_admins")) {
        return Response.json(admin ? [{ email: "admin@example.com" }] : []);
      }
      if (url.includes("/rpc/survey_list")) return Response.json([]);
      if (url.includes("/rpc/weather_action")) {
        if (body.p_action === "list") return Response.json([]);
        return Response.json({ ok: true });
      }
      if (url.includes("/rpc/")) return Response.json({ ok: true });
      if (url === "https://api.resend.com/emails") {
        return Response.json(mailOk ? { id: "mail-id" } : { error: "failed" }, {
          status: mailOk ? 200 : 500,
        });
      }
      throw new Error("Unexpected network access: " + url);
    };
    await import("../supabase/functions/surveys/index.ts");
    const request = (
      body: Record<string, unknown>,
      token = false,
      origin = "http://localhost:8000",
    ) =>
      handler(
        new Request("https://survey-test.invalid/functions/v1/surveys", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            ...(token ? { Authorization: "Bearer test-jwt" } : {}),
          },
          body: JSON.stringify(body),
        }),
      );
    for (
      const action of ["authorize", "create", "activate", "close", "results"]
    ) {
      const response = await request({
        action,
        surveyId: survey,
        admin: true,
        p_admin: true,
      });
      assert(
        response.status === 403,
        "anonymous admin action blocked " + action,
      );
    }
    assert(
      (await request({ action: "create" }, true)).status === 403,
      "non-admin blocked",
    );
    assert(
      (await request({ action: "weather_publish", surveyId: survey })).status === 403,
      "anonymous weather publication blocked",
    );
    await request({ action: "weather_list", actorId: "admin-id" });
    assert(
      calls.at(-1)?.body.p_actor === null,
      "client cannot forge weather administrator identity",
    );
    await request({ action: "list", admin: true, p_admin: true });
    assert(
      calls.at(-1)?.body.p_admin === false,
      "client cannot forge admin list",
    );
    assert(
      (await request({ action: "list" }, false, "https://attacker.invalid"))
        .status === 403,
      "CORS denied",
    );
    admin = true;
    assert(
      (await request({ action: "authorize" }, true)).status === 200,
      "verified admin allowed",
    );
    await request({ action: "weather_list", actorId: "forged-id" }, true);
    assert(
      calls.at(-1)?.body.p_actor === "admin-id",
      "weather operations use verified Auth identity",
    );
    const weatherSent = await request({
      action: "weather_request",
      surveyId: survey,
      email: " ADMIN@example.com ",
      p_actor: "forged-id",
    }, true);
    const weatherChallenge = await weatherSent.json();
    assert(weatherChallenge.challengeId, "weather code sent without returning it");
    const weatherReservation = calls.findLast((call) =>
      call.url.includes("/rpc/weather_action") && call.body.p_action === "request"
    )!;
    assert(weatherReservation.body.p_actor === "admin-id", "weather challenge uses verified admin");
    assert(!JSON.stringify(weatherReservation.body.p_data).includes("admin@example.com"), "weather challenge stores no clear email");
    assert(String(weatherReservation.body.p_data.code_hash).length === 64, "weather code hashed");
    const weatherMail = calls.findLast((call) => call.url === "https://api.resend.com/emails")!;
    const weatherCode = String(weatherMail.body.text).match(/\b\d{6}\b/)![0];
    assert(String(weatherMail.body.text).includes("Caduca en 5 minutos"), "weather code expires in five minutes");
    const verified = await request({
      action: "weather_verify",
      surveyId: survey,
      email: "admin@example.com",
      challengeId: weatherChallenge.challengeId,
      code: weatherCode,
    }, true);
    const permit = await verified.json();
    assert(permit.permit && !JSON.stringify(permit).includes(weatherCode), "weather verification returns only an opaque permit");
    await request({
      action: "weather_submit",
      surveyId: survey,
      email: "admin@example.com",
      permit: permit.permit,
      answers: { q1: ["Presencial"] },
      consent: true,
    }, true);
    const weatherSubmit = calls.findLast((call) =>
      call.url.includes("/rpc/weather_action") && call.body.p_action === "submit"
    )!;
    assert(weatherSubmit.body.p_actor === "admin-id", "weather response uses verified admin");
    assert(weatherSubmit.body.p_data.contact === "admin@example.com", "explicit consent sends the normalized contact for separate storage");
    assert(String(weatherSubmit.body.p_data.email_key).length === 64, "consent contact matches the verified email fingerprint");
    assert(!JSON.stringify(weatherSubmit.body.p_data).includes(permit.permit), "raw weather permit is never sent to the database");
    const sent = await request({
      action: "request",
      surveyId: survey,
      email: " VOTER@example.com ",
    });
    const challenge = await sent.json();
    assert(challenge.challengeId && !challenge.code, "code never returned");
    const reservation = calls.find((call) =>
      call.url.includes("/rpc/survey_challenge")
    )!;
    assert(
      !JSON.stringify(reservation.body).includes("voter@example.com"),
      "database receives no email",
    );
    assert(String(reservation.body.p_code_hash).length === 64, "code hashed");
    const mail = calls.findLast((call) =>
      call.url === "https://api.resend.com/emails"
    )!;
    assert(
      JSON.stringify(mail.body.to) === '["voter@example.com"]',
      "mail normalized",
    );
    const code = String(mail.body.text).match(/\b\d{6}\b/)![0];
    await request({
      action: "vote",
      surveyId: survey,
      email: "voter@example.com",
      challengeId: challenge.challengeId,
      optionId: option,
      code,
      consent: false,
    });
    assert(calls.at(-1)?.body.p_contact === null, "no consent no contact");
    assert(
      calls.at(-1)?.body.p_code_hash === reservation.body.p_code_hash,
      "verification binds exact challenge/code",
    );
    await request({
      action: "vote",
      surveyId: survey,
      email: "voter@example.com",
      challengeId: challenge.challengeId,
      optionId: option,
      code,
      consent: true,
    });
    assert(
      calls.at(-1)?.body.p_contact === "voter@example.com",
      "explicit consent stores contact",
    );
    assert(
      (await request({
        action: "vote",
        surveyId: survey,
        email: "voter@example.com",
        challengeId: challenge.challengeId,
        optionId: option,
        code,
        consent: "yes",
      })).status === 400,
      "string consent rejected",
    );
    mailOk = false;
    assert(
      (await request({
        action: "request",
        surveyId: survey,
        email: "other@example.com",
      })).status === 503,
      "mail failure reported",
    );
    Deno.env.delete("SURVEY_HMAC_SECRET");
    assert(
      (await request({
        action: "request",
        surveyId: survey,
        email: "other@example.com",
      })).status === 503,
      "missing secret fails closed",
    );
  } finally {
    globalThis.fetch = originalFetch;
    Deno.serve = originalServe;
    names.forEach((name, i) =>
      originalEnv[i] === undefined
        ? Deno.env.delete(name)
        : Deno.env.set(name, originalEnv[i]!)
    );
  }
});
