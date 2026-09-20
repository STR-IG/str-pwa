import { buildEconomicValue } from './salary-overview.mjs?v=2';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { monthReceipts } from './payroll-receipts.mjs?v=1';
import {
  MONTH_NAMES,
  availableYears,
  buildYearStatistics,
  conceptTotal,
  reviewToReceipt
} from './payroll-statistics.mjs?v=2';

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

let currentUserId = '';
let receipts = [];
let selectedYear = new Date().getFullYear();
let selectedMonth = null;
let selectedView = 'accumulated';
let chartMetric = 'gross';
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
  const value = buildEconomicValue(period);
  const equation = element('div', 'value-equation');
  const amountCard = (label, amount, className = '') => {
    const card = element('article', `value-amount ${className}`.trim());
    card.append(element('span', '', label), element('strong', '', money(amount)));
    return card;
  };
  equation.append(amountCard('Salario bruto', value.gross), element('span', 'value-sign', '+'),
    amountCard('Aportaciones empresa', value.company), element('span', 'value-sign', '='),
    amountCard('TOTAL REPRESENTADO', value.totalRepresented, 'total'));
  container.append(equation);
  if (!value.slices.length) {
    container.append(element('p', 'value-warning', value.reason));
  } else {
    const colors = ['#4bb889', '#d44756', '#e2a235'];
    const labels = ['Lo que recibes tú', 'Impuestos y cotizaciones', 'Otras deducciones'];
    const descriptions = ['Salario líquido realmente recibido', 'IRPF, Seguridad Social del trabajador y aportaciones empresariales', 'Cantidades no identificadas como impuestos o cotizaciones públicas'];
    let cursor = 0;
    const gradient = value.slices.map((slice, index) => {
      const start = cursor;
      cursor += slice.percent;
      return `${colors[index]} ${start}% ${cursor}%`;
    });
    const layout = element('div', 'value-layout');
    const donut = element('div', 'value-donut');
    donut.style.setProperty('--value-gradient', `conic-gradient(${gradient.join(',')})`);
    donut.setAttribute('role', 'img');
    donut.setAttribute('aria-label', value.slices.map((slice, index) => `${labels[index]}: ${money(slice.amount)}, ${slice.percent.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`).join('. '));
    const center = element('div', 'value-donut-center');
    center.append(element('span', '', 'Total representado'), element('strong', '', money(value.totalRepresented)));
    donut.append(center);
    const legend = element('div');
    value.slices.forEach((slice, index) => {
      const row = element('div', 'value-legend-row');
      const dot = element('i', 'value-dot');
      dot.style.setProperty('--dot', colors[index]);
      const copy = element('div');
      copy.append(element('strong', '', labels[index]), element('small', '', descriptions[index]));
      const number = element('div', 'value-legend-number');
      number.append(element('strong', '', `${slice.percent.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`), element('small', '', money(slice.amount)));
      row.append(dot, copy, number);
      legend.append(row);
    });
    layout.append(donut, legend);
    container.append(layout);
    if (value.twoPart) container.append(element('p', 'value-message', `De cada 100 € representados, ${value.slices[0].percent.toLocaleString('es-ES', { maximumFractionDigits: 1 })} € llegan a tu cuenta y ${value.slices[1].percent.toLocaleString('es-ES', { maximumFractionDigits: 1 })} € se destinan a impuestos y cotizaciones.`));
    else container.append(element('p', 'value-warning', 'Hay otras deducciones que no se han clasificado como impuestos o cotizaciones. Se muestran por separado para que el cálculo cuadre.'));
  }
  const cards = element('div', 'value-tax-cards');
  const payroll = element('article', 'value-tax-card');
  payroll.append(element('h3', '', 'DESDE TU NÓMINA'), element('strong', '', money(value.fromPayroll)),
    element('p', '', `IRPF: ${money(value.irpf)}`), element('p', '', `Seguridad Social: ${money(value.workerSocialSecurity)}`));
  const company = element('article', 'value-tax-card');
  company.append(element('h3', '', 'APORTACIÓN ADICIONAL DE LA EMPRESA'), element('strong', '', money(value.company)),
    element('p', '', 'Cotizaciones empresariales identificadas en tus nóminas.'));
  cards.append(payroll, company);
  container.append(cards);
  if (!value.complete) container.append(element('p', 'section-note', `${value.available} de ${value.total} nóminas contienen todos los datos necesarios; los importes mostrados usan únicamente ese conjunto comparable.`));
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

async function loadReceipts() {
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
    return Promise.all(storedReceipts
      .filter((receipt) => receipt.files.some((file) => file.id && file.name === 'payroll')
        && receipt.files.some((file) => file.id && file.name === 'review'))
      .map(async (receipt) => {
        const review = await readReview(bucket, `${receipt.folder}/review`);
        if (review?.status !== 'complete') return null;
        return reviewToReceipt(review, { year, month, receiptId: receipt.id || `legacy:${year}-${month}` });
      }));
  }));
  return periodResults.flat(2).filter(Boolean);
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
    const loaded = await loadReceipts();
    if (requestVersion !== loadVersion) return;
    receipts = loaded;
    lastLoadedAt = Date.now();
    renderYearOptions();
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
