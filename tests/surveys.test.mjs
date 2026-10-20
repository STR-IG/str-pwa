import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanEmail,
  hmac,
  randomCode,
  validateSurvey,
} from "../supabase/functions/_shared/survey-core.mjs";
test("normaliza correo y rechaza entradas inválidas", () => {
  assert.equal(cleanEmail(" A@EXAMPLE.COM "), "a@example.com");
  for (const value of ["", "x", "a b@example.com", "x@domain"]) {
    assert.throws(() => cleanEmail(value));
  }
});
test("valida encuestas, duplicados y límites", () => {
  const survey = {
    title: "Pregunta",
    description: "",
    options: ["Sí", "No"],
    adminOnly: true,
  };
  assert.deepEqual(validateSurvey(survey), survey);
  for (
    const options of [
      [],
      ["Única"],
      ["Sí", "Sí"],
      ["", "No"],
      Array(11).fill("x"),
    ]
  ) assert.throws(() => validateSurvey({ ...survey, options }));
  assert.throws(() => validateSurvey({ ...survey, adminOnly: "false" }));
});
test("HMAC depende del secreto y separa códigos e identidad", async () => {
  const secret = "a".repeat(32), email = "email:a@example.com";
  assert.equal(await hmac(secret, email), await hmac(secret, email));
  assert.notEqual(await hmac(secret, email), await hmac("b".repeat(32), email));
  assert.notEqual(
    await hmac(secret, email),
    await hmac(secret, "code:a@example.com"),
  );
  for (let i = 0; i < 100; i++) assert.match(randomCode(), /^\d{6}$/);
});
