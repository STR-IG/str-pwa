import { CONTENIDOS, ordenarPorFecha } from './actividad-sindical-datos.mjs';
import { initNews } from './novedades.js';

const HUB = 'actividad-informacion-sindical.html';
const PENDING = 'PENDIENTE DE REDACTAR';
const sections = [
  { vista: 'resumenes', titulo: 'En un minuto · Resúmenes mensuales', tipo: 'resumen', enlace: 'resumen-mensual.html' },
  { vista: 'temas', titulo: 'Temas abiertos', tipo: 'tema' },
  { vista: 'proyectos', titulo: 'En qué estamos trabajando', tipo: 'proyecto' },
  { vista: 'reuniones', titulo: 'Reuniones y comunicados', tipo: 'reunión' },
  { vista: 'logros', titulo: 'Nuestros logros', tipo: 'logro' }
];
const statuses = { abierto: 'Abierto', cerrado: 'Cerrado', 'en curso': 'En curso', conseguido: 'Conseguido' };
const actions = { tema: 'Ver cronología →', proyecto: 'Ver ficha →', logro: 'Ver ficha →', 'reunión': 'Ver resumen →' };
const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const main = document.querySelector('#activity-content');
const heading = document.querySelector('h1');
const back = document.querySelector('.back');
const params = new URLSearchParams(location.search);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function link(text, href, className) {
  const node = element('a', text, className);
  node.href = href;
  return node;
}

function screen(title, parent, parentTitle) {
  heading.textContent = title;
  document.title = title + ' · STR-IG';
  back.href = parent;
  back.setAttribute('aria-label', 'Volver a ' + parentTitle);
  main.replaceChildren();
}

function addBadge(card, entry) {
  if (!entry.aviso) return;
  card.dataset.newsCategory = entry.aviso.categoria;
  card.dataset.newsId = entry.aviso.id;
  const badge = element('span', '0', 'news-notification-badge');
  badge.dataset.newsBadge = '';
  badge.setAttribute('aria-label', 'Novedades sin leer');
  card.append(badge);
}

function addDate(card, entry) {
  const row = element('div', '', 'post-date');
  const prefix = entry.tipo === 'tema' ? 'Actualizado: ' : '📅 ';
  if (entry.fecha) {
    const time = element('time', prefix + (entry.tipo === 'tema' ? monthFormat : dateFormat).format(new Date(entry.fecha)));
    time.dateTime = entry.fecha;
    row.append(time);
  } else {
    row.textContent = 'Fecha: ' + PENDING;
  }
  card.append(row);
}

function relatedLink(entry, label = 'Relacionado con: ') {
  const related = CONTENIDOS.find(item => item.id === entry.relacionado);
  if (!related) return null;
  return link(label + related.titulo, related.enlace, 'related');
}

function listingCard(entry) {
  const card = element('article', '', 'post content-card');
  card.append(element('h2', entry.titulo));
  if (entry.estado) card.append(element('span', statuses[entry.estado] || entry.estado, 'status'));
  addDate(card, entry);
  if (entry.resumen) card.append(element('p', entry.resumen));
  const buttons = element('div', '', 'post-actions');
  buttons.append(link(actions[entry.tipo], entry.enlace, 'primary'));
  card.append(buttons);
  if (entry.tipo === 'reunión') {
    const related = relatedLink(entry);
    if (related) card.append(related);
  }
  addBadge(card, entry);
  return card;
}

function renderList(section) {
  screen(section.titulo, HUB, 'Actividad e información sindical');
  const entries = ordenarPorFecha(CONTENIDOS.filter(entry => entry.tipo === section.tipo));
  if (!entries.length) {
    main.append(element('p', 'Todavía no hay contenido aquí', 'post empty'));
    return;
  }
  if (section.tipo === 'logro') {
    const categories = [...new Set(entries.map(entry => entry.categoria || 'Otros logros'))];
    for (const category of categories) {
      const group = element('section', '', 'group');
      group.append(element('h2', category, 'category-heading'));
      for (const entry of entries.filter(item => (item.categoria || 'Otros logros') === category)) {
        group.append(listingCard(entry));
      }
      main.append(group);
    }
  } else {
    for (const entry of entries) main.append(listingCard(entry));
  }
}

function detailBlock(card, title, text) {
  card.append(element('h3', title), element('p', text || PENDING));
}

function renderDetail(entry) {
  const section = sections.find(item => item.tipo === entry.tipo);
  screen(entry.titulo, HUB + '?vista=' + section.vista, section.titulo);
  const card = element('article', '', 'post content-card');
  if (entry.imagen) {
    const image = element('img', '', 'content-image');
    image.src = entry.imagen;
    image.alt = 'Puntos de recarga para vehículos eléctricos';
    card.append(image);
  }
  card.append(element('span', statuses[entry.estado] || entry.estado, 'status'));
  const ficha = entry.ficha || {};
  if (entry.tipo === 'proyecto') {
    detailBlock(card, 'Qué proponemos', ficha.objetivo);
    detailBlock(card, 'Qué hemos hecho', ficha.actuaciones);
    detailBlock(card, 'Próximo paso', ficha.proximoPaso);
    if (entry.precioActualKwh) detailBlock(card, 'Precio actual por kWh', entry.precioActualKwh);
  } else {
    detailBlock(card, 'Qué se consiguió', ficha.objetivo);
    detailBlock(card, 'Qué hizo STR', ficha.actuaciones);
    detailBlock(card, 'Cuándo', ficha.cuando || (entry.fecha && dateFormat.format(new Date(entry.fecha))));
  }
  const related = relatedLink(entry, entry.id === 'puntos-recarga' ? 'Siguiente paso: ' : 'Relacionado con: ');
  if (related) {
    if (entry.id === 'puntos-recarga') related.textContent = 'Siguiente paso: bajar el precio del kWh →';
    card.append(related);
  }
  main.append(card);
}

function renderHub() {
  screen('Actividad e información sindical', 'app.html', 'menú principal');
  for (const section of sections) {
    const card = link('', section.enlace || HUB + '?vista=' + section.vista, 'post navigation-card');
    card.append(element('h2', section.titulo));
    const arrow = element('span', '›', 'arrow');
    arrow.setAttribute('aria-hidden', 'true');
    card.append(arrow);
    if (section.tipo === 'tema') {
      const unreadTopic = CONTENIDOS.find(entry => entry.tipo === 'tema' && entry.aviso);
      if (unreadTopic) addBadge(card, unreadTopic);
    }
    main.append(card);
  }
}

const detailId = location.pathname.endsWith('/nuestros-logros.html') ? 'puntos-recarga' : params.get('ficha');
if (detailId) {
  const entry = CONTENIDOS.find(item => item.id === detailId && ['proyecto', 'logro'].includes(item.tipo));
  if (entry) {
    renderDetail(entry);
  } else {
    screen('Ficha no disponible', HUB, 'Actividad e información sindical');
    main.append(element('p', 'Todavía no hay contenido aquí', 'post empty'));
  }
} else {
  const section = sections.find(item => item.vista === params.get('vista') && item.tipo);
  if (section) renderList(section);
  else renderHub();
}
initNews().catch(() => {});
