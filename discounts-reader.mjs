export const DISCOUNT_KIND = Object.freeze({
  accrued_total_cc: { code: '9102', label: 'Devengado Total CC', section: 'bases' },
  accrued_total_accidents: { code: '9105', label: 'Devengado Total Acc/d/fp', section: 'bases' },
  extra_pay_proration: { code: '/341', label: 'Prorrata pagas extras', section: 'bases' },
  march_pay_proration: { code: '9044', label: 'Prorrata Paga de Marzo', section: 'bases' },
  other_proration: { code: 'RDL', label: 'Otras prorratas', section: 'bases' },
  common_contingencies: { code: '9350', label: 'Contingencias comunes', sections: ['worker', 'company'] },
  mei: { code: '', label: 'MEI', sections: ['worker', 'company'] },
  unemployment: { code: '9370', label: 'Desempleo', sections: ['worker', 'company'] },
  training: { code: '9380', label: 'Formación profesional', sections: ['worker', 'company'] },
  solidarity_contribution: { code: '93C0', label: 'Cuota solidaridad', sections: ['worker', 'company'] },
  irpf: { code: '9402', label: 'IRPF', section: 'irpf' },
  in_kind_irpf: { code: '/402', label: 'Retención en especie IRPF', section: 'irpf' },
  company_fogasa: { code: '/361', label: 'Fondo de garantía salarial', section: 'company' },
  company_it: { code: '/352', label: 'Empresa IT', section: 'company' },
  company_ims: { code: '/353', label: 'Empresa IMS', section: 'company' },
  company_pension_plan: { code: '4001', label: 'Aportación Empresa PP', section: 'contributions' },
  company_meals: { code: '9106', label: 'Comedor parte empresa', section: 'contributions' },
  life_insurance: { code: '9117', label: 'Seguro vida', section: 'contributions' },
  christmas_lot: { code: '9108', label: 'Lote Navidad', section: 'contributions' },
  total: { code: '', label: 'Total Cotiz. SS e IRPF (*)', sections: ['worker_total', 'company_total'] },
  unknown: { code: '', label: 'Concepto no reconocido', section: 'unknown' },
});

function numberOrNull(value, maximum) {
  if (value === null || value === undefined || value === '') return null;
  let raw = String(value).trim();
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d{1,4})?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && Math.abs(parsed) <= maximum ? parsed : null;
}

function safeText(value, maximum = 160) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);
  if (!text) return '';
  const looksPersonal = /@|\b(?:dni|nif|nie|naf|n[úu]mero de (?:la )?seguridad social|domicilio|emplead[oa])\b|\b\d{8}[a-z]\b/i.test(text);
  return looksPersonal ? '' : text;
}

function normalizedCode(value) {
  return safeText(value, 12).replace(/\s+/g, '').toUpperCase();
}

function sectionFor(kind, side) {
  const definition = DISCOUNT_KIND[kind];
  if (definition.section) return definition.section;
  return definition.sections?.includes(side) ? side : '';
}

export function normalizeDiscountsResponse(payload) {
  if (payload?.isDiscountsSection !== true || payload?.quality !== 'ok' || !Array.isArray(payload?.rows)) {
    return { readable: false, rows: [] };
  }

  const rows = payload.rows.flatMap((item) => {
    const kind = Object.hasOwn(DISCOUNT_KIND, item?.kind) ? item.kind : 'unknown';
    const sourceText = safeText(item?.sourceText);
    const code = normalizedCode(item?.code) || DISCOUNT_KIND[kind].code;
    const section = sectionFor(kind, String(item?.side ?? '').trim().toLowerCase());
    if (!section) return [];

    const row = {
      kind,
      code,
      label: DISCOUNT_KIND[kind].label,
      section,
      sourceText,
      value: numberOrNull(item?.value, 1_000_000),
      base: numberOrNull(item?.base, 1_000_000),
      rate: numberOrNull(item?.rate, 100),
      amount: numberOrNull(item?.amount, 1_000_000),
    };

    if (kind === 'unknown' && !sourceText && !code) return [];
    if ([row.value, row.base, row.rate, row.amount].every((value) => value === null) && kind !== 'unknown') return [];
    return [row];
  });

  return { readable: rows.length > 0, rows };
}

export function formatMoney(value) {
  return value === null ? 'No indicado' : `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function formatRate(value) {
  return value === null ? 'No indicado' : `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} %`;
}
