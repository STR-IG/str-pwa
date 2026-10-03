import {
  normalizeHourlyForecast,
  normalizeCivilProtectionPlans,
  normalizeSmpEpisodes,
  parseSctRss,
  SOURCE_URLS,
} from '../_shared/official-weather-data.mjs';

const CACHE_TTL_MS = 2 * 60 * 1000;
const FORECAST_TTL_MS = 10 * 60 * 1000;
const MAX_FORECAST_CACHE_ENTRIES = 64;
const REFERENCE_TTL_MS = 24 * 60 * 60 * 1000;
const METEOCAT_ENABLED = Deno.env.get('METEOCAT_ENABLED')?.toLowerCase() === 'true';
const SCT_RSS_URL = 'https://www.gencat.cat/transit/opendata/incidenciesRSS.xml';
const CIVIL_PROTECTION_URL = 'https://analisi.transparenciacatalunya.cat/resource/wj9c-j6vf.json';
const METEOCAT_API = 'https://api.meteo.cat';
let snapshotCache: { expiresAt: number; value: Record<string, unknown> } | null = null;
let snapshotFlight: Promise<Record<string, unknown>> | null = null;
const forecastCache = new Map<string, { expiresAt: number; value: unknown }>();
const forecastFlights = new Map<string, Promise<unknown>>();
const lastSuccessAt = new Map<string, string>();
type MeteocatReferences = { expiresAt: number; comarcaNames: Record<string, string>; municipalities: Array<{ code: string; name: string }> };
let references: MeteocatReferences | null = null;
let referencesFlight: Promise<MeteocatReferences> | null = null;

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

async function fetchCivilProtection() {
  const rows = await requestJson(CIVIL_PROTECTION_URL, { Accept: 'application/json' });
  const alerts = normalizeCivilProtectionPlans(rows);
  const checkedAt = new Date().toISOString();
  lastSuccessAt.set('civilProtection', checkedAt);
  return {
    source: 'Protecció Civil de Catalunya / CECAT', status: 'ok', checkedAt,
    updatedAt: alerts.reduce((latest, alert) => !latest || String(alert.updatedAt || '') > String(latest) ? alert.updatedAt : latest, null as string | null),
    lastSuccessAt: checkedAt, officialUrl: CIVIL_PROTECTION_URL, alerts, incidents: [],
  };
}

async function getReferences(apiKey: string): Promise<MeteocatReferences> {
  const now = Date.now();
  if (references && references.expiresAt > now) return references;
  if (referencesFlight) return await referencesFlight;

  const pending = (async () => {
    const headers = { 'X-Api-Key': apiKey, Accept: 'application/json' };
    const [comarcas, municipios] = await Promise.all([
      requestJson(METEOCAT_API + '/referencia/v1/comarques', headers),
      requestJson(METEOCAT_API + '/referencia/v1/municipis', headers),
    ]);
    if (!Array.isArray(comarcas) || !Array.isArray(municipios)) throw new Error('Meteocat devolvió metadatos inesperados.');
    return {
      expiresAt: Date.now() + REFERENCE_TTL_MS,
      comarcaNames: Object.fromEntries(comarcas.filter(item => item?.codi != null && item?.nom).map(item => [String(item.codi), String(item.nom)])),
      municipalities: municipios.filter(item => item?.codi && item?.nom).map(item => ({ code: String(item.codi), name: String(item.nom) })),
    };
  })();

  referencesFlight = pending;
  try {
    references = await pending;
    return references;
  } finally {
    referencesFlight = null;
  }
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

async function buildSnapshot(): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();

  let civilProtection;
  try { civilProtection = await fetchCivilProtection(); }
  catch (error) {
    civilProtection = sourceFailure('Protecció Civil de Catalunya / CECAT', CIVIL_PROTECTION_URL, new Date().toISOString(), error instanceof Error ? error.message : 'No se ha podido actualizar esta fuente.', lastSuccessAt.get('civilProtection') || null);
  }

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

  let meteocat;
  const apiKey = METEOCAT_ENABLED ? Deno.env.get('METEOCAT_API_KEY')?.trim() : undefined;
  if (!METEOCAT_ENABLED) {
    meteocat = sourceFailure('Servei Meteorològic de Catalunya', SOURCE_URLS.meteocat, new Date().toISOString(), 'Fuente desactivada hasta completar el alta y confirmar las condiciones de difusión.');
  } else if (!apiKey) {
    meteocat = sourceFailure('Servei Meteorològic de Catalunya', SOURCE_URLS.meteocat, new Date().toISOString(), 'Falta configurar el secreto METEOCAT_API_KEY.');
  } else {
    try {
      const refs = await getReferences(apiKey);
      meteocat = await fetchSmp(apiKey, refs.comarcaNames);
      lastSuccessAt.set('meteocat', meteocat.lastSuccessAt);
    } catch (error) {
      meteocat = sourceFailure('Servei Meteorològic de Catalunya', SOURCE_URLS.meteocat, new Date().toISOString(), error instanceof Error ? error.message : 'No se ha podido actualizar esta fuente.', lastSuccessAt.get('meteocat') || null);
    }
  }

  return { checkedAt: now, overallStatus: 'incomplete', sources: { civilProtection, meteocat, traffic } };
}

async function buildForecast(requestedName: string) {
  if (!METEOCAT_ENABLED) {
    return { status: 'unavailable', municipality: requestedName || null, hours: [], officialUrl: SOURCE_URLS.meteocat, error: 'Meteocat está desactivado hasta completar el alta y confirmar las condiciones de difusión.' };
  }
  if (!requestedName) return { status: 'needs-municipality', municipality: null, hours: [], officialUrl: SOURCE_URLS.meteocat };
  const apiKey = Deno.env.get('METEOCAT_API_KEY')?.trim();
  if (!apiKey) return { status: 'unavailable', municipality: requestedName, hours: [], officialUrl: SOURCE_URLS.meteocat, error: 'Falta configurar el secreto METEOCAT_API_KEY.' };

  try {
    const refs = await getReferences(apiKey);
    const wanted = requestedName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
    const municipality = refs.municipalities.find(item => item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es') === wanted);
    if (!municipality) return { status: 'invalid-territory', municipality: requestedName, hours: [], officialUrl: SOURCE_URLS.meteocat };

    const now = Date.now();
    const cached = forecastCache.get(municipality.code);
    if (cached && cached.expiresAt > now) return cached.value;
    const flight = forecastFlights.get(municipality.code);
    if (flight) return await flight;

    const pending = fetchForecast(apiKey, municipality.name, refs.municipalities);
    forecastFlights.set(municipality.code, pending);
    try {
      const forecast = await pending;
      {
        const ttl = forecast.status === 'ok' ? FORECAST_TTL_MS : CACHE_TTL_MS;
        forecastCache.set(municipality.code, { expiresAt: Date.now() + ttl, value: forecast });
        while (forecastCache.size > MAX_FORECAST_CACHE_ENTRIES) {
          const oldest = forecastCache.keys().next().value;
          if (oldest === undefined) break;
          forecastCache.delete(oldest);
        }
      }
      return forecast;
    } finally {
      forecastFlights.delete(municipality.code);
    }
  } catch (error) {
    return { status: 'unavailable', municipality: requestedName, hours: [], officialUrl: SOURCE_URLS.meteocat, error: error instanceof Error ? error.message : 'No se ha podido actualizar esta fuente.' };
  }
}

async function getSharedSnapshot() {
  const now = Date.now();
  if (snapshotCache && snapshotCache.expiresAt > now) return snapshotCache.value;
  if (snapshotFlight) return await snapshotFlight;

  const pending = buildSnapshot();
  snapshotFlight = pending;
  try {
    const value = await pending;
    snapshotCache = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    return value;
  } finally {
    snapshotFlight = null;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return response({ ok: true });
  if (request.method !== 'GET') return response({ error: 'Método no permitido.' }, 405);
  const url = new URL(request.url);
  const municipality = (url.searchParams.get('municipality') || '').trim();
  if (municipality.length > 80) return response({ error: 'El nombre de municipio supera el límite.' }, 400);

  try {
    // Traffic/protection snapshots are shared by all municipalities within the isolate.
    // Per-municipality forecasts use canonical Meteocat municipality codes and a longer TTL.
    const snapshot = await getSharedSnapshot();
    const forecast = await buildForecast(municipality);
    return response({ ...snapshot, forecast });
  } catch (_error) {
    // Never substitute expired active data after an unexpected error.
    return response({
      checkedAt: new Date().toISOString(), overallStatus: 'incomplete',
      sources: {
        civilProtection: sourceFailure('Protecció Civil de Catalunya / CECAT', CIVIL_PROTECTION_URL, new Date().toISOString(), 'No se ha podido actualizar esta fuente.', lastSuccessAt.get('civilProtection') || null),
        meteocat: sourceFailure('Servei Meteorològic de Catalunya', SOURCE_URLS.meteocat, new Date().toISOString(), 'Meteocat no se ha podido actualizar o está desactivado.', lastSuccessAt.get('meteocat') || null),
        traffic: sourceFailure('Servei Català de Trànsit', SCT_RSS_URL, new Date().toISOString(), 'No se ha podido actualizar esta fuente.', lastSuccessAt.get('traffic') || null),
      }, forecast: { status: 'unavailable', municipality: municipality || null, hours: [], officialUrl: SOURCE_URLS.meteocat, error: 'No se ha podido actualizar esta fuente.' },
    });
  }
});
