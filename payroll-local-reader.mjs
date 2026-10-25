import { DISCOUNT_KIND, normalizeDiscountsResponse } from './discounts-reader.mjs?v=2';

export function money(value, maximum = 100_000_000) {
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= maximum ? value : NaN;
  const raw = String(value ?? '').trim().replace(/€/g, '').trim();
  if (!raw) return null;
  // Accept Spanish thousands and decimals, or an ungrouped decimal point.
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,4})?$/.test(raw)
    && !/^-?\d+\.\d{1,4}$/.test(raw)) return NaN;
  const normalized = raw.includes(',') || /^-?\d{1,3}(?:\.\d{3})+$/.test(raw)
    ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const number = Number(normalized);
  return Number.isFinite(number) && Math.abs(number) <= maximum ? number : NaN;
}

export function discountTemplates() {
  return Object.entries(DISCOUNT_KIND).filter(([kind]) => kind !== 'unknown')
    .flatMap(([kind, definition]) => (definition.sections || [definition.section]).map(section => ({
      kind, code: definition.code, label: definition.label, section, sourceText: '',
      value: null, base: null, rate: null, amount: null
    })));
}

export function discountFields(row) {
  if (row.section === 'unknown') return ['value', 'base', 'rate', 'amount'];
  return ['bases', 'contributions'].includes(row.section) ? ['value']
    : row.section.endsWith('_total') ? ['amount'] : ['base', 'rate', 'amount'];
}

// Only prefill unambiguous single-amount base/contribution lines. Never infer
// worker/company columns from flattened OCR: those must be checked manually.
export function localDiscountRows(text) {
  const lines = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().split(/\r?\n/);
  return discountTemplates().map(row => {
    if (!['bases', 'contributions'].includes(row.section) || !row.code) return row;
    const matches = lines.filter(line => line.trim().split(/\s+/)[0] === row.code);
    if (matches.length !== 1) return row;
    const numbers = matches[0].slice(matches[0].indexOf(row.code) + row.code.length)
      .match(/-?\d[\d.,]*/g) || [];
    if (numbers.length !== 1) return row;
    const value = money(numbers[0], 1_000_000);
    return Number.isFinite(value) ? { ...row, value } : row;
  });
}

export function confirmedDiscountRows(rows) {
  const normalized = rows.map(row => {
    const result = { ...row, side: row.section };
    for (const field of discountFields(row)) {
      const value = money(row[field], field === 'rate' ? 100 : 1_000_000);
      if (Number.isNaN(value)) throw new Error(`Revisa el valor de «${row.label}».`);
      result[field] = value;
    }
    return result;
  });
  return normalizeDiscountsResponse({ isDiscountsSection: true, quality: 'ok', rows: normalized }).rows;
}

export async function recognizeLocally(source) {
  if (!globalThis.Tesseract?.createWorker) throw new Error('OCR_UNAVAILABLE');
  let worker;
  try {
    worker = await globalThis.Tesseract.createWorker('spa');
    await worker.setParameters({ preserve_interword_spaces: '1' });
    const result = await worker.recognize(source);
    return result?.data?.text || '';
  } finally {
    if (worker) await worker.terminate();
  }
}

export function renderLocalTotals(container, economics, confirmed, root = container.ownerDocument || globalThis.document) {
  const section = root.createElement('section');
  section.id = 'local-payroll-totals';
  section.className = 'panel local-payroll-totals';
  const heading = root.createElement('h3');
  heading.textContent = 'Totales de la nómina';
  const help = root.createElement('p');
  help.textContent = 'Comprueba e introduce los totales en euros. Deja vacío lo que no conste; no se sustituirá por cero.';
  section.appendChild(heading); section.appendChild(help);
  for (const [key, title] of [['gross', 'Bruto'], ['deductions', 'Deducciones'], ['net', 'Neto']]) {
    const label = root.createElement('label');
    label.textContent = `${title} (€)`;
    const input = root.createElement('input');
    input.id = `local-total-${key}`;
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = economics?.totals?.[key] == null ? '' : String(economics.totals[key]).replace('.', ',');
    input.readOnly = confirmed;
    input.placeholder = 'No indicado';
    label.appendChild(input);
    section.appendChild(label);
  }
  container.appendChild(section);
}

export function readLocalTotals(root, previous) {
  const totals = {};
  for (const key of ['gross', 'deductions', 'net']) {
    const value = money(root.getElementById(`local-total-${key}`)?.value);
    if (Number.isNaN(value)) throw new Error('Revisa los totales de la nómina: utiliza importes válidos en euros.');
    totals[key] = value;
  }
  return { ...(previous || {}), totals, concepts: previous?.concepts || [] };
}
