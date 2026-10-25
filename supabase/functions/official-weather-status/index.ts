import {
  normalizeCivilProtectionPlans,
  parseSctRss,
  overallStatus,
} from '../_shared/official-weather-data.mjs';

const CACHE_TTL_MS = 2 * 60 * 1000;
const SCT_RSS_URL = 'https://www.gencat.cat/transit/opendata/incidenciesRSS.xml';
const CIVIL_PROTECTION_URL = 'https://analisi.transparenciacatalunya.cat/resource/wj9c-j6vf.json';
let snapshotCache: { expiresAt: number; value: Record<string, unknown> } | null = null;
let snapshotFlight: Promise<Record<string, unknown>> | null = null;
const lastSuccessAt = new Map<string, string>();

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

async function buildSnapshot(): Promise<Record<string, unknown>> {
  const checkedAt = new Date().toISOString();

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

  const sources = { civilProtection, traffic };
  return { checkedAt, overallStatus: overallStatus(sources), sources };
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

  try {
    return response(await getSharedSnapshot());
  } catch (_error) {
    // Never substitute expired active data after an unexpected error.
    const checkedAt = new Date().toISOString();
    const sources = {
      civilProtection: sourceFailure('Protecció Civil de Catalunya / CECAT', CIVIL_PROTECTION_URL, checkedAt, 'No se ha podido actualizar esta fuente.', lastSuccessAt.get('civilProtection') || null),
      traffic: sourceFailure('Servei Català de Trànsit', SCT_RSS_URL, checkedAt, 'No se ha podido actualizar esta fuente.', lastSuccessAt.get('traffic') || null),
    };
    return response({ checkedAt, overallStatus: overallStatus(sources), sources });
  }
});
