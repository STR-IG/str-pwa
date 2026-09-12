(() => {
  function isAdminPayrollMode() {
    const params = new URLSearchParams(window.location.search);
    return Boolean(String(params.get('adminAffiliate') || '').trim())
      || Boolean(document.getElementById('admin-context') && !document.getElementById('admin-context').hidden);
  }

  function unlockAdminPayrollInputs() {
    if (!isAdminPayrollMode()) return;

    const fields = document.getElementById('comparison-fields');
    if (fields) {
      fields.querySelectorAll('input, textarea').forEach((control) => {
        control.readOnly = false;
        control.removeAttribute('readonly');
        control.disabled = false;
        control.removeAttribute('disabled');
      });
      fields.querySelectorAll('select').forEach((control) => {
        control.disabled = false;
        control.removeAttribute('disabled');
      });
    }

    const form = document.getElementById('comparison-form');
    const editButton = document.getElementById('edit-payroll-values');
    const confirmButton = document.getElementById('confirm-comparison');
    if (form && !form.hidden && editButton && confirmButton?.dataset.action === 'back') {
      editButton.hidden = false;
    }
  }

  const observer = new MutationObserver(() => unlockAdminPayrollInputs());
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden', 'readonly', 'disabled', 'data-action']
  });

  document.addEventListener('focusin', unlockAdminPayrollInputs, true);
  document.addEventListener('click', unlockAdminPayrollInputs, true);
  window.addEventListener('load', unlockAdminPayrollInputs);
  document.addEventListener('DOMContentLoaded', unlockAdminPayrollInputs, { once: true });

  // Salvaguarda frente a renderizados posteriores del flujo base que vuelvan a marcar
  // los campos como solo lectura en modo administrador.
  setInterval(unlockAdminPayrollInputs, 250);
  unlockAdminPayrollInputs();
})();
