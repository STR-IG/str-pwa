import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";
const url = "https://icneigdnuntzugisexaz.supabase.co";
const key = "sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m";
// Existing admin session is read, never replaced by public survey verification.
const supabase = createClient(url, key, {
  auth: {
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
});
export const messages = {
  ALREADY_VOTED: "Este correo ya ha participado en esta encuesta.",
  INVALID_CODE:
    "El código es incorrecto, ha caducado o ha agotado sus intentos. Solicita otro código.",
  RATE_LIMITED:
    "Has alcanzado el límite de envíos. Espera antes de volver a intentarlo.",
  UNAVAILABLE: "La encuesta no está disponible.",
  FORBIDDEN:
    "Acceso exclusivo para administradores. Inicia sesión desde el acceso privado.",
  MAIL_NOT_CONFIGURED: "El envío de códigos todavía no está configurado.",
  MAIL_FAILED:
    "No se ha podido enviar el correo. Espera un minuto antes de solicitar otro código.",
  RESULTS_WITHHELD:
    "Los resultados públicos solo se muestran después del cierre y con al menos cinco participaciones.",
  INVALID_TRANSITION: "La encuesta ya cambió de estado. Actualiza el listado.",
  INVALID_SURVEY:
    "Revisa la pregunta y las opciones: entre 2 y 10, sin duplicados y de hasta 180 caracteres.",
};
export async function api(action, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { "Content-Type": "application/json", apikey: key };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const response = await fetch(url + "/functions/v1/surveys", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => ({
    error: "REQUEST_FAILED",
  }));
  if (!response.ok || result.error) {
    throw new Error(
      messages[result.error] ||
        "No se ha podido completar la operación. Inténtalo de nuevo.",
    );
  }
  return result;
}
export function text(parent, tag, value, className) {
  const el = document.createElement(tag);
  el.textContent = value;
  if (className) el.className = className;
  parent.append(el);
  return el;
}
export async function busy(form, task) {
  const buttons = [...form.querySelectorAll("button")];
  buttons.forEach((b) => b.disabled = true);
  try {
    await task();
  } finally {
    buttons.forEach((b) => b.disabled = false);
  }
}
