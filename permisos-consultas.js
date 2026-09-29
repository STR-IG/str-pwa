const API = 'https://icneigdnuntzugisexaz.supabase.co/functions/v1/';
const KEY = 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m';
const STORAGE_KEY = 'strPermitBrowserKeyV1';

export function browserKey() {
  try {
    let key = localStorage.getItem(STORAGE_KEY);
    if (!/^[a-f0-9]{64}$/.test(key || '')) {
      key = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(STORAGE_KEY, key);
    }
    return key;
  } catch {
    throw new Error('Activa el almacenamiento de este navegador para realizar consultas. La Guía rápida sigue disponible.');
  }
}

function showQuota(quota, message) {
  const el = document.getElementById('permit-quota');
  if (!el) return;
  el.textContent = message || (quota.remaining === 0
    ? 'Has agotado tus créditos de consulta de este mes. Se renovarán el día 1 del próximo mes. Mientras tanto, puedes consultar la Guía rápida sin límite.'
    : `Créditos de consulta disponibles este mes: ${quota.remaining} de 2.`);
}

export async function permitFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  headers.delete('Authorization');
  headers.set('apikey', KEY);
  headers.set('X-Permit-Device', browserKey());
  const response = await fetch(url, { ...options, headers });
  const data = await response.clone().json().catch(() => ({}));
  if (data.quota) showQuota(data.quota);
  if (data.error === 'MONTHLY_LIMIT_REACHED') {
    const message = 'Has agotado tus créditos de consulta de este mes. Se renovarán el día 1 del próximo mes. Mientras tanto, puedes consultar la Guía rápida sin límite.';
    showQuota(null, message);
  }
  return response;
}

export function handlePermitError(error, result) {
  const messages = {
    MONTHLY_LIMIT_REACHED: 'Has agotado tus créditos de consulta de este mes. Se renovarán el día 1 del próximo mes. Mientras tanto, puedes consultar la Guía rápida sin límite.',
    QUOTA_UNAVAILABLE: 'No podemos comprobar tu saldo ahora. Inténtalo más tarde.',
    BROWSER_KEY_REQUIRED: 'No hemos podido reconocer este navegador. Recarga la página para volver a intentarlo.'
  };
  const message = messages[error?.message];
  if (!message) return false;
  result.className = 'result show not-compatible';
  const heading = document.createElement('strong');
  heading.textContent = error.message === 'MONTHLY_LIMIT_REACHED' ? 'Créditos mensuales agotados' : 'Consulta no disponible';
  const copy = document.createElement('p');
  copy.textContent = message;
  const link = document.createElement('a');
  link.href = 'permisos.html';
  link.textContent = 'Consultar la Guía rápida';
  result.replaceChildren(heading, copy, link);
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return true;
}

export function showPublicPermitPage(withQuota = false) {
  const check = document.getElementById('auth-check');
  if (check) check.hidden = true;
  const content = document.getElementById('content');
  if (content) content.hidden = false;
  if (!withQuota) return;
  const notice = document.createElement('p');
  notice.id = 'permit-quota';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.style.cssText = 'padding:14px;border-radius:14px;background:#fff0f1;color:#8b1320;line-height:1.5;font-size:14px;margin:0 0 18px';
  notice.textContent = 'Consultando tus créditos disponibles…';
  (content || document.querySelector('main')).prepend(notice);
  permitFetch(API + 'permit-query-quota', { method: 'POST', signal: AbortSignal.timeout(10000) })
    .then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      showQuota(data.quota);
    })
    .catch(() => showQuota(null, 'No se ha podido consultar tu saldo de créditos. Comprueba la conexión. La Guía rápida sigue disponible sin límite.'));
}
