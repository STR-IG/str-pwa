import {
  normalizeHourlyForecast,
  normalizeSmpEpisodes,
  parseSctRss,
  SOURCE_URLS,
} from '../_shared/official-weather-data.mjs';

const CACHE_TTL_MS = 2 * 60 * 1000;
const REFERENCE_TTL_MS = 24 * 60 * 60 * 1000;
const SCT_RSS_URL = 'https://www.gencat.cat/transit/opendata/incidenciesRSS.xml';
const METEOCAT_API = 'https://api.meteo.cat';
const cache = new Map<string, { expiresAt: number; value: unknown }>();
const lastSuccessAt = new Map<string, string>();
let references: { expiresAt: number; comarcaNames: Record<string, string>; municipalities: Array<{ code: string; name: string }> } | null = null;

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    },
  });
}

function sourceFailure(source: string, officialUrl: string, checkedAt: string, error: string, lastSuccessAt: string | null = null) {
  return { source, status: 'unavailable', checkedAt, lastSuccessAt, updatedAt: null, officialUrl, error, alerts: [], incidents: [] };
}

function localDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: values.year, month: values.month, day: values.day };
}

function nextDate({ year, month, day }: { year: string; month: string; day: string }) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1));
  return { year: String(date.getUTCFullYear()), month: String(date.getUTCMonth() + 1).padStart(2, '0'), day: String(date.getUTCDate()).padStart(2, '0') };
}

function asIso(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function requestJson(url: string, headers: HeadersInit = {}) {
  const result = await fetch(url, { headers, signal: AbortSignal.timeout(12_000), cache: 'no-store' });
  if (!result.ok) throw new Error(`La fuente respondió HTTP ${result.status}.`);
  return await result.json();
}

async function requestText(url: string) {
  const result = await fetch(url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(12_000), cache: 'no-store' });
  if (!result.ok) throw new Error(`La fuente respondió HTTP ${result.status}.`);
  return await result.text();
}

async function getReferences(apiKey: string) {
  const now = Date.now();
  if (references && references.expiresAt > now) return references;
  const headers = { 'X-Api-Key': apiKey, Accept: 'application/json' };
  const [comarcas, municipios] = await Promise.all([
    requestJson(`${METEOCAT_API}/referencia/v1/comarques`, headers),
    requestJson(`${METEOCAT_API}/referencia/v1/municipis`, headers),
  ]);
  if (!Array.isArray(comarcas) || !Array.isArray(municipios)) throw new Error('Meteocat devolvió metadatos inesperados.');
  references = {
    expiresAt: now + REFERENCE_TTL_MS,
    comarcaNames: Object.fromEntries(comarcas.filter(item => item?.codi != null && item?.nom).map(item => [String(item.codi), String(item.nom)])),
    municipalities: municipios.filter(item => item?.codi && item?.nom).map(item => ({ code: String(item.codi), name: String(item.nom) })),
  };
  return references;
}

async function fetchSmp(apiKey: string, comarcaNames: Record<string, string>) {
  const today = localDateParts();
  const dates = [today, nextDate(today)];
  const headers = { 'X-Api-Key': apiKey, Accept: 'application/json' };
  const episodes = await Promise.all(dates.map(async ({ year, month, day }) => {
    const data = `${year}-${month}-${day}Z`;
    const payload = await requestJson(`${METEOCAT_API}/pronostic/v2/smp/episodis-oberts?data=${encodeURIComponent(data)}`, headers);
    if (!Array.isArray(payload)) throw new Error('Meteocat devolvió avisos con un formato inesperado.');
    return payload;
  }));
  const alerts = normalizeSmpEpisodes(episodes.flat(), comarcaNames);
  return {
    source: 'Servei Meteorològic de Catalunya', status: 'ok', checkedAt: new Date().toISOString(),
    updatedAt: alerts.reduce((latest, alert) => !latest || (Date.parse(alert.updatedAt || '') > Date.parse(latest)) ? alert.updatedAt : latest, null as string | null),
    lastSuccessAt: new Date().toISOString(), officialUrl: SOURCE_URLS.meteocat, alerts, incidents: [],
  };
}

async function fetchForecast(apiKey: string, requestedName: string, municipalityList: Array<{ code: string; name: string }>) {
  const wanted = requestedName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
  const municipality = municipalityList.find(item => item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es') === wanted);
  if (!municipality) return { status: 'invalid-territory', municipality: requestedName, hours: [], officialUrl: SOURCE_URLS.meteocat };
  const payload = await requestJson(`${METEOCAT_API}/pronostic/v1/municipalHoraria/${encodeURIComponent(municipality.code)}`, {
    'X-Api-Key': apiKey, Accept: 'application/json',
  });
  const hours = normalizeHourlyForecast(payload);
  return {
    status: hours.length ? 'ok' : 'unavailable', municipality: municipality.name, checkedAt: new Date().toISOString(),
    lastSuccessAt: hours.length ? new Date().toISOString() : null, updatedAt: null, hours,
    error: hours.length ? null : 'No se han recibido horas de previsión vigentes.', officialUrl: SOURCE_URLS.meteocat,
  };
}

async function buildSnapshot(municipality: string) {
  const now = new Date().toISOString();
  const civilProtection = {
    source: 'Protecció Civil de Catalunya', status: 'unavailable', checkedAt: now, lastSuccessAt: null, updatedAt: null,
    officialUrl: SOURCE_URLS.civilProtection, alerts: [], incidents: [],
    error: 'No se ha localizado un feed estructurado oficial para activar o desactivar INUNCAT y sus restricciones. Consulta la fuente oficial; no se interpreta como ausencia de alertas.',
  };

  let traffic;
  try {
    const parsed = parseSctRss(await requestText(SCT_RSS_URL));
    lastSuccessAt.set('traffic', new Date().toISOString());
    traffic = {
      source: 'Servei Català de Trànsit', status: 'ok', checkedAt: new Date().toISOString(),
      lastSuccessAt: lastSuccessAt.get('traffic'), updatedAt: parsed.feedUpdatedAt, officialUrl: SCT_RSS_URL,
      incidents: parsed.incidents, alerts: [],
    };
  } catch (error) {
    traffic = sourceFailure('Servei Català de Trànsit', SCT_RSS_URL, new Date().toISOString(), error instanceof Error ? error.message : 'No se ha podido actualizar esta fuente.', lastSuccessAt.get('traffic') || null);
  }

  const apiKey = Deno.env.get('METEOCAT_API_KEY')?.trim();
  let meteocat;
  let forecast = municipality
    ? { status: 'unavailable', municipality, hours: [], officialUrl: SOURCE_URLS.meteocat, error: 'Meteocat no está disponible.' }
    : { status: 'needs-municipality', municipality: null, hours: [], officialUrl: SOURCE_URLS.meteocat };

  if (!apiKey) {
    meteocat = sourceFailure('Servei Meteorològic de Catalunya', SOURCE_URLS.meteocat, new Date().toISOString(), 'Falta configurar el secreto METEOCAT_API_KEY.');
    if (municipality) forecast = { ...forecast, status: 'unavailable', error: 'Falta configurar el secreto METEOCAT_API_KEY.' };
  } else {
    try {
      const refs = await getReferences(apiKey);
      meteocat = await fetchSmp(apiKey, refs.comarcaNames);
      lastSuccessAt.set('meteocat', meteocat.lastSuccessAt);
      if (municipality) {
        try { forecast = await fetchForecast(apiKey, municipality, refs.municipalities); }
        catch (error) { forecast = { status: 'unavailable', municipality, hours: [], officialUrl: SOURCE_URLS.meteocat, error: error instanceof Error ? error.message : 'No se ha podido actualizar esta fuente.' }; }
      }
    } catch (error) {
      meteocat = sourceFailure('Servei Meteorològic de Catalunya', SOURCE_URLS.meteocat, new Date().toISOString(), error instanceof Error ? error.message : 'No se ha podido actualizar esta fuente.', lastSuccessAt.get('meteocat') || null);
      if (municipality) forecast = { ...forecast, status: 'unavailable', error: meteocat.error };
    }
  }

  return { checkedAt: now, overallStatus: 'incomplete', sources: { civilProtection, meteocat, traffic }, forecast };
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return response({ ok: true });
  if (request.method !== 'GET') return response({ error: 'Método no permitido.' }, 405);
  const url = new URL(request.url);
  const municipality = (url.searchParams.get('municipality') || '').trim();
  if (municipality.length > 80) return response({ error: 'El nombre de municipio supera el límite.' }, 400);

  const cacheKey = municipality.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  const existing = cache.get(cacheKey);
  const now = Date.now();
  if (existing && existing.expiresAt > now) return response(existing.value);
  try {
    const value = await buildSnapshot(municipality);
    cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, value });
    return response(value);
  } catch (_error) {
    // Never retry upstreams or substitute expired active data after an unexpected error.
    return response({
      checkedAt: new Date().toISOString(), overallStatus: 'incomplete',
      sources: {
        civilProtection: sourceFailure('Protecció Civil de Catalunya', SOURCE_URLS.civilProtection, new Date().toISOString(), 'No se ha podido actualizar esta fuente.'),
        meteocat: sourceFailure('Servei Meteorològic de Catalunya', SOURCE_URLS.meteocat, new Date().toISOString(), 'No se ha podido actualizar esta fuente.', lastSuccessAt.get('meteocat') || null),
        traffic: sourceFailure('Servei Català de Trànsit', SCT_RSS_URL, new Date().toISOString(), 'No se ha podido actualizar esta fuente.', lastSuccessAt.get('traffic') || null),
      }, forecast: { status: 'unavailable', municipality: municipality || null, hours: [], officialUrl: SOURCE_URLS.meteocat, error: 'No se ha podido actualizar esta fuente.' },
    });
  }
});
