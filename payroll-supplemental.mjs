// Payroll-only data. Never add these codes to the timesheet comparison keys.
export const SUPPLEMENTAL_CONCEPTS = [
  { code: '0001', label: 'Salario mínimo garantizado', group: 'fixed', unitPrice: true },
  { code: '0002', label: 'Plus convenio', group: 'fixed', unitPrice: true },
  { code: '0003', label: 'Complemento personal', group: 'fixed', unitPrice: true },
  { code: '0004', label: 'Complemento puesto de trabajo', group: 'fixed', unitPrice: true },
  { code: '0053', label: 'Antigüedad', group: 'fixed', unitPrice: true },
  { code: '0038', label: 'Cuota sindical', group: 'deductions', unitPrice: false, quantity: false, amountLabel: 'Importe descontado (€)' },
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

const STATIC_SUPPLEMENTAL_CODES = new Set(SUPPLEMENTAL_CONCEPTS.map(({code}) => code));

function dynamicConcept(item) {
  if (item?.output !== 'supplemental' || item?.dynamic !== true) return null;
  const code = String(item.code ?? '').trim().toUpperCase();
  const label = String(item.label ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!/^(?:\/\d{3}|[A-Z0-9]{2,5})$/.test(code) || !label || STATIC_SUPPLEMENTAL_CODES.has(code)) return null;
  return {
    code,
    label,
    group: 'detected',
    dynamic: true,
    output: 'supplemental',
    quantity: item.quantityExpected !== false,
    unitPrice: item.unitPriceExpected === true,
    amountLabel: String(item.amountLabel || 'Importe (€)').slice(0, 60),
  };
}

export function validateSupplemental(rows = {}) {
  const dynamic = Object.values(rows).map(dynamicConcept).filter(Boolean);
  return Object.fromEntries([...SUPPLEMENTAL_CONCEPTS, ...dynamic].map(({code, label, unitPrice: readsUnitPrice, quantity: readsQuantity = true, dynamic: isDynamic = false, output, amountLabel}) => {
    const row = rows[code] || {};
    const status = ['present', 'absent'].includes(row.status) ? row.status : 'unknown';
    const result = {code, status, quantity:null, amount:null, unit:null,
      ...(isDynamic ? {dynamic:true, output, label, quantityExpected:readsQuantity, unitPriceExpected:readsUnitPrice, amountLabel} : {}),
      ...(readsUnitPrice ? {unitPrice:null} : {})};
    if (status !== 'present') return [code, result];

    const fields = [
      ...(readsQuantity ? [['quantity', 'cantidad']] : []),
      ...(readsUnitPrice ? [['unitPrice', 'precio unitario']] : []),
      ['amount', readsQuantity ? 'importe abonado' : 'importe descontado']
    ];
    for (const [field, fieldLabel] of fields) {
      const raw = String(row[field] ?? '').trim();
      result[field] = decimal(raw, field !== 'quantity');
      if (raw && result[field] === null) {
        throw new Error(`Revisa la ${fieldLabel} de «${label}»: usa un número con hasta cuatro decimales o déjalo pendiente.`);
      }
    }

    if (isDynamic && fields.every(([field]) => result[field] === null)) {
      throw new Error(`Introduce al menos un dato de «${label}», o déjalo pendiente.`);
    }
    if (!isDynamic && !readsQuantity && result.amount === null) {
      throw new Error(`Completa el importe de «${label}», o déjalo pendiente.`);
    }
    if (!isDynamic && readsQuantity && !readsUnitPrice && (result.quantity === null || result.amount === null)) {
      throw new Error(`Completa la cantidad y el importe de «${label}», o déjalo pendiente.`);
    }
    if (!isDynamic && readsQuantity && readsUnitPrice && result.quantity === null && result.unitPrice === null && result.amount === null) {
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
    key: 'deductions',
    title: 'Deducciones de nómina',
    note: 'Se leen por recibo y no se comparan con el registro de jornada.',
  },
  {
    key: 'higherRole',
    title: 'Funciones de grupo superior',
    note: 'Son conceptos propios de la nómina y tampoco se comparan con el registro de jornada.',
  },
];

function updateSupplementalVisibility(root) {
  for (const group of SUPPLEMENTAL_GROUPS) {
    const container = root.getElementById(`payroll-supplemental-group-${group.key}`);
    if (container) container.hidden = ![...container.children].some((child) => child.dataset?.supplementalCode && !child.hidden);
  }
  const section = root.getElementById('payroll-supplemental');
  if (section) {
    const groupsVisible = SUPPLEMENTAL_GROUPS.some((group) => !root.getElementById(`payroll-supplemental-group-${group.key}`)?.hidden);
    const dynamicVisible = !root.getElementById('payroll-supplemental-dynamic')?.hidden;
    section.hidden = !groupsVisible && !dynamicVisible;
  }
}

function renderSupplementalCard(root, concept, saved, confirmed) {
  const {code, label: conceptLabel, unitPrice: readsUnitPrice, quantity: readsQuantity = true, amountLabel = 'Importe abonado (€)'} = concept;
  const row = saved?.[code] || {};
  const card = root.createElement('div');
  card.className = 'comparison-field';
  card.style.marginBottom = '14px';
  card.dataset.supplementalCode = code;
  if (concept.dynamic) {
    card.dataset.supplementalDynamic = 'true';
    card.dataset.supplementalLabel = conceptLabel;
    card.dataset.supplementalQuantity = readsQuantity ? 'true' : 'false';
    card.dataset.supplementalUnitPrice = readsUnitPrice ? 'true' : 'false';
    card.dataset.supplementalAmountLabel = amountLabel;
  }
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
  for (const [value,text] of [['unknown','Pendiente / no leído'],['present','Aparece en esta nómina'],['absent','No aparece en esta nómina']]) {
    const option = root.createElement('option'); option.value = value; option.textContent = text; status.appendChild(option);
  }
  status.value = row.status || 'unknown';
  card.hidden = status.value === 'absent';
  status.disabled = confirmed;
  status.style.width = '100%';
  status.style.margin = '8px 0 12px';
  status.style.padding = '12px';
  const values = root.createElement('div'); values.className = 'comparison-values';
  const fields = [
    ...(readsQuantity ? [['quantity', readsUnitPrice ? 'Cantidad en esta nómina' : 'Cantidad en este recibo']] : []),
    ...(readsUnitPrice ? [['unitPrice','Importe diario / precio unitario (€)']] : []),
    ['amount', amountLabel]
  ];
  if (readsUnitPrice) values.className += ' supplemental-fixed-values';
  const inputs = [];
  for (const [field,text] of fields) {
    const column = root.createElement('div'); column.className = 'comparison-value';
    const label = root.createElement('label'); label.htmlFor = `supplemental-${code}-${field}`; label.textContent = text;
    const input = root.createElement('input'); input.id = label.htmlFor; input.type = 'text'; input.inputMode = 'decimal';
    input.value = row[field] == null ? '' : String(row[field]).replace('.', ',');
    input.placeholder = 'Pendiente'; input.readOnly = confirmed;
    inputs.push(input);
    column.append(label,input); values.appendChild(column);
    input.addEventListener('input', () => { card.dataset.manual = 'true'; status.value = 'present'; });
  }
  const updateAbsentState = () => {
    const absent = status.value === 'absent';
    inputs.forEach((input) => {
      if (absent) input.value = '';
      input.disabled = absent;
      input.placeholder = absent ? 'No aplica' : 'Pendiente';
    });
  };
  status.addEventListener('change', () => { card.dataset.manual = 'true'; updateAbsentState(); });
  updateAbsentState();
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
    const groupContainer = root.createElement('div');
    groupContainer.id = `payroll-supplemental-group-${group.key}`;
    const heading = root.createElement('h4');
    heading.textContent = group.title;
    heading.style.margin = '18px 0 6px';
    const note = root.createElement('p');
    note.textContent = group.note;
    note.style.margin = '0 0 12px';
    groupContainer.append(heading, note);
    for (const concept of SUPPLEMENTAL_CONCEPTS.filter(item => item.group === group.key)) {
      groupContainer.appendChild(renderSupplementalCard(root, concept, saved, confirmed));
    }
    section.appendChild(groupContainer);
  }
  const dynamicHeading = root.createElement('h4');
  dynamicHeading.id = 'payroll-supplemental-dynamic-heading';
  dynamicHeading.textContent = 'Otros conceptos detectados';
  dynamicHeading.style.margin = '18px 0 6px';
  const dynamicContainer = root.createElement('div');
  dynamicContainer.id = 'payroll-supplemental-dynamic';
  for (const row of Object.values(saved)) {
    const concept = dynamicConcept(row);
    if (concept) dynamicContainer.appendChild(renderSupplementalCard(root, concept, saved, confirmed));
  }
  dynamicHeading.hidden = ![...dynamicContainer.children].some((card) => !card.hidden);
  dynamicContainer.hidden = dynamicHeading.hidden;
  section.append(dynamicHeading, dynamicContainer);
  container.appendChild(section);
  updateSupplementalVisibility(root);
}

export function readSupplemental(root = document) {
  const rows = {};
  for (const {code, unitPrice: readsUnitPrice, quantity: readsQuantity = true} of SUPPLEMENTAL_CONCEPTS) {
    const get = field => root.getElementById(`supplemental-${code}-${field}`)?.value;
    rows[code] = {status:get('status'),amount:get('amount'),
      ...(readsQuantity ? {quantity:get('quantity')} : {}),
      ...(readsUnitPrice ? {unitPrice:get('unitPrice')} : {})};
  }
  const dynamicContainer = root.getElementById('payroll-supplemental-dynamic');
  for (const card of dynamicContainer?.children || []) {
    const concept = dynamicConcept({
      code: card.dataset.supplementalCode,
      label: card.dataset.supplementalLabel,
      output: 'supplemental',
      dynamic: true,
      quantityExpected: card.dataset.supplementalQuantity !== 'false',
      unitPriceExpected: card.dataset.supplementalUnitPrice === 'true',
      amountLabel: card.dataset.supplementalAmountLabel,
    });
    if (!concept) continue;
    const get = field => root.getElementById(`supplemental-${concept.code}-${field}`)?.value;
    rows[concept.code] = {code:concept.code, status:get('status'), amount:get('amount'), dynamic:true, output:'supplemental',
      label:concept.label, quantityExpected:concept.quantity, unitPriceExpected:concept.unitPrice, amountLabel:concept.amountLabel,
      ...(concept.quantity ? {quantity:get('quantity')} : {}),
      ...(concept.unitPrice ? {unitPrice:get('unitPrice')} : {})};
  }
  return validateSupplemental(rows);
}

export function applySupplemental(items, root = document, options = {}) {
  const allowLocked = options?.allowLocked === true;
  const readingComplete = options?.readingComplete === true;
  const dynamicContainer = root.getElementById('payroll-supplemental-dynamic');
  for (const item of items || []) {
    const concept = dynamicConcept(item);
    if (concept && dynamicContainer && !root.getElementById(`supplemental-${concept.code}-status`)) {
      dynamicContainer.appendChild(renderSupplementalCard(root, concept, {}, false));
    }
  }
  const dynamicHeading = root.getElementById('payroll-supplemental-dynamic-heading');
  const counts = new Map();
  for (const item of items || []) counts.set(String(item.code), (counts.get(String(item.code)) || 0) + 1);
  const dynamicConcepts = [...(dynamicContainer?.children || [])].map((card) => dynamicConcept({
    code: card.dataset.supplementalCode,
    label: card.dataset.supplementalLabel,
    output: 'supplemental',
    dynamic: true,
    quantityExpected: card.dataset.supplementalQuantity !== 'false',
    unitPriceExpected: card.dataset.supplementalUnitPrice === 'true',
    amountLabel: card.dataset.supplementalAmountLabel,
  })).filter(Boolean);
  for (const {code, unitPrice: readsUnitPrice, quantity: readsQuantity = true} of [...SUPPLEMENTAL_CONCEPTS, ...dynamicConcepts]) {
    const status = root.getElementById(`supplemental-${code}-status`);
    const card = status?.closest('[data-supplemental-code]');
    if (!status || (status.disabled && !allowLocked) || card?.dataset.manual === 'true') continue;
    const item = counts.get(code) === 1 ? items.find(item => String(item.code) === code) : null;
    const fields = [
      ...(readsQuantity ? ['quantity'] : []),
      ...(readsUnitPrice ? ['unitPrice'] : []),
      'amount'
    ];
    const readable = item && !item.ambiguous && fields.some((field) => decimal(item?.[field], field !== 'quantity') !== null);
    status.value = readable ? 'present' : (item ? 'unknown' : (readingComplete ? 'absent' : 'unknown'));
    for (const field of fields) {
      const input = root.getElementById(`supplemental-${code}-${field}`);
      if (!input || (input.readOnly && !allowLocked)) continue;
      const value = decimal(item?.[field], field !== 'quantity');
      input.value = value === null ? '' : String(value).replace('.', ',');
      input.disabled = status.value === 'absent';
      input.placeholder = status.value === 'absent' ? 'No aplica' : 'Pendiente';
    }
    if (card) card.hidden = status.value === 'absent';
  }
  const hasVisibleDynamic = [...(dynamicContainer?.children || [])].some((card) => !card.hidden);
  if (dynamicContainer) dynamicContainer.hidden = !hasVisibleDynamic;
  if (dynamicHeading) dynamicHeading.hidden = !hasVisibleDynamic;
  updateSupplementalVisibility(root);
}
