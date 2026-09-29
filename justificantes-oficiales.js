import { SOURCES, localToday, validateSearch, officialDocumentUrl, privateAccess } from './justificantes-oficiales.mjs';

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
let searchController;
let searchVersion = 0;
const submit = form.querySelector('button[type="submit"]');

function cancelSearch() {
  searchVersion++;
  searchController?.abort();
  submit.disabled = false;
  submit.textContent = 'Localizar documentación oficial';
}

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

function renderSources() {
  const cards = SOURCES.map(source => {
    const card = document.createElement('article');
    card.className = 'source';
    const title = document.createElement('h3');
    title.textContent = source.name;
    const description = document.createElement('p');
    description.textContent = source.description;
    card.append(title, description, externalLink(source.label, source.url));
    card.dataset.source = source.id;
    return card;
  });
  document.getElementById('sources').replaceChildren(...cards.slice(0, 2));
  document.getElementById('other-sources').replaceChildren(...cards.slice(2));
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
          cancelSearch();
          document.getElementById('documents').replaceChildren();
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

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!accessGranted) return;
  error.hidden = true;
  cancelSearch();
  const version = searchVersion;
  document.getElementById('documents').replaceChildren();
  try {
    date.max = localToday();
    const criteria = validateSearch({ date: date.value, location: locationInput.value, incident: incident.value });
    const [year, month, day] = criteria.date.split('-');
    const context = `${day}/${month}/${year} · ${criteria.location}`;
    summary.textContent = `Consultando el catálogo oficial de Meteocat para ${context}…`;
    submit.disabled = true;
    submit.textContent = 'Consultando fuente oficial…';
    searchController = new AbortController();
    const { data, error: sessionError } = await client.auth.getSession();
    if (version !== searchVersion) return;
    if (sessionError || !data?.session?.access_token) throw new Error('Tu sesión ha caducado. Vuelve a entrar en el Área privada.');
    const timeout = setTimeout(() => searchController?.abort(), 35000);
    let response;
    try {
      response = await fetch('https://icneigdnuntzugisexaz.supabase.co/functions/v1/official-weather-documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify(criteria), signal: searchController.signal
      });
    } finally { clearTimeout(timeout); }
    if (version !== searchVersion) return;
    if (response.status === 401 || response.status === 403) {
      window.location.replace('acceso-privado.html?next=justificantes-oficiales.html');
      return;
    }
    if (!response.ok) throw new Error('No se ha podido consultar Meteocat. Puedes reintentar o abrir la solicitud oficial de abajo.');
    const result = await response.json();
    if (version !== searchVersion) return;
    const descriptions = {
      found: `Certificado publicado en Meteocat para ${context}.`,
      not_published: `Meteocat no muestra un certificado publicado para ${context}. Puedes solicitarlo directamente con el formulario de abajo. Esto no significa que no hubiera una incidencia.`,
      unknown_municipality: `No hemos identificado «${criteria.location}» en el catálogo de municipios de Meteocat. Escribe el nombre oficial del municipio, no la comarca. Para otros territorios, utiliza la solicitud de AEMET.`,
      not_supported: `Para este tipo de incidencia (${context}), utiliza los trámites oficiales de abajo. El catálogo consultado automáticamente cubre certificados de lluvia y viento, no acredita restricciones de tráfico ni otros fenómenos.`
    };
    if (!Object.hasOwn(descriptions, result.status)) throw new Error('La fuente ha devuelto una respuesta inesperada. Inténtalo de nuevo.');
    if (result.status === 'found') {
      if (!Array.isArray(result.documents) || !result.documents.length) throw new Error('No se ha podido comprobar el enlace del documento.');
      const cards = result.documents.map(doc => {
        const url = officialDocumentUrl(doc.url);
        if (!url || doc.date !== criteria.date) throw new Error('No se ha podido comprobar el enlace del documento.');
        const card = document.createElement('article');
        card.className = 'source';
        const title = document.createElement('h3');
        title.textContent = doc.title;
        const issuer = document.createElement('p');
        issuer.textContent = `${doc.issuer}. Documento original; comprueba su contenido y la zona que cubre.`;
        card.append(title, issuer, externalLink('Abrir certificado oficial (PDF)', url));
        return card;
      });
      document.getElementById('documents').replaceChildren(...cards);
    }
    summary.textContent = descriptions[result.status];
    document.getElementById('results-title').focus();
  } catch (issue) {
    if (version !== searchVersion) return;
    error.textContent = issue.name === 'AbortError' ? 'La consulta está tardando demasiado. Reintenta o abre el trámite oficial de abajo.' : issue.message;
    error.hidden = false;
    summary.textContent = 'Consulta no completada. No hemos podido comprobar si hay un documento disponible.';
  } finally {
    if (version === searchVersion) {
      submit.disabled = false;
      submit.textContent = 'Localizar documentación oficial';
    }
  }
});

// Clear obsolete searches as soon as any criterion changes.
form.addEventListener('input', () => {
  cancelSearch();
  error.hidden = true;
  document.getElementById('documents').replaceChildren();
  summary.textContent = 'Pulsa «Localizar documentación oficial» para consultar el municipio y fecha indicados.';
});
retry.addEventListener('click', checkAccess);
window.addEventListener('pageshow', event => { if (event.persisted) checkAccess(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { cancelSearch(); content.hidden = true; accessGranted = false; }
  else checkAccess();
});
date.max = localToday();
renderSources();
checkAccess();
