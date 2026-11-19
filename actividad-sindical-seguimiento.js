// Cambiar revision al publicar una novedad en una ficha. Omitirla para contenido histórico.
const categories = [
  {
    title: 'Movilidad',
    issues: [
      { id: 'precio-kwh', title: 'Precio del kWh de los cargadores eléctricos', revision: 1, existingId: 'precio-recarga' },
      { id: 'transporte-maresme', title: 'Transporte colectivo desde el Maresme', revision: 1 },
      { id: 'plazas-vao', title: 'Plazas VAO', revision: 1 },
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
  for (const { dot, issues } of indicators) {
    dot.hidden = !issues.some(unread);
    const home = dot.closest('.sindical-news-card');
    if (home) {
      home.setAttribute('aria-label', dot.hidden
        ? 'Actividad e información sindical'
        : 'Actividad e información sindical, novedades de seguimiento sin consultar');
    }
  }
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function addIndicator(parent, issues) {
  const dot = node('span', '', 'activity-dot');
  dot.setAttribute('role', 'img');
  dot.setAttribute('aria-label', 'Novedades sin consultar');
  parent.append(dot);
  indicators.push({ dot, issues });
}

function issuePanel(issue, existing) {
  const panel = node('details', '', 'activity-issue');
  const summary = node('summary', issue.title);
  addIndicator(summary, [issue]);
  const status = issue.status || (existing?.estado === 'en curso'
    ? 'En curso · detalles pendientes de validación'
    : 'Pendiente de validación');
  panel.append(summary, node('p', status, 'activity-status'));
  if (existing?.resumen) panel.append(node('p', existing.resumen));
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
  if (existing?.enlace) {
    const detail = node('a', 'Consultar la propuesta de STR', 'primary');
    detail.href = existing.enlace;
    panel.append(detail);
  }
  panel.addEventListener('toggle', () => {
    if (panel.open && panel.closest('.activity-category').open) {
      markRead(issue);
      refreshIndicators();
    }
  });
  return panel;
}

const allIssues = categories.flatMap(category => category.issues);
const homeDot = document.querySelector('[data-activity-home-dot]');
if (homeDot) indicators.push({ dot: homeDot, issues: allIssues });

export function addWorkIndicator(link) {
  addIndicator(link, allIssues);
  refreshIndicators();
}

export function renderWorkCategories(work, existingContent) {
  for (const category of categories) {
    if (!category.issues.length) continue;
    const panel = node('details', '', 'post activity-category');
    const summary = node('summary', category.title);
    addIndicator(summary, category.issues);
    panel.append(summary);
    const body = node('div', '', 'activity-category-body');
    for (const issue of category.issues) {
      const existing = existingContent.find(entry => entry.id === issue.existingId);
      body.append(issuePanel(issue, existing));
    }
    panel.append(body);
    work.append(panel);
  }
  refreshIndicators();
}

refreshIndicators();
window.addEventListener('pageshow', refreshIndicators);
window.addEventListener('storage', refreshIndicators);
