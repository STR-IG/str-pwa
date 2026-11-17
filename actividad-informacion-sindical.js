import { MONTHLY_SUMMARIES } from './resumenes-mensuales.js';
import { initNews } from './novedades.js';

// Añadir reuniones y temas aquí. Las fechas usan AAAA-MM-DD.
const topics = [
  {
    title: 'Filtración de datos en SharePoint: qué ocurrió y dónde estamos',
    date: '2026-11-01',
    summary: '',
    url: 'cronologia-sharepoint.html',
    status: 'abierto',
    action: 'Ver cronología →',
    newsCategory: 'documentation-info',
    newsId: 'documentation-explanation-2026-09-30'
  }
];
const meetings = [
  {
    title: 'Resumen reunión comedor',
    date: '2026-09-07',
    summary: 'Nos reunimos con la empresa y Sodexo para conocer la propuesta de mejora del servicio, la encuesta que se realizará a la plantilla y trasladar nuestras aportaciones.',
    url: 'comunicado-comedor.html',
    action: 'Ver resumen →'
  }
];
const achievements = [
  { title: 'Lo que hemos conseguido →', date: '', summary: '', url: 'nuestros-logros.html' }
];

const descending = entries => [...entries].sort((a, b) => b.date.localeCompare(a.date));
const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function publication(entry, category, red = false) {
  const card = document.querySelector('#publication').content.firstElementChild.cloneNode(true);
  card.querySelector('.post-category').textContent = category;
  card.querySelector('h3').textContent = entry.title;
  card.querySelector('p').textContent = entry.summary;
  card.querySelector('p').hidden = !entry.summary;
  const time = card.querySelector('time');
  time.dateTime = entry.date;
  time.textContent = dateFormat.format(new Date(entry.date));
  const link = card.querySelector('.primary');
  link.href = entry.url;
  link.textContent = entry.action;
  if (red) card.classList.add('monthly-access');
  return card;
}

const latest = descending(MONTHLY_SUMMARIES)[0];
if (latest) {
  const card = publication({
    ...latest,
    title: 'EN UN MINUTO · RESUMEN MENSUAL',
    summary: 'Lo más importante de nuestra actividad sindical cada mes, en menos de un minuto de lectura.',
    url: 'resumen-mensual.html',
    action: 'Ver resúmenes mensuales →'
  }, '', true);
  card.querySelector('.post-category').remove();
  card.querySelector('.post-date').remove();
  document.querySelector('#monthly').append(card);
}

const openTopics = descending(topics.filter(topic => topic.status === 'abierto'));
const topicSection = document.querySelector('#topics');
topicSection.hidden = openTopics.length === 0;
for (const topic of openTopics) {
  const card = publication(topic, 'Temas abiertos', true);
  card.querySelector('h3').after(card.querySelector('.post-date'));
  card.querySelector('.calendar').remove();
  card.querySelector('time').textContent = 'Actualizado: ' + monthFormat.format(new Date(topic.date));
  card.dataset.newsCategory = topic.newsCategory;
  card.dataset.newsId = topic.newsId;
  const badge = document.createElement('span');
  badge.className = 'news-notification-badge';
  badge.dataset.newsBadge = '';
  badge.setAttribute('aria-label', 'Novedades sin leer');
  badge.textContent = '0';
  card.append(badge);
  topicSection.append(card);
}

const showAll = new URLSearchParams(location.search).get('reuniones') === 'todas';
const sortedMeetings = descending(meetings);
for (const meeting of sortedMeetings.slice(0, showAll ? sortedMeetings.length : 3)) {
  const card = publication(meeting, '');
  card.querySelector('.post-category').remove();
  document.querySelector('#meetings').append(card);
}
document.querySelector('#all-meetings').hidden = showAll || meetings.length <= 3;

for (const achievement of achievements) {
  const link = document.createElement('a');
  link.className = 'post post-link achievements-link';
  link.href = achievement.url;
  link.textContent = achievement.title;
  document.querySelector('#achievements').append(link);
}
initNews().catch(() => {});
