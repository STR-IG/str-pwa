// Cambiar revision al publicar una novedad en una ficha. Omitirla para contenido histórico.
const categories = [
  {
    title: 'Movilidad',
    issues: [
      { id: 'precio-kwh', title: 'Precio del kWh de los cargadores eléctricos', revision: 2, existingId: 'precio-recarga' },
      { id: 'transporte-maresme', title: 'Transporte colectivo desde el Maresme', revision: 1, image: 'boton-movilidad-maresme.webp', href: 'transporte-maresme-detalle.html' },
      { id: 'plazas-vao', title: 'Plazas VAO para coche compartido', revision: 1, image: 'plazas-vao-icono.png', href: 'plazas-vao-detalle.html' },
    ],
  },
  { title: 'Condiciones laborales', issues: [] },
  { title: 'Salarios y complementos', issues: [] },
  {
    title: 'Comedor',
    issues: [{
      id: 'servicio-comedor',
      title: 'Mejoras del servicio de comedor',
      status: 'Situación actual pendiente de validación',
      actions: [
        'Si sube el precio, STR pidió que todos los turnos tengan la misma oferta y calidad.',
        'STR pidió suficiente cantidad y reposición en los bufés, con capacidad adecuada para evitar el control de las raciones.',
      ],
      update: 'El 7 de septiembre de 2026, la empresa y Sodexo recogieron las aportaciones de STR.',
      source: 'comunicado-comedor.html',
    }],
  },
  { title: 'Prevención', issues: [] },
];

const keyPrefix = 'str-actividad-sindical-vista:';
const sessionReads = new Set();
const indicators = [];

function unread(issue) {
  if (!issue.revision) return false;
  const key = keyPrefix + issue.id + ':' + issue.revision;
  if (sessionReads.has(key)) return false;
  try {
    return localStorage.getItem(key) !== '1';
  } catch {
    return true;
  }
}

function markRead(issue) {
  if (!unread(issue)) return;
  const key = keyPrefix + issue.id + ':' + issue.revision;
  sessionReads.add(key);
  try {
    localStorage.setItem(key, '1');
  } catch {
    // En modo restringido se conserva la lectura mientras la página siga abierta.
  }
}

function refreshIndicators() {
  for (const { badge, issues, card, legacyBadge } of indicators) {
    const legacyCount = Number(legacyBadge?.textContent) || 0;
    const count = issues.filter(unread).length + legacyCount;
    const label = count === 1 ? '1 novedad sin consultar' : count + ' novedades sin consultar';
    badge.textContent = String(count);
    badge.hidden = count === 0;
    badge.setAttribute('aria-label', label);
    if (card) card.setAttribute('aria-label', count
      ? 'Actividad e información sindical, ' + label
      : 'Actividad e información sindical');
  }
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function renderPublishedIssue(container, publication) {
  for (const text of publication.parrafos) {
    const paragraph = node('p');
    text.split('**').forEach((part, index) => {
      paragraph.append(index % 2 ? node('strong', part) : part);
    });
    container.append(paragraph);
  }
  if (publication.estado) {
    const status = node('p');
    status.append(node('strong', 'Estado actual:'), ' ' + publication.estado);
    container.append(status);
  }
}

export function markPublishedIssueRead(existingId) {
  const issue = allIssues.find(item => item.existingId === existingId);
  if (issue) markRead(issue);
  refreshIndicators();
}

function issueThumbnail(src) {
  const photo = node('img');
  photo.src = src;
  photo.alt = '';
  photo.width = 64;
  photo.height = 64;
  photo.style.cssText = 'display:block;width:clamp(48px,15vw,64px);height:auto;aspect-ratio:1;object-fit:cover;border-radius:10px;flex:none';
  return photo;
}

function issuePanel(issue, existing) {
  const panel = node('section', '', 'post content-card activity-project-detail');
  const title = node('h2', issue.title);
  const status = issue.status || (existing?.estado === 'en curso'
    ? 'En curso · detalles pendientes de validación'
    : 'Pendiente de validación');
  if (issue.image) {
    const heading = node('div');
    heading.style.cssText = 'display:flex;align-items:center;gap:12px';
    heading.append(issueThumbnail(issue.image), title);
    panel.append(heading);
  } else {
    panel.append(title);
  }
  if (existing?.publicacion) {
    renderPublishedIssue(panel, existing.publicacion);
  } else {
    panel.append(node('p', status, 'activity-status'));
    if (existing?.resumen) panel.append(node('p', existing.resumen));
  }
  if (issue.actions?.length) {
    const actions = node('ul');
    for (const action of issue.actions) actions.append(node('li', action));
    panel.append(actions);
  }
  if (issue.update) panel.append(node('p', issue.update));
  if (issue.source) {
    const source = node('a', 'Ver el resumen de la reunión', 'primary');
    source.href = issue.source;
    panel.append(source);
  }
  if (existing?.enlace && !existing.publicacion) {
    const detail = node('a', 'Consultar la propuesta de STR', 'primary');
    detail.href = existing.enlace;
    panel.append(detail);
  }
  return panel;
}

const allIssues = categories.flatMap(category => category.issues);
const homeBadge = document.querySelector('[data-activity-home-count]');
if (homeBadge) {
  const card = homeBadge.closest('.sindical-news-card');
  const legacyBadge = card.querySelector('[data-news-badge]');
  if (legacyBadge) {
    legacyBadge.hidden = true;
    new MutationObserver(refreshIndicators).observe(legacyBadge, {
      childList: true, characterData: true, subtree: true,
    });
  }
  indicators.push({ badge: homeBadge, issues: allIssues, card, legacyBadge });
}

export function renderWorkCategory(work, title, existingContent) {
  const category = categories.find(item => item.title === title);
  if (!category) return;
  for (const issue of category.issues) {
    const existing = existingContent.find(entry => entry.id === issue.existingId);
    const href = issue.href || existing?.enlace;
    if ((issue.id === 'precio-kwh' || issue.image) && href) {
      const card = node('a', '', 'post navigation-card');
      card.href = href;

      const photo = issueThumbnail(issue.image || 'data:image/webp;base64,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');

      const copy = node('div', '', 'navigation-copy');
      copy.append(node('h2', issue.title));
      if (issue.id === 'precio-kwh') copy.append(node('small', 'Propuesta para bajar el precio'));
      const arrow = node('span', '›', 'arrow');
      arrow.setAttribute('aria-hidden', 'true');
      card.append(photo, copy, arrow);
      work.append(card);
    } else {
      work.append(issuePanel(issue, existing));
    }
    markRead(issue);
  }
  refreshIndicators();
}

refreshIndicators();
window.addEventListener('pageshow', refreshIndicators);
window.addEventListener('storage', refreshIndicators);
