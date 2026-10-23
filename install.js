(() => {
  const android = document.getElementById('install-android');
  const iphone = document.getElementById('install-iphone');
  const status = document.getElementById('install-status');
  let deferredPrompt;
  let androidSelected = false;
  const standalone = matchMedia('(display-mode: standalone)');
  const openApp = () => location.replace('./app.html' + location.search + location.hash);
  if (standalone.matches || navigator.standalone === true) { openApp(); return; }
  standalone.addEventListener('change', () => { if (standalone.matches) openApp(); });
  document.querySelectorAll('.install-url').forEach(link => { link.href = new URL('./', location.href).href; link.textContent = link.href; });
  function guide(platform) {
    for (const name of ['android', 'iphone']) {
      const selected = name === platform;
      document.getElementById(`${name}-guide`).hidden = !selected;
      document.getElementById(`install-${name}`).setAttribute('aria-expanded', String(selected));
    }
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    if (androidSelected) status.textContent = 'La instalación está disponible. Pulsa de nuevo Instalar en Android.';
  });
  android.addEventListener('click', async () => {
    androidSelected = true;
    guide('android');
    status.textContent = '';
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    deferredPrompt = null;
    android.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      status.textContent = choice.outcome === 'accepted' ? 'Confirma la instalación y abre STR-IG desde el icono de tu móvil.' : 'Puedes volver a intentarlo desde el menú de Chrome.';
    } catch {
      status.textContent = 'Sigue los pasos de Chrome para instalar la app.';
    } finally { android.disabled = false; }
  });
  const title = document.getElementById('screen-title');
  const intro = document.getElementById('screen-intro');
  const copyStatus = document.getElementById('copy-status');
  const iphoneInstallUrl = new URL('./', location.href);
  iphoneInstallUrl.searchParams.set('install', 'iphone');
  document.querySelectorAll('#iphone-guide .install-url').forEach(link => {
    link.href = iphoneInstallUrl.href;
    link.textContent = iphoneInstallUrl.href;
  });
  iphone.addEventListener('click', () => {
    androidSelected = false;
    guide('iphone');
    status.textContent = '';
    document.querySelector('.actions').hidden = true;
    intro.hidden = true;
    copyStatus.textContent = '';
    title.textContent = 'Instalar en iPhone';
    document.body.classList.add('iphone-guide-open');
    title.focus();
    window.scrollTo(0, 0);
  });
  document.getElementById('copy-iphone-link').addEventListener('click', async () => {
    const url = iphoneInstallUrl.href;
    try {
      await navigator.clipboard.writeText(url);
      copyStatus.textContent = 'Enlace copiado. Abre Safari y sigue el paso 2.';
    } catch {
      copyStatus.textContent = 'Mantén pulsado el enlace de abajo y elige Copiar enlace. Después sigue el paso 2.';
    }
  });
  document.getElementById('iphone-back').addEventListener('click', () => {
    document.getElementById('iphone-guide').hidden = true;
    iphone.setAttribute('aria-expanded', 'false');
    document.querySelector('.actions').hidden = false;
    intro.hidden = false;
    title.textContent = 'Instala STR-IG';
    document.body.classList.remove('iphone-guide-open', 'resume-iphone');
    iphone.focus();
    window.scrollTo(0, 0);
  });
  if (new URLSearchParams(location.search).get('install') === 'iphone') {
    iphone.click();
    document.body.classList.add('resume-iphone');
    title.textContent = 'Ahora pulsa Compartir';
    document.getElementById('copy-status').textContent = 'Ya has abierto el enlace. Si estás en Safari, continúa en el paso 3: Pulsa Compartir.';
  }
  window.addEventListener('appinstalled', () => { deferredPrompt = null; status.textContent = 'App instalada. Ábrela desde el icono de tu pantalla de inicio.'; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js', {updateViaCache:'none'}).then(registration => registration.update()).catch(() => {});
})();
