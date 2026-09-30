import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
test('la entrada sindical unificada conserva contenido, rutas y avisos', () => {
  const home = read('index.html');
  assert.equal((home.match(/src="actividad-informacion-sindical.png"/g) || []).length, 1);
  assert.doesNotMatch(home, /src="card-(?:actividad-sindical|informacion-plantilla).png"/);
  assert.match(home, /sindical-news-card[^>]+href="actividad-informacion-sindical.html"[^>]+data-news-category="activity"/);
  const hub = read('actividad-informacion-sindical.html');
  for (const file of ['informacion-plantilla.html', 'actualidad-sindical.html', 'actividad-sindical.html', 'index.html']) {
    assert.ok(hub.includes('href="' + file + '"'));
    assert.ok(existsSync(new URL('../' + file, import.meta.url)));
  }
  assert.match(read('informacion-plantilla.html'), /href="comunicado-comedor.html"/);
  assert.match(read('actividad-sindical.html'), /href="dia-afiliacion.html"/);
  assert.match(read('actividad-sindical.html'), /markCategoryRead\('activity'\)/);
  assert.match(read('novedades.js'), /link.href = 'actividad-informacion-sindical.html'/);
  assert.match(read('dia-afiliacion.html'), /href="https:\/\/www.soporteusuarios.com\/STR\/diaafiliacion\/"/);
});
