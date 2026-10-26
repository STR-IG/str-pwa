import { CARD_LABELS } from './card-catalog.mjs?v=1';
const ENDPOINT = 'https://icneigdnuntzugisexaz.supabase.co/rest/v1/rpc/record_card_access';
const KEY = 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m';
for (const key of ['str_analytics_visitor_v1', 'str_analytics_session_v1']) {
  try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch {}
}
try { indexedDB.deleteDatabase('str-ig-analytics'); } catch {}
try { sessionStorage.removeItem('strPublicDutyDraftV1'); } catch {}
export function cardDestination(href, base = location.href) {
  try {
    const current = new URL(base), target = new URL(href, current);
    if (target.origin !== current.origin || !target.pathname.startsWith('/str-pwa/')) return null;
    let card = target.pathname.slice('/str-pwa/'.length) || 'index.html';
    if (card === 'acceso-privado.html') {
      const next = target.searchParams.get('next');
      if (Object.hasOwn(CARD_LABELS, next)) card = next;
    }
    if (card === 'revisa-nomina.html') card = 'revisa-tu-nomina.html';
    return Object.hasOwn(CARD_LABELS, card) ? card : null;
  } catch { return null; }
}
export async function track(eventType, card) {
  if (eventType !== 'card_click' || !Object.hasOwn(CARD_LABELS, card)) return;
  try {
    await fetch(ENDPOINT, {
      method: 'POST', keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_card: card })
    });
  } catch { /* Statistics never affect navigation; no persistent retry queue. */ }
}
document.addEventListener('click', event => {
  const anchor = event.target.closest?.('a[href]');
  if (!anchor || anchor.dataset.analyticsIgnore != null) return;
  if (!anchor.matches('.quick-card,.menu-image-card,.news-card,.image-card,.option,.module,.post-media,.permit-link,[data-news-category],[data-analytics-target]')) return;
  const card = cardDestination(anchor.getAttribute('href'));
  if (card) void track('card_click', card);
}, { capture: true });
