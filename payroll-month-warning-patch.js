(() => {
  const WARNING = '⚠️';

  function decorateMonthlyWarnings(root = document) {
    const elements = root.querySelectorAll('h1, h2, h3, h4, strong, p, li');

    elements.forEach((element) => {
      const text = (element.textContent || '').trim();
      if (!text) return;

      if (/^Mes completo:\s*\d+\s+diferencia(?:s)?\s+para revisar/i.test(text)) {
        if (!text.startsWith(WARNING)) element.textContent = `${WARNING} ${text}`;
        return;
      }

      if (element.tagName === 'LI' && /\bdiferencia\s+[-+]?\d+(?:[.,]\d+)?\b/i.test(text) && !/\bcoincide\b/i.test(text)) {
        if (!text.startsWith(WARNING)) element.textContent = `${WARNING} ${text}`;
      }
    });
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorateMonthlyWarnings();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
