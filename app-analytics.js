const SUPABASE_URL = 'https://icneigdnuntzugisexaz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m';
const VISITOR_KEY = 'str_analytics_visitor_v1';
const SESSION_KEY = 'str_analytics_session_v1';

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}
function getId(storage, key) {
  try {
    let value = storage.getItem(key);
    if (!value) { value = uuid(); storage.setItem(key, value); }
    return value;
  } catch (_) { return uuid(); }
}
const visitorId = getId(localStorage, VISITOR_KEY);
const sessionId = getId(sessionStorage, SESSION_KEY);

function clean(value, max) {
  return value == null ? null : String(value).trim().slice(0, max);
}
function inferArea() {
  return document.documentElement.dataset.analyticsArea === 'private' ? 'private' : 'public';
}
function inferSection() {
  const explicit = document.documentElement.dataset.analyticsSection;
  if (explicit) return clean(explicit, 120);
  return clean(location.pathname.split('/').pop()?.replace(/\.html$/i, '') || 'inicio', 120);
}
export async function track(eventType, target = null) {
  const payload = {
    visitor_id: visitorId,
    session_id: sessionId,
    event_type: eventType,
    area: inferArea(),
    section: inferSection(),
    target: clean(target, 120),
    path: clean(location.pathname + location.hash, 160),
    environment: 'production'
  };
  try {
    await fetch(SUPABASE_URL + '/rest/v1/app_analytics_events', {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
  } catch (_) {}
}
function targetFor(anchor) {
  return clean(
    anchor.dataset.analyticsTarget ||
    anchor.getAttribute('aria-label') ||
    anchor.querySelector('img')?.alt ||
    anchor.querySelector('h2,h3,strong')?.textContent ||
    anchor.getAttribute('href'),
    120
  );
}
track('page_view');
document.addEventListener('click', event => {
  const anchor = event.target.closest('a[href]');
  if (!anchor) return;
  track('card_click', targetFor(anchor));
}, { capture: true });
