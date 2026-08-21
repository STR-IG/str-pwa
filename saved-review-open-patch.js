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

      const savedPayroll = plainObjectToMap(savedReview.payroll);
      showComparisonScreen();
      renderPayrollComparison(savedPayroll, true, savedReview);
      setComparisonProgress(
        'ready',
        '✓',
        'Revisión mensual guardada',
        'Puedes consultar el resultado o volver a leer la nómina.'
      );
    } catch (error) {
      console.error('saved-review-open-patch', error);
    }
  }, true);
})();
