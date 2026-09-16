import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('el carrusel conserva la demo y sustituye solo la segunda diapositiva', () => {
  const html = read('index.html');
  assert.match(html, /<a class="hero-slide" href="demo-app\.html"/);
  assert.match(html, /<a class="hero-slide dia-afiliacion" href="dia-afiliacion\.html"/);
  assert.doesNotMatch(html, /hero-slide conoce-app/);
  assert.match(html, /\.hero-slide\.dia-afiliacion[^}]*card-carrusel-dia-afiliado\.png[^}]*background-size:contain/);
});

test('la ficha reutiliza el cartel completo y ofrece la inscripción externa segura', () => {
  const html = read('dia-afiliacion.html');
  assert.equal(existsSync(new URL('../Card-dia-afiliacion.jpg', import.meta.url)), true);
  assert.match(html, /class="poster" src="Card-dia-afiliacion\.jpg"/);
  assert.match(html, /\.poster \{[^}]*width:100%; height:auto;/);
  assert.match(html, /href="https:\/\/www\.soporteusuarios\.com\/STR\/diaafiliacion\/"/);
  assert.match(html, />APÚNTATE AQUÍ<\/a>/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test('actividad sindical incluye el Día de la Afiliación y reutiliza el contador existente', () => {
  const activity = read('actividad-sindical.html');
  const home = read('index.html');
  const news = read('novedades.js');
  assert.match(activity, /href="dia-afiliacion\.html"/);
  assert.match(activity, /src="Card-dia-afiliacion\.jpg"/);
  assert.match(home, /data-news-category="activity"/);
  assert.match(home, /class="news-notification-badge" data-news-badge/);
  assert.match(news, /id: 'activity-dia-afiliacion-2026-10-24'/);
});

test('el carrusel avanza cada 15 segundos, vuelve al inicio y reinicia tras interacción', () => {
  const html = read('index.html');
  assert.match(html, /const HERO_AUTOPLAY_DELAY = 15000/);
  assert.match(html, /const nextIndex = \(visibleHeroIndex\(\) \+ 1\) % heroDots\.length/);
  assert.match(html, /dot\.addEventListener\('click',[\s\S]*?scheduleHeroAutoplay\(\)/);
  assert.match(html, /heroCarousel\.addEventListener\('scroll',[\s\S]*?setActiveHeroDot\(visibleHeroIndex\(\)\);[\s\S]*?scheduleHeroAutoplay\(\)/);
  assert.match(html, /scrollTo\(\{ left:nextIndex \* heroCarousel\.clientWidth, behavior:'smooth' \}\)/);
});
