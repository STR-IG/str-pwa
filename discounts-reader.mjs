export const DISCOUNT_KIND = Object.freeze({
  common_contingencies: { label: 'Contingencias comunes', section: 'social' },
  mei: { label: 'MEI', section: 'social' },
  unemployment: { label: 'Desempleo', section: 'social' },
  training: { label: 'Formación profesional', section: 'social' },
  irpf: { label: 'IRPF', section: 'irpf' },
  total: { label: 'Total de cotizaciones y deducciones', section: 'total' },
  unknown: { label: 'Concepto no reconocido', section: 'unknown' },
});

function numberOrNull(value, maximum) {
  if (value === null || value === undefined || value === '') return null;
  let raw = String(value).trim();
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d{1,4})?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && Math.abs(parsed) <= maximum ? parsed : null;
}

function safeSourceText(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!text) return '';
  const looksPersonal = /@|\b(?:dni|nif|nie|naf|seguridad social|domicilio|emplead[oa])\b|\b\d{8}[a-z]\b/i.test(text);
  return looksPersonal ? '' : text;
}

export function normalizeDiscountsResponse(payload) {
  if (payload?.isDiscountsSection !== true || payload?.quality !== 'ok' || !Array.isArray(payload?.rows)) {
    return { readable: false, rows: [] };
  }

  const rows = payload.rows.flatMap((item) => {
    const kind = Object.hasOwn(DISCOUNT_KIND, item?.kind) ? item.kind : 'unknown';
    const sourceText = safeSourceText(item?.sourceText);
    const row = {
      kind,
      label: DISCOUNT_KIND[kind].label,
      section: DISCOUNT_KIND[kind].section,
      sourceText,
      base: numberOrNull(item?.base, 1_000_000),
      rate: numberOrNull(item?.rate, 100),
      amount: numberOrNull(item?.amount, 1_000_000),
    };
    if (kind === 'unknown' && !sourceText) return [];
    if (row.base === null && row.rate === null && row.amount === null && kind !== 'unknown') return [];
    return [row];
  });

  return { readable: rows.length > 0, rows };
}

export function formatMoney(value) {
  return value === null ? 'No leído' : `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function formatRate(value) {
  return value === null ? 'No leído' : `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} %`;
}
