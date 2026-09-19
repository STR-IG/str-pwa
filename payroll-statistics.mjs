import { SUPPLEMENTAL_CONCEPTS } from './payroll-supplemental.mjs';

export const MONTH_NAMES = Object.freeze([
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]);

const FIXED_CODES = new Set(
  SUPPLEMENTAL_CONCEPTS.filter((concept) => concept.group === 'fixed').map((concept) => concept.code)
);
const SUPPLEMENTAL_LABELS = new Map(SUPPLEMENTAL_CONCEPTS.map((concept) => [concept.code, concept.label]));
const SOCIAL_SECURITY_KINDS = new Set([
  'common_contingencies', 'mei', 'unemployment', 'training', 'solidarity_contribution'
]);
const IRPF_KINDS = new Set(['irpf', 'in_kind_irpf']);
const COMPANY_CONTRIBUTION_KINDS = new Set([
  'company_pension_plan', 'company_meals', 'life_insurance', 'christmas_lot'
]);

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  let normalized = String(value).trim().replace(/\s|€/g, '');
  if (typeof value !== 'number') {
    const comma = normalized.lastIndexOf(',');
    const dot = normalized.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
      const decimal = comma > dot ? ',' : '.';
      normalized = normalized.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.');
    } else if (comma >= 0) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else if ((normalized.match(/\./g) || []).length > 1 || /^-?\d+\.\d{3}$/.test(normalized)) {
      normalized = normalized.replace(/\./g, '');
    }
  }
  const parsed = typeof value === 'number' ? value : Number(normalized);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 100_000_000 ? parsed : null;
}

function sumMoney(values) {
  const valid = values.filter((value) => value !== null);
  if (!valid.length) return null;
  return valid.reduce((total, value) => total + Math.round(value * 100), 0) / 100;
}

function safeText(value, maximum = 140) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function safeLabel(value) {
  const label = safeText(value);
  if (!label) return '';
  return /@|\b(?:dni|nif|nie|naf|domicilio|emplead[oa]|n[uú]mero de (?:la )?seguridad social|iban|cuenta bancaria|correo|tel[eé]fono)\b|\b\d{8}[a-z]\b/i.test(label)
    ? ''
    : label;
}

function safeCode(value) {
  const code = safeText(value, 16).toUpperCase().replace(/\s+/g, '');
  return /^[A-Z0-9/.-]{1,16}$/.test(code) ? code : '';
}

function normalizedKey(value) {
  return safeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeEconomicConcept(item) {
  const amount = finiteNumber(item?.amount);
  if (amount === null) return null;
  const code = safeCode(item?.code);
  const label = safeLabel(item?.label || item?.name) || SUPPLEMENTAL_LABELS.get(code) || code;
  if (!label && !code) return null;
  const side = item?.side === 'deductions' ? 'deductions' : item?.side === 'earnings' ? 'earnings' : '';
  if (!side) return null;
  const group = side === 'deductions'
    ? 'deductions'
    : (['fixed', 'variable', 'complement', 'other'].includes(item?.group)
      ? item.group
      : (FIXED_CODES.has(code) ? 'fixed' : 'other'));
  return {
    code,
    label: label || code,
    amount,
    quantity: finiteNumber(item?.quantity),
    unitPrice: finiteNumber(item?.unitPrice),
    side,
    group
  };
}

function legacyConcepts(review) {
  const concepts = [];
  for (const [rawCode, row] of Object.entries(review?.supplemental || {})) {
    if (row?.status !== 'present') continue;
    const code = safeCode(row.code || rawCode);
    const concept = normalizeEconomicConcept({
      code,
      label: row.label || SUPPLEMENTAL_LABELS.get(code) || code,
      amount: row.amount,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      side: code === '0038' ? 'deductions' : 'earnings',
      group: FIXED_CODES.has(code) ? 'fixed' : 'complement'
    });
    if (concept) concepts.push(concept);
  }
  if (review?.overtime?.status === 'present') {
    const overtime = normalizeEconomicConcept({
      code: '0029',
      label: 'Horas extras',
      amount: review.overtime.amount,
      quantity: review.overtime.quantity,
      unitPrice: review.overtime.unitPrice,
      side: 'earnings',
      group: 'variable'
    });
    if (overtime) concepts.push(overtime);
  }
  return concepts;
}

function mergeConfirmedConcepts(review, economicsConcepts) {
  const confirmed = legacyConcepts(review);
  const absentCodes = new Set(Object.entries(review?.supplemental || {})
    .filter(([, row]) => row?.status === 'absent')
    .map(([rawCode, row]) => safeCode(row?.code || rawCode))
    .filter(Boolean));
  if (review?.overtime?.status === 'absent') absentCodes.add('0029');
  const availableEconomics = economicsConcepts.filter((concept) => !concept.code || !absentCodes.has(concept.code));
  if (!availableEconomics.length) return confirmed;
  const overrides = new Map(confirmed.filter((concept) => concept.code).map((concept) => [concept.code, concept]));
  const appliedOverrides = new Set();
  const merged = availableEconomics.flatMap((concept) => {
    const override = overrides.get(concept.code);
    if (!override) return [concept];
    if (appliedOverrides.has(concept.code)) return [];
    appliedOverrides.add(concept.code);
    return [override];
  });
  const existing = new Set([...merged.map((concept) => concept.code), ...appliedOverrides].filter(Boolean));
  confirmed.forEach((concept) => {
    if (!concept.code || !existing.has(concept.code)) merged.push(concept);
  });
  return merged;
}

function sumDiscountRows(rows, predicate) {
  const amounts = (Array.isArray(rows) ? rows : [])
    .filter(predicate)
    .map((row) => finiteNumber(row?.amount))
    .filter((value) => value !== null);
  return sumMoney(amounts);
}

function receiptDiscounts(review, metrics, concepts) {
  const rows = Array.isArray(review?.discounts) ? review.discounts : [];
  const irpf = sumDiscountRows(rows, (row) => row?.section === 'irpf' && IRPF_KINDS.has(row?.kind));
  const socialSecurity = sumDiscountRows(
    rows,
    (row) => row?.section === 'worker' && SOCIAL_SECURITY_KINDS.has(row?.kind)
  );
  const explicitOther = sumMoney(
    concepts.filter((concept) => concept.side === 'deductions').map((concept) => concept.amount)
  );
  let other = explicitOther;
  if (metrics.deductions !== null && irpf !== null && socialSecurity !== null) {
    const remainder = Math.round((metrics.deductions - irpf - socialSecurity) * 100) / 100;
    if (remainder >= -0.02) other = Math.max(0, remainder);
  }
  return { irpf, socialSecurity, other };
}

function normalizeCompanyDetail(row) {
  const section = row?.section;
  if (section !== 'company' && section !== 'contributions') return null;
  const amount = finiteNumber(section === 'contributions' ? row?.value ?? row?.amount : row?.amount);
  if (amount === null) return null;
  const code = safeCode(row?.code);
  const label = safeLabel(row?.label || row?.sourceText) || code;
  if (!label && !code) return null;
  return {
    code,
    label: label || code,
    amount,
    section,
    kind: safeText(row?.kind, 48)
  };
}

function receiptCompanyCosts(review, metrics) {
  const rows = Array.isArray(review?.discounts) ? review.discounts : [];
  const socialSecurity = sumDiscountRows(
    rows,
    (row) => row?.section === 'company_total' && row?.kind === 'total'
  );
  const otherContributions = sumMoney(rows
    .filter((row) => row?.section === 'contributions' && COMPANY_CONTRIBUTION_KINDS.has(row?.kind))
    .map((row) => finiteNumber(row?.value ?? row?.amount))
    .filter((value) => value !== null));
  const totalCost = metrics.gross !== null && socialSecurity !== null
    ? (Math.round(metrics.gross * 100) + Math.round(socialSecurity * 100)) / 100
    : null;
  return {
    socialSecurity,
    totalCost,
    otherContributions,
    details: rows.map(normalizeCompanyDetail).filter(Boolean)
  };
}

export function reviewToReceipt(review, fallback = {}) {
  if (!review || typeof review !== 'object') return null;
  const year = Number(review.year ?? fallback.year);
  const month = Number(review.month ?? fallback.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return null;

  const economics = review.payrollEconomics && typeof review.payrollEconomics === 'object'
    ? review.payrollEconomics
    : {};
  const totals = economics.totals && typeof economics.totals === 'object' ? economics.totals : {};
  const economicConcepts = (Array.isArray(economics.concepts) ? economics.concepts : [])
    .map(normalizeEconomicConcept)
    .filter(Boolean);
  const concepts = mergeConfirmedConcepts(review, economicConcepts);
  const metrics = {
    gross: finiteNumber(totals.gross),
    net: finiteNumber(totals.net) ?? finiteNumber(review?.paymentInfo?.breakdown?.netTotal),
    deductions: finiteNumber(totals.deductions)
  };
  const company = receiptCompanyCosts(review, metrics);
  return {
    id: safeText(review.receiptId || fallback.receiptId || review.period || `${year}-${month}`),
    year,
    month,
    type: review.documentType === 'regularization' ? 'regularization' : 'ordinary',
    status: safeText(review.status || ''),
    metrics,
    concepts,
    discounts: receiptDiscounts(review, metrics, concepts),
    company,
    source: economics.concepts || economics.totals ? 'economics' : 'legacy'
  };
}

function metricSummary(receipts, metric) {
  const values = receipts.map((receipt) => finiteNumber(receipt?.metrics?.[metric]));
  const available = values.filter((value) => value !== null);
  return {
    value: sumMoney(available),
    available: available.length,
    total: receipts.length,
    complete: receipts.length > 0 && available.length === receipts.length
  };
}

function valueSummary(receipts, read) {
  const values = receipts.map((receipt) => finiteNumber(read(receipt)));
  const available = values.filter((value) => value !== null);
  return {
    value: sumMoney(available),
    available: available.length,
    total: receipts.length,
    complete: receipts.length > 0 && available.length === receipts.length
  };
}

function aggregateConcepts(receipts) {
  const concepts = new Map();
  receipts.forEach((receipt) => {
    receipt.concepts.forEach((concept) => {
      const key = concept.code
        ? `${concept.side}:code:${concept.code}`
        : `${concept.side}:label:${normalizedKey(concept.label)}`;
      if (!key.endsWith(':')) {
        const current = concepts.get(key) || {
          ...concept,
          amount: 0,
          quantity: 0,
          quantityAvailable: 0,
          occurrences: 0,
          receiptIds: new Set()
        };
        current.amount = (Math.round(current.amount * 100) + Math.round(concept.amount * 100)) / 100;
        current.occurrences += 1;
        current.receiptIds.add(receipt.id);
        if (concept.quantity !== null) {
          current.quantity = Math.round((current.quantity + concept.quantity) * 10_000) / 10_000;
          current.quantityAvailable += 1;
        }
        concepts.set(key, current);
      }
    });
  });
  return [...concepts.values()]
    .map(({ receiptIds, ...concept }) => ({
      ...concept,
      receipts: receiptIds.size,
      quantityComplete: concept.occurrences > 0 && concept.quantityAvailable === concept.occurrences
    }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.label.localeCompare(b.label, 'es'));
}

function aggregateCompanyDetails(receipts) {
  const details = new Map();
  receipts.forEach((receipt) => {
    (receipt.company?.details || []).forEach((detail) => {
      const key = detail.code
        ? `${detail.section}:code:${detail.code}`
        : `${detail.section}:label:${normalizedKey(detail.label)}`;
      if (key.endsWith(':')) return;
      const current = details.get(key) || { ...detail, amount: 0, receiptIds: new Set() };
      current.amount = (Math.round(current.amount * 100) + Math.round(detail.amount * 100)) / 100;
      current.receiptIds.add(receipt.id);
      details.set(key, current);
    });
  });
  return [...details.values()]
    .map(({ receiptIds, ...detail }) => ({ ...detail, receipts: receiptIds.size }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.label.localeCompare(b.label, 'es'));
}

function buildPeriod(receipts) {
  const gross = metricSummary(receipts, 'gross');
  const net = metricSummary(receipts, 'net');
  const deductions = metricSummary(receipts, 'deductions');
  const irpf = valueSummary(receipts, (receipt) => receipt.discounts.irpf);
  const socialSecurity = valueSummary(receipts, (receipt) => receipt.discounts.socialSecurity);
  const otherDiscounts = valueSummary(receipts, (receipt) => receipt.discounts.other);
  const companySocialSecurity = valueSummary(receipts, (receipt) => receipt.company?.socialSecurity);
  const companyTotalCost = valueSummary(receipts, (receipt) => receipt.company?.totalCost);
  const companyOtherContributions = valueSummary(receipts, (receipt) => receipt.company?.otherContributions);
  const deductionRate = gross.complete && deductions.complete && gross.value > 0
    ? Math.round((deductions.value / gross.value) * 10_000) / 100
    : null;
  return {
    receipts,
    receiptCount: receipts.length,
    regularizationCount: receipts.filter((receipt) => receipt.type === 'regularization').length,
    metrics: { gross, net, deductions },
    deductionRate,
    concepts: aggregateConcepts(receipts),
    discounts: { irpf, socialSecurity, other: otherDiscounts },
    company: {
      socialSecurity: companySocialSecurity,
      totalCost: companyTotalCost,
      otherContributions: companyOtherContributions,
      details: aggregateCompanyDetails(receipts)
    }
  };
}

export function buildYearStatistics(receipts, selectedYear) {
  const year = Number(selectedYear);
  const relevant = (Array.isArray(receipts) ? receipts : [])
    .filter((receipt) => receipt?.year === year)
    .sort((a, b) => a.month - b.month || String(a.id).localeCompare(String(b.id)));
  const months = Array.from({ length: 12 }, (_, index) => {
    const monthReceipts = relevant.filter((receipt) => receipt.month === index + 1);
    return {
      month: index + 1,
      label: MONTH_NAMES[index],
      shortLabel: MONTH_NAMES[index].slice(0, 3),
      hasData: monthReceipts.length > 0,
      ...buildPeriod(monthReceipts)
    };
  });
  return {
    year,
    ...buildPeriod(relevant),
    months,
    availableMonths: months.filter((month) => month.hasData).map((month) => month.month)
  };
}

export function availableYears(receipts, fallbackYear = new Date().getFullYear()) {
  const years = [...new Set((Array.isArray(receipts) ? receipts : []).map((receipt) => receipt?.year)
    .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100))]
    .sort((a, b) => b - a);
  return years.length ? years : [Number(fallbackYear)];
}

export function conceptTotal(concepts, matcher) {
  const matching = (Array.isArray(concepts) ? concepts : []).filter(matcher);
  return matching.length ? sumMoney(matching.map((concept) => concept.amount)) : null;
}
