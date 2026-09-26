(() => {
  const views = ['home', 'economic', 'register', 'comparisons'];
  const refresh = document.getElementById('refresh');
  refresh.hidden = true;
  let lastCard = null;

  // Integra la card visual de Estadísticas económicas manteniendo intacta
  // la navegación y la funcionalidad existente.
  const economicCard = document.querySelector('[data-statistics-view="economic"]');
  if (economicCard) {
    economicCard.innerHTML = '';
    economicCard.style.padding = '0';
    economicCard.style.overflow = 'hidden';
    economicCard.style.border = '0';
    economicCard.style.background = 'transparent';
    economicCard.setAttribute('aria-label', 'Estadísticas económicas');
    const image = document.createElement('img');
    image.src = 'card-estadisticas-economicas.png';
    image.alt = 'Estadísticas económicas. Evolución y composición de tus nóminas guardadas.';
    image.style.display = 'block';
    image.style.width = '100%';
    image.style.height = 'auto';
    image.style.borderRadius = '22px';
    economicCard.append(image);
  }

  document.querySelectorAll('[data-statistics-view]').forEach(button => {
    button.addEventListener('click', () => {
      const selected = button.dataset.statisticsView;
      if (selected !== 'home') lastCard = button;
      views.forEach(view => {
        document.getElementById(`statistics-${view}`).hidden = view !== selected;
      });
      refresh.hidden = selected !== 'economic' && selected !== 'register';
      const target = selected === 'home' ? lastCard : document.querySelector(`#statistics-${selected} h1`);
      target?.focus();
    });
  });

  const year = document.getElementById('comparison-year');
  const month = document.getElementById('comparison-month');
  const now = new Date();
  for (let value = now.getFullYear(); value >= 2020; value--) {
    year.add(new Option(String(value), String(value)));
  }
  const monthNames = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(2020, index, 1)));
  monthNames.forEach((name, index) => month.add(new Option(name, String(index + 1))));
  month.value = String(now.getMonth() + 1);

  // Presentation only. A future adapter must reuse saved register data and extracted
  // payroll economics, preserving missing values and the units of each concept.
  // Do not read documents, infer quantities from amounts or duplicate payroll rules here.
  const concepts = [
    ['Comidas Can Guasch', 'Comidas registradas', 'Comidas abonadas'],
    ['Noches', 'Noches trabajadas', 'Nocturnidad abonada'],
    ['Jornadas de 12 h', 'Jornadas registradas', 'Plus 12 h abonado'],
    ['Sábados', 'Sábados trabajados', 'Concepto abonado'],
    ['Domingos', 'Domingos trabajados', 'Concepto abonado'],
    ['Festivos', 'Festivos trabajados', 'Concepto abonado']
  ];
  const rows = document.getElementById('comparison-rows');
  concepts.forEach(([title, registered, paid]) => {
    const row = document.createElement('div');
    row.className = 'comparison-row';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const values = document.createElement('p');
    values.className = 'comparison-values';
    values.textContent = `${registered}: — / ${paid}: —`;
    const status = document.createElement('span');
    status.className = 'comparison-status missing';
    status.textContent = '— Sin datos suficientes';
    row.append(heading, values, status);
    rows.append(row);
  });
  function renderPeriod() {
    document.getElementById('comparison-period').textContent = `${monthNames[Number(month.value) - 1]} de ${year.value}`;
  }
  year.addEventListener('change', renderPeriod);
  month.addEventListener('change', renderPeriod);
  renderPeriod();
})();
