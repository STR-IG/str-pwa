const SUPABASE_URL = 'https://icneigdnuntzugisexaz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m';
const VAPID_PUBLIC_KEY = 'BBTztbyStE4bSwPnFrwgub5t2EY96fogT6LQaiD4lkSa31PC3IDmXsCDbHsc2LxRA3_i2fUH-chHpz2cGkUwyHQ';
const READ_STORAGE_KEY = 'str_news_read_ids';
const DEVICE_STORAGE_KEY = 'str_push_device_id';
const ONBOARDING_STORAGE_KEY = 'str_push_onboarding_dismissed';
const MENU_LEGACY_KEY = 'str_menu_seen_version';
const DEFAULT_NEWS = [{
  id: 'menu-2026-09',
  category: 'menu',
  published_at: '2026-09-03T12:37:11Z',
  url: 'menu-comedor.html',
  active: true,
}];

let newsPromise;

function applyHomeCarousels() {
  if (document.getElementById('str-home-carousel-layout')) return;
  const style = document.createElement('style');
  style.id = 'str-home-carousel-layout';
  style.textContent = `
    .news-grid,
    .list {
      display:flex !important;
      gap:12px !important;
      overflow-x:auto !important;
      overflow-y:hidden !important;
      padding-bottom:10px !important;
      scroll-snap-type:x mandatory !important;
      -webkit-overflow-scrolling:touch;
      scrollbar-width:none;
    }
    .news-grid::-webkit-scrollbar,
    .list::-webkit-scrollbar { display:none; }

    .news-grid > .news-card,
    .list > .list-item {
      flex:0 0 calc((100% - 24px) / 3) !important;
      width:auto !important;
      min-width:0 !important;
      aspect-ratio:1.5 / 1 !important;
      scroll-snap-align:start;
      overflow:hidden !important;
      border-radius:20px !important;
      box-sizing:border-box;
    }

    .news-grid > .news-card {
      display:flex !important;
      flex-direction:column;
    }

    .activity-news-card img,
    .list > .list-item:first-child img {
      width:100% !important;
      height:100% !important;
      object-fit:cover !important;
      display:block !important;
    }

    .news-grid > .news-card:not(.activity-news-card) .news-image {
      flex:0 0 42%;
      height:auto !important;
    }
    .news-grid > .news-card:not(.activity-news-card) .news-content {
      flex:1;
      min-height:0;
      overflow:hidden;
      padding:14px !important;
    }

    .list > .list-item { padding:16px !important; }
    .list > .list-item:first-child { padding:0 !important; }

    @media (max-width:700px) {
      .news-grid > .news-card,
      .list > .list-item {
        flex:0 0 245px !important;
        width:245px !important;
        min-width:245px !important;
        aspect-ratio:1.5 / 1 !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function applyPrivateAreaLayout() {
  const privateHeading = Array.from(document.querySelectorAll('.area-heading'))
    .find((heading) => heading.textContent.trim().toUpperCase() === 'ÁREA PRIVADA');
  const grid = privateHeading?.nextElementSibling;
  if (!grid?.classList.contains('area-grid')) return;

  const cards = Array.from(grid.children);
  const byImage = (src) => cards.find((card) => card.querySelector(`img[src="${src}"]`));
  const review = byImage('revisa-tu-nomina-card.png');
  const calculateV = byImage('calcula-tu-v.png');
  const personalArea = byImage('mi-espacio-str-ig.png');
  if (!review || !calculateV || !personalArea) return;

  let statistics = byImage('card-estadisticas-nomina.png');
  if (!statistics) {
    statistics = document.createElement('article');
    statistics.className = 'quick-card menu-image-card';
    statistics.setAttribute('aria-label', 'Estadísticas de nómina, próximamente');
    statistics.innerHTML = '<img src="card-estadisticas-nomina.png" alt="Estadísticas de nómina, área privada">';
  }

  grid.replaceChildren(review, statistics, calculateV, personalArea);
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

function getReadIds() {
  const ids = new Set(Array.isArray(readJson(READ_STORAGE_KEY, [])) ? readJson(READ_STORAGE_KEY, []) : []);
  try {
    if (localStorage.getItem(MENU_LEGACY_KEY) === '2026-09') ids.add('menu-2026-09');
  } catch (_error) {}
  return ids;
}

function saveReadIds(ids) {
  try {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...ids]));
  } catch (_error) {}
}

async function loadNews() {
  if (!newsPromise) {
    newsPromise = fetch(`${SUPABASE_URL}/rest/v1/app_news?select=id,category,published_at,url,active&active=eq.true&order=published_at.desc`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      cache: 'no-store',
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('NEWS_LOAD_FAILED')))
      .then((items) => Array.isArray(items) ? items : DEFAULT_NEWS)
      .catch(() => DEFAULT_NEWS);
  }
  return newsPromise;
}

function unreadNews(news) {
  const readIds = getReadIds();
  return news.filter((item) => item.active && !readIds.has(item.id));
}

async function setBadge(count) {
  try {
    if (count > 0 && 'setAppBadge' in navigator) await navigator.setAppBadge(count);
    else if ('clearAppBadge' in navigator) await navigator.clearAppBadge();
    else if ('setAppBadge' in navigator) await navigator.setAppBadge(0);
  } catch (_error) {}
}

function renderCategoryBadges(unread) {
  document.querySelectorAll('[data-news-category]').forEach((card) => {
    const category = card.dataset.newsCategory;
    const count = unread.filter((item) => item.category === category).length;
    const badge = card.querySelector('[data-news-badge]');
    if (!badge) return;
    badge.textContent = String(count);
    badge.setAttribute('aria-label', count === 1 ? '1 novedad sin leer' : `${count} novedades sin leer`);
    badge.classList.toggle('show', count > 0);
  });
}

async function refreshNewsBadges() {
  const news = await loadNews();
  const unread = unreadNews(news);
  renderCategoryBadges(unread);
  await setBadge(unread.length);
  return unread;
}

function getDeviceId(create = false) {
  try {
    let id = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!id && create) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_STORAGE_KEY, id);
    }
    return id;
  } catch (_error) {
    return null;
  }
}

async function subscriptionRequest(body) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/push-subscription`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('PUSH_REQUEST_FAILED');
  return response.json();
}

function applicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function setPushStatus(element, message, state = '') {
  if (!element) return;
  element.textContent = message;
  element.dataset.state = state;
}

async function enablePush(button, status) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    setPushStatus(status, 'Para recibir avisos en iPhone, instala STR-IG en la pantalla de inicio.', 'unsupported');
    return false;
  }

  button.disabled = true;
  setPushStatus(status, 'Activando avisos…');
  try {
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    if (permission !== 'granted') {
      setPushStatus(status, 'Los avisos no se han activado. Puedes permitirlos desde los ajustes.', 'denied');
      button.disabled = false;
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(VAPID_PUBLIC_KEY),
      });
    }
    const deviceId = getDeviceId(true);
    if (!deviceId) throw new Error('DEVICE_STORAGE_FAILED');
    const result = await subscriptionRequest({
      action: 'subscribe',
      deviceId,
      subscription: subscription.toJSON(),
      readNewsIds: [...getReadIds()],
    });
    await setBadge(Number(result.unreadCount) || 0);
    setPushStatus(status, 'Avisos activados.', 'enabled');
    button.textContent = 'Avisos activados';
    button.disabled = true;
    return true;
  } catch (_error) {
    setPushStatus(status, 'No se han podido activar los avisos. Inténtalo de nuevo.', 'error');
    button.disabled = false;
    return false;
  }
}

async function configurePushControl(options) {
  const buttonId = options.pushButtonId;
  const statusId = options.pushStatusId;
  const button = document.getElementById(buttonId);
  const status = document.getElementById(statusId);
  const panel = document.getElementById(options.pushPanelId);
  const onboarding = document.getElementById(options.onboardingId);
  const onboardingButton = document.getElementById(options.onboardingButtonId);
  const onboardingDismiss = document.getElementById(options.onboardingDismissId);
  if (!button) return;

  const isInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (!isInstalled) {
    if (panel) panel.hidden = true;
    return;
  }
  if (panel) panel.hidden = false;

  let onboardingDismissed = false;
  try { onboardingDismissed = localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1'; } catch (_error) {}

  const dismissOnboarding = () => {
    if (onboarding) onboarding.hidden = true;
    try { localStorage.setItem(ONBOARDING_STORAGE_KEY, '1'); } catch (_error) {}
  };

  const activated = () => {
    dismissOnboarding();
    if (panel) panel.hidden = true;
  };

  const activateFrom = async (sourceButton) => {
    const enabled = await enablePush(sourceButton, status);
    if (enabled) activated();
    return enabled;
  };

  onboardingDismiss?.addEventListener('click', dismissOnboarding);
  onboardingButton?.addEventListener('click', () => activateFrom(onboardingButton));

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    button.addEventListener('click', () => activateFrom(button));
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && Notification.permission === 'granted') {
      const deviceId = getDeviceId(true);
      if (deviceId) {
        subscriptionRequest({
          action: 'subscribe',
          deviceId,
          subscription: subscription.toJSON(),
          readNewsIds: [...getReadIds()],
        }).then((result) => setBadge(Number(result.unreadCount) || 0)).catch(() => {});
      }
      button.textContent = 'Avisos activados';
      button.disabled = true;
      setPushStatus(status, 'Recibirás un aviso genérico cuando haya una novedad.', 'enabled');
      activated();
      return;
    }
  } catch (_error) {}
  button.addEventListener('click', () => activateFrom(button));
  if (isInstalled && !onboardingDismissed && Notification.permission === 'default' && onboarding) {
    onboarding.hidden = false;
  }
}

export async function initNews(options = {}) {
  applyHomeCarousels();
  applyPrivateAreaLayout();
  await refreshNewsBadges();
  window.addEventListener('pageshow', () => refreshNewsBadges());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshNewsBadges();
  });
  if (options.pushButtonId) {
    configurePushControl(options);
  }
}

export async function markCategoryRead(category) {
  const news = await loadNews();
  const matchingIds = news.filter((item) => item.active && item.category === category).map((item) => item.id);
  if (!matchingIds.length) return refreshNewsBadges();

  const readIds = getReadIds();
  matchingIds.forEach((id) => readIds.add(id));
  saveReadIds(readIds);
  if (category === 'menu') {
    try { localStorage.setItem(MENU_LEGACY_KEY, '2026-09'); } catch (_error) {}
  }

  const deviceId = getDeviceId(false);
  if (deviceId) {
    subscriptionRequest({ action: 'read', deviceId, newsIds: matchingIds }).catch(() => {});
  }
  return refreshNewsBadges();
}
