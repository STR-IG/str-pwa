export const CONSENT_VERSION = "str-laboral-v1";
export function cleanEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INVALID_EMAIL");
  }
  return email;
}
export function validateSurvey(value) {
  const title = String(value.title ?? "").trim();
  const description = String(value.description ?? "").trim();
  const options = Array.isArray(value.options)
    ? value.options.map((v) => String(v).trim())
    : [];
  if (
    !title || title.length > 180 || description.length > 1500 ||
    options.length < 2 || options.length > 10 ||
    options.some((v) => !v || v.length > 180) ||
    new Set(options).size !== options.length ||
    typeof value.adminOnly !== "boolean"
  ) {
    throw new Error("INVALID_SURVEY");
  }
  return { title, description, options, adminOnly: value.adminOnly };
}
export function uuid(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) throw new Error("INVALID_ID");
  return value;
}
export async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(signature),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function randomCode() {
  // Rejection sampling avoids modulo bias.
  let n;
  do {
    n = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (n >= 4294000000);
  return String(n % 1000000).padStart(6, "0");
}
