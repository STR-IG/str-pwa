(() => {
  'use strict';

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#start-analysis');
    if (!button) return;

    try {
      const savedReview = monthlyReviews.get(periodKey());
      if (savedReview?.status !== 'complete') return;

      event.preventDefault();
      event.stopImmediatePropagation();

      // Una revisión ya guardada debe poder abrirse aunque el estado temporal
      // de la imagen de nómina no se haya restaurado al volver a la pantalla.
      documents.payroll.confirmed = true;
      startPayrollComparison(false);
    } catch (error) {
      console.error('saved-review-open-patch', error);
    }
  }, true);
})();
