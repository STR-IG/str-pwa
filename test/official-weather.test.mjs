import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRoadIncident,
  normalizeCivilProtectionPlans,
  normalizeSmpEpisodes,
  overallStatus,
  parseSctRss,
  trafficFeedState,
} from '../official-weather-data.mjs';

// Exact RSS items captured from the official SCT feed at 2026-10-03 22:47 CEST.
// Source: https://www.gencat.cat/transit/opendata/incidenciesRSS.xml
const capturedSctFeed = `<?xml version='1.0' encoding='UTF-8'?>
<rss xmlns:dc='http://purl.org/dc/elements/1.1/' version='2.0'>
  <channel>
    <title>RSS de dades d'Incidències</title>
    <pubDate>Sat, 03 Oct 2026 22:47:02 CEST</pubDate>
    <item><guid isPermaLink='false'>142217829</guid><pubDate>Thu, 10 Sep 2026 06:53:29 GMT</pubDate><title>REFORÇAMENT DE FERM. Calçada tallada (Obres)</title><link>https://cit.transit.gencat.cat</link><description>A-2 | JORBA | Sentit Est cap a BARCELONA | Punt km. 542.3-545 | 08:53</description></item>
    <item><guid isPermaLink='false'>151253101</guid><pubDate>Tue, 22 Sep 2026 06:22:09 GMT</pubDate><title>NETEJA. Calçada restringida (Obres)</title><link>https://cit.transit.gencat.cat</link><description>A-2 | BRUC | Sentit Oest cap a LLEIDA | Punt km. 570-586 | 08:22</description></item>
    <item><guid isPermaLink='false'>151524902</guid><pubDate>Sat, 03 Oct 2026 20:32:34 GMT</pubDate><title>INUNDACIONS. Trànsit lent (Meteorologia)</title><link>https://cit.transit.gencat.cat</link><description>C-32 | ESPLUGUES DE LLOBREGAT | Sentit Sud cap a NUS LLOBREGAT-CIRCULACIÓ PEL VORAL | Punt km. 61.5-62.5 | 22:32</description></item>
    <item><guid isPermaLink='false'>151524802</guid><pubDate>Sat, 03 Oct 2026 20:29:06 GMT</pubDate><title>INUNDACIONS. Trànsit intens (Meteorologia)</title><link>https://cit.transit.gencat.cat</link><description>C-35 | VIDRERES | Sentit Ambdós sentits cap a TALLADA SORTIDA 87 | Punt km. 87-87.5 | 22:29</description></item>
  </channel>
</rss>`;

test('real SCT RSS items parse timestamps, directions, closure and affected traffic accurately', () => {
  const result = parseSctRss(capturedSctFeed);
  assert.equal(result.incidents.length, 4);
  assert.equal(result.feedUpdatedAt, '2026-10-03T20:47:02.000Z');
  const closure = result.incidents.find(item => item.id === '142217829');
  assert.equal(closure.type, 'road-closure');
  assert.equal(closure.severity, 'red');
  assert.equal(closure.road, 'A-2');
  assert.equal(closure.location, 'JORBA');
  assert.equal(closure.direction, 'Est cap a BARCELONA');
  assert.equal(closure.publishedAt, '2026-09-10T06:53:29.000Z');

  const restricted = result.incidents.find(item => item.id === '151253101');
  assert.equal(restricted.type, 'traffic-affected');
  assert.equal(restricted.severity, 'orange');

  const slowTraffic = result.incidents.find(item => item.id === '151524902');
  assert.equal(slowTraffic.type, 'traffic-affected');
  assert.equal(slowTraffic.severity, 'orange');

  const intenseAtNamedExit = result.incidents.find(item => item.id === '151524802');
  assert.equal(intenseAtNamedExit.type, 'traffic-affected');
  assert.equal(intenseAtNamedExit.severity, 'orange');
  assert.notEqual(intenseAtNamedExit.type, 'road-closure');
});


test('a lane closure is affected circulation, not a whole-road closure', () => {
  const lane = classifyRoadIncident('OBRES', 'C-58 | SABADELL | carril tallat');
  assert.equal(lane.type, 'traffic-affected');
  assert.equal(lane.severity, 'orange');
});

test('an unrecognized incident is shown as unclassified, without an inferred warning level', () => {
  assert.deepEqual(classifyRoadIncident('AVÍS ESPECIAL', 'C-58 | SABADELL | observació del SCT'), {
    type: 'unclassified', severity: 'neutral', label: 'Incidencia sin clasificar',
  });
});

test('a valid empty RSS is distinct from a failed or malformed feed', () => {
  const empty = parseSctRss("<rss version='2.0'><channel><title>SCT</title></channel></rss>");
  assert.deepEqual(empty.incidents, []);
  assert.equal(trafficFeedState({ status: 'ok', incidents: empty.incidents }), 'empty');
  assert.equal(trafficFeedState({ status: 'unavailable', incidents: [] }), 'unavailable');
  assert.equal(trafficFeedState({ status: 'ok' }), 'unavailable');
  assert.throws(() => parseSctRss('<html>blocked</html>'), /formato esperado/);
  assert.throws(() => parseSctRss('<rss version="2.0"><channel></rss>'), /canal válido/);
  assert.throws(() => parseSctRss('<rss version="2.0"><channel><item><title>solo título</title></item></channel></rss>'), /descripción/);
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

test('Protecció Civil phase time is represented as a phase change, not an episode start', () => {
  const plans = normalizeCivilProtectionPlans([{
    plaacronim: 'INUNCAT', planom: 'INUNCAT', plafase: 'EMERGÈNCIA', plaactivat: 'SI',
    fasedatahora: '03/10/2026 12:59', descripcio: 'Pas a ALERTA SMP Intensitat 1 i 2 d’Octubre',
    comunicatpdf: { url: 'https://documents.dadesobertes.gencat.cat/cecat/docs/example.pdf' },
  }]);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].severity, 'red');
  assert.equal(plans[0].phaseChangedAt, '03/10/2026 12:59');
  assert.equal('startAt' in plans[0], false);
  assert.match(plans[0].bulletinUrl, /^https:\/\//);
  assert.deepEqual(normalizeCivilProtectionPlans([]), []);
});

test('an unavailable official source can never become a green all-clear', () => {
  assert.equal(overallStatus({ civilProtection: { status: 'unavailable' }, meteocat: { status: 'ok', alerts: [] }, traffic: { status: 'ok', incidents: [] } }), 'incomplete');
  assert.equal(overallStatus({ civilProtection: { status: 'ok' }, meteocat: { status: 'ok', alerts: [] }, traffic: { status: 'ok', incidents: [] } }), 'none');
});

test('duplicate RSS guids remain deduplicated', () => {
  const item = capturedSctFeed.match(/<item>[\s\S]*?<guid isPermaLink='false'>142217829<\/guid>[\s\S]*?<\/item>/)?.[0];
  assert.ok(item);
  const duplicated = capturedSctFeed.replace('</channel>', item + '</channel>');
  assert.equal(parseSctRss(duplicated).incidents.length, 4);
});
