import { CONTENIDOS, ordenarPorFecha } from './actividad-sindical-datos.mjs';
import { initNews } from './novedades.js';
import { markPublishedIssueRead, renderPublishedIssue, renderWorkCategories } from './actividad-sindical-seguimiento.js';

const HUB = 'actividad-informacion-sindical.html';
const PENDING = 'PENDIENTE DE REDACTAR';
const sections = [
  { vista: 'resumenes', titulo: 'Resumen del mes', icono: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5h2m4 0h2m-8 3h2"/></svg>', subtitulo: 'Lo importante de cada mes, en 1 minuto', tipo: 'resumen', enlace: 'resumen-mensual.html' },
  { vista: 'proyectos', titulo: 'En qué estamos trabajando', icono: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5-5l2.3 2.3-2.4 2.4-2.3-2.3a4 4 0 0 0 5 5L3.4 17.6a2 2 0 0 0 2.8 2.8l8.9-8.9a4 4 0 0 0 5-5l-2.3 2.3-2.4-2.4 2.3-2.3a4 4 0 0 0-3 .2"/></svg>', subtitulo: 'Movilidad y comedor', tipo: 'proyecto' },
  { vista: 'reuniones', titulo: 'Actas y reuniones', icono: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="3"/><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m2-16a3 3 0 0 1 0 6m4 10v-2a4 4 0 0 0-3-3.9"/></svg>', subtitulo: 'Lo que hablamos con la empresa', tipo: 'reunión' },
  { vista: 'logros', titulo: 'Nuestros logros', icono: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8m-4-4v4M7 4h10v7a5 5 0 0 1-10 0V4Zm0 2H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4"/></svg>', subtitulo: 'Lo que hemos conseguido', tipo: 'logro' }
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
    const icon = element('span', '', 'navigation-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = section.icono;
    card.append(icon, copy);
    const arrow = element('span', '›', 'arrow');
    arrow.setAttribute('aria-hidden', 'true');
    card.append(arrow);
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
