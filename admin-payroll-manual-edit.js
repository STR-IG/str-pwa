(() => {
  const params = new URLSearchParams(window.location.search);
  if (!String(params.get('adminAffiliate') || '').trim()) return;

  function unlockAdminPayrollInputs() {
    const fields = document.getElementById('comparison-fields');
    if (fields) {
      fields.querySelectorAll('input, textarea').forEach((control) => {
        if (control.readOnly) control.readOnly = false;
      });
    }

    const form = document.getElementById('comparison-form');
    const editButton = document.getElementById('edit-payroll-values');
    const confirmButton = document.getElementById('confirm-comparison');
    if (form && !form.hidden && editButton && confirmButton?.dataset.action === 'back') {
      editButton.hidden = false;
    }
  }

  const observer = new MutationObserver(() => queueMicrotask(unlockAdminPayrollInputs));
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden', 'readonly', 'data-action']
  });

  window.addEventListener('load', unlockAdminPayrollInputs);
  document.addEventListener('DOMContentLoaded', unlockAdminPayrollInputs, { once: true });
  setTimeout(unlockAdminPayrollInputs, 0);
})();
