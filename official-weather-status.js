const SUPABASE_URL = 'https://icneigdnuntzugisexaz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m';
const API_URL = `${SUPABASE_URL}/functions/v1/official-weather-status`;
const REFRESH_MS = 120_000;
let lastFetch = 0;
let lastSnapshot;

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const localTime = value => value ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(value)) : 'No indicado por la fuente';
const icon = severity => ({ red: '🔴', orange: '🟠', yellow: '🟡', green: '🟢' })[severity] || '🟡';

async function loadSnapshot(municipality = '', force = false) {
  if (!force && lastSnapshot && Date.now() - lastFetch < REFRESH_MS) return lastSnapshot;
  const url = new URL(API_URL);
  if (municipality) url.searchParams.set('municipality', municipality);
  lastFetch = Date.now();
  try {
    const response = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    lastSnapshot = await response.json();
    return lastSnapshot;
  } catch (_error) {
    lastSnapshot = null;
    return { checkedAt: new Date().toISOString(), overallStatus: 'incomplete', sources: Object.fromEntries(['civilProtection', 'meteocat', 'traffic'].map(key => [key, { status: 'unavailable', checkedAt: new Date().toISOString(), lastSuccessAt: null, alerts: [], incidents: [], error: 'No se ha podido actualizar esta fuente.' }])), forecast: { status: 'unavailable', hours: [], error: 'No se ha podido actualizar esta fuente.' } };
  }
}

function sourceState(source, label) {
  if (source?.status === 'ok') return `<span class="live-ok">Fuente consultada ${esc(localTime(source.updatedAt || source.checkedAt))}</span>`;
  const last = source?.lastSuccessAt ? ` Último dato válido: ${esc(localTime(source.lastSuccessAt))}.` : '';
  return `<span class="live-error">⚠️ No se ha podido actualizar esta fuente (${esc(label)}).${last}</span>`;
}

function renderWeather(root, data) {
  const pc = data.sources?.civilProtection || {};
  const meteo = data.sources?.meteocat || {};
  const pcHtml = `<article class="live-priority"><strong>Protecció Civil · prioridad de seguridad</strong><p>El estado de INUNCAT y las restricciones no se pueden confirmar automáticamente. Consulta aquí las instrucciones vigentes; este estado no significa que no haya alerta.</p><a href="${esc(pc.officialUrl || 'https://interior.gencat.cat/ca/sales_de_premsa/noticies_de_proteccio_civil/index.html')}" target="_blank" rel="noopener noreferrer">Avisos oficiales de Protecció Civil ↗</a><p>${sourceState(pc, 'Protecció Civil')}</p></article>`;
  const alerts = meteo.alerts || [];
  const meteoHtml = meteo.status !== 'ok'
    ? `<article class="live-alert"><h3>⚠️ Avisos meteorológicos sin verificar</h3><p>${esc(meteo.error || 'No se ha podido actualizar esta fuente.')}</p><p>${sourceState(meteo, 'Meteocat')}</p><a href="${esc(meteo.officialUrl || 'https://www.meteo.cat/prediccio/general')}" target="_blank" rel="noopener noreferrer">Consultar Meteocat ↗</a></article>`
    : alerts.length ? alerts.map(alert => `<article class="live-alert live-${esc(alert.severity)}"><h3>${icon(alert.severity)} ${esc(alert.title)} · nivel ${esc(alert.level ?? '—')}</h3><p>${esc(alert.description || alert.warningType || 'Aviso meteorológico vigente')}</p><p><strong>Territorio:</strong> ${esc((alert.affectedAreas || []).join(', ') || 'No indicado')}</p><p><strong>Desde–hasta:</strong> ${esc(localTime(alert.startAt))} – ${esc(localTime(alert.endAt))}</p><p>${sourceState(meteo, 'Meteocat')}</p><a href="${esc(alert.officialUrl)}" target="_blank" rel="noopener noreferrer">Fuente oficial ↗</a></article>`).join('')
      : '<article class="live-alert"><h3>🟢 Meteocat no devuelve avisos vigentes</h3><p>Este resultado solo cubre los avisos meteorológicos de Meteocat. Protecció Civil aparece arriba por separado.</p></article>';
  const forecast = data.forecast || {};
  const forecastHtml = forecast.status === 'ok'
    ? `<p>Previsión de ${esc(forecast.municipality)}: ${(forecast.hours || []).slice(0, 6).map(h => `${esc(localTime(h.at))}: ${esc(h.precipitationMm)} mm${h.temperatureC == null ? '' : ` · ${esc(h.temperatureC)} °C`}`).join(' · ')}</p>`
    : `<p>${forecast.status === 'needs-municipality' ? 'Elige un municipio para consultar la previsión horaria.' : `Previsión no disponible. ${esc(forecast.error || '')}`}</p>`;
  root.innerHTML = `${pcHtml}${meteoHtml}<section class="live-forecast"><h3>Previsión próxima</h3><form data-weather-form><label for="weather-municipality">Municipio (consulta puntual, sin geolocalización)</label><input id="weather-municipality" name="municipality" maxlength="80" autocomplete="off" placeholder="p. ej., Girona" value="${esc(forecast.municipality || '')}"><button type="submit">Consultar</button></form>${forecastHtml}</section><p class="live-updated">Consulta realizada: ${esc(localTime(data.checkedAt))}</p>`;
  root.querySelector('[data-weather-form]')?.addEventListener('submit', async event => {
    event.preventDefault();
    const municipality = new FormData(event.currentTarget).get('municipality')?.toString().trim() || '';
    root.setAttribute('aria-busy', 'true'); renderWeather(root, await loadSnapshot(municipality, true)); root.removeAttribute('aria-busy');
  });
}

function renderRoads(root, data) {
  const traffic = data.sources?.traffic || {};
  const incidents = traffic.incidents || [];
  const body = traffic.status !== 'ok'
    ? `<article class="live-alert"><h3>⚠️ Estado de carreteras no confirmado</h3><p>${esc(traffic.error || 'No se ha podido actualizar esta fuente.')}</p><p>${sourceState(traffic, 'Servei Català de Trànsit')}</p></article>`
    : incidents.length ? incidents.map(item => `<article class="live-road live-${esc(item.severity)}"><h3>${icon(item.severity)} ${esc(({ 'road-closure': 'Carretera cortada', 'traffic-affected': 'Circulación afectada', caution: 'Precaución' })[item.type] || 'Incidencia')} · ${esc(item.road || 'Vía no indicada')}</h3><p><strong>Punto/tramo:</strong> ${esc(item.location || item.description || 'No indicado')}${item.direction ? ` · <strong>Sentido:</strong> ${esc(item.direction)}` : ''}</p><p><strong>Estado/causa:</strong> ${esc(item.status || item.cause || item.title)}</p><p>Actualización de la incidencia: ${esc(localTime(item.updatedAt || traffic.updatedAt))}</p></article>`).join('')
      : '<article class="live-alert"><h3>Feed del SCT sin incidencias publicadas</h3><p>Comprueba también el mapa oficial para tu trayecto.</p></article>';
  root.innerHTML = `<div class="live-toolbar"><strong>${traffic.status === 'ok' ? `${incidents.length} incidencias publicadas` : 'Estado no confirmado'}</strong><button type="button" data-refresh>Actualizar</button></div>${body}<p class="live-updated">Consulta realizada: ${esc(localTime(data.checkedAt))}</p><a class="button button-secondary" href="https://mct.gencat.cat/" target="_blank" rel="noopener noreferrer">Abrir mapa oficial ↗</a>`;
  root.querySelector('[data-refresh]')?.addEventListener('click', async () => { root.setAttribute('aria-busy', 'true'); renderRoads(root, await loadSnapshot('', true)); root.removeAttribute('aria-busy'); });
}

function addStyles() {
  if (document.getElementById('official-weather-styles')) return;
  const style = document.createElement('style'); style.id = 'official-weather-styles';
  style.textContent = `.live-panel{display:grid;gap:12px;margin:0 0 24px}.live-panel article,.live-forecast{border:1px solid #e4e4e7;border-radius:16px;padding:16px;background:white}.live-priority{border-left:5px solid #e30613!important;background:#fff7f7!important}.live-panel h3{font-size:17px;margin:0 0 8px}.live-panel p{margin:8px 0;color:#444;line-height:1.5}.live-updated,.live-ok,.live-error{font-size:13px;color:#626269}.live-error{color:#9b1c1c;font-weight:bold}.live-red{border-left:5px solid #d90000!important}.live-orange{border-left:5px solid #ed7d00!important}.live-yellow{border-left:5px solid #dfb000!important}.live-toolbar{display:flex;justify-content:space-between;align-items:center}.live-toolbar button,.live-forecast button{border:0;border-radius:999px;background:#e30613;color:white;padding:12px 18px;font-weight:bold}.live-forecast form{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.live-forecast label{display:block;width:100%;font-size:14px}.live-forecast input{min-width:0;flex:1;padding:12px;border:1px solid #bbb;border-radius:10px;font:inherit}.live-panel a{color:#b9000b;font-weight:bold}.live-panel[aria-busy=true]{opacity:.65;pointer-events:none}@media(max-width:580px){.live-toolbar{gap:10px}}`;
  document.head.append(style);
}

async function start() {
  addStyles();
  const weather = document.querySelector('[data-weather-status]'); const roads = document.querySelector('[data-road-status]');
  if (!weather && !roads) return;
  for (const root of [weather, roads].filter(Boolean)) root.textContent = 'Consultando fuentes oficiales…';
  const municipality = new URLSearchParams(location.search).get('municipality') || '';
  const data = await loadSnapshot(municipality);
  if (weather) renderWeather(weather, data); if (roads) renderRoads(roads, data);
  document.querySelector('[data-status-refresh]')?.addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true;
    const refreshed = await loadSnapshot(municipality, true);
    if (weather) renderWeather(weather, refreshed); if (roads) renderRoads(roads, refreshed);
    button.disabled = false;
  });
}
start();
