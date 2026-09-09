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
  const start = normalized.search(/DESGLOSE\s+PAGOS?/);
  if (start < 0) return false;
  const endMatch = /DEVENGOS?\s+Y\s+DEDUCCIONES?/.exec(normalized.slice(start));
  return Boolean(endMatch && endMatch.index > 0);
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
