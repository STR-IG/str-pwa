const PORTAL = 'https://www.meteo.cat/serveis/descarregues';
export const REQUEST_URL = 'https://www.meteo.cat/wpweb/serveis/peticio-certificat-de-dades-meteorologiques/';
const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

// Read only JSON literals published by the official page; never execute its scripts.
function arrayAt(text, start) {
  let depth = 0, quoted = false, escaped = false;
  if (text[start] !== '[') throw new Error('SOURCE_FORMAT');
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('SOURCE_FORMAT');
}

export function parseMunicipalities(html) {
  const marker = 'new Meteocat.serveis.descarregues.buscador(';
  const start = html.indexOf(marker);
  const data = start < 0 ? -1 : html.indexOf('dades:', start);
  if (data < 0) throw new Error('SOURCE_FORMAT');
  const towns = arrayAt(html, html.indexOf('[', data));
  if (!towns.length || towns.some(t => !/^\d{6}$/.test(t.codi) || typeof t.nom !== 'string')) throw new Error('SOURCE_FORMAT');
  return towns.map(t => ({ code: t.codi, name: t.nom }));
}

export function parseFiles(html) {
  const match = /Meteocat\.serveis\.descarregues\.init\(\s*/.exec(html);
  if (!match) throw new Error('SOURCE_FORMAT');
  const start = match.index + match[0].length;
  // null is the initial form, not an empty response for a selected town.
  const files = arrayAt(html, start);
  if (files.some(file => typeof file !== 'string' || !/^climatologia\/InformesEREM\/\d{4}\/\d{2}\/\d{6}_\d{4}-\d{2}-\d{2}\.pdf$/.test(file))) throw new Error('SOURCE_FORMAT');
  return files;
}

export function validateCriteria(body, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })) {
  const { date, location, incident } = body || {};
  const parsed = new Date(`${date}T12:00:00Z`);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > today || typeof location !== 'string' || location.trim().length < 2 || location.length > 100 || !['all', 'rain', 'wind', 'snow', 'heat', 'traffic'].includes(incident)) throw new Error('INVALID_CRITERIA');
  return { date, location: location.trim(), incident };
}

export function createLookup(fetcher = fetch) {
  let municipalities;
  let townsExpire = 0;
  const cache = new Map();
  async function read(options) {
    const response = await fetcher(PORTAL, { ...options, redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('SOURCE_UNAVAILABLE');
    const text = await response.text();
    if (text.length > 4_000_000) throw new Error('SOURCE_FORMAT');
    return text;
  }
  return async criteria => {
    const { date, location, incident } = validateCriteria(criteria);
    if (!['all', 'rain', 'wind'].includes(incident)) return { status: 'not_supported', documents: [], requestUrl: REQUEST_URL };
    if (!municipalities || townsExpire < Date.now()) {
      municipalities = parseMunicipalities(await read());
      townsExpire = Date.now() + 3600000;
    }
    const town = municipalities.find(t => normalize(t.name) === normalize(location));
    if (!town) return { status: 'unknown_municipality', documents: [], requestUrl: REQUEST_URL };
    let cached = cache.get(town.code);
    if (!cached || cached.expires < Date.now()) {
      const files = parseFiles(await read({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ codi: town.code }).toString() }));
      cached = { files, expires: Date.now() + 300000 };
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(town.code, cached);
    }
    const documents = cached.files.filter(file => file.endsWith(`/${town.code}_${date}.pdf`)).map(file => {
      const url = new URL('https://www.meteo.cat/serveis/descarregaFitxer');
      url.searchParams.set('file_name', file);
      return { title: `Certificado meteorológico · ${town.name} · ${date}`, url: url.href, date, municipality: town.name, issuer: 'Servei Meteorològic de Catalunya (Meteocat)' };
    });
    return { status: documents.length ? 'found' : 'not_published', municipality: town.name, documents, requestUrl: REQUEST_URL };
  };
}
