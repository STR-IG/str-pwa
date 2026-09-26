const PAYMENT_ROWS = [
  ['pendingAmount', /CANTIDAD\s+PDTE\.?(?=\s|$)/],
  ['netTotal', /LIQUIDO\s+TOTAL\b/]
];

const TRANSFER_ROW = /TRANSFER\.?\s*(\d+)\b/;

function normalizedLine(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[−–—]/g, '-')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function signedMoney(value) {
  let text = String(value || '').replace(/[−–—]/g, '-').replace(/\s|€/g, '');
  const match = text.match(/-?\d[\d.,]*-?/);
  if (!match) return null;
  text = match[0];
  const negative = text.startsWith('-') || text.endsWith('-');
  text = text.replace(/-/g, '');
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    text = text.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.');
  } else if (comma >= 0) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if ((text.match(/\./g) || []).length > 1 || /^\d+\.\d{3}$/.test(text)) {
    text = text.replace(/\./g, '');
  }
  const amount = Number(text);
  return Number.isFinite(amount) ? Math.round((negative ? -amount : amount) * 100) / 100 : null;
}

function rowValue(lines, index, pattern) {
  const match = pattern.exec(lines[index]);
  const tail = match ? lines[index].slice(match.index + match[0].length) : '';
  const sameLine = signedMoney(tail);
  if (sameLine !== null) return sameLine;
  const next = lines[index + 1] || '';
  if (TRANSFER_ROW.test(next) || PAYMENT_ROWS.some(([, rowPattern]) => rowPattern.test(next)) || /DEVENGOS?\s+Y\s+DEDUCCIONES?/.test(next)) return null;
  return signedMoney(next);
}

export function hasCompletePaymentBreakdown(text) {
  const normalized = normalizedLine(text);
  // Historical headings can be letter-spaced by OCR. Match only the full
  // known headings; do not remove spaces from amounts or privacy detection.
  const heading = value => new RegExp('\\b' + value.split('').join('\\s*') + '\\b').test(normalized);
  if ((heading('DESGLOSEPAGOS') || heading('DESGLOSEDEPAGOS'))
    && heading('DEVENGOSYDEDUCCIONES')) return true;
  // OCR can return the two blocks in either order and may miss their amounts.
  // Validate independent structural evidence, not a fixed position or exact heading.
  const money = /[-−]?\d(?:[\d.\s]*\d)?[,.]\d{2}\b/;
  const hasAmountAfter = (pattern, distance = 90) => {
    const match = pattern.exec(normalized);
    return Boolean(match && money.test(normalized.slice(match.index + match[0].length, match.index + match[0].length + distance)));
  };
  const paymentHeader = /D[E3]S[GC]L[O0][S5C][E3](?:\s+D[E3])?\s*:?\s*P[A4]G(?:[O0][S5]?|[S5])?/.test(normalized);
  const netTotal = /(?:L[I1]QU[I1]D[O0]\s+T[O0]TAL|T[O0]TAL\s+L[I1]QU[I1]D[O0])/;
  const paymentRows = hasAmountAfter(/TRANSFER(?:ENCIA)?\.?\s*\d*/)
    || hasAmountAfter(/CANT[I1]DAD\s+PDT[E3]\.?/);
  const earningsColumn = /D[E3]V[E3]N\w*/.test(normalized);
  const deductionsColumn = /D[E3]DUC\w*/.test(normalized);
  const conceptColumns = /C[O0]D[I1]G[O0]\s+C[O0]NC[E3]PT[O0]/.test(normalized)
    || /CANT[I1]DAD.{0,90}(?:IMP[O0]RTE|D[E3]V[E3]NG|D[E3]DUC)/.test(normalized);
  const paymentBlock = paymentHeader || paymentRows || netTotal.test(normalized);
  const conceptsBlock = (earningsColumn && deductionsColumn) || conceptColumns;
  return paymentBlock && conceptsBlock;
}

const REGULARIZATION_MONTHS = [
  ['ENERO', 'ENE'], ['FEBRERO', 'FEB'], ['MARZO', 'MAR'], ['ABRIL', 'ABR'],
  ['MAYO', 'MAY'], ['JUNIO', 'JUN'], ['JULIO', 'JUL'], ['AGOSTO', 'AGO'],
  ['SEPTIEMBRE', 'SETIEMBRE', 'SEP', 'SET'], ['OCTUBRE', 'OCT'],
  ['NOVIEMBRE', 'NOV'], ['DICIEMBRE', 'DIC']
];

export function payrollRegularizationMonth(text) {
  const normalized = normalizedLine(text);
  if (!/DIF\.?\s+MESES?\s+ANTERIORES?/.test(normalized)) return null;
  if (!/(?:DEVENGOS?|DEDUCCIONES?|CODIGO\s+CONCEPTO|SALARIO|PLUS|CUOTA)/.test(normalized)) return null;
  const label = /\b(?:R|REG|REGULARIZACION)\.?\s*(?:DE\s+)?([A-Z]+)\b/.exec(normalized)?.[1];
  if (!label) return null;
  const index = REGULARIZATION_MONTHS.findIndex((aliases) => aliases.includes(label));
  return index < 0 ? null : index + 1;
}

export function hasValidPayrollCrop(text) {
  return hasCompletePaymentBreakdown(text) || payrollRegularizationMonth(text) !== null;
}

export function payrollRegularizationMatchesMonth(text, selectedMonth) {
  const regularizedMonth = payrollRegularizationMonth(text);
  return regularizedMonth === null || regularizedMonth === Number(selectedMonth);
}

export function extractPaymentBreakdown(texts) {
  const found = { transfers: [], transfer1: null, transfer2: null, pendingAmount: null, netTotal: null };
  const transferNumbers = new Set();
  for (const text of Array.isArray(texts) ? texts : [texts]) {
    const lines = String(text || '').split(/\r?\n/).map(normalizedLine).filter(Boolean);
    const start = lines.findIndex(line => /DESGLOSE\s+PAGOS?/.test(line));
    if (start < 0) continue;
    const fromStart = lines.slice(start);
    const end = fromStart.findIndex((line, index) => index > 0 && /DEVENGOS?\s+Y\s+DEDUCCIONES?/.test(line));
    const block = end >= 0 ? fromStart.slice(0, end) : fromStart.slice(0, 16);
    block.forEach((line, index) => {
      const match = TRANSFER_ROW.exec(line);
      if (!match) return;
      const number = Number(match[1]);
      if (!Number.isInteger(number) || transferNumbers.has(number)) return;
      const amount = rowValue(block, index, TRANSFER_ROW);
      if (amount === null) return;
      transferNumbers.add(number);
      found.transfers.push({ number, amount });
      if (number === 1) found.transfer1 = amount;
      if (number === 2) found.transfer2 = amount;
    });
    for (const [key, pattern] of PAYMENT_ROWS) {
      if (found[key] !== null) continue;
      const index = block.findIndex(line => pattern.test(line));
      if (index >= 0) found[key] = rowValue(block, index, pattern);
    }
  }
  found.transfers.sort((a, b) => a.number - b.number);
  return found.transfers.length || found.pendingAmount !== null || found.netTotal !== null ? found : null;
}

function quantity(values, key) {
  const raw = values instanceof Map ? values.get(key) : values?.[key];
  const number = Number(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : null;
}

function nopaga(values) {
  return [
    ['unpaidNight', 'NOPAGA PNocturn teór', quantity(values, 'unpaidNight')],
    ['unpaidHoliday', 'NOPAGA PFestivo teór', quantity(values, 'unpaidHoliday')]
  ].filter(([, , hours]) => hours !== null).map(([key, label, hours]) => ({ key, label, hours }));
}

export function relatePaymentAdjustment(breakdown, currentTimesheet, previousTimesheet) {
  if (!breakdown) return null;
  if (!(breakdown.pendingAmount < 0)) return { breakdown, adjustment: null };
  const current = nopaga(currentTimesheet);
  const previous = current.length ? [] : nopaga(previousTimesheet);
  const matches = current.length ? current : previous;
  return {
    breakdown,
    adjustment: {
      amount: breakdown.pendingAmount,
      status: matches.length ? 'identified' : 'pending',
      sourceMonth: current.length ? 'current' : (previous.length ? 'previous' : null),
      matches
    }
  };
}

export function formatPaymentMoney(value) {
  return Number(value).toLocaleString('es-ES', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).replace('-', '−');
}
