import { trafficFeedState } from './official-weather-data.mjs';

const SUPABASE_URL = 'https://icneigdnuntzugisexaz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m';
const API_URL = `${SUPABASE_URL}/functions/v1/official-weather-status`;
const REFRESH_MS = 120_000;
let lastFetch = 0;
let lastSnapshot;

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const localTime = value => {
  if (!value) return 'No indicado por la fuente';
  const local = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  const parsed = local ? new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]), Number(local[4]), Number(local[5])) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? esc(value) : new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(parsed);
};
const icon = severity => ({ red: '🔴', orange: '🟠', yellow: '🟡', green: '🟢', neutral: 'ℹ️' })[severity] || 'ℹ️';
const officialHref = value => { try { const url = new URL(value); return url.protocol === 'https:' && url.hostname.endsWith('gencat.cat') ? url.href : null; } catch (_error) { return null; } };

async function loadSnapshot(force = false) {
  if (!force && lastSnapshot && Date.now() - lastFetch < REFRESH_MS) return lastSnapshot;
  const url = new URL(API_URL);
  lastFetch = Date.now();
  try {
    const response = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    lastSnapshot = await response.json();
    return lastSnapshot;
  } catch (_error) {
    lastSnapshot = null;
    return { checkedAt: new Date().toISOString(), overallStatus: 'incomplete', sources: Object.fromEntries(['civilProtection', 'traffic'].map(key => [key, { status: 'unavailable', checkedAt: new Date().toISOString(), lastSuccessAt: null, alerts: [], incidents: [], error: 'No se ha podido actualizar esta fuente.' }])) };
  }
}

function sourceState(source, label) {
  if (source?.status === 'ok') return `<span class="live-ok">Consulta a la fuente: ${esc(localTime(source.checkedAt))}</span>`;
  const last = source?.lastSuccessAt ? ` Último dato válido: ${esc(localTime(source.lastSuccessAt))}.` : '';
  return `<span class="live-error">⚠️ No se ha podido actualizar esta fuente (${esc(label)}).${last}</span>`;
}

function renderRoads(root, data) {
  const traffic = data.sources?.traffic || {};
  const incidents = traffic.incidents || [];
  const state = trafficFeedState(traffic);
  const body = state === 'unavailable'
    ? `<article class="live-alert"><h3>⚠️ Estado de carreteras no confirmado</h3><p>${esc(traffic.error || 'No se ha podido actualizar esta fuente.')}</p><p>${sourceState(traffic, 'Servei Català de Trànsit')}</p></article>`
    : state === 'incidents' ? `${incidents.slice(0, 12).map(item => {
      const label = ({ 'road-closure': 'Carretera cortada', 'traffic-affected': 'Circulación afectada', unclassified: 'Incidencia sin clasificar' })[item.type] || 'Incidencia sin clasificar';
      return `<article class="live-road live-${esc(item.severity || 'neutral')}"><h3>${icon(item.severity)} ${esc(label)} · ${esc(item.road || 'Vía no indicada')}</h3><p><strong>Punto/tramo:</strong> ${esc(item.location || item.description || 'No indicado')}${item.direction ? ` · <strong>Sentido:</strong> ${esc(item.direction)}` : ''}</p><p><strong>Descripción SCT:</strong> ${esc(item.status || item.title)}</p><p>Publicado por SCT: ${esc(localTime(item.publishedAt || traffic.updatedAt))}</p></article>`;
    }).join('')}${incidents.length > 12 ? `<p class="live-muted">Se muestran las 12 incidencias prioritarias de ${incidents.length}; consulta el mapa oficial para más detalle.</p>` : ''}`
      : '<article class="live-alert"><h3>El RSS no publica incidencias en esta consulta</h3><p>Comprueba también el mapa oficial para tu trayecto.</p></article>';
  root.innerHTML = `<div class="live-toolbar"><strong>${state === 'incidents' ? `${incidents.length} incidencias publicadas` : state === 'empty' ? 'Feed consultado, sin incidencias publicadas' : 'Estado no confirmado'}</strong><button type="button" data-refresh>Actualizar</button></div><p class="live-muted">La fecha del RSS es de publicación: no confirma por sí sola el inicio, la actualización más reciente ni la finalización de la incidencia. Comprueba la vigencia en el CIT.</p>${body}<p class="live-updated">Consulta realizada: ${esc(localTime(data.checkedAt))}</p><a class="button button-secondary" href="https://mct.gencat.cat/" target="_blank" rel="noopener noreferrer">Abrir mapa oficial ↗</a>`;
  root.querySelector('[data-refresh]')?.addEventListener('click', async () => { root.setAttribute('aria-busy', 'true'); renderRoads(root, await loadSnapshot(true)); root.removeAttribute('aria-busy'); });
}

function addStyles() {
  if (document.getElementById('official-weather-styles')) return;
  const style = document.createElement('style'); style.id = 'official-weather-styles';
  style.textContent = `.live-panel{display:grid;gap:12px;margin:0 0 24px}.live-panel article{border:1px solid #e4e4e7;border-radius:16px;padding:16px;background:white}.live-panel h3{font-size:17px;margin:0 0 8px}.live-panel p{margin:8px 0;color:#444;line-height:1.5}.live-updated,.live-ok,.live-error{font-size:13px;color:#626269}.live-error{color:#9b1c1c;font-weight:bold}.live-red{border-left:5px solid #d90000!important}.live-orange{border-left:5px solid #ed7d00!important}.live-neutral{border-left:5px solid #9ca3af!important}.live-toolbar{display:flex;justify-content:space-between;align-items:center}.live-toolbar button{border:0;border-radius:999px;background:#e30613;color:white;padding:12px 18px;font-weight:bold}.live-panel a{color:#b9000b;font-weight:bold}.live-panel[aria-busy=true]{opacity:.65;pointer-events:none}@media(max-width:580px){.live-toolbar{gap:10px}}`;
  document.head.append(style);
}

async function start() {
  addStyles();
  const roads = document.querySelector('[data-road-status]');
  if (!roads) return;
  roads.textContent = 'Consultando fuentes oficiales…';
  renderRoads(roads, await loadSnapshot());
}
start();
