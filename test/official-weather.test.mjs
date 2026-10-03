import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCivilProtectionPlans, normalizeSmpEpisodes, overallStatus, parseSctRss } from '../official-weather-data.mjs';

test('SCT RSS becomes deduplicated, classified incidents with source timestamps', () => {
  const feed = `<?xml version="1.0"?><rss version="2.0"><channel><pubDate>Sat, 03 Oct 2026 21:57:00 +0200</pubDate>
    <item><guid>road-1</guid><title>Carretera tallada per inundació</title><description><![CDATA[AP-7 | Subirats | sentit Barcelona]]></description><pubDate>Sat, 03 Oct 2026 21:40:00 +0200</pubDate></item>
    <item><guid>road-1</guid><title>Carretera tallada per inundació</title><description><![CDATA[AP-7 | Subirats | sentit Barcelona]]></description><pubDate>Sat, 03 Oct 2026 21:40:00 +0200</pubDate></item>
  </channel></rss>`;
  const result = parseSctRss(feed);
  assert.equal(result.incidents.length, 1);
  assert.equal(result.incidents[0].severity, 'red');
  assert.equal(result.incidents[0].road, 'AP-7');
  assert.equal(result.incidents[0].location, 'Subirats');
  assert.equal(result.feedUpdatedAt, '2026-10-03T19:57:00.000Z');
  assert.ok(result.incidents[0].updatedAt);
});

test('Meteocat open episode includes territory, severity, and validity', () => {
  const alerts = normalizeSmpEpisodes([{
    meteor: { nom: 'Pluja' }, estat: { nom: 'Obert' },
    avisos: [{ estat: 'Vigent', nivell: 4, dataEmisio: '2026-10-03T18:00:00Z', dataInici: '2026-10-03T19:00:00Z', dataFi: '2026-10-04T12:00:00Z', evolucions: [{ periodes: [{ afectacions: [{ idComarca: 13, perill: 4 }] }] }] }],
  }], { '13': 'Alt Penedès' });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, 'orange');
  assert.deepEqual(alerts[0].affectedAreas, ['Alt Penedès']);
  assert.equal(alerts[0].endAt, '2026-10-04T12:00:00Z');
});

test('Protecció Civil dataset detects an active INUNCAT emergency and bulletin', () => {
  const plans = normalizeCivilProtectionPlans([{
    plaacronim: 'INUNCAT', planom: 'INUNCAT', plafase: 'EMERGÈNCIA', plaactivat: 'SI',
    fasedatahora: '03/10/2026 12:59', descripcio: 'Pas a ALERTA SMP Intensitat 1 i 2 d’Octubre',
    comunicatpdf: { url: 'https://documents.dadesobertes.gencat.cat/cecat/docs/example.pdf' },
  }]);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].severity, 'red');
  assert.match(plans[0].title, /INUNCAT.*EMERGÈNCIA/);
  assert.equal(plans[0].updatedAt, '03/10/2026 12:59');
  assert.match(plans[0].bulletinUrl, /^https:\/\//);
  assert.deepEqual(normalizeCivilProtectionPlans([]), []);
});

test('an unavailable official source can never become a green all-clear', () => {
  assert.equal(overallStatus({ civilProtection: { status: 'unavailable' }, meteocat: { status: 'ok', alerts: [] }, traffic: { status: 'ok', incidents: [] } }), 'incomplete');
  assert.equal(overallStatus({ civilProtection: { status: 'ok' }, meteocat: { status: 'ok', alerts: [] }, traffic: { status: 'ok', incidents: [] } }), 'none');
});

test('unexpected non-RSS input is rejected rather than treated as an empty feed', () => {
  assert.throws(() => parseSctRss('<html>blocked</html>'), /formato esperado/);
});
