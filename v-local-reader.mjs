import { money, recognizeLocally } from './payroll-local-reader.mjs?v=1';

export const V_ROWS = Object.freeze([
  { code: '0010', name: 'Plus de turno', days: true },
  { code: '0080', name: 'Plus de turno 12 horas', days: true },
  { code: '0013', name: 'Plus nocturno' },
  { code: '0017', name: 'Plus festivo' },
  { code: '7013', name: 'Diferencial grupo superior nocturno' },
  { code: '7017', name: 'Diferencial grupo superior festivo' },
  { code: '', name: 'Turnicidad' },
  { code: '', name: 'Plus sábados' },
  { code: '', name: 'Flexibilización' },
  { code: '', name: 'Sábado domingo' },
  { code: '', name: 'Festivo local' }
]);

export function parseVText(text) {
  const rows = new Map();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    const match = line.match(/^(0010|0080|0013|0017|7013|7017|0024)\s+(.+)$/);
    if (!match) continue;
    const code = match[1];
    if (rows.has(code)) { rows.set(code, null); continue; }
    rows.set(code, null);
    const tail = match[2].replace(/turno\s*12\s*(?:horas?|h)?/i, 'turno');
    const numbers = tail.match(/-?\d[\d.,]*/g) || [];
    if (![2, 3].includes(numbers.length)) { rows.set(code, null); continue; }
    const quantity = money(numbers[0], 500), amount = money(numbers.at(-1), 100_000);
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(amount) || amount < 0) continue;
    rows.set(code, { code, name: code === '0024' ? 'Pluses vacaciones' : V_ROWS.find(row => row.code === code).name,
      quantity, devengos: amount });
  }
  return { concepts: [...rows.values()].filter(Boolean), specialFlags: /jornada\s+reducida|incapacidad\s+temporal|te[oó]rico|acumulado/i.test(text || '') ? ['other_special_case'] : [] };
}

export async function readVImageLocally(file) {
  return parseVText(await recognizeLocally(file));
}

export function previousVMonth(period, index) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || ![0, 1, 2].includes(index)) throw Error('INVALID_MONTH');
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 4 + index, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function renderVReview(container, { vMonth, vacation = {}, readings = [] }) {
  const root = container.ownerDocument;
  container.replaceChildren(); container.hidden = false;
  container.dataset.period = vMonth;
  const create = (tag, text) => { const el = root.createElement(tag); if (text) el.textContent = text; return el; };
  const field = (parent, id, label, value) => {
    const wrapper = create('label', label), input = create('input');
    input.id = id; input.type = 'text'; input.inputMode = 'decimal';
    input.value = value == null ? '' : String(value).replace('.', ',');
    input.placeholder = 'No indicado'; wrapper.append(input); parent.append(wrapper); return input;
  };
  container.append(create('h3', 'Comprueba las cifras antes de calcular'),
    create('p', 'La lectura se hace en este dispositivo. Revisa los días y los devengos; deja vacío un concepto solo si has comprobado que no aparece. El cálculo confirmado consume la comprobación de ese mes.'));
  field(container, 'v-local-days', 'Cantidad de «Pluses vacaciones» (días)', vacation.quantity);
  field(container, 'v-local-paid', 'Devengo de «Pluses vacaciones» (€)', vacation.devengos);
  for (let index = 0; index < 3; index++) {
    const section = create('details'); section.open = index === 0;
    section.append(create('summary', `Nómina de ${previousVMonth(vMonth, index)}`));
    const reading = readings[index] || {};
    V_ROWS.forEach((row, position) => {
      const card = create('div'); card.className = 'v-local-row';
      card.append(create('strong', row.code ? `${row.code} · ${row.name}` : row.name));
      const matches = (reading.concepts || []).filter(item => row.code && item.code === row.code);
      const suggested = matches.length === 1 ? matches[0] : {};
      if (row.days) field(card, `v-local-${index}-${position}-quantity`, 'Cantidad (días de turno)', suggested.quantity);
      field(card, `v-local-${index}-${position}-amount`, 'Devengos (€)', suggested.devengos);
      section.append(card);
    });
    const confirmation = create('label'), checkbox = create('input');
    checkbox.type = 'checkbox'; checkbox.id = `v-local-confirm-${index}`;
    confirmation.append(checkbox, root.createTextNode(' He revisado esta nómina y confirmado los conceptos que aparecen y los que dejo vacíos.'));
    section.addEventListener('input', event => { if (event.target !== checkbox) checkbox.checked = false; });
    section.append(confirmation); container.append(section);
  }
  const special = create('label'), check = create('input'); check.type = 'checkbox'; check.id = 'v-local-special';
  check.checked = readings.some(reading => reading.specialFlags?.length);
  special.append(check, root.createTextNode(' Hay jornada reducida, incapacidad temporal prolongada o conceptos teóricos/acumulados que requieren revisión de STR.'));
  container.append(special);
}

export function readVReview(root, period) {
  const parse = (id, max) => {
    const value = money(root.getElementById(id)?.value, max);
    if (Number.isNaN(value) || value < 0) throw Error('INVALID_LOCAL_VALUES');
    return value;
  };
  const days = parse('v-local-days', 31), paidTotal = parse('v-local-paid', 100_000);
  if (days === null || days <= 0 || !Number.isInteger(days) || paidTotal === null) throw Error('VACATION_PAYMENT_NOT_FOUND');
  const payrolls = [0, 1, 2].map(index => {
    if (!root.getElementById(`v-local-confirm-${index}`)?.checked) throw Error('CONFIRM_LOCAL_MONTHS');
    const concepts = V_ROWS.flatMap((row, position) => {
      const amount = parse(`v-local-${index}-${position}-amount`, 100_000);
      const quantity = row.days ? parse(`v-local-${index}-${position}-quantity`, 500) : null;
      if (amount === null && quantity === null) return [];
      if (amount === null || (row.days && quantity === null)) throw Error('INVALID_LOCAL_VALUES');
      return [{ code: row.code, name: row.name, quantity: quantity ?? '', devengos: amount }];
    });
    return { month: previousVMonth(period, index), concepts,
      specialFlags: root.getElementById('v-local-special')?.checked ? ['other_special_case'] : [] };
  });
  return { days, paidTotal, payrolls };
}
