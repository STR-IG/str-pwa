// Payroll-only data. Never add these codes to the timesheet comparison keys.
export const SUPPLEMENTAL_CONCEPTS = [
  { code: '0001', label: 'Salario mínimo garantizado', group: 'fixed', unitPrice: true },
  { code: '0002', label: 'Plus convenio', group: 'fixed', unitPrice: true },
  { code: '0003', label: 'Complemento personal', group: 'fixed', unitPrice: true },
  { code: '0004', label: 'Complemento puesto de trabajo', group: 'fixed', unitPrice: true },
  { code: '0053', label: 'Antigüedad', group: 'fixed', unitPrice: true },
  { code: '7001', label: 'Grupo superior · salario', group: 'higherRole', unitPrice: false },
  { code: '7016', label: 'Grupo superior · rotatividad', group: 'higherRole', unitPrice: false },
  { code: '7017', label: 'Grupo superior · festivo', group: 'higherRole', unitPrice: false },
];

export function decimal(value, signed = false) {
  let raw = String(value ?? '').trim();
  if (!raw) return null;
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d{1,4})?$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) && (signed || number >= 0) && Math.abs(number) <= 1000000 ? number : null;
}

export function validateSupplemental(rows = {}) {
  return Object.fromEntries(SUPPLEMENTAL_CONCEPTS.map(({code, label, unitPrice: readsUnitPrice}) => {
    const row = rows[code] || {};
    const status = ['present', 'absent'].includes(row.status) ? row.status : 'unknown';
    const result = {code, status, quantity:null, amount:null, unit:null,
      ...(readsUnitPrice ? {unitPrice:null} : {})};
    if (status !== 'present') return [code, result];

    const fields = readsUnitPrice
      ? [['quantity', 'cantidad'], ['unitPrice', 'precio unitario'], ['amount', 'importe abonado']]
      : [['quantity', 'cantidad'], ['amount', 'importe abonado']];
    for (const [field, fieldLabel] of fields) {
      const raw = String(row[field] ?? '').trim();
      result[field] = decimal(raw, field !== 'quantity');
      if (raw && result[field] === null) {
        throw new Error(`Revisa la ${fieldLabel} de «${label}»: usa un número con hasta cuatro decimales o déjalo pendiente.`);
      }
    }

    if (!readsUnitPrice && (result.quantity === null || result.amount === null)) {
      throw new Error(`Completa la cantidad y el importe de «${label}», o déjalo pendiente.`);
    }
    if (readsUnitPrice && result.quantity === null && result.unitPrice === null && result.amount === null) {
      throw new Error(`Introduce al menos un dato de «${label}», o déjalo pendiente.`);
    }
    return [code, result];
  }));
}

const SUPPLEMENTAL_GROUPS = [
  {
    key: 'fixed',
    title: 'Conceptos fijos mensuales',
    note: 'Se leen y guardan por cada nómina para futuras estadísticas. No se comparan con el registro de jornada. Si una cifra no se distingue, puede quedar pendiente.',
  },
  {
    key: 'higherRole',
    title: 'Funciones de grupo superior',
    note: 'Son conceptos propios de la nómina y tampoco se comparan con el registro de jornada.',
  },
];

function renderSupplementalCard(root, concept, saved, confirmed) {
  const {code, label: conceptLabel, unitPrice: readsUnitPrice} = concept;
  const row = saved?.[code] || {};
  const card = root.createElement('div');
  card.className = 'comparison-field';
  card.style.marginBottom = '14px';
  card.dataset.supplementalCode = code;
  const heading = root.createElement('strong');
  heading.textContent = `${code} · ${conceptLabel}`;
  heading.style.display = 'block';
  heading.style.marginBottom = '10px';
  const statusLabel = root.createElement('label');
  statusLabel.htmlFor = `supplemental-${code}-status`;
  statusLabel.textContent = 'Estado del concepto';
  statusLabel.style.display = 'block';
  const status = root.createElement('select');
  status.id = statusLabel.htmlFor;
  for (const [value,text] of [['unknown','Pendiente / no leído'],['present','Aparece en esta nómina'],['absent','Confirmo que no aparece']]) {
    const option = root.createElement('option'); option.value = value; option.textContent = text; status.appendChild(option);
  }
  status.value = row.status || 'unknown';
  status.disabled = confirmed;
  status.style.width = '100%';
  status.style.margin = '8px 0 12px';
  status.style.padding = '12px';
  const values = root.createElement('div'); values.className = 'comparison-values';
  const fields = readsUnitPrice
    ? [['quantity','Cantidad en esta nómina'],['unitPrice','Importe diario / precio unitario (€)'],['amount','Importe abonado (€)']]
    : [['quantity','Cantidad en este recibo'],['amount','Importe abonado (€)']];
  if (readsUnitPrice) values.className += ' supplemental-fixed-values';
  for (const [field,text] of fields) {
    const column = root.createElement('div'); column.className = 'comparison-value';
    const label = root.createElement('label'); label.htmlFor = `supplemental-${code}-${field}`; label.textContent = text;
    const input = root.createElement('input'); input.id = label.htmlFor; input.type = 'text'; input.inputMode = 'decimal';
    input.value = row[field] == null ? '' : String(row[field]).replace('.', ',');
    input.placeholder = 'Pendiente'; input.readOnly = confirmed;
    column.append(label,input); values.appendChild(column);
    input.addEventListener('input', () => { card.dataset.manual = 'true'; status.value = 'present'; });
  }
  status.addEventListener('change', () => { card.dataset.manual = 'true'; });
  // Absence is a saved status, not an input lock. Typing changes it to present.
  card.append(heading,statusLabel,status,values);
  return card;
}

export function renderSupplemental(container, saved = {}, confirmed = false) {
  const root = container.ownerDocument || document;
  const section = root.createElement('section');
  section.id = 'payroll-supplemental';
  const title = root.createElement('h3');
  title.textContent = 'Otros conceptos de la nómina';
  section.appendChild(title);
  for (const group of SUPPLEMENTAL_GROUPS) {
    const heading = root.createElement('h4');
    heading.textContent = group.title;
    heading.style.margin = '18px 0 6px';
    const note = root.createElement('p');
    note.textContent = group.note;
    note.style.margin = '0 0 12px';
    section.append(heading, note);
    for (const concept of SUPPLEMENTAL_CONCEPTS.filter(item => item.group === group.key)) {
      section.appendChild(renderSupplementalCard(root, concept, saved, confirmed));
    }
  }
  container.appendChild(section);
}

export function readSupplemental(root = document) {
  const rows = {};
  for (const {code, unitPrice: readsUnitPrice} of SUPPLEMENTAL_CONCEPTS) {
    const get = field => root.getElementById(`supplemental-${code}-${field}`)?.value;
    rows[code] = {status:get('status'),quantity:get('quantity'),amount:get('amount'),
      ...(readsUnitPrice ? {unitPrice:get('unitPrice')} : {})};
  }
  return validateSupplemental(rows);
}

export function applySupplemental(items, root = document) {
  const counts = new Map();
  for (const item of items || []) counts.set(String(item.code), (counts.get(String(item.code)) || 0) + 1);
  for (const {code, unitPrice: readsUnitPrice} of SUPPLEMENTAL_CONCEPTS) {
    const status = root.getElementById(`supplemental-${code}-status`);
    const card = status?.closest('[data-supplemental-code]');
    if (!status || status.disabled || card?.dataset.manual === 'true') continue;
    const item = counts.get(code) === 1 ? items.find(item => String(item.code) === code) : null;
    // Omission or ambiguity is unknown, never an automatic zero/absence.
    status.value = item ? 'present' : 'unknown';
    for (const field of readsUnitPrice ? ['quantity','unitPrice','amount'] : ['quantity','amount']) {
      const input = root.getElementById(`supplemental-${code}-${field}`);
      if (!input || input.readOnly) continue;
      const value = decimal(item?.[field], field !== 'quantity');
      input.value = value === null ? '' : String(value).replace('.', ',');
    }
  }
}
