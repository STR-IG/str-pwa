(() => {
  const panel = document.getElementById('install-panel');
  const choice = document.getElementById('install-choice');
  const iosGuide = document.getElementById('install-ios');
  const androidGuide = document.getElementById('install-other');
  const button = document.getElementById('install-app');
  const status = document.getElementById('install-status');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let deferredPrompt;
  let installed = false;

  function showGuide(platform) {
    choice.hidden = Boolean(platform);
    iosGuide.hidden = platform !== 'iphone';
    androidGuide.hidden = platform !== 'android';
    render();
  }

  function render() {
    panel.hidden = installed || standalone.matches || navigator.standalone === true;
    button.hidden = !deferredPrompt || androidGuide.hidden || panel.hidden;
  }

  document.getElementById('install-choose-iphone').addEventListener('click', () => showGuide('iphone'));
  document.getElementById('install-choose-android').addEventListener('click', () => showGuide('android'));
  document.getElementById('install-back-iphone').addEventListener('click', () => showGuide(null));
  document.getElementById('install-back-android').addEventListener('click', () => showGuide(null));

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    render();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    render();
  });
  standalone.addEventListener('change', render);
  button.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    deferredPrompt = null;
    button.hidden = true;
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      status.textContent = result.outcome === 'accepted'
        ? 'Has aceptado la instalación. Sigue las indicaciones del navegador.'
        : 'Puedes instalarla más tarde desde el menú del navegador.';
    } catch (_error) {
      status.textContent = 'Abre el menú del navegador y elige Instalar aplicación o Añadir a pantalla de inicio.';
    }
  });
  render();
})();