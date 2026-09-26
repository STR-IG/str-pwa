(() => {
  const views = ['home', 'economic', 'register', 'comparisons'];
  const refresh = document.getElementById('refresh');
  refresh.hidden = true;
  let lastCard = null;
  let registerControlsReady = false;

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
      refresh.hidden = !['economic', 'register'].includes(selected);
      if (selected === 'register') renderRegister();
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

  const metricFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
  const registerYear = document.getElementById('register-year');
  const registerMetric = document.getElementById('register-metric');
  const registerEmpty = document.getElementById('register-empty-state');
  const registerConflict = document.getElementById('register-conflict-state');
  const registerContent = document.getElementById('register-content');
  const monthLabels = monthNames.map(name => name[0].toLocaleUpperCase('es-ES') + name.slice(1));

  function prepareRegisterControls() {
    const metrics = window.strTimesheetMetrics || [];
    if (registerControlsReady || !registerMetric) return;
    metrics.forEach(metric => registerMetric.add(new Option(metric.label, metric.key)));
    registerYear.addEventListener('change', renderRegister);
    registerMetric.addEventListener('change', renderRegister);
    registerControlsReady = true;
  }

  function renderRegisterSummary(statistics, metrics) {
    const summary = document.getElementById('register-summary');
    summary.replaceChildren();
    metrics.forEach(metric => {
      const values = statistics.metrics[metric.key];
      const card = document.createElement('article');
      card.className = 'register-summary-card';
      const label = document.createElement('span');
      label.textContent = metric.label;
      const total = document.createElement('strong');
      total.textContent = metricFormat.format(values.total);
      const note = document.createElement('small');
      note.textContent = values.months
        ? `Acumulado en ${values.months} mes${values.months === 1 ? '' : 'es'} · media ${metricFormat.format(values.monthlyAverage)}`
        : 'Sin datos confirmados este año';
      card.append(label, total, note);
      summary.append(card);
    });
  }

  function renderRegisterChart(statistics, metric) {
    const chart = document.getElementById('register-chart');
    chart.replaceChildren();
    const values = statistics.months.map(month => month.hasData && !month.conflict ? month.values[metric.key] : null);
    const maximum = Math.max(0, ...values.filter(value => value !== null));
    const wrapper = document.createElement('div');
    wrapper.className = 'register-chart-wrap';
    const columns = document.createElement('div');
    columns.className = 'register-chart';
    columns.setAttribute('aria-hidden', 'true');
    statistics.months.forEach((month, index) => {
      const column = document.createElement('div');
      column.className = 'register-chart-column';
      const value = values[index];
      const valueLabel = document.createElement('span');
      valueLabel.className = 'register-chart-value';
      valueLabel.textContent = month.conflict ? 'Revisar' : value === null ? '—' : metricFormat.format(value);
      const track = document.createElement('span');
      track.className = 'register-chart-track';
      if (value !== null && maximum > 0) {
        const bar = document.createElement('span');
        bar.className = 'register-chart-bar';
        bar.style.height = `${Math.max(3, value / maximum * 100)}%`;
        track.append(bar);
      }
      const label = document.createElement('span');
      label.className = 'register-chart-label';
      label.textContent = monthLabels[index].slice(0, 3);
      column.append(valueLabel, track, label);
      columns.append(column);
    });
    wrapper.append(columns);
    chart.append(wrapper);
    chart.setAttribute('aria-label', `Evolución mensual de ${metric.label} durante ${statistics.year}`);
  }

  function renderRegisterMonths(statistics, metric) {
    const list = document.getElementById('register-month-list');
    list.replaceChildren();
    statistics.months.forEach(month => {
      const row = document.createElement('div');
      row.className = `register-month-row${month.conflict ? ' conflict' : ''}`;
      const name = document.createElement('strong');
      name.textContent = monthLabels[month.month - 1];
      const value = document.createElement('span');
      value.textContent = month.conflict
        ? 'Registros distintos'
        : month.hasData
          ? metricFormat.format(month.values[metric.key])
          : 'Sin datos';
      row.append(name, value);
      list.append(row);
    });
    document.getElementById('register-detail-note').textContent = metric.label;
  }

  window.addEventListener('str:timesheet-statistics-loaded', () => {
    if (!document.getElementById('statistics-register').hidden) renderRegister();
  });

  function renderRegister() {
    prepareRegisterControls();
    const years = window.strAvailableTimesheetYears || [];
    const build = window.strBuildTimesheetYearStatistics;
    const metrics = window.strTimesheetMetrics || [];
    const records = window.strTimesheetReviews || [];
    if (!records.length || typeof build !== 'function' || !metrics.length) {
      registerContent.hidden = true;
      registerConflict.hidden = true;
      registerEmpty.hidden = false;
      return;
    }
    registerEmpty.hidden = true;
    const currentYear = Number(registerYear.value);
    const selectedYear = years.includes(currentYear) ? currentYear : years[0];
    registerYear.replaceChildren(...years.map(year => new Option(String(year), String(year))));
    registerYear.value = String(selectedYear);
    const statistics = build(selectedYear);
    const metric = metrics.find(item => item.key === registerMetric.value) || metrics[0];
    registerMetric.value = metric.key;
    renderRegisterSummary(statistics, metrics);
    renderRegisterChart(statistics, metric);
    renderRegisterMonths(statistics, metric);
    document.getElementById('register-summary-title').textContent = `Resumen de ${statistics.year}`;
    document.getElementById('register-summary-note').textContent =
      `${statistics.monthCount} mes${statistics.monthCount === 1 ? '' : 'es'} con datos confirmados.`;
    if (statistics.conflictMonths.length) {
      const labels = statistics.conflictMonths.map(month => monthLabels[month - 1].toLowerCase()).join(', ');
      registerConflict.textContent = `Hay diferencias entre los registros guardados en ${labels}. Esos meses aparecen como «Registros distintos» y no se incluyen en los acumulados.`;
      registerConflict.hidden = false;
    } else {
      registerConflict.hidden = true;
    }
    registerContent.hidden = false;
  }

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
