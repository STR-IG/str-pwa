import { CONTENIDOS, ordenarPorFecha } from './actividad-sindical-datos.mjs';
import { initNews } from './novedades.js';
import { addWorkIndicator, markPublishedIssueRead, renderPublishedIssue, renderWorkCategories } from './actividad-sindical-seguimiento.js';

const HUB = 'actividad-informacion-sindical.html';
const PENDING = 'PENDIENTE DE REDACTAR';
const sections = [
  { vista: 'resumenes', titulo: 'Resumen del mes', subtitulo: 'Lo importante de cada mes, en 1 minuto', tipo: 'resumen', enlace: 'resumen-mensual.html' },
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
  badge.hidden = true;
  badge.setAttribute('aria-label', 'Novedades sin leer');
  card.append(badge);
  return badge;
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
  if (entry.tipo === 'tema') {
    card.classList.add('topic-card', entry.estado === 'cerrado' ? 'topic-closed' : 'topic-open');
    const metadata = element('div', '', 'topic-metadata');
    metadata.append(card.querySelector('.status'), card.querySelector('.post-date'));
    card.prepend(metadata);
    card.id = entry.id;
    if (entry.ficha?.actuaciones) detailBlock(card, 'Qué ha hecho STR', entry.ficha.actuaciones);
    if (entry.ficha?.proximoPaso) detailBlock(card, 'Qué queda pendiente', entry.ficha.proximoPaso);
  }
  card.append(buttons);
  if (entry.tipo === 'reunión') {
    card.classList.add('meeting-card');
    const related = relatedLink(entry);
    if (related) card.append(related);
  }
  return card;
}

function renderTopics(entries) {
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
    renderTopics(ordenarPorFecha(CONTENIDOS.filter(entry => entry.tipo === 'tema')));
    renderWorkCategories(main, CONTENIDOS);
    if (location.hash === '#sharepoint') document.getElementById('sharepoint')?.scrollIntoView();
    return;
  }
  if (section.vista === 'reuniones') {
    const comedor = link('', 'seguimiento-del-comedor.html', 'comedor-access');
    const image = element('img');
    image.src = 'data:image/webp;base64,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';
    image.alt = '';
    image.width = 72;
    image.height = 84;
    const arrow = element('span', '›', 'comedor-chevron');
    arrow.setAttribute('aria-hidden', 'true');
    comedor.append(element('h2', 'Comedor'), image, arrow);
    main.append(comedor);
  }
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
    if (section.subtitulo) copy.append(element('small', section.subtitulo));
    card.append(copy);
    const arrow = element('span', '›', 'arrow');
    arrow.setAttribute('aria-hidden', 'true');
    card.append(arrow);
    if (section.tipo === 'proyecto') {
      const topic = CONTENIDOS.find(entry => entry.tipo === 'tema' && entry.aviso);
      addWorkIndicator(copy.querySelector('h2'), topic ? addBadge(card, topic) : undefined);
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
  const view = params.get('vista');
  const section = sections.find(item => item.vista === (view === 'temas' ? 'proyectos' : view));
  if (section) renderList(section);
  else renderHub();
}
initNews().catch(() => {});
