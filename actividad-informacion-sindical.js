import { CONTENIDOS, ordenarPorFecha } from './actividad-sindical-datos.mjs';
import { initNews } from './novedades.js';
import { addWorkIndicator, markPublishedIssueRead, renderPublishedIssue, renderWorkCategories } from './actividad-sindical-seguimiento.js';

const HUB = 'actividad-informacion-sindical.html';
const PENDING = 'PENDIENTE DE REDACTAR';
const sections = [
  { vista: 'resumenes', titulo: 'Resumen del mes', subtitulo: 'Lo importante de cada mes, en 1 minuto', tipo: 'resumen', enlace: 'resumen-mensual.html' },
  { vista: 'temas', titulo: 'Temas abiertos', tipo: 'tema' },
  { vista: 'proyectos', titulo: 'En qué estamos trabajando', tipo: 'proyecto' },
  { vista: 'reuniones', titulo: 'Actas y reuniones', tipo: 'reunión' },
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
  if (entry.tipo === 'logro' && !hasDate(entry.fecha)) return;
  const row = element('div', '', 'post-date');
  const prefix = entry.tipo === 'tema' ? 'Actualizado: ' : '📅 ';
  if (entry.fecha) {
    const monthOnly = entry.tipo === 'tema' || /^\d{4}-\d{2}$/.test(entry.fecha);
    const date = (monthOnly ? monthFormat : dateFormat).format(new Date(entry.fecha));
    const time = element('time', prefix + (entry.tipo === 'tema' ? date.replace(' de ', ' ') : date));
    time.dateTime = entry.fecha;
    row.append(time);
  } else {
    row.textContent = 'Fecha: ' + PENDING;
  }
  card.append(row);
}

function hasDate(value) {
  return Boolean(value?.trim()) && !value.includes(PENDING) && !Number.isNaN(Date.parse(value));
}

function relatedLink(entry, label = 'Relacionado con: ') {
  const related = CONTENIDOS.find(item => item.id === entry.relacionado);
  if (!related) return null;
  return link(label + related.titulo, related.enlace, 'related');
}

function listingCard(entry) {
  const card = element('article', '', 'post content-card');
  if (entry.tipo === 'logro') card.classList.add('achievement-card');
  card.append(element('h2', entry.titulo));
  if (entry.estado && (entry.tipo !== 'logro' || entry.mostrarEstado)) card.append(element('span', statuses[entry.estado] || entry.estado, 'status'));
  addDate(card, entry);
  if (entry.resumen) card.append(element('p', entry.resumen));
  const buttons = element('div', '', 'post-actions');
  buttons.append(link(actions[entry.tipo], entry.enlace, 'primary'));
  card.append(buttons);
  if (entry.tipo === 'reunión') {
    card.classList.add('meeting-card');
    const related = relatedLink(entry);
    if (related) card.append(related);
  }
  if (entry.tipo === 'tema') {
    card.classList.add('topic-card', entry.estado === 'cerrado' ? 'topic-closed' : 'topic-open');
    const metadata = element('div', '', 'topic-metadata');
    metadata.append(card.querySelector('.status'), card.querySelector('.post-date'));
    card.prepend(metadata);
  }
  return card;
}

function renderTopics(entries) {
  main.append(element('p', 'Asuntos que seguimos hasta resolverlos', 'page-intro'));
  if (!entries.length) {
    main.append(element('p', 'Todavía no hay contenido aquí', 'post empty'));
    return;
  }
  for (const entry of entries.filter(item => item.estado === 'abierto')) {
    main.append(listingCard(entry));
  }
  const closed = entries.filter(item => item.estado === 'cerrado');
  if (closed.length) {
    const resolved = element('details', '', 'resolved-topics');
    resolved.append(element('summary', 'Resueltos'));
    const list = element('div', '', 'feed');
    for (const entry of closed) list.append(listingCard(entry));
    resolved.append(list);
    main.append(resolved);
  }
}

function renderList(section) {
  screen(section.titulo, HUB, 'Actividad e información sindical');
  if (section.tipo === 'proyecto') {
    renderWorkCategories(main, CONTENIDOS);
    return;
  }
  const entries = ordenarPorFecha(CONTENIDOS.filter(entry => entry.tipo === section.tipo));
  if (section.tipo === 'tema') {
    renderTopics(entries);
    return;
  }
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
  const block = element('section', '', 'detail-block');
  block.append(element('h3', title));
  if (Array.isArray(text)) {
    const list = element('ul');
    for (const item of text) list.append(element('li', item));
    block.append(list);
  } else {
    block.append(element('p', text || PENDING));
  }
  card.append(block);
  return block;
}

function detailImage(card, entry) {
  if (!entry.imagen?.trim()) return;
  const image = element('img', '', 'content-image');
  image.src = entry.imagen.trim();
  image.alt = entry.titulo;
  card.append(image);
}

function renderDetail(entry) {
  const section = sections.find(item => item.tipo === entry.tipo);
  screen(entry.titulo, HUB + '?vista=' + section.vista, section.titulo);
  const card = element('article', '', 'post content-card');
  if (entry.tipo === 'logro') {
    document.body.classList.add('achievement-detail');
    card.classList.add('achievement-detail-card');
  }
  if (entry.tipo === 'proyecto' && !entry.publicacion) card.append(element('span', statuses[entry.estado] || entry.estado, 'status'));
  const ficha = entry.ficha || {};
  if (entry.publicacion) {
    renderPublishedIssue(card, entry.publicacion);
    markPublishedIssueRead(entry.id);
  } else if (entry.tipo === 'proyecto') {
    detailImage(card, entry);
    detailBlock(card, 'Qué proponemos', ficha.objetivo);
    detailBlock(card, 'Qué hemos hecho', ficha.actuaciones);
    detailBlock(card, 'Próximo paso', ficha.proximoPaso);
    if (entry.precioActualKwh) detailBlock(card, 'Precio actual por kWh', entry.precioActualKwh);
  } else {
    detailBlock(card, 'Qué se consiguió', ficha.objetivo);
    detailImage(card, entry);
    if (ficha.norma) {
      const block = detailBlock(card, 'Qué dice la norma', ficha.norma);
      if (entry.enlaceNorma) block.append(link('Consultar el BOE →', entry.enlaceNorma, 'related'));
    }
    detailBlock(card, 'Qué hizo STR', ficha.actuaciones);
    const when = ficha.cuando?.trim();
    if (hasDate(entry.fecha) && when && !when.includes(PENDING)) {
      detailBlock(card, 'Cuándo', when);
    } else if (hasDate(entry.fecha)) {
      detailBlock(card, 'Cuándo', dateFormat.format(new Date(entry.fecha)));
    }
  }
  const related = relatedLink(entry);
  if (entry.siguientePaso && !related) {
    detailBlock(card, 'Siguiente paso', entry.siguientePaso);
  }
  if (related) {
    if (entry.siguientePaso) {
      const block = detailBlock(card, 'Siguiente paso', entry.siguientePaso);
      const buttons = element('div', '', 'post-actions');
      related.className = 'primary';
      related.textContent = 'Ver el proyecto →';
      buttons.append(related);
      block.append(buttons);
    } else if (entry.textoRelacionado) {
      const block = element('section', '', 'detail-block');
      related.textContent = entry.textoRelacionado;
      block.append(element('h3', 'Relacionado'), related);
      card.append(block);
    } else {
      card.append(related);
    }
  }
  main.append(card);
}

function renderHub() {
  screen('Actividad e información sindical', 'app.html', 'menú principal');
  for (const section of sections) {
    const card = link('', section.enlace || HUB + '?vista=' + section.vista, 'post navigation-card');
    const copy = element('div', '', 'navigation-copy');
    copy.append(element('h2', section.titulo));
    if (section.tipo === 'proyecto') addWorkIndicator(copy.querySelector('h2'));
    if (section.subtitulo) copy.append(element('small', section.subtitulo));
    card.append(copy);
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
