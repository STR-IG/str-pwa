export const REGISTER_PAYROLL_METRICS = Object.freeze([
  { key: 'meals', label: 'Comidas Can Guasch', unit: 'quantity' },
  { key: 'rotation', label: 'Plus rotatividad', unit: 'quantity' },
  { key: 'night', label: 'Plus nocturno', unit: 'hours' },
  { key: 'shift', label: 'Plus de turno', unit: 'quantity' },
  { key: 'holiday', label: 'Plus festivo', unit: 'hours' },
  { key: 'shift12', label: 'Plus de turno 12 horas', unit: 'quantity' },
  { key: 'holidayDiets', label: 'Dietas festivos', unit: 'quantity' },
  { key: 'vacation', label: 'Pluses vacaciones', unit: 'quantity' }
]);

const MONTH_NAMES = Object.freeze([
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]);

function quantity(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  let normalized = String(value).trim().replace(/\s+/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) normalized = normalized.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 10_000) / 10_000 : null;
}

function validPeriod(period) {
  return Number.isInteger(Number(period?.year)) && Number(period.year) >= 2000 && Number(period.year) <= 2100
    && Number.isInteger(Number(period?.month)) && Number(period.month) >= 1 && Number(period.month) <= 12;
}

function periodForReview(review, fallback) {
  if (review?.documentType === 'regularization' && validPeriod(review.attributionPeriod)) {
    return { year: Number(review.attributionPeriod.year), month: Number(review.attributionPeriod.month) };
  }
  return { year: Number(review?.year ?? fallback?.year), month: Number(review?.month ?? fallback?.month) };
}

export function reviewToRegisterPayrollEntry(review, fallback = {}) {
  if (!review || typeof review !== 'object' || review.status !== 'complete') return null;
  const period = periodForReview(review, fallback);
  if (!validPeriod(period)) return null;
  const register = {};
  const payroll = {};
  REGISTER_PAYROLL_METRICS.forEach(({ key }) => {
    const registerValue = quantity(review.timesheet?.[key]);
    const payrollValue = quantity(review.payroll?.[key]);
    if (registerValue !== null) register[key] = registerValue;
    if (payrollValue !== null) payroll[key] = payrollValue;
    // The existing confirmation flow treats a concept omitted from both sources as not applicable.
    if (review.timesheet?.[key] === undefined && review.payroll?.[key] === undefined) payroll[key] = 0;
  });
  return {
    id: String(review.receiptId || fallback.receiptId || review.period || `${period.year}-${period.month}`),
    year: period.year,
    month: period.month,
    register,
    payroll,
    regularization: review.documentType === 'regularization'
  };
}

function round(value) {
  return Math.round(value * 10_000) / 10_000;
}

function registerSummary(entries, key) {
  const values = [...new Set(entries
    .map(entry => entry.register[key])
    .filter(value => value !== null && value !== undefined)
    .map(round))];
  return {
    value: values.length === 1 ? values[0] : null,
    conflict: values.length > 1,
    available: values.length === 1
  };
}

function payrollSummary(entries, key) {
  if (!entries.length) return { value: null, available: false, receiptCount: 0 };
  const values = entries.map(entry => entry.payroll[key]);
  const complete = values.every(value => value !== null && value !== undefined);
  return {
    value: complete ? round(values.reduce((sum, value) => sum + value, 0)) : null,
    available: complete,
    receiptCount: entries.length
  };
}

function comparison(register, payroll) {
  if (register.conflict || register.value === null || payroll.value === null) {
    return { difference: null, status: 'missing' };
  }
  const difference = round(payroll.value - register.value);
  return { difference, status: Math.abs(difference) < 0.01 ? 'match' : 'review' };
}

function buildMonth(entries, month) {
  const relevant = entries.filter(entry => entry.month === month);
  const metrics = Object.fromEntries(REGISTER_PAYROLL_METRICS.map(({ key }) => {
    const register = registerSummary(relevant, key);
    const payroll = payrollSummary(relevant, key);
    return [key, { register, payroll, ...comparison(register, payroll) }];
  }));
  return {
    month,
    label: MONTH_NAMES[month - 1],
    shortLabel: MONTH_NAMES[month - 1].slice(0, 3),
    receiptCount: relevant.length,
    regularizationCount: relevant.filter(entry => entry.regularization).length,
    hasData: relevant.length > 0,
    metrics
  };
}

function totalForMonths(months, key) {
  const relevant = months.filter(month => month.hasData);
  const registerValues = relevant.map(month => month.metrics[key].register.value)
    .filter(value => value !== null);
  const payrollValues = relevant.map(month => month.metrics[key].payroll.value)
    .filter(value => value !== null);
  const complete = relevant.length > 0 && relevant.every(month =>
    month.metrics[key].register.value !== null && month.metrics[key].payroll.value !== null
  );
  const register = {
    value: registerValues.length ? round(registerValues.reduce((sum, value) => sum + value, 0)) : null,
    available: registerValues.length,
    total: relevant.length
  };
  const payroll = {
    value: payrollValues.length ? round(payrollValues.reduce((sum, value) => sum + value, 0)) : null,
    available: payrollValues.length,
    total: relevant.length
  };
  return {
    register,
    payroll,
    difference: complete ? round(payroll.value - register.value) : null,
    status: !complete ? 'missing' : Math.abs(payroll.value - register.value) < 0.01 ? 'match' : 'review',
    complete
  };
}

export function buildRegisterPayrollStatistics(entries, selectedYear, cutoffMonth = 12) {
  const year = Number(selectedYear);
  const cutoff = Math.min(12, Math.max(1, Number(cutoffMonth) || 12));
  const relevant = (Array.isArray(entries) ? entries : [])
    .filter(entry => entry?.year === year && entry.month >= 1 && entry.month <= cutoff);
  const months = Array.from({ length: 12 }, (_, index) => buildMonth(relevant, index + 1));
  const includedMonths = months.filter(month => month.month <= cutoff);
  return {
    year,
    cutoffMonth: cutoff,
    months,
    receiptCount: relevant.length,
    coveredMonths: includedMonths.filter(month => month.hasData).length,
    metrics: Object.fromEntries(REGISTER_PAYROLL_METRICS.map(({ key }) => [key, totalForMonths(includedMonths, key)]))
  };
}
