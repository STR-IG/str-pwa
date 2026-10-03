export const SOURCE_URLS = {
  civilProtection: 'https://analisi.transparenciacatalunya.cat/resource/wj9c-j6vf.json',
  civilProtectionInfo: 'https://interior.gencat.cat/ca/arees_dactuacio/proteccio_civil/plans-proteccio-civil/plans-especials/',
  meteocat: 'https://www.meteo.cat/prediccio/general',
  traffic: 'https://www.gencat.cat/transit/opendata/incidenciesRSS.xml',
  trafficMap: 'https://mct.gencat.cat/',
};

export function normalizeCivilProtectionPlans(rows) {
  if (!Array.isArray(rows)) throw new Error('El conjunto de Protección Civil no devolvió una lista válida.');
  return rows.filter(row => row && row.plaactivat?.toLocaleUpperCase('ca') === 'SI').map(row => {
    const phase = String(row.plafase || '').toLocaleUpperCase('ca');
    const severity = phase.includes('EMERG') ? 'red' : phase === 'ALERTA' ? 'orange' : 'yellow';
    const bulletinUrl = row.comunicatpdf?.url || null;
    return {
      id: [row.plaacronim, phase, row.fasedatahora].filter(Boolean).join('|'),
      source: 'Protecció Civil de Catalunya / CECAT',
      type: 'civil-protection-plan', severity,
      title: `${row.plaacronim || row.planom || 'Plan de emergencia'} · ${row.plafase || 'Activo'}`,
      description: [row.descripcio, row.planom].filter(Boolean).join(' · '),
      affectedAreas: [], roads: [],
      // This dataset timestamp is local Catalonia time and contains no timezone.
      phaseChangedAt: row.fasedatahora || null, endAt: null, updatedAt: row.fasedatahora || null,
      officialUrl: SOURCE_URLS.civilProtection,
      bulletinUrl,
      phase,
    };
  });
}

export function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
}

function xmlField(xml, name) {
  const tag = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function parsePubDate(value) {
  const normalized = String(value || '').replace(/\bCEST\b/i, '+0200').replace(/\bCET\b/i, '+0100').replace(/\bGMT\b/i, '+0000');
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function classifyRoadIncident(title = '', description = '') {
  const text = String(title) + ' ' + String(description);
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ca');

  // SCT's own item "Calçada tallada" is an explicit full-carriageway closure.
  // Do not classify a generic occurrence of "tallada" (for example, a named exit)
  // as a road closure.
  if (/\b(?:calzada|calcada|carretera|via|autopista|autovia)\s+(?:tallad[ao]s?|tancad[ao]s?|cerrad[ao]s?|cortad[ao]s?)\b/.test(normalized) ||
      /\b(?:tall|tancament|cierre|corte)\s+(?:de\s+)?(?:la\s+)?(?:calzada|carretera|via|autopista|autovia)\b/.test(normalized)) {
    return { type: 'road-closure', severity: 'red', label: 'Carretera cortada' };
  }

  if (/\b(?:carril(?:es)?|calzada|carretera|via)\s+(?:restringid[ao]s?|afectad[ao]s?)\b/.test(normalized) ||
      /\b(?:carril(?:es)?|calzada)\s+(?:tallad[ao]s?|tancad[ao]s?)\b/.test(normalized) ||
      /retencio|congestio|accident|transit\s+(?:lent|intens)|trafic\s+(?:lent|intens)|desviament|obres|pas alternatiu|circulacio pel voral/.test(normalized)) {
    return { type: 'traffic-affected', severity: 'orange', label: 'Circulación afectada' };
  }

  return { type: 'unclassified', severity: 'neutral', label: 'Incidencia sin clasificar' };
}

export function trafficFeedState(source) {
  if (source?.status !== 'ok' || !Array.isArray(source?.incidents)) return 'unavailable';
  return source.incidents.length ? 'incidents' : 'empty';
}

export function parseSctRss(xml) {
  if (typeof xml !== 'string' || !/<rss\b[^>]*>[\s\S]*<\/rss\s*>/i.test(xml)) {
    throw new Error('El RSS del SCT no tiene el formato esperado.');
  }
  const channelMatch = xml.match(/<channel(?:\s[^>]*)?>([\s\S]*?)<\/channel\s*>/i);
  if (!channelMatch) throw new Error('El RSS del SCT no contiene un canal válido.');
  const channel = channelMatch[1];
  const itemCount = [...channel.matchAll(/<item(?:\s[^>]*)?>/gi)].length;
  const itemMatches = [...channel.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/gi)];
  if (itemCount !== itemMatches.length) throw new Error('El RSS del SCT contiene una incidencia mal formada.');
  const feedUpdatedAt = parsePubDate(xmlField(channel, 'pubDate'));
  const items = itemMatches.map(([, item]) => {
    const title = xmlField(item, 'title');
    const description = xmlField(item, 'description');
    if (!title || !description) throw new Error('El RSS del SCT contiene una incidencia incompleta (falta título o descripción).');
    const parts = description.split('|').map(part => part.trim());
    const classification = classifyRoadIncident(title, description);
    return {
      id: xmlField(item, 'guid') || [parts[0] || '', parts[1] || '', title, description].join('|'),
      source: 'Servei Català de Trànsit',
      type: classification.type,
      severity: classification.severity,
      title,
      description,
      road: parts[0] || null,
      location: parts[1] || null,
      direction: description.match(/Sentit\s+([^|]+)/i)?.[1]?.trim() || null,
      cause: title.split(/[.(]/)[0]?.trim() || null,
      status: title,
      // RSS pubDate records publication time, not incident start, last update, or expiry.
      startAt: null,
      endAt: null,
      publishedAt: parsePubDate(xmlField(item, 'pubDate')),
      officialUrl: 'https://cit.transit.gencat.cat/cit/AppJava/views/incidents.xhtml',
    };
  });
  const seen = new Set();
  const unique = items.filter(item => {
    const key = item.id || [item.road, item.location, item.status, item.direction].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const severityOrder = { red: 0, orange: 1, yellow: 2, neutral: 3, green: 4 };
  unique.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0));
  return { feedUpdatedAt, incidents: unique };
}

function getAreaCodes(episode) {
  const ids = new Set();
  for (const aviso of episode?.avisos ?? []) {
    for (const evolution of aviso?.evolucions ?? []) {
      for (const period of evolution?.periodes ?? []) {
        for (const affectation of period?.afectacions ?? []) {
          if (affectation?.idComarca != null) ids.add(String(affectation.idComarca));
        }
      }
    }
  }
  return [...ids];
}

export function normalizeSmpEpisodes(episodes, comarcaNames = {}) {
  const results = [];
  for (const episode of Array.isArray(episodes) ? episodes : []) {
    if (episode?.estat?.nom !== 'Obert') continue;
    const alerts = (episode.avisos ?? []).filter(alert => alert?.estat === 'Vigent' || alert?.estat === 'Ampliat');
    for (const alert of alerts) {
      const dangerValues = (alert.evolucions ?? []).flatMap(evolution =>
        (evolution.periodes ?? []).flatMap(period =>
          (period.afectacions ?? []).map(area => Number(area.perill)).filter(Number.isFinite)));
      const danger = dangerValues.length ? Math.max(...dangerValues) : Number(alert.nivell ?? 0);
      const ids = getAreaCodes({ avisos: [alert] });
      const updatedAt = alert.dataEmisio || null;
      results.push({
        source: 'Servei Meteorològic de Catalunya',
        type: 'weather-warning',
        severity: danger >= 5 ? 'red' : danger >= 3 ? 'orange' : 'yellow',
        title: episode.meteor?.nom || 'Aviso meteorológico',
        description: alert.comentari || alert.evolucions?.map(e => e.comentari).filter(Boolean).join(' ') || '',
        affectedAreas: ids.map(id => comarcaNames[id] || `Comarca ${id}`),
        roads: [],
        startAt: alert.dataInici || null,
        endAt: alert.dataFi || null,
        updatedAt,
        officialUrl: SOURCE_URLS.meteocat,
        level: danger || null,
        warningType: alert.tipus || null,
        episodeStatus: episode.estat.nom,
      });
    }
  }
  const unique = new Map();
  for (const alert of results) {
    const key = [alert.title, alert.startAt, alert.endAt, alert.affectedAreas.join(',')].join('|');
    const existing = unique.get(key);
    if (!existing || Date.parse(alert.updatedAt || '') > Date.parse(existing.updatedAt || '')) unique.set(key, alert);
  }
  return [...unique.values()].sort((a, b) => (Date.parse(a.startAt || '') || 0) - (Date.parse(b.startAt || '') || 0));
}

export function normalizeHourlyForecast(payload, now = Date.now()) {
  const nowTime = now instanceof Date ? now.getTime() : Number(now);
  const hours = [];
  for (const day of payload?.dies ?? []) {
    const variables = day?.variables ?? {};
    const hourlyValues = variables.precipitacio?.valor ?? variables.precipitacio?.valors ?? [];
    for (const item of hourlyValues) {
      const time = Date.parse(item?.data || '');
      if (!Number.isFinite(time) || time < nowTime || time > nowTime + 18 * 60 * 60 * 1000) continue;
      const temperatureValues = variables.temp?.valors ?? [];
      const temperature = temperatureValues.find(value => value?.data === item.data)?.valor;
      hours.push({ at: new Date(time).toISOString(), precipitationMm: Number(item.valor), temperatureC: temperature == null ? null : Number(temperature) });
    }
  }
  return hours.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 18);
}

export function overallStatus(sources) {
  const required = ['civilProtection', 'meteocat', 'traffic'];
  if (!required.every(name => sources?.[name]?.status === 'ok')) return 'incomplete';
  const hasActiveSignal = required.some(name => (sources[name].alerts?.length || sources[name].incidents?.length) > 0);
  return hasActiveSignal ? 'active' : 'none';
}
