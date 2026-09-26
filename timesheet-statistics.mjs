export const TIMESHEET_METRICS = [
  { key: 'theoreticalHours', label: 'Horas teóricas', unit: 'hours', aliases: ['theoreticalHours', 'hoursTheoretical', 'totalTheoreticalHours', 'horasTeoricas'] },
  { key: 'workedHours', label: 'Horas trabajadas', unit: 'hours', aliases: ['workedHours', 'hoursWorked', 'totalWorkedHours', 'horasTrabajadas'] },
  { key: 'differenceHours', label: 'Diferencia de horas', unit: 'hours', aliases: ['differenceHours', 'hoursDifference', 'saldoHoras'] },
  { key: 'night', label: 'Nocturnidad', unit: 'hours', aliases: ['night', 'nocturnidad'] },
  { key: 'holiday', label: 'Festivos trabajados', unit: 'hours', aliases: ['holiday', 'festivos'] },
  { key: 'shift', label: 'Pluses de turno', unit: 'quantity', aliases: ['shift', 'turnos'] },
  { key: 'meals', label: 'Comidas', unit: 'quantity', aliases: ['meals', 'comidas'] },
  { key: 'vacation', label: 'Vacaciones', unit: 'quantity', aliases: ['vacation', 'vacaciones'] },
  { key: 'absences', label: 'Ausencias', unit: 'hours', aliases: ['absences', 'absence', 'absenceHours', 'ausencias'] },
  { key: 'rotation', label: 'Plus rotatividad', unit: 'quantity', aliases: ['rotation', 'rotatividad'] },
  { key: 'shift12', label: 'Turnos de 12 horas', unit: 'quantity', aliases: ['shift12', 'turnos12'] },
  { key: 'holidayDiets', label: 'Dietas festivos', unit: 'quantity', aliases: ['holidayDiets', 'dietasFestivos'] },
  { key: 'unpaidNight', label: 'Nocturnidad no abonada', unit: 'hours', aliases: ['unpaidNight'] },
  { key: 'unpaidHoliday', label: 'Festivo no abonado', unit: 'hours', aliases: ['unpaidHoliday'] }
];

const aliasKeys = new Set(TIMESHEET_METRICS.flatMap(metric => metric.aliases));

function quantity(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value ?? '').trim().replace(/\s+/g, '');
  if (!text) return null;
  let normalized = text;
  if (text.includes(',') && text.includes('.')) {
    normalized = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (text.includes(',')) normalized = text.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 10_000) / 10_000 : null;
}

function validPeriod(year, month) {
  return Number.isInteger(year) && year >= 2000 && year <= 2100
    && Number.isInteger(month) && month >= 1 && month <= 12;
}

function readableLabel(key) {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .replace(/^./, value => value.toUpperCase());
}

export function reviewToTimesheet(review, fallback = {}) {
  if (!review || typeof review !== 'object' || !review.timesheet || typeof review.timesheet !== 'object') return null;
  const year = Number(review.year ?? fallback.year);
  const month = Number(review.month ?? fallback.month);
  if (!validPeriod(year, month)) return null;
  const values = {};
  TIMESHEET_METRICS.forEach(metric => {
    const alias = metric.aliases.find(key => quantity(review.timesheet[key]) !== null);
    if (alias) values[metric.key] = quantity(review.timesheet[alias]);
  });
  if (values.differenceHours === undefined
    && values.workedHours !== undefined && values.theoreticalHours !== undefined) {
    values.differenceHours = Math.round((values.workedHours - values.theoreticalHours) * 10_000) / 10_000;
  }
  const others = Object.entries(review.timesheet).flatMap(([key, raw]) => {
    const value = quantity(raw);
    return aliasKeys.has(key) || value === null ? [] : [{ key, label: readableLabel(key), value }];
  });
  if (!Object.keys(values).length && !others.length) return null;
  return {
    id: String(review.receiptId || fallback.receiptId || review.period || `${year}-${month}`),
    year,
    month,
    values,
    others,
    status: String(review.status || ''),
    updatedAt: String(review.updatedAt || review.createdAt || '')
  };
}

function uniqueValues(entries, read) {
  return [...new Set(entries.map(read).filter(value => value !== null && value !== undefined)
    .map(value => Math.round(value * 10_000) / 10_000))];
}

function monthlySummary(entries, read) {
  const values = uniqueValues(entries, read);
  return {
    value: values.length === 1 ? values[0] : null,
    available: values.length === 1 ? 1 : 0,
    total: entries.length ? 1 : 0,
    complete: entries.length > 0 && values.length === 1,
    conflict: values.length > 1
  };
}

function buildMonth(entries, month, label) {
  const metrics = Object.fromEntries(TIMESHEET_METRICS.map(metric => [
    metric.key,
    monthlySummary(entries, entry => entry.values[metric.key])
  ]));
  const otherKeys = new Map();
  entries.forEach(entry => entry.others.forEach(item => {
    const current = otherKeys.get(item.key) || { key: item.key, label: item.label };
    otherKeys.set(item.key, current);
  }));
  const otherMetrics = [...otherKeys.values()].map(item => ({
    ...item,
    ...monthlySummary(entries, entry => entry.others.find(other => other.key === item.key)?.value)
  }));
  const hasData = entries.length > 0;
  return {
    month,
    label,
    shortLabel: label.slice(0, 3),
    hasData,
    registerCount: hasData ? 1 : 0,
    sourceCount: entries.length,
    duplicateCopies: Math.max(0, entries.length - 1),
    conflict: Object.values(metrics).some(metric => metric.conflict) || otherMetrics.some(metric => metric.conflict),
    metrics,
    otherMetrics
  };
}

function annualSummary(months, read) {
  const availableMonths = months.filter(month => month.hasData);
  const values = availableMonths.map(read).filter(value => value !== null && value !== undefined);
  return {
    value: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 10_000) / 10_000 : null,
    available: values.length,
    total: availableMonths.length,
    complete: availableMonths.length > 0 && values.length === availableMonths.length
  };
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function buildTimesheetYearStatistics(entries, selectedYear) {
  const year = Number(selectedYear);
  const relevant = (Array.isArray(entries) ? entries : [])
    .filter(entry => entry?.year === year && validPeriod(entry.year, entry.month));
  const months = MONTH_NAMES.map((label, index) => buildMonth(
    relevant.filter(entry => entry.month === index + 1),
    index + 1,
    label
  ));
  const metrics = Object.fromEntries(TIMESHEET_METRICS.map(metric => [
    metric.key,
    annualSummary(months, month => month.metrics[metric.key].value)
  ]));
  const otherKeys = new Map();
  months.forEach(month => month.otherMetrics.forEach(item => otherKeys.set(item.key, { key: item.key, label: item.label })));
  const otherMetrics = [...otherKeys.values()].map(item => ({
    ...item,
    ...annualSummary(months, month => month.otherMetrics.find(other => other.key === item.key)?.value)
  }));
  const availableMonths = months.filter(month => month.hasData).map(month => month.month);
  return {
    year,
    months,
    metrics,
    otherMetrics,
    availableMonths,
    missingMonths: months.filter(month => !month.hasData).map(month => month.month),
    registerCount: availableMonths.length,
    duplicateCopies: months.reduce((sum, month) => sum + month.duplicateCopies, 0),
    conflictMonths: months.filter(month => month.conflict).map(month => month.month)
  };
}

export function availableTimesheetYears(entries, fallbackYear = new Date().getFullYear()) {
  const years = [...new Set((Array.isArray(entries) ? entries : [])
    .map(entry => entry?.year)
    .filter(year => Number.isInteger(year) && year >= 2000 && year <= 2100))]
    .sort((a, b) => b - a);
  return years.length ? years : [Number(fallbackYear)];
}
