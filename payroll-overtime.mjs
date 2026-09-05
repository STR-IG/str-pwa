import { decimal } from './payroll-supplemental.mjs?v=2';

// Payroll-only concept. Its rate belongs to this receipt, never to a group or user.
export const OVERTIME_CODE = '0029';

export function overtimeAmount(quantity, unitPrice) {
  const hours = decimal(quantity);
  const price = decimal(unitPrice);
  if (hours === null || price === null) return null;
  // Four decimal places per operand; round the product once to euro cents.
  const product = BigInt(Math.round(hours * 10000)) * BigInt(Math.round(price * 10000));
  return Number((product + 500000n) / 1000000n) / 100;
}

export function validateOvertime(row = {}) {
  const status = ['present', 'absent'].includes(row?.status) ? row.status : 'unknown';
  const result = { code: OVERTIME_CODE, status, quantity: null, unitPrice: null, amount: null, unit: 'hours' };
  if (status !== 'present') return result;
  for (const [field, label] of [['quantity', 'número de horas extras'], ['unitPrice', 'precio por hora extra']]) {
    const raw = String(row[field] ?? '').trim();
    result[field] = decimal(raw);
    if (raw && result[field] === null) throw new Error(`Revisa el ${label}: usa un número positivo o cero, con hasta cuatro decimales, o déjalo pendiente.`);
  }
  result.amount = overtimeAmount(result.quantity, result.unitPrice);
  return result;
}

function updateAmount(root) {
  const output = root.getElementById('overtime-amount');
  if (!output) return;
  const status = root.getElementById('overtime-status')?.value;
  const quantity = decimal(root.getElementById('overtime-quantity')?.value);
  const price = decimal(root.getElementById('overtime-unitPrice')?.value);
  const amount = overtimeAmount(quantity, price);
  output.textContent = status === 'absent' ? 'Confirmado: no hay horas extras en este recibo.'
    : status !== 'present' || amount === null ? 'Importe pendiente: completa las horas y el precio cuando los conozcas.'
    : `Importe calculado: ${amount.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})} €`;
}

export function renderOvertime(container, saved = {}, confirmed = false) {
  const root = container.ownerDocument || document;
  const section = root.createElement('section');
  section.id = 'payroll-overtime';
  section.className = 'comparison-field';
  const heading = root.createElement('h3');
  heading.textContent = '0029 · Horas extras';
  const note = root.createElement('p');
  note.textContent = 'Horas × precio de esta nómina. Puedes guardar un dato pendiente y completarlo después. No se compara con el registro de jornada.';
  const label = root.createElement('label');
  label.htmlFor = 'overtime-status';
  label.textContent = 'Estado del concepto';
  const status = root.createElement('select');
  status.id = label.htmlFor;
  for (const [value, text] of [['unknown', 'Pendiente / no leído'], ['present', 'Aparece en esta nómina'], ['absent', 'Confirmo que no aparece']]) {
    const option = root.createElement('option');
    option.value = value; option.textContent = text; status.appendChild(option);
  }
  status.value = ['present', 'absent'].includes(saved?.status) ? saved.status : 'unknown';
  status.disabled = confirmed;
  status.style.width = '100%'; status.style.padding = '12px'; status.style.margin = '8px 0 12px';
  const values = root.createElement('div'); values.className = 'comparison-values';
  for (const [field, text] of [['quantity', 'Número de horas extras'], ['unitPrice', 'Precio por hora (€)']]) {
    const column = root.createElement('div'); column.className = 'comparison-value';
    const fieldLabel = root.createElement('label');
    fieldLabel.htmlFor = `overtime-${field}`; fieldLabel.textContent = text;
    const input = root.createElement('input');
    input.id = fieldLabel.htmlFor; input.type = 'text'; input.inputMode = 'decimal';
    input.placeholder = 'Pendiente'; input.readOnly = confirmed;
    input.value = saved?.[field] == null ? '' : String(saved[field]).replace('.', ',');
    input.addEventListener('input', () => {
      section.dataset.manual = 'true'; status.value = 'present'; updateAmount(root);
    });
    column.append(fieldLabel, input); values.appendChild(column);
  }
  status.addEventListener('change', () => { section.dataset.manual = 'true'; updateAmount(root); });
  const amount = root.createElement('output'); amount.id = 'overtime-amount';
  amount.setAttribute('for', 'overtime-quantity overtime-unitPrice');
  amount.setAttribute('aria-live', 'polite'); amount.style.display = 'block'; amount.style.marginTop = '12px';
  section.append(heading, note, label, status, values, amount);
  container.appendChild(section);
  updateAmount(root);
}

export function readOvertime(root = document) {
  const value = field => root.getElementById(`overtime-${field}`)?.value;
  return validateOvertime({status: value('status'), quantity: value('quantity'), unitPrice: value('unitPrice')});
}

export function applyOvertime(item, root = document) {
  const status = root.getElementById('overtime-status');
  const card = root.getElementById('payroll-overtime');
  if (!status || status.disabled || card?.dataset.manual === 'true') return;
  // Only this exact row; no rate inferred from a group or another receipt.
  const row = item?.code === OVERTIME_CODE ? item : null;
  status.value = row ? 'present' : 'unknown';
  for (const field of ['quantity', 'unitPrice']) {
    const input = root.getElementById(`overtime-${field}`);
    if (!input || input.readOnly) continue;
    const value = decimal(row?.[field]);
    input.value = value === null ? '' : String(value).replace('.', ',');
  }
  updateAmount(root);
}
