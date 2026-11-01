import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';

const KEY = 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m';
try { localStorage.removeItem('strPermitBrowserKeyV1'); } catch { /* Clear the retired quota identifier when this module loads. */ }
const supabase = createClient('https://icneigdnuntzugisexaz.supabase.co', KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const PRIVACY_CONSENT_VERSION = 'permits-privacy-2026-11-01';
const PRIVACY_CONSENT_KEY = 'strPermitPrivacyConsentV1';
const PRIVACY_NOTICE_URL = 'aviso-privacidad-consulta.pdf';

async function requirePermitPrivacyConsent() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token || !session.user?.id) throw new Error('AUTH_REQUIRED');
  try {
    const stored = JSON.parse(sessionStorage.getItem(PRIVACY_CONSENT_KEY) || 'null');
    if (stored?.version === PRIVACY_CONSENT_VERSION && stored?.userId === session.user.id) return;
  } catch {}

  await new Promise((resolve, reject) => {
    const dialog = document.createElement('dialog');
    dialog.id = 'permit-privacy-consent-dialog';
    dialog.setAttribute('aria-labelledby', 'permit-privacy-consent-title');
    const style = document.createElement('style');
    style.textContent = `
      #permit-privacy-consent-dialog { width:min(92vw,560px); max-height:88vh; border:0; border-radius:20px; padding:24px; color:#24242a; box-shadow:0 16px 60px #0004; font:16px/1.5 Arial,Helvetica,sans-serif; }
      #permit-privacy-consent-dialog::backdrop { background:#1119; backdrop-filter:blur(3px); }
      #permit-privacy-consent-dialog h2 { margin:0 0 12px; font-size:22px; }
      #permit-privacy-consent-dialog p { margin:0 0 12px; }
      #permit-privacy-consent-dialog a { color:#b9000b; font-weight:700; }
      #permit-privacy-consent-dialog label { display:flex; gap:10px; align-items:flex-start; margin:16px 0; font-weight:700; }
      #permit-privacy-consent-dialog input { width:22px; height:22px; flex:0 0 22px; margin-top:2px; accent-color:#e30613; }
      #permit-privacy-consent-dialog .consent-actions { display:flex; gap:10px; margin-top:18px; }
      #permit-privacy-consent-dialog button { min-height:46px; flex:1; border:0; border-radius:999px; padding:8px 14px; font:700 15px Arial,Helvetica,sans-serif; cursor:pointer; }
      #permit-privacy-consent-dialog button[type=submit] { color:white; background:#e30613; }
      #permit-privacy-consent-dialog button[type=submit]:disabled { opacity:.45; cursor:not-allowed; }
      #permit-privacy-consent-dialog button[type=button] { color:#333; background:#f1f1f3; }
      #permit-privacy-consent-error { color:#a40009; font-weight:700; }
    `;
    const title = document.createElement('h2');
    title.id = 'permit-privacy-consent-title';
    title.textContent = 'Consentimiento para tu consulta';
    const intro = document.createElement('p');
    intro.textContent = 'Algunas respuestas pueden revelar datos de salud. Antes de enviarlas, lee el aviso completo sobre el uso de tus respuestas y los servicios que intervienen.';
    const link = document.createElement('a');
    link.href = PRIVACY_NOTICE_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Leer el aviso de privacidad';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const copy = document.createElement('span');
    copy.textContent = 'Doy mi consentimiento expreso para tratar las respuestas que seleccione, incluidas las que puedan revelar datos de salud, con el fin de preparar esta orientación sobre permisos retribuidos.';
    label.append(checkbox, copy);
    const warning = document.createElement('p');
    warning.textContent = 'No incluyas nombres, DNI, diagnósticos ni documentos médicos. Si no aceptas, no se enviará la consulta.';
    const error = document.createElement('p');
    error.id = 'permit-privacy-consent-error';
    error.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'consent-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Volver sin enviar';
    const accept = document.createElement('button');
    accept.type = 'submit';
    accept.disabled = true;
    accept.textContent = 'Aceptar y continuar';
    actions.append(cancel, accept);
    dialog.append(style, title, intro, link, label, warning, error, actions);
    document.body.append(dialog);
    checkbox.addEventListener('change', () => { accept.disabled = !checkbox.checked; });
    cancel.addEventListener('click', () => {
      dialog.close(); dialog.remove(); reject(new Error('CONSENT_NOT_GIVEN'));
    });
    accept.addEventListener('click', async () => {
      if (!checkbox.checked) return;
      accept.disabled = true;
      error.hidden = true;
      try {
        const response = await fetch('https://icneigdnuntzugisexaz.supabase.co/functions/v1/record-permit-privacy-consent', {
          method: 'POST',
          headers: { apikey: KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ accepted: true, policy_version: PRIVACY_CONSENT_VERSION })
        });
        if (!response.ok) throw new Error('CONSENT_RECORD_FAILED');
        const acceptedAt = new Date().toISOString();
        sessionStorage.setItem(PRIVACY_CONSENT_KEY, JSON.stringify({ version: PRIVACY_CONSENT_VERSION, userId: session.user.id, acceptedAt }));
        dialog.close(); dialog.remove(); resolve();
      } catch {
        error.textContent = 'No se pudo guardar el consentimiento. No se ha enviado la consulta; inténtalo de nuevo.';
        error.hidden = false;
        accept.disabled = false;
      }
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); });
    dialog.showModal();
    accept.focus();
  });
}

export async function permitFetch(url, options = {}) {
  const requestUrl = new URL(url, location.href);
  if ((options.method || 'GET').toUpperCase() === 'POST' && requestUrl.pathname.includes('/functions/v1/answer-')) {
    await requirePermitPrivacyConsent();
  }
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
