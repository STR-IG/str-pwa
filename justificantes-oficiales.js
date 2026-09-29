import { SOURCES, localToday, validateSearch, searchUrl, privateAccess } from './justificantes-oficiales.mjs';

const content = document.getElementById('private-content');
const checking = document.getElementById('checking');
const message = document.getElementById('access-message');
const retry = document.getElementById('retry');
const form = document.getElementById('search-form');
const date = document.getElementById('date');
const locationInput = document.getElementById('location');
const incident = document.getElementById('incident');
const error = document.getElementById('form-error');
const summary = document.getElementById('summary');
let client;
let accessGranted = false;
let checkingAccess = false;

function externalLink(label, href, className = '') {
  const link = document.createElement('a');
  link.textContent = `${label} ↗`;
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = className;
  link.setAttribute('aria-label', `${label} (abre una pestaña nueva)`);
  return link;
}

function renderSources(criteria) {
  const cards = SOURCES.map(source => {
    const card = document.createElement('article');
    card.className = 'source';
    const title = document.createElement('h3');
    title.textContent = source.name;
    const description = document.createElement('p');
    description.textContent = source.description;
    card.append(title, description, externalLink(source.label, source.url));
    if (criteria) {
      const label = source.id === 'municipal' ? 'Localizar ayuntamiento en Google' : 'Buscar fecha y ubicación en Google';
      card.append(externalLink(label, searchUrl(source, criteria), 'search-link'));
    }
    return card;
  });
  document.getElementById('sources').replaceChildren(...cards);
}

async function checkAccess() {
  if (checkingAccess) return;
  checkingAccess = true;
  accessGranted = false;
  content.hidden = true;
  checking.hidden = false;
  retry.hidden = true;
  message.textContent = 'Comprobando el acceso privado…';
  try {
    if (!client) {
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      client = createClient('https://icneigdnuntzugisexaz.supabase.co', 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m', {
        auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true }
      });
      client.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') {
          accessGranted = false;
          content.hidden = true;
          window.location.replace('acceso-privado.html?next=justificantes-oficiales.html');
        }
      });
    }
    if (!await privateAccess(client)) {
      window.location.replace('acceso-privado.html?next=justificantes-oficiales.html');
      return;
    }
    accessGranted = true;
    checking.hidden = true;
    content.hidden = false;
  } catch (_) {
    message.textContent = 'No se ha podido verificar el acceso. Comprueba tu conexión e inténtalo de nuevo.';
    retry.hidden = false;
  } finally {
    checkingAccess = false;
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!accessGranted) return;
  error.hidden = true;
  try {
    date.max = localToday();
    const criteria = validateSearch({ date: date.value, location: locationInput.value, incident: incident.value });
    renderSources(criteria);
    const [year, month, day] = criteria.date.split('-');
    summary.textContent = `Búsquedas preparadas para ${day}/${month}/${year} · ${criteria.location}. Abre una fuente para localizar y comprobar los documentos originales. No son resultados verificados.`;
    document.getElementById('results-title').focus();
  } catch (issue) {
    error.textContent = issue.message;
    error.hidden = false;
  }
});

// Clear obsolete searches as soon as any criterion changes.
form.addEventListener('input', () => {
  error.hidden = true;
  renderSources();
  summary.textContent = 'Pulsa «Localizar documentación oficial» para actualizar las búsquedas.';
});
retry.addEventListener('click', checkAccess);
window.addEventListener('pageshow', event => { if (event.persisted) checkAccess(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { content.hidden = true; accessGranted = false; }
  else checkAccess();
});
date.max = localToday();
renderSources();
checkAccess();
