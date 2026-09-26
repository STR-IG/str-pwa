import { buildEconomicDonuts } from './salary-overview.mjs?v=3';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { monthReceipts } from './payroll-receipts.mjs?v=1';
import {
  MONTH_NAMES,
  availableYears,
  buildYearStatistics,
  conceptTotal,
  reviewToReceipt
} from './payroll-statistics.mjs?v=2';
import {
  TIMESHEET_METRICS,
  availableTimesheetYears,
  buildTimesheetYearStatistics,
  reviewToTimesheet
} from './timesheet-statistics.mjs?v=1';
import {
  REGISTER_PAYROLL_METRICS,
  buildRegisterPayrollStatistics,
  reviewToRegisterPayrollEntry
} from './payroll-register-statistics.mjs?v=1';

const SUPABASE_URL = 'https://icneigdnuntzugisexaz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m';
const STORAGE_BUCKET = 'payroll-documents';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true }
});

const euro = new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2
});
const metricLabels = { gross: 'Bruto', net: 'Líquido', deductions: 'Deducciones' };

const authCheck = document.getElementById('auth-check');
const content = document.getElementById('content');
const refreshButton = document.getElementById('refresh');
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const emptyState = document.getElementById('empty-state');
const statisticsContent = document.getElementById('statistics-content');
const yearSelect = document.getElementById('year-select');
const accumulatedView = document.getElementById('accumulated-view');
const monthlyView = document.getElementById('monthly-view');
const accumulatedButton = document.getElementById('view-accumulated');
const monthlyButton = document.getElementById('view-monthly');
const monthSelect = document.getElementById('month-select');
const previousMonthButton = document.getElementById('previous-month');
const nextMonthButton = document.getElementById('next-month');
const registerYearSelect = document.getElementById('register-year-select');
const registerAccumulatedView = document.getElementById('register-accumulated-view');
const registerMonthlyView = document.getElementById('register-monthly-view');
const registerAccumulatedButton = document.getElementById('register-view-accumulated');
const registerMonthlyButton = document.getElementById('register-view-monthly');
const registerMonthSelect = document.getElementById('register-month-select');
const registerPreviousMonthButton = document.getElementById('register-previous-month');
const registerNextMonthButton = document.getElementById('register-next-month');
const registerComparisonCutoff = document.getElementById('register-comparison-cutoff');
const registerComparisonConcept = document.getElementById('register-comparison-concept');

let currentUserId = '';
let receipts = [];
let timesheets = [];
let registerPayrollEntries = [];
let selectedYear = new Date().getFullYear();
let selectedMonth = null;
let selectedView = 'accumulated';
let chartMetric = 'gross';
let selectedRegisterYear = new Date().getFullYear();
let selectedRegisterMonth = null;
let selectedRegisterView = 'accumulated';
let registerChartMetric = 'workedHours';
let registerComparisonMetric = 'meals';
let registerComparisonCutoffValue = 'auto';
let loadVersion = 0;
let loading = false;
let lastLoadedAt = 0;

function money(value) {
  return value === null || value === undefined ? 'Sin datos' : euro.format(value);
}

function availabilityText(summary) {
  if (!summary || summary.value === null) return 'No disponible en las nóminas guardadas';
  if (summary.complete) return `${summary.available} de ${summary.total} recibo${summary.total === 1 ? '' : 's'} con dato`;
  return `Dato parcial · ${summary.available} de ${summary.total} recibos`;
}

function clear(node) {
  node.replaceChildren();
}

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function timesheetNumber(value, unit = 'quantity') {
  if (value === null || value === undefined) return 'Sin datos';
  const formatted = value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  return unit === 'hours' ? `${formatted} h` : formatted;
}

function timesheetAvailability(summary, monthly = false) {
  if (summary?.conflict) return 'Datos distintos en las revisiones del mes';
  if (!summary || summary.value === null) return 'Sin datos confirmados';
  if (monthly) return 'Dato confirmado en el registro mensual';
  return summary.complete
    ? `${summary.available} de ${summary.total} meses con dato`
    : `Dato parcial · ${summary.available} de ${summary.total} meses`;
}

function renderTimesheetMetrics(container, period, monthly = false) {
  clear(container);
  TIMESHEET_METRICS.forEach(metric => {
    const summary = period.metrics[metric.key];
    const card = element('article', `metric-card${summary?.conflict ? ' register-conflict' : ''}`);
    card.append(
      element('span', '', metric.label),
      element('strong', '', timesheetNumber(summary?.value, metric.unit)),
      element('small', '', timesheetAvailability(summary, monthly))
    );
    container.appendChild(card);
  });
}

function renderTimesheetOthers(container, metrics, monthly = false) {
  clear(container);
  if (!metrics.length) {
    container.appendChild(element('p', 'section-note', 'No hay otros conceptos confirmados en los registros disponibles.'));
    return;
  }
  metrics.forEach(metric => {
    const row = element('div', 'concept-row');
    const copy = element('div');
    copy.append(
      element('strong', '', metric.label),
      element('small', '', timesheetAvailability(metric, monthly))
    );
    row.append(copy, element('span', 'concept-amount', timesheetNumber(metric.value)));
    container.appendChild(row);
  });
}

function renderRegisterCoverage(statistics) {
  document.getElementById('register-coverage-count').textContent = `${statistics.registerCount} de 12 meses`;
  const months = document.getElementById('register-month-status');
  clear(months);
  statistics.months.forEach(month => {
    const chip = element('span', `month-chip${month.hasData ? '' : ' missing'}`, `${month.shortLabel}: ${month.hasData ? 'Registro' : 'Sin datos'}`);
    if (month.conflict) {
      chip.classList.add('conflict');
      chip.textContent = `${month.shortLabel}: Revisar`;
    }
    months.appendChild(chip);
  });
  const note = document.getElementById('register-deduplication-note');
  note.textContent = statistics.duplicateCopies
    ? `${statistics.duplicateCopies} copia${statistics.duplicateCopies === 1 ? '' : 's'} repetida${statistics.duplicateCopies === 1 ? '' : 's'} por nóminas adicionales se ha${statistics.duplicateCopies === 1 ? '' : 'n'} excluido del total.`
    : 'Cada mes se contabiliza una sola vez, independientemente del número de nóminas.';
}

function renderRegisterChartToggle(statistics) {
  const container = document.getElementById('register-chart-metric-toggle');
  clear(container);
  TIMESHEET_METRICS.forEach(metric => {
    const button = element('button', metric.key === registerChartMetric ? 'active' : '', metric.label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(metric.key === registerChartMetric));
    button.addEventListener('click', () => {
      registerChartMetric = metric.key;
      renderRegisterChartToggle(statistics);
      renderRegisterChart(statistics);
    });
    container.appendChild(button);
  });
}

function renderRegisterChart(statistics) {
  const chart = document.getElementById('register-annual-chart');
  const selection = document.getElementById('register-chart-selection');
  clear(chart);
  selection.textContent = 'Selecciona una barra para consultar la cantidad.';
  const metric = TIMESHEET_METRICS.find(item => item.key === registerChartMetric) || TIMESHEET_METRICS[0];
  const values = statistics.months.map(month => month.metrics[metric.key].value);
  const maximum = Math.max(0, ...values.map(value => Math.abs(value || 0)));
  statistics.months.forEach(month => {
    const summary = month.metrics[metric.key];
    const column = element('div', 'chart-column');
    const track = element('div', 'bar-track');
    if (!month.hasData || summary.value === null) {
      const missing = element('span', 'chart-missing', '—');
      missing.title = `${month.label}: ${summary.conflict ? 'Revisar datos' : 'Sin datos'}`;
      track.appendChild(missing);
    } else {
      const height = maximum ? Math.max(5, Math.round(Math.abs(summary.value) / maximum * 100)) : 5;
      const bar = element('button', 'bar');
      bar.type = 'button';
      bar.style.setProperty('--bar-height', `${height}%`);
      bar.title = `${month.label}: ${timesheetNumber(summary.value, metric.unit)}`;
      bar.setAttribute('aria-label', bar.title);
      bar.addEventListener('click', () => { selection.textContent = bar.title; });
      track.appendChild(bar);
    }
    column.append(track, element('span', 'chart-label', month.shortLabel));
    chart.appendChild(column);
  });
  chart.setAttribute('aria-label', `Evolución mensual de ${metric.label.toLowerCase()} en ${statistics.year}`);
}

function comparisonCutoffMonth(year) {
  if (registerComparisonCutoffValue !== 'auto') return Number(registerComparisonCutoffValue);
  const now = new Date();
  if (year === now.getFullYear()) return now.getMonth() + 1;
  if (year < now.getFullYear()) return 12;
  const available = registerPayrollEntries.filter(entry => entry.year === year).map(entry => entry.month);
  return available.length ? Math.max(...available) : 12;
}

function renderRegisterComparisonOptions(year) {
  const previousCutoff = registerComparisonCutoffValue;
  clear(registerComparisonCutoff);
  const now = new Date();
  const automaticLabel = year === now.getFullYear()
    ? `Hasta hoy · ${MONTH_NAMES[now.getMonth()].toLowerCase()}`
    : year < now.getFullYear() ? 'Cierre anual · diciembre' : 'Hasta la última nómina';
  registerComparisonCutoff.add(new Option(automaticLabel, 'auto'));
  MONTH_NAMES.forEach((label, index) => registerComparisonCutoff.add(new Option(`Hasta ${label.toLowerCase()}`, String(index + 1))));
  registerComparisonCutoffValue = previousCutoff === 'auto' || (Number(previousCutoff) >= 1 && Number(previousCutoff) <= 12)
    ? previousCutoff : 'auto';
  registerComparisonCutoff.value = registerComparisonCutoffValue;

  const previousMetric = registerComparisonMetric;
  clear(registerComparisonConcept);
  REGISTER_PAYROLL_METRICS.forEach(metric => registerComparisonConcept.add(new Option(metric.label, metric.key)));
  registerComparisonMetric = REGISTER_PAYROLL_METRICS.some(metric => metric.key === previousMetric) ? previousMetric : 'meals';
  registerComparisonConcept.value = registerComparisonMetric;
}

function comparisonStatus(status) {
  if (status === 'match') return ['match', '✓ Coincide'];
  if (status === 'review') return ['review', '⚠ Revisar'];
  return ['missing', '— Sin datos suficientes'];
}

function renderRegisterComparisonRows(statistics) {
  const container = document.getElementById('register-comparison-rows');
  clear(container);
  const header = element('div', 'cross-row header');
  ['Concepto', 'Registro', 'Nóminas', 'Diferencia', 'Estado'].forEach(label => header.appendChild(element('span', '', label)));
  container.appendChild(header);
  REGISTER_PAYROLL_METRICS.forEach(metric => {
    const result = statistics.metrics[metric.key];
    const [statusClass, statusText] = comparisonStatus(result.status);
    const row = element('div', 'cross-row');
    row.append(
      element('strong', '', metric.label),
      element('span', 'cross-number', timesheetNumber(result.register.value, metric.unit)),
      element('span', 'cross-number', timesheetNumber(result.payroll.value, metric.unit)),
      element('span', 'cross-number', timesheetNumber(result.difference, metric.unit)),
      element('span', `comparison-status ${statusClass}`, statusText)
    );
    container.appendChild(row);
  });
}

function renderRegisterComparisonChart(statistics) {
  const chart = document.getElementById('register-comparison-chart');
  const title = document.getElementById('register-comparison-chart-title');
  const note = document.getElementById('register-comparison-chart-note');
  clear(chart);
  const metric = REGISTER_PAYROLL_METRICS.find(item => item.key === registerComparisonMetric) || REGISTER_PAYROLL_METRICS[0];
  const total = statistics.metrics[metric.key];
  const months = statistics.months.filter(month => month.month <= statistics.cutoffMonth);
  const values = months.flatMap(month => [month.metrics[metric.key].register.value, month.metrics[metric.key].payroll.value]);
  const maximum = Math.max(0, ...values.map(value => Math.abs(value || 0)));
  title.textContent = `Evolución · ${metric.label}`;
  months.forEach(month => {
    const result = month.metrics[metric.key];
    const column = element('div', 'cross-chart-column');
    const track = element('div', 'cross-chart-track');
    [['register', result.register.value], ['payroll', result.payroll.value]].forEach(([kind, value]) => {
      const wrap = element('div', 'cross-bar-wrap');
      if (value === null) {
        wrap.appendChild(element('span', 'chart-missing', '—'));
      } else {
        const number = element('span', 'cross-bar-number', timesheetNumber(value, metric.unit));
        const bar = element('span', `cross-bar${kind === 'register' ? ' register' : ''}`);
        bar.style.setProperty('--bar-height', `${maximum ? Math.max(3, Math.round(Math.abs(value) / maximum * 100)) : 3}%`);
        wrap.append(number, bar);
      }
      track.appendChild(wrap);
    });
    column.append(track, element('span', 'chart-label', month.shortLabel));
    chart.appendChild(column);
  });
  const [statusClass, statusText] = comparisonStatus(total.status);
  note.replaceChildren(
    document.createTextNode(`Acumulado: Registro ${timesheetNumber(total.register.value, metric.unit)} · Nóminas ${timesheetNumber(total.payroll.value, metric.unit)} · Diferencia ${timesheetNumber(total.difference, metric.unit)} · `),
    element('span', `comparison-status ${statusClass}`, statusText)
  );
  chart.setAttribute('aria-label', `Comparación mensual de ${metric.label.toLowerCase()} entre registro y nóminas en ${statistics.year}`);
}

function renderRegisterPayrollComparison() {
  const cutoff = comparisonCutoffMonth(selectedRegisterYear);
  const statistics = buildRegisterPayrollStatistics(registerPayrollEntries, selectedRegisterYear, cutoff);
  const metric = REGISTER_PAYROLL_METRICS.find(item => item.key === registerComparisonMetric) || REGISTER_PAYROLL_METRICS[0];
  const selected = statistics.metrics[metric.key];
  document.getElementById('register-comparison-note').textContent = statistics.receiptCount
    ? `${statistics.coveredMonths} mes${statistics.coveredMonths === 1 ? '' : 'es'} con datos · ${statistics.receiptCount} nómina${statistics.receiptCount === 1 ? '' : 's'} sumada${statistics.receiptCount === 1 ? '' : 's'} · un único registro por mes. Corte: ${MONTH_NAMES[cutoff - 1]} de ${selectedRegisterYear}.`
    : `No hay nóminas confirmadas hasta ${MONTH_NAMES[cutoff - 1].toLowerCase()} de ${selectedRegisterYear}.`;
  const summary = document.getElementById('register-comparison-summary');
  clear(summary);
  [
    ['Registro', selected.register.value],
    ['Nóminas', selected.payroll.value],
    ['Diferencia', selected.difference]
  ].forEach(([label, value]) => {
    const card = element('article', 'metric-card');
    card.append(element('span', '', `${label} · ${metric.label}`), element('strong', '', timesheetNumber(value, metric.unit)));
    summary.appendChild(card);
  });
  renderRegisterComparisonRows(statistics);
  renderRegisterComparisonChart(statistics);
}

function renderRegisterMonthOptions(statistics) {
  const previous = selectedRegisterMonth;
  clear(registerMonthSelect);
  statistics.months.forEach(month => {
    const option = document.createElement('option');
    option.value = String(month.month);
    option.textContent = `${month.label} ${statistics.year}${month.hasData ? '' : ' · Sin datos'}`;
    registerMonthSelect.appendChild(option);
  });
  selectedRegisterMonth = Number.isInteger(previous) ? previous : (statistics.availableMonths.at(-1) || 1);
  registerMonthSelect.value = String(selectedRegisterMonth);
}

function renderRegisterMonthly(statistics) {
  const month = statistics.months.find(item => item.month === selectedRegisterMonth) || statistics.months[0];
  selectedRegisterMonth = month.month;
  registerMonthSelect.value = String(month.month);
  registerPreviousMonthButton.disabled = month.month <= 1;
  registerNextMonthButton.disabled = month.month >= 12;
  const status = document.getElementById('register-month-status-note');
  status.textContent = month.hasData
    ? `${month.label}: 1 Registro de jornada mensual${month.duplicateCopies ? ` · ${month.duplicateCopies} copia repetida excluida` : ''}${month.conflict ? ' · Hay datos contradictorios que deben revisarse' : ''}.`
    : `${month.label}: Sin datos. No se interpreta como cero.`;
  renderTimesheetMetrics(document.getElementById('register-monthly-summary'), month, true);
  renderTimesheetOthers(document.getElementById('register-monthly-others'), month.otherMetrics, true);
}

function renderRegisterView() {
  const accumulated = selectedRegisterView === 'accumulated';
  registerAccumulatedView.hidden = !accumulated;
  registerMonthlyView.hidden = accumulated;
  registerAccumulatedButton.classList.toggle('active', accumulated);
  registerMonthlyButton.classList.toggle('active', !accumulated);
  registerAccumulatedButton.setAttribute('aria-selected', String(accumulated));
  registerMonthlyButton.setAttribute('aria-selected', String(!accumulated));
}

function renderRegisterYearOptions() {
  const years = availableTimesheetYears(timesheets);
  if (!years.includes(selectedRegisterYear)) selectedRegisterYear = years[0];
  clear(registerYearSelect);
  years.forEach(year => registerYearSelect.add(new Option(String(year), String(year))));
  registerYearSelect.value = String(selectedRegisterYear);
}

function renderRegisterStatistics() {
  const statistics = buildTimesheetYearStatistics(timesheets, selectedRegisterYear);
  const empty = document.getElementById('register-empty-state');
  const content = document.getElementById('register-content');
  empty.hidden = statistics.registerCount > 0;
  content.hidden = statistics.registerCount === 0;
  if (!statistics.registerCount) return;
  renderRegisterCoverage(statistics);
  renderTimesheetMetrics(document.getElementById('register-annual-summary'), statistics);
  renderTimesheetOthers(document.getElementById('register-annual-others'), statistics.otherMetrics);
  renderRegisterChartToggle(statistics);
  renderRegisterChart(statistics);
  renderRegisterComparisonOptions(selectedRegisterYear);
  renderRegisterPayrollComparison();
  renderRegisterMonthOptions(statistics);
  renderRegisterMonthly(statistics);
  renderRegisterView();
}

function renderSummary(container, period) {
  clear(container);
  const definitions = [
    ['gross', 'Bruto', ''],
    ['net', 'Líquido', 'net'],
    ['deductions', 'Deducciones', '']
  ];
  definitions.forEach(([key, label, className]) => {
    const summary = period.metrics[key];
    const card = element('article', `metric-card${className ? ` ${className}` : ''}`);
    card.append(
      element('span', '', label),
      element('strong', '', money(summary.value)),
      element('small', '', availabilityText(summary))
    );
    container.appendChild(card);
  });
}

function renderDeductionRate(node, period) {
  node.textContent = period.deductionRate === null
    ? 'Porcentaje de deducciones: Sin datos completos'
    : `Las deducciones representan el ${period.deductionRate.toLocaleString('es-ES', { maximumFractionDigits: 2 })} % del bruto disponible.`;
}

function renderDiscounts(container, discounts) {
  clear(container);
  [
    ['IRPF', discounts.irpf],
    ['Seguridad Social', discounts.socialSecurity],
    ['Otros descuentos', discounts.other]
  ].forEach(([label, summary]) => {
    const card = element('article', 'discount-card');
    card.append(
      element('span', '', label),
      element('strong', '', money(summary.value)),
      element('small', '', availabilityText(summary))
    );
    container.appendChild(card);
  });
}

function renderSalaryGlance(container, glance) {
  clear(container);
  if (!glance?.receiptCount || glance.totalCost === null || glance.totalCost <= 0) {
    container.appendChild(element('p', 'salary-glance-empty', '— Sin datos suficientes para comparar líquido, deducciones y aportaciones empresariales en las mismas nóminas.'));
    return;
  }
  const categories = [
    ['Lo que recibes tú', glance.net, 'var(--green)'],
    ['Lo que aportas tú', glance.workerContributions, '#e4a229'],
    ['Lo que aporta la empresa', glance.companyContributions, 'var(--red)']
  ].map(([label, value, color]) => ({
    label,
    value,
    color,
    percent: value / glance.totalCost * 100
  }));
  const layout = element('div', 'salary-glance-layout');
  const donut = element('div', 'salary-donut');
  const netAngle = categories[0].percent * 3.6;
  const workerAngle = netAngle + categories[1].percent * 3.6;
  donut.style.setProperty('--net-angle', `${netAngle}deg`);
  donut.style.setProperty('--worker-angle', `${workerAngle}deg`);
  donut.setAttribute('role', 'img');
  donut.setAttribute('aria-label', categories.map((item) => `${item.label}: ${money(item.value)}, ${item.percent.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`).join('. '));
  const center = element('div', 'salary-donut-center');
  center.append(
    element('span', '', 'Coste total'),
    element('strong', '', money(glance.totalCost)),
    element('small', '', `${glance.receiptCount} nómina${glance.receiptCount === 1 ? '' : 's'} utilizada${glance.receiptCount === 1 ? '' : 's'}`)
  );
  donut.appendChild(center);
  const legend = element('div', 'salary-glance-legend');
  categories.forEach((item) => {
    const row = element('div', 'salary-glance-item');
    const dot = element('i', 'salary-glance-dot');
    dot.style.background = item.color;
    row.append(
      dot,
      element('span', '', item.label),
      element('strong', '', money(item.value)),
      element('small', '', `${item.percent.toLocaleString('es-ES', { maximumFractionDigits: 1 })} % del coste total`)
    );
    legend.appendChild(row);
  });
  layout.append(donut, legend);
  const breakdown = element('details', 'salary-breakdown');
  const breakdownTitle = element('summary', '', 'Ver desglose');
  const breakdownRows = element('div', 'concept-list');
  renderConceptRows(breakdownRows, glance.details, 'No hay un desglose empresarial disponible en estas nóminas.');
  breakdown.append(breakdownTitle, breakdownRows);
  const note = element('p', 'salary-glance-note', `Comparación realizada con ${glance.receiptCount} de ${glance.totalReceipts} nómina${glance.totalReceipts === 1 ? '' : 's'}: solo se incluyen las que tienen disponibles las tres partes.`);
  container.append(layout, breakdown, note);
}

function renderEconomicValue(container, period) {
  clear(container);
  const value = buildEconomicDonuts(period);
  const percent = number => number.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const grid = element('div', 'economic-donuts');
  function chart(title, centerLabel, total, slices, valid, note) {
    const card = element('article', 'economic-donut-card');
    card.append(element('h3', '', title));
    const donut = element('div', 'value-donut');
    let cursor = 0;
    const gradient = slices.filter(slice => slice.amount > 0).map(slice => {
      const start = cursor;
      cursor += slice.amount / total * 100;
      return slice.color + ' ' + start + '% ' + cursor + '%';
    });
    donut.style.setProperty('--value-gradient', valid ? 'conic-gradient(' + gradient.join(',') + ')' : '#e5e7eb');
    donut.setAttribute('role', 'img');
    donut.setAttribute('aria-label', title + '. ' + centerLabel + ': ' + money(total) + (valid ? '. Porcentajes en la leyenda inferior.' : '. Sin reparto fiable.'));
    const center = element('div', 'value-donut-center');
    center.append(element('span', '', centerLabel), element('strong', '', money(total)));
    donut.append(center);
    card.append(donut);
    const legend = element('div');
    slices.forEach(slice => {
      const row = element('div', 'value-legend-row');
      const dot = element('i', 'value-dot');
      dot.style.setProperty('--dot', slice.color);
      const copy = element('div');
      copy.append(element('strong', '', slice.label));
      if (slice.available !== undefined && slice.available < value.salary.available) copy.append(element('small', '', slice.available + ' de ' + value.salary.available + ' recibos con dato'));
      const number = element('div', 'value-legend-number');
      number.append(element('strong', '', money(slice.amount)), element('small', '', total > 0 && slice.amount !== null ? percent(slice.amount / total * 100) + ' %' : 'Sin datos'));
      row.append(dot, copy, number);
      legend.append(row);
    });
    card.append(legend, element('p', 'section-note', note));
    if (!valid) card.append(element('p', 'value-warning', 'Sin datos suficientes o importes incompatibles para dibujar un reparto fiable. No se ajustan los importes.'));
    grid.append(card);
  }
  chart('El coste de tu trabajo', 'Coste total', value.cost.total, [
    { label: 'Salario bruto', amount: value.cost.gross, color: 'var(--green)' },
    { label: 'Aportación de la empresa', amount: value.cost.company, color: 'var(--red)' }
  ], value.cost.valid, value.cost.withCompany + ' de ' + value.total + ' recibos con aportación empresarial. El cálculo utiliza únicamente los ' + value.cost.available + ' recibos con bruto y aportación empresarial disponibles.');
  const slices = [...value.salary.slices];
  if (value.salary.remainder > 0) slices.push({ label: 'Importe sin desglosar / diferencia pendiente', amount: value.salary.remainder, color: '#d1d5db' });
  chart('¿Dónde va tu salario bruto?', 'Tu bruto', value.salary.total, slices, value.salary.valid,
    value.salary.available + ' de ' + value.total + ' recibos con bruto. Los importes sin identificar no se atribuyen a otros descuentos.');
  container.append(grid);
  if (value.mismatchCount) container.append(element('p', 'value-warning', 'Bruto − Deducciones no coincide con Líquido en ' + value.mismatchCount + ' recibos. Diferencia acumulada: ' + money(value.mismatch) + '. Revisa los datos guardados.'));
  container.append(element('p', 'value-message', value.cost.valid && value.perHundred !== null
    ? 'De cada 100 € que cuesta tu trabajo, ' + percent(value.perHundred) + ' € llegan a tu cuenta.'
    : 'De cada 100 € que cuesta tu trabajo: sin datos suficientes para calcular cuánto llega a tu cuenta.'));
  container.append(element('p', 'section-note', 'La comparación utiliza el líquido y el coste del mismo conjunto de ' + value.cost.available + ' recibos con bruto y aportación empresarial.'));
}

function conceptMeta(concept) {
  const parts = [];
  if (concept.code) parts.push(`Código ${concept.code}`);
  if (concept.quantityComplete) {
    parts.push(`Cantidad acumulada: ${concept.quantity.toLocaleString('es-ES', { maximumFractionDigits: 4 })}`);
  }
  parts.push(`${concept.receipts} recibo${concept.receipts === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function renderConceptRows(container, concepts, emptyCopy = 'Sin conceptos económicos disponibles.') {
  clear(container);
  if (!concepts.length) {
    container.appendChild(element('p', 'section-note', emptyCopy));
    return;
  }
  concepts.forEach((concept) => {
    const row = element('div', 'concept-row');
    const copy = element('div');
    copy.append(element('strong', '', concept.label), element('small', '', conceptMeta(concept)));
    row.append(copy, element('span', 'concept-amount', money(concept.amount)));
    container.appendChild(row);
  });
}

function renderComposition(container, concepts) {
  clear(container);
  const earnings = concepts.filter((concept) => concept.side === 'earnings');
  const groups = [
    ['Salario y complementos fijos', earnings.filter((concept) => concept.group === 'fixed')],
    ['Pluses y otros complementos', earnings.filter((concept) => concept.group !== 'fixed')]
  ].filter(([, rows]) => rows.length);
  if (!groups.length) {
    container.appendChild(element('p', 'section-note', 'Sin importes de conceptos disponibles en las nóminas guardadas.'));
    return;
  }
  groups.forEach(([label, rows], index) => {
    const details = element('details');
    details.open = index === 0 || groups.length === 1;
    const total = rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
    const summary = element('summary');
    summary.append(element('span', '', label), element('span', '', money(total)));
    const list = element('div', 'concept-list');
    renderConceptRows(list, rows);
    details.append(summary, list);
    container.appendChild(details);
  });
}

function renderChartMetricToggle() {
  const container = document.getElementById('chart-metric-toggle');
  clear(container);
  Object.entries(metricLabels).forEach(([key, label]) => {
    const button = element('button', key === chartMetric ? 'active' : '', label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(key === chartMetric));
    button.addEventListener('click', () => {
      chartMetric = key;
      renderChartMetricToggle();
      renderChart(buildYearStatistics(receipts, selectedYear));
    });
    container.appendChild(button);
  });
}

function renderChart(statistics) {
  const chart = document.getElementById('annual-chart');
  const selection = document.getElementById('chart-selection');
  const caption = document.getElementById('chart-caption');
  clear(chart);
  selection.textContent = 'Selecciona una barra para consultar su importe.';
  const summaries = statistics.months.map((month) => month.metrics[chartMetric]);
  const maximum = Math.max(0, ...summaries.map((summary) => Math.abs(summary.value || 0)));
  statistics.months.forEach((month) => {
    const summary = month.metrics[chartMetric];
    const column = element('div', 'chart-column');
    const track = element('div', 'bar-track');
    if (!month.hasData || summary.value === null) {
      const missing = element('span', 'chart-missing', '—');
      missing.title = `${month.label}: Sin datos`;
      track.appendChild(missing);
    } else {
      const height = maximum ? Math.max(5, Math.round(Math.abs(summary.value) / maximum * 100)) : 5;
      const bar = element('button', `bar${summary.complete ? '' : ' partial'}`);
      bar.type = 'button';
      bar.style.setProperty('--bar-height', `${height}%`);
      bar.title = `${month.label}: ${money(summary.value)}${summary.complete ? '' : ' (dato parcial)'}`;
      bar.setAttribute('aria-label', bar.title);
      bar.addEventListener('click', () => { selection.textContent = bar.title; });
      track.appendChild(bar);
    }
    column.append(track, element('span', 'chart-label', month.shortLabel));
    chart.appendChild(column);
  });
  chart.setAttribute('aria-label', `Evolución mensual de ${metricLabels[chartMetric].toLowerCase()} en ${statistics.year}`);
  const hasPartial = summaries.some((summary) => summary.value !== null && !summary.complete);
  caption.textContent = hasPartial
    ? 'Las barras rayadas contienen datos parciales porque algún recibo del mes no conserva esa cifra.'
    : '«—» significa Sin datos.';
}

function addFigure(container, label, value) {
  const card = element('article', 'figure');
  card.append(element('span', '', label), element('strong', '', value));
  container.appendChild(card);
}

function renderYearFigures(statistics) {
  const container = document.getElementById('year-figures');
  clear(container);
  document.getElementById('year-figures-title').textContent = `Tu ${statistics.year} en cifras`;
  addFigure(container, 'Meses cargados', `${statistics.availableMonths.length} de 12`);
  if (statistics.metrics.gross.complete) addFigure(container, 'Bruto disponible', money(statistics.metrics.gross.value));
  if (statistics.metrics.net.complete) addFigure(container, 'Líquido disponible', money(statistics.metrics.net.value));
  const night = conceptTotal(statistics.concepts, (concept) => concept.side === 'earnings'
    && (concept.code === '0013' || /nocturn/i.test(concept.label)));
  const holidays = conceptTotal(statistics.concepts, (concept) => concept.side === 'earnings'
    && (['0017', '0034', '7017'].includes(concept.code) || /festiv/i.test(concept.label)));
  if (night !== null) addFigure(container, 'Nocturnidad', money(night));
  if (holidays !== null) addFigure(container, 'Festivos', money(holidays));
}

function renderAccumulated(statistics) {
  document.getElementById('coverage-count').textContent = `Nóminas disponibles: ${statistics.availableMonths.length} de 12 meses`;
  const monthChips = document.getElementById('available-months');
  clear(monthChips);
  statistics.availableMonths.forEach((month) => monthChips.appendChild(element('span', 'month-chip', MONTH_NAMES[month - 1].slice(0, 3))));
  document.getElementById('annual-receipt-count').textContent = `${statistics.receiptCount} recibo${statistics.receiptCount === 1 ? '' : 's'} incluido${statistics.receiptCount === 1 ? '' : 's'}.`;
  renderSummary(document.getElementById('annual-summary'), statistics);
  renderDeductionRate(document.getElementById('annual-deduction-rate'), statistics);
  renderChartMetricToggle();
  renderChart(statistics);
  renderComposition(document.getElementById('annual-composition'), statistics.concepts);
  renderDiscounts(document.getElementById('annual-discounts'), statistics.discounts);
  renderConceptRows(
    document.getElementById('annual-complements'),
    statistics.concepts.filter((concept) => concept.side === 'earnings' && concept.group !== 'fixed'),
    'Sin pluses o complementos con importe disponible.'
  );
  renderYearFigures(statistics);
  renderEconomicValue(document.getElementById('annual-economic-value'), statistics);
}

function renderMonthOptions(statistics) {
  const previousSelection = selectedMonth;
  clear(monthSelect);
  statistics.months.filter((month) => month.hasData).forEach((month) => {
    const option = document.createElement('option');
    option.value = String(month.month);
    option.textContent = `${month.label} ${statistics.year}`;
    monthSelect.appendChild(option);
  });
  if (statistics.availableMonths.includes(previousSelection)) selectedMonth = previousSelection;
  else selectedMonth = statistics.availableMonths.at(-1) || null;
  if (selectedMonth !== null) monthSelect.value = String(selectedMonth);
}

function renderMonthly(statistics) {
  const month = statistics.months.find((item) => item.month === selectedMonth) || statistics.months.find((item) => item.hasData);
  if (!month) return;
  selectedMonth = month.month;
  monthSelect.value = String(selectedMonth);
  const position = statistics.availableMonths.indexOf(selectedMonth);
  previousMonthButton.disabled = position <= 0;
  nextMonthButton.disabled = position < 0 || position >= statistics.availableMonths.length - 1;
  document.getElementById('monthly-receipt-count').textContent = `${month.receiptCount} recibo${month.receiptCount === 1 ? '' : 's'} incluido${month.receiptCount === 1 ? '' : 's'} en ${month.label.toLowerCase()}.`;
  const regularization = document.getElementById('monthly-regularization');
  regularization.hidden = month.regularizationCount === 0;
  regularization.textContent = month.regularizationCount
    ? `${month.regularizationCount} recibo${month.regularizationCount === 1 ? '' : 's'} corresponde${month.regularizationCount === 1 ? '' : 'n'} a una regularización ya atribuida a este mes por Revisa tu nómina.`
    : '';
  renderSummary(document.getElementById('monthly-summary'), month);
  renderDeductionRate(document.getElementById('monthly-deduction-rate'), month);
  renderConceptRows(
    document.getElementById('monthly-concepts'),
    month.concepts,
    'Este mes no conserva importes de conceptos desglosados.'
  );
  renderConceptRows(
    document.getElementById('monthly-complements'),
    month.concepts.filter((concept) => concept.side === 'earnings' && concept.group !== 'fixed'),
    'Este mes no conserva pluses o complementos con importe disponible.'
  );
  renderDiscounts(document.getElementById('monthly-discounts'), month.discounts);
  renderEconomicValue(document.getElementById('monthly-economic-value'), month);
}

function renderCurrentYear() {
  const statistics = buildYearStatistics(receipts, selectedYear);
  renderAccumulated(statistics);
  renderMonthOptions(statistics);
  renderMonthly(statistics);
}

function renderView() {
  const accumulated = selectedView === 'accumulated';
  accumulatedView.hidden = !accumulated;
  monthlyView.hidden = accumulated;
  accumulatedButton.classList.toggle('active', accumulated);
  monthlyButton.classList.toggle('active', !accumulated);
  accumulatedButton.setAttribute('aria-selected', String(accumulated));
  monthlyButton.setAttribute('aria-selected', String(!accumulated));
}

async function listAll(bucket, path) {
  const items = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(path, {
      limit: 100, offset, sortBy: { column: 'name', order: 'asc' }
    });
    if (error) throw error;
    items.push(...(data || []));
    if (!data || data.length < 100) return items;
  }
}

async function readReview(bucket, path) {
  const { data, error } = await bucket.download(path);
  if (error) throw error;
  if (!data?.text) return null;
  try { return JSON.parse(await data.text()); } catch { return null; }
}

async function loadStoredStatistics() {
  const bucket = supabase.storage.from(STORAGE_BUCKET);
  const root = await listAll(bucket, currentUserId);
  const years = root.filter((item) => item.id == null && /^\d{4}$/.test(item.name)).map((item) => Number(item.name));
  const yearFolders = await Promise.all(years.map(async (year) => ({
    year,
    months: await listAll(bucket, `${currentUserId}/${year}`)
  })));
  const periods = yearFolders.flatMap(({ year, months }) => months
    .filter((item) => item.id == null && /^(0[1-9]|1[0-2])$/.test(item.name))
    .map((item) => ({ year, month: Number(item.name) })));
  const periodResults = await Promise.all(periods.map(async ({ year, month }) => {
    const folder = `${currentUserId}/${year}/${String(month).padStart(2, '0')}`;
    const storedReceipts = await monthReceipts(bucket, folder);
    const storedReviews = await Promise.all(storedReceipts
      .filter(receipt => receipt.files.some(file => file.id && file.name === 'review'))
      .map(async receipt => ({
        receipt,
        review: await readReview(bucket, `${receipt.folder}/review`)
      })));
    return {
      receipts: storedReviews.flatMap(({ receipt, review }) => {
        const hasPayroll = receipt.files.some(file => file.id && file.name === 'payroll');
        if (!hasPayroll || review?.status !== 'complete') return [];
        const normalized = reviewToReceipt(review, { year, month, receiptId: receipt.id || `legacy:${year}-${month}` });
        return normalized ? [normalized] : [];
      }),
      timesheets: storedReviews.flatMap(({ receipt, review }) => {
        const normalized = reviewToTimesheet(review, { year, month, receiptId: receipt.id || `legacy:${year}-${month}` });
        return normalized ? [normalized] : [];
      }),
      registerPayrollEntries: storedReviews.flatMap(({ receipt, review }) => {
        const normalized = reviewToRegisterPayrollEntry(review, { year, month, receiptId: receipt.id || `legacy:${year}-${month}` });
        return normalized ? [normalized] : [];
      })
    };
  }));
  return {
    receipts: periodResults.flatMap(period => period.receipts),
    timesheets: periodResults.flatMap(period => period.timesheets),
    registerPayrollEntries: periodResults.flatMap(period => period.registerPayrollEntries)
  };
}

function renderYearOptions() {
  const years = availableYears(receipts);
  if (!years.includes(selectedYear)) selectedYear = years[0];
  clear(yearSelect);
  years.forEach((year) => {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    yearSelect.appendChild(option);
  });
  yearSelect.value = String(selectedYear);
}

async function loadStatistics() {
  if (!currentUserId || loading) return;
  const requestVersion = ++loadVersion;
  loading = true;
  refreshButton.disabled = true;
  loadingState.hidden = false;
  errorState.hidden = true;
  emptyState.hidden = true;
  try {
    const loaded = await loadStoredStatistics();
    if (requestVersion !== loadVersion) return;
    receipts = loaded.receipts;
    timesheets = loaded.timesheets;
    registerPayrollEntries = loaded.registerPayrollEntries;
    lastLoadedAt = Date.now();
    renderYearOptions();
    renderRegisterYearOptions();
    renderRegisterStatistics();
    if (!receipts.length) {
      statisticsContent.hidden = true;
      emptyState.hidden = false;
    } else {
      renderCurrentYear();
      renderView();
      statisticsContent.hidden = false;
    }
  } catch {
    if (requestVersion !== loadVersion) return;
    statisticsContent.hidden = true;
    errorState.textContent = 'No se han podido cargar tus estadísticas. Comprueba la conexión e inténtalo de nuevo.';
    errorState.hidden = false;
  } finally {
    if (requestVersion === loadVersion) {
      loading = false;
      refreshButton.disabled = false;
      loadingState.hidden = true;
    }
  }
}

function changeView(view) {
  selectedView = view;
  renderView();
  if (view === 'monthly') renderMonthly(buildYearStatistics(receipts, selectedYear));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

yearSelect.addEventListener('change', () => {
  selectedYear = Number(yearSelect.value);
  selectedMonth = null;
  renderCurrentYear();
});
accumulatedButton.addEventListener('click', () => changeView('accumulated'));
monthlyButton.addEventListener('click', () => changeView('monthly'));
monthSelect.addEventListener('change', () => {
  selectedMonth = Number(monthSelect.value);
  renderMonthly(buildYearStatistics(receipts, selectedYear));
});
previousMonthButton.addEventListener('click', () => {
  const statistics = buildYearStatistics(receipts, selectedYear);
  const index = statistics.availableMonths.indexOf(selectedMonth);
  if (index > 0) selectedMonth = statistics.availableMonths[index - 1];
  renderMonthly(statistics);
});
nextMonthButton.addEventListener('click', () => {
  const statistics = buildYearStatistics(receipts, selectedYear);
  const index = statistics.availableMonths.indexOf(selectedMonth);
  if (index >= 0 && index < statistics.availableMonths.length - 1) selectedMonth = statistics.availableMonths[index + 1];
  renderMonthly(statistics);
});
registerYearSelect.addEventListener('change', () => {
  selectedRegisterYear = Number(registerYearSelect.value);
  selectedRegisterMonth = null;
  renderRegisterStatistics();
});
registerAccumulatedButton.addEventListener('click', () => {
  selectedRegisterView = 'accumulated';
  renderRegisterView();
});
registerMonthlyButton.addEventListener('click', () => {
  selectedRegisterView = 'monthly';
  renderRegisterMonthly(buildTimesheetYearStatistics(timesheets, selectedRegisterYear));
  renderRegisterView();
});
registerMonthSelect.addEventListener('change', () => {
  selectedRegisterMonth = Number(registerMonthSelect.value);
  renderRegisterMonthly(buildTimesheetYearStatistics(timesheets, selectedRegisterYear));
});
registerPreviousMonthButton.addEventListener('click', () => {
  selectedRegisterMonth = Math.max(1, Number(selectedRegisterMonth || 1) - 1);
  renderRegisterMonthly(buildTimesheetYearStatistics(timesheets, selectedRegisterYear));
});
registerNextMonthButton.addEventListener('click', () => {
  selectedRegisterMonth = Math.min(12, Number(selectedRegisterMonth || 1) + 1);
  renderRegisterMonthly(buildTimesheetYearStatistics(timesheets, selectedRegisterYear));
});
registerComparisonCutoff.addEventListener('change', () => {
  registerComparisonCutoffValue = registerComparisonCutoff.value;
  renderRegisterPayrollComparison();
});
registerComparisonConcept.addEventListener('change', () => {
  registerComparisonMetric = registerComparisonConcept.value;
  renderRegisterPayrollComparison();
});
refreshButton.addEventListener('click', loadStatistics);
window.addEventListener('pageshow', () => {
  if (currentUserId && Date.now() - lastLoadedAt > 1500) loadStatistics();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentUserId && Date.now() - lastLoadedAt > 15_000) loadStatistics();
});

const { data: { session } } = await supabase.auth.getSession();
const { data: accessAllowed, error: accessError } = session
  ? await supabase.rpc('is_current_user_private_access_allowed')
  : { data: false, error: null };
if (!session || accessError || accessAllowed !== true) {
  if (session) await supabase.auth.signOut();
  sessionStorage.setItem('strAfterLogin', 'estadisticas-nomina.html');
  window.location.replace('acceso-privado.html?next=estadisticas-nomina.html');
} else {
  currentUserId = session.user.id;
  authCheck.hidden = true;
  content.hidden = false;
  await loadStatistics();
}
