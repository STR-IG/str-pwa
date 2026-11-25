import { CONTENIDOS, ordenarPorFecha } from './actividad-sindical-datos.mjs';
import { initNews } from './novedades.js';
import { markPublishedIssueRead, renderPublishedIssue, renderWorkCategory } from './actividad-sindical-seguimiento.js?v=miniatura-plazas-vao';

const HUB = 'actividad-informacion-sindical.html';
const PENDING = 'PENDIENTE DE REDACTAR';
const sections = [
  { vista: 'resumenes', titulo: 'Resumen del mes', subtitulo: 'Lo importante de cada mes, en 1 minuto', miniatura: 'actividad-menu-resumen.webp', tipo: 'resumen', enlace: 'resumen-mensual.html' },
  { vista: 'proyectos', titulo: 'En qué estamos trabajando', miniatura: 'actividad-menu-trabajo.webp', tipo: 'proyecto' },
  { vista: 'reuniones', titulo: 'Actas y reuniones', subtitulo: 'Lo que hablamos con la empresa', miniatura: 'actividad-menu-actas.webp', tipo: 'reunión' },
  { vista: 'logros', titulo: 'Nuestros logros', miniatura: 'actividad-menu-logros.webp', tipo: 'logro' },
  { vista: 'opinion', titulo: 'Artículos de opinión', subtitulo: 'Publicaciones y reflexiones de STR', miniatura: 'actividad-menu-opinion.webp', tipo: 'opinion', enlace: 'articulos-opinion.html' }
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

const workSections = [
  { id: 'sharepoint', titulo: 'Filtración de datos en SharePoint', subtitulo: 'Abierto · Exigimos respuestas. Queremos saber hasta dónde llegó.', miniatura: 'boton-sharepoint-candado.webp' },
  { id: 'movilidad', titulo: 'Movilidad', subtitulo: 'Cargadores, transporte desde el Maresme y plazas VAO', miniatura: 'boton-movilidad-recarga-bus.png' },
  { id: 'comedor', titulo: 'Comedor', subtitulo: 'Seguimiento con la empresa', miniatura: 'boton-comedor-seguimiento.webp' }
];
const workList = HUB + '?vista=proyectos';

function renderWorkList() {
  for (const section of workSections) {
    main.append(navigationCard(section, workList + '&seccion=' + section.id));
  }
}

function renderWorkDetail(section) {
  screen(section.titulo, workList, 'En qué estamos trabajando');
  if (section.id === 'sharepoint') {
    const topic = CONTENIDOS.find(entry => entry.id === section.id);
    const card = listingCard(topic);
    card.querySelector('h2').remove();
    main.append(card);
  } else {
    renderWorkCategory(main, section.titulo, CONTENIDOS);
  }
}

function renderMeetings() {
  const categories = [['todas','Todas'],['comedor','Comedor'],['direccion','Dirección'],['rrhh','RR. HH.'],['formacion','Formación'],['calendarios','Calendarios'],['movilidad','Movilidad']];
  const style = element('style');
  style.textContent = `
    body.meetings-feed {background:#fff;color:#171717}
    .meetings-feed #activity-content {display:block; padding-top:0}
    .meeting-tabs {display:flex;gap:8px;overflow-x:auto;padding:14px 0;scrollbar-width:none;border-bottom:1px solid #e5e5e5}
    .meeting-tabs::-webkit-scrollbar {display:none}
    .meeting-tabs button {flex:none;border:0;border-radius:999px;padding:12px 17px;background:#fbe5e7;color:#b9000b;font:600 16px Arial;cursor:pointer}
    .meeting-tabs button[aria-pressed=true] {background:#e30613;color:#fff}
    .meeting-feed-item {padding:22px 0;border-bottom:1px solid #e5e5e5}
    .meeting-feed-item img {display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:16px;margin-bottom:15px}
    .meeting-feed-item h2 {font-size:24px;line-height:1.22;margin:8px 0;color:#171717}
    .meeting-feed-item a {color:inherit;text-decoration:none;display:block}
    .meeting-feed-item p {border-left:3px solid #e30613;padding-left:12px;color:#626269;line-height:1.5;margin:12px 0}
    .meeting-feed-item .meeting-kicker {color:#b9000b;font-size:13px;font-weight:700;text-transform:uppercase}
    .meeting-feed-item .meeting-date {color:#666;font-size:14px}
    .meeting-feed-item .meeting-more {color:#b9000b;font-weight:700;margin-top:12px}
    .meeting-feed-item.compact img {float:left;width:34%;aspect-ratio:4/3;margin:0 14px 10px 0}
    .meeting-feed-item.compact h2 {font-size:19px}
    .meeting-feed-item.compact {display:flow-root}
    .meeting-empty {padding:28px 0;color:#666}
  `;
  document.head.append(style);
  document.body.classList.add('meetings-feed');
  const tabs = element('nav','','meeting-tabs');
  tabs.setAttribute('aria-label','Categorías de actas y reuniones');
  const feed = element('section');
  const entries = ordenarPorFecha(CONTENIDOS.filter(entry => entry.tipo === 'reunión')).map(entry => ({...entry, group: entry.id === 'reunion-comedor-2026-09' ? 'comedor' : (categories.find(([id,label]) => id === entry.categoria || label === entry.categoria)?.[0] || 'otras'), photo: entry.imagen || (entry.id === 'reunion-comedor-2026-09' ? 'boton-comedor-seguimiento.webp' : '')}));
  const follow = {titulo:'Seguimiento del comedor',group:'comedor',enlace:'seguimiento-del-comedor.html',photo:'boton-comedor-seguimiento.webp',resumen:'Consulta el seguimiento del servicio de comedor.'};
  function select(id) {
    for (const button of tabs.children) button.setAttribute('aria-pressed',String(button.dataset.category===id));
    feed.replaceChildren();
    const visible = entries.filter(entry => id==='todas'||entry.group===id);
    if (id==='todas'||id==='comedor') visible.push(follow);
    if (!visible.length) feed.append(element('p','Todavía no hay publicaciones en esta sección.','meeting-empty'));
    visible.forEach((entry,index)=>{
      const card=element('article','','meeting-feed-item'+(index?' compact':''));
      const a=link('',entry.enlace);
      if(entry.photo){const image=element('img');image.src=entry.photo;image.alt='';image.loading=index?'lazy':'eager';a.append(image);}
      a.append(element('div',categories.find(([key])=>key===entry.group)?.[1] || 'Reuniones','meeting-kicker'));
      a.append(element('h2',entry.titulo));
      if(hasDate(entry.fecha)){const time=element('time',dateFormat.format(new Date(entry.fecha)),'meeting-date');time.dateTime=entry.fecha;a.append(time);}
      if(entry.resumen)a.append(element('p',entry.resumen));
      a.append(element('span','Ver resumen →','meeting-more'));
      card.append(a);feed.append(card);
    });
  }
  for(const [id,label] of categories){const button=element('button',label);button.type='button';button.dataset.category=id;button.addEventListener('click',()=>select(id));tabs.append(button);}
  main.append(tabs,feed);
  select('todas');
}

function renderList(section) {
  screen(section.titulo, HUB, 'Actividad e información sindical');
  if (section.tipo === 'proyecto') {
    renderWorkList();
    return;
  }
  if (section.vista === 'reuniones') { renderMeetings(); return; }
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
        if (entry.id === 'pluses-especiales') {
          group.append(navigationCard({
            id: entry.id,
            titulo: entry.titulo,
            miniatura: 'boton-pluses-navidad.webp',
          }, entry.enlace));
        } else {
          group.append(listingCard(entry));
        }
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

function photoNavigationCard(image, title, href, subtitle) {
  const row = element('div', '', 'photo-navigation-row');
  const thumbnail = element('div', '', 'photo-navigation-thumbnail');
  thumbnail.append(image);

  const card = link('', href, 'photo-navigation-link');
  const copy = element('div', '', 'navigation-copy');
  copy.append(element('h2', title));
  if (subtitle) copy.append(element('small', subtitle));

  const arrow = element('span', '›', 'photo-navigation-arrow');
  arrow.setAttribute('aria-hidden', 'true');
  card.append(copy, arrow);
  row.append(thumbnail, card);
  return row;
}

function navigationCard(section, href) {
  const card = link('', href, 'post navigation-card');
  if (section.id === 'sharepoint' || section.id === 'movilidad' || section.id === 'comedor' || section.id === 'pluses-especiales') card.classList.add('navigation-card-sharepoint');
  const copy = element('div', '', 'navigation-copy');
  copy.append(element('h2', section.titulo));
  if (section.subtitulo) {
    copy.append(element('small', section.subtitulo));
  }
  const icon = element('span', '', 'navigation-icon');
  icon.setAttribute('aria-hidden', 'true');
  if (section.miniatura) {
    icon.classList.add('navigation-thumbnail');
    const image = element('img');
    image.src = section.miniatura;
    image.alt = '';
    image.width = 72;
    image.height = 72;
    image.loading = 'lazy';
    image.decoding = 'async';
    icon.append(image);
  } else {
    icon.innerHTML = section.icono;
  }
  card.append(icon, copy);
  const arrow = element('span', '›', 'arrow');
  arrow.setAttribute('aria-hidden', 'true');
  card.append(arrow);
  return card;
}

function renderHub() {
  document.body.classList.add('activity-hub');
  screen('Actividad e información sindical', 'app.html', 'menú principal');
  for (const section of sections) {
    main.append(navigationCard(section, section.enlace || HUB + '?vista=' + section.vista));
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
  const workDetail = section?.vista === 'proyectos'
    ? workSections.find(item => item.id === (params.get('seccion') || location.hash.slice(1)))
    : undefined;
  if (workDetail) renderWorkDetail(workDetail);
  else if (section) renderList(section);
  else renderHub();
}
initNews().catch(() => {});
