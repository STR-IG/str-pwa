const CACHE_NAME = 'str-ig-cache-v20';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((name) => name !== CACHE_NAME ? caches.delete(name) : undefined)))
      .then(() => self.clients.claim())
  );
});

function patchIndex(html) {
  return html.replace(
    /<article class="quick-card payroll-card"[\s\S]*?<\/article>/,
    `<a class="quick-card payroll-card" href="acceso-privado.html" onclick="sessionStorage.setItem('strAfterLogin','revisa-nomina.html')" aria-label="Revisa tu nómina, acceso privado para afiliados">
      <div class="payroll-copy"><h3>Revisa tu nómina</h3><span class="coming-soon">Área privada</span></div>
      <span class="card-lock" aria-hidden="true"></span>
    </a>`
  );
}

function patchAccess(html) {
  const helper = `<script>(function(){const q=new URLSearchParams(location.search).get('next');if(q==='revisa-tu-nomina.html'||sessionStorage.getItem('strLabNext')==='revisa-tu-nomina.html'){sessionStorage.setItem('strAfterLogin','revisa-nomina.html');sessionStorage.removeItem('strLabNext');}})();<\/script>`;
  return html.replace('</body>', `${helper}</body>`);
}

function patchPayrollPage(html) {
  let patched = html
    .replace(/<title>Revisa tu nómina · STR-IG LAB<\/title>/, '<title>Revisa tu nómina · STR-IG</title>')
    .replace(/\s*<div class="labbar">[\s\S]*?<\/div>\s*/, '\n')
    .replaceAll('strLabSchedule:', 'strSchedule:')
    .replace("sessionStorage.setItem('strLabNext', 'revisa-tu-nomina.html');", "sessionStorage.setItem('strAfterLogin', 'revisa-nomina.html');")
    .replace("window.location.replace('acceso-privado.html?next=revisa-tu-nomina.html');", "window.location.replace('acceso-privado.html');");

  const scripts = [
    '<script src="payroll-reading.js?v=20"></script>',
    '<script src="timesheet-crop-guard.js?v=20"></script>',
    '<script src="timesheet-vision.js?v=20"></script>',
    '<script src="payroll-vision.js?v=20"></script>',
    '<script src="history-review.js?v=20"></script>'
  ].join('');

  if (!patched.includes('history-review.js')) patched = patched.replace('</body>', `${scripts}</body>`);
  return patched;
}

async function patchNavigation(response, request) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const url = new URL(request.url);
  let html = await response.text();

  if (url.pathname.endsWith('/revisa-tu-nomina.html')) html = patchPayrollPage(html);
  else if (url.pathname.endsWith('/acceso-privado.html')) html = patchAccess(html);
  else if (url.pathname.endsWith('/index.html') || url.pathname.endsWith('/str-pwa/') || url.pathname === '/') html = patchIndex(html);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          const patched = await patchNavigation(response, event.request);
          const copy = patched.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
          return patched;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached ? patchNavigation(cached, event.request) : Response.error();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
