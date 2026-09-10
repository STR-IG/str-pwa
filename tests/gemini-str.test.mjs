import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../supabase/functions/gemini-str/index.ts", import.meta.url), "utf8");

test("Gemini queda aislado en una función privada para la prueba técnica", () => {
  assert.match(source, /admin\.auth\.getUser\(token\)/);
  assert.match(source, /\.from\("committee_admins"\)/);
  assert.match(source, /\.eq\("active", true\)/);
  assert.match(source, /connection_test/);
  assert.match(source, /FORBIDDEN/);
});

test("la clave de Gemini solo se obtiene desde el secreto del servidor", () => {
  assert.match(source, /Deno\.env\.get\("GEMINI_API_KEY"\)/);
  assert.match(source, /"x-goog-api-key": apiKey/);
  assert.doesNotMatch(source, /[?&]key=/);
  assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{20,}/);
});

test("el modelo estable se centraliza en una única constante", () => {
  const declaration = source.match(/const GEMINI_MODEL = "([^"]+)";/);
  assert.ok(declaration);
  assert.match(declaration[1], /^gemini-[\w.-]+$/);
  assert.equal(source.split(`"${declaration[1]}"`).length - 1, 1);
});

test("la petición oficial es mínima, no se almacena y conserva el prompt fijo", () => {
  assert.match(source, /generativelanguage\.googleapis\.com\/v1beta\/interactions/);
  assert.match(source, /Responde únicamente: conexión Gemini correcta/);
  assert.match(source, /store: false/);
  assert.match(source, /model: GEMINI_MODEL/);
});

test("los fallos previstos se traducen a errores seguros", () => {
  for (const code of [
    "GEMINI_NOT_CONFIGURED",
    "GEMINI_AUTH_FAILED",
    "GEMINI_RATE_LIMITED",
    "GEMINI_TIMEOUT",
    "GEMINI_UNAVAILABLE",
    "GEMINI_EMPTY_RESPONSE",
  ]) {
    assert.match(source, new RegExp(code));
  }
  assert.doesNotMatch(source, /await geminiResponse\.text/);
});
