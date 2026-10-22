(() => {
  const panel = document.getElementById('install-panel');
  const button = document.getElementById('install-app');
  const status = document.getElementById('install-status');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)');
  let deferredPrompt;
  let installed = false;

  function render() {
    panel.hidden = installed || standalone.matches || navigator.standalone === true;
    document.getElementById('install-ios').hidden = !ios;
    document.getElementById('install-other').hidden = ios;
    button.hidden = ios || !deferredPrompt || panel.hidden;
  }

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
      const choice = await prompt.userChoice;
      status.textContent = choice.outcome === 'accepted'
        ? 'Has aceptado la instalación. Sigue las indicaciones del navegador.'
        : 'Puedes instalarla más tarde desde el menú del navegador.';
    } catch (_error) {
      status.textContent = 'Abre el menú del navegador y elige Instalar aplicación o Añadir a pantalla de inicio.';
    }
  });
  render();
})();
