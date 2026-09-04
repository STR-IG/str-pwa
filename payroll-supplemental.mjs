// Payroll-only data. Never add these codes to the timesheet comparison keys.
export const SUPPLEMENTAL_CONCEPTS = [
  { code: '7001', label: 'Grupo superior · salario' },
  { code: '7016', label: 'Grupo superior · rotatividad' },
  { code: '7017', label: 'Grupo superior · festivo' },
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
  return Object.fromEntries(SUPPLEMENTAL_CONCEPTS.map(({code, label}) => {
    const row = rows[code] || {};
    const status = ['present', 'absent'].includes(row.status) ? row.status : 'unknown';
    if (status !== 'present') return [code, {code, status, quantity:null, amount:null, unit:null}];
    const quantity = decimal(row.quantity);
    const amount = decimal(row.amount, true);
    if (quantity === null || amount === null) throw new Error(`Completa la cantidad y el importe de «${label}», o déjalo pendiente.`);
    return [code, {code, status, quantity, amount, unit:null}];
  }));
}

export function renderSupplemental(container, saved = {}, confirmed = false) {
  const section = document.createElement('section');
  section.id = 'payroll-supplemental';
  const title = document.createElement('h3');
  title.textContent = 'Otros conceptos de la nómina · grupo superior';
  const note = document.createElement('p');
  note.textContent = 'Solo se guardan para futuras estadísticas. No se comparan con el registro de jornada. Las cantidades mantienen su unidad original, sin asumir que todas son días. Si no puedes comprobar un dato, déjalo pendiente.';
  section.append(title, note);
  for (const {code,label} of SUPPLEMENTAL_CONCEPTS) {
    const row = saved?.[code] || {};
    const card = document.createElement('div');
    card.className = 'comparison-field';
    card.style.marginBottom = '14px';
    card.dataset.supplementalCode = code;
    const heading = document.createElement('strong');
    heading.textContent = `${code} · ${label}`;
    const statusLabel = document.createElement('label');
    statusLabel.htmlFor = `supplemental-${code}-status`;
    statusLabel.textContent = 'Estado del concepto';
    const status = document.createElement('select');
    status.id = statusLabel.htmlFor;
    for (const [value,text] of [['unknown','Pendiente / no leído'],['present','Aparece en esta nómina'],['absent','Confirmo que no aparece']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = text; status.appendChild(option);
    }
    status.value = row.status || 'unknown';
    status.disabled = confirmed;
    status.style.width = '100%';
    status.style.margin = '8px 0 12px';
    status.style.padding = '12px';
    const values = document.createElement('div'); values.className = 'comparison-values';
    for (const [field,text] of [['quantity','Cantidad en este recibo'],['amount','Importe abonado (€)']]) {
      const column = document.createElement('div'); column.className = 'comparison-value';
      const label = document.createElement('label'); label.htmlFor = `supplemental-${code}-${field}`; label.textContent = text;
      const input = document.createElement('input'); input.id = label.htmlFor; input.type = 'text'; input.inputMode = 'decimal';
      input.value = row[field] == null ? '' : String(row[field]).replace('.', ',');
      input.placeholder = 'Pendiente'; input.readOnly = confirmed;
      column.append(label,input); values.appendChild(column);
      input.addEventListener('input', () => { card.dataset.manual = 'true'; status.value = 'present'; });
    }
    status.addEventListener('change', () => { card.dataset.manual = 'true'; });
    // Absence is a saved status, not an input lock. Typing changes it to present.
    card.append(heading,statusLabel,status,values); section.appendChild(card);
  }
  container.appendChild(section);
}

export function readSupplemental(root = document) {
  const rows = {};
  for (const {code} of SUPPLEMENTAL_CONCEPTS) {
    const get = field => root.getElementById(`supplemental-${code}-${field}`)?.value;
    rows[code] = {status:get('status'),quantity:get('quantity'),amount:get('amount')};
  }
  return validateSupplemental(rows);
}

export function applySupplemental(items, root = document) {
  const counts = new Map();
  for (const item of items || []) counts.set(String(item.code), (counts.get(String(item.code)) || 0) + 1);
  for (const {code} of SUPPLEMENTAL_CONCEPTS) {
    const status = root.getElementById(`supplemental-${code}-status`);
    const card = status?.closest('[data-supplemental-code]');
    if (!status || status.disabled || card?.dataset.manual === 'true') continue;
    const item = counts.get(code) === 1 ? items.find(item => String(item.code) === code) : null;
    // Omission or ambiguity is unknown, never an automatic zero/absence.
    status.value = item ? 'present' : 'unknown';
    for (const field of ['quantity','amount']) {
      const input = root.getElementById(`supplemental-${code}-${field}`);
      if (!input || input.readOnly) continue;
      const value = decimal(item?.[field], field === 'amount');
      input.value = value === null ? '' : String(value).replace('.', ',');
    }
  }
}
