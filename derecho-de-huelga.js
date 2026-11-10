function openLinkedSection() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  let current = target;
  while (current) {
    if (current.tagName === 'DETAILS') current.open = true;
    current = current.parentElement;
  }
  requestAnimationFrame(() => {
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
    const focusTarget = target.tagName === 'DETAILS' ? target.querySelector('summary') : null;
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  });
}
window.addEventListener('hashchange', openLinkedSection);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', openLinkedSection);
else openLinkedSection();
