import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';

const API = 'https://icneigdnuntzugisexaz.supabase.co/functions/v1/';
const KEY = 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m';
const supabase = createClient('https://icneigdnuntzugisexaz.supabase.co', KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

export async function permitFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  headers.delete('Authorization');
  headers.set('apikey', KEY);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  } catch { /* The server rejects requests without an active validated session. */ }
  return fetch(url, { ...options, headers });
}

export function handlePermitError(error, result) {
  const messages = {
    AUTH_REQUIRED: 'Para realizar esta consulta, entra en la app con un acceso autorizado.',
    ACCESS_NOT_ACTIVE: 'Esta cuenta no tiene acceso activo a la consulta. Comprueba el acceso en el área privada.',
    ACCESS_CHECK_FAILED: 'No podemos comprobar el acceso ahora. Inténtalo más tarde.'
  };
  const message = messages[error?.message];
  if (!message) return false;
  result.className = 'result show not-compatible';
  const heading = document.createElement('strong');
  heading.textContent = 'Consulta no disponible';
  const copy = document.createElement('p');
  copy.textContent = message;
  const link = document.createElement('a');
  const next = location.pathname.split('/').pop() || 'preguntale-str-permisos.html';
  link.href = `acceso-privado.html?next=${encodeURIComponent(next)}`;
  link.textContent = 'Entrar al área privada';
  result.replaceChildren(heading, copy, link);
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return true;
}

export async function showAuthorizedPermitPage() {
  const check = document.getElementById('auth-check');
  if (check) {
    check.hidden = false;
    check.textContent = 'Comprobando acceso…';
  }
  const content = document.getElementById('content');
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const { data, error } = await supabase.rpc('is_current_user_private_access_allowed');
      if (!error && data === true) {
        if (check) check.hidden = true;
        if (content) content.hidden = false;
        return true;
      }
    }
  } catch { /* Fail closed and send the visitor to the access screen. */ }
  const next = location.pathname.split('/').pop() || 'preguntale-str-permisos.html';
  location.replace(`acceso-privado.html?next=${encodeURIComponent(next)}`);
  return false;
}

export function showPublicPermitPage() {
  const check = document.getElementById('auth-check');
  if (check) check.hidden = true;
  const content = document.getElementById('content');
  if (content) content.hidden = false;
}
