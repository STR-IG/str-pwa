export const TIMESHEET_METRICS = Object.freeze([
  { key: 'rotation', label: 'Plus rotatividad' },
  { key: 'meals', label: 'Comidas Can Guasch' },
  { key: 'night', label: 'Plus nocturno' },
  { key: 'shift', label: 'Plus de turno' },
  { key: 'holiday', label: 'Plus festivo' },
  { key: 'shift12', label: 'Turno de 12 horas' },
  { key: 'holidayDiets', label: 'Dietas festivos' },
  { key: 'vacation', label: 'Pluses vacaciones' }
]);

const validYear = value => Number.isInteger(Number(value)) && Number(value) >= 2000 && Number(value) <= 2100;
const validMonth = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 12;

function quantity(value) {
  if (value === undefined || value === null || String(value).trim() === '') return 0;
  const number = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
}

function hasRecordedValues(values) {
  return TIMESHEET_METRICS.some(({ key }) => Object.prototype.hasOwnProperty.call(values, key)
    && values[key] !== null && String(values[key]).trim() !== '');
}

export function normalizeTimesheetReview(review, fallback = {}) {
  if (!review || review.status !== 'complete' || !review.timesheet || typeof review.timesheet !== 'object') return null;
  const year = Number(review.year ?? fallback.year);
  const month = Number(review.month ?? fallback.month);
  if (!validYear(year) || !validMonth(month) || !hasRecordedValues(review.timesheet)) return null;

  const values = {};
  for (const { key } of TIMESHEET_METRICS) {
    const value = quantity(review.timesheet[key]);
    if (value === null) return null;
    values[key] = value;
  }
  return { year, month, values };
}

function valueKey(values) {
  return TIMESHEET_METRICS.map(({ key }) => values[key]).join('|');
}

export function availableTimesheetYears(records, fallbackYear = new Date().getFullYear()) {
  const years = [...new Set((Array.isArray(records) ? records : [])
    .map(record => Number(record?.year))
    .filter(validYear))].sort((a, b) => b - a);
  return years.length ? years : [Number(fallbackYear)];
}

export function buildTimesheetYearStatistics(records, selectedYear) {
  const year = Number(selectedYear);
  const relevant = (Array.isArray(records) ? records : [])
    .filter(record => Number(record?.year) === year && validMonth(Number(record?.month)))
    .map(record => {
      const values = {};
      for (const { key } of TIMESHEET_METRICS) {
        const value = quantity(record?.values?.[key]);
        if (value === null) return null;
        values[key] = value;
      }
      return { year, month: Number(record.month), values };
    })
    .filter(Boolean);

  const grouped = new Map();
  relevant.forEach(record => {
    const key = record.month;
    const entries = grouped.get(key) || new Map();
    entries.set(valueKey(record.values), record.values);
    grouped.set(key, entries);
  });

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const entries = grouped.get(month);
    const conflict = Boolean(entries && entries.size > 1);
    return {
      month,
      hasData: Boolean(entries),
      conflict,
      receiptCount: entries?.size || 0,
      values: entries && !conflict ? [...entries.values()][0] : null
    };
  });
  const validMonths = months.filter(month => month.hasData && !month.conflict);
  const metrics = Object.fromEntries(TIMESHEET_METRICS.map(({ key }) => {
    const total = validMonths.reduce((sum, month) => sum + month.values[key], 0);
    return [key, {
      total: Math.round(total * 100) / 100,
      months: validMonths.length,
      monthlyAverage: validMonths.length
        ? Math.round((total / validMonths.length) * 100) / 100
        : null
    }];
  }));

  return {
    year,
    months,
    metrics,
    availableMonths: validMonths.map(month => month.month),
    conflictMonths: months.filter(month => month.conflict).map(month => month.month),
    monthCount: validMonths.length
  };
}
