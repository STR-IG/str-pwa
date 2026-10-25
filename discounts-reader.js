import { recognizeLocally, localDiscountRows, discountTemplates, discountFields, confirmedDiscountRows } from './payroll-local-reader.mjs?v=1';

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);


const elements = {
  input: document.getElementById('discounts-image'),
  select: document.getElementById('select-discounts-image'),
  change: document.getElementById('change-discounts-image'),
  review: document.getElementById('review-discounts'),
  preview: document.getElementById('discounts-preview'),
  image: document.getElementById('discounts-preview-image'),
  privacyConsent: document.getElementById('discounts-privacy-consent'),
  privacyCheckbox: document.getElementById('confirm-discounts-privacy'),
  actions: document.getElementById('discounts-actions'),
  fileError: document.getElementById('discounts-file-error'),
  status: document.getElementById('discounts-status'),
  statusIcon: document.getElementById('discounts-status-icon'),
  statusTitle: document.getElementById('discounts-status-title'),
  statusMessage: document.getElementById('discounts-status-message'),
  results: document.getElementById('discounts-results'),
  resultsContent: document.getElementById('discounts-results-content'),
  save: document.getElementById('save-discounts'),
  cancel: document.getElementById('cancel-discounts'),
};

let selectedFile = null;
let previewUrl = '';
let activeRequest = null;
let latestRows = [];

function updateReviewAvailability() {
  elements.review.disabled = Boolean(activeRequest) || !selectedFile || !elements.privacyCheckbox.checked;
}

function setFileError(message = '') {
  elements.fileError.textContent = message;
  elements.fileError.hidden = !message;
}

function clearResults() {
  elements.results.hidden = true;
  elements.resultsContent.replaceChildren();
  elements.status.hidden = true;
}

function setBusy(busy) {
  elements.select.disabled = busy;
  if (typeof manualButton !== 'undefined') manualButton.disabled = busy;
  elements.change.disabled = busy;
  elements.input.disabled = busy;
  elements.privacyCheckbox.disabled = busy;
  elements.review.disabled = busy || !selectedFile || !elements.privacyCheckbox.checked;
  elements.save.disabled = busy || !latestRows.length;
  elements.cancel.disabled = busy;
}

function setStatus(kind, title, message) {
  elements.status.hidden = false;
  elements.status.className = `analysis-progress discounts-status ${kind}`;
  elements.statusIcon.textContent = kind === 'checking' ? '🔎' : kind === 'ready' ? '✓' : '!';
  elements.statusTitle.textContent = title;
  elements.statusMessage.textContent = message;
}

function chooseImage() {
  if (elements.input.disabled) return;
  elements.input.value = '';
  elements.input.click();
}

function revokePreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = '';
  elements.image.removeAttribute('src');
}

function resetReader() {
  activeRequest?.abort();
  activeRequest = null;
  elements.save.disabled = false;
  elements.cancel.disabled = false;
  revokePreview();
  selectedFile = null;
  latestRows = [];
  elements.input.value = '';
  elements.preview.hidden = true;
  elements.privacyConsent.hidden = true;
  elements.privacyCheckbox.checked = false;
  elements.actions.hidden = true;
  setFileError();
  clearResults();
  setBusy(false);
}

function selectFile(file) {
  if (activeRequest) return;
  latestRows = [];
  elements.save.disabled = true;
  setFileError();
  clearResults();
  elements.privacyCheckbox.checked = false;
  elements.privacyConsent.hidden = true;
  updateReviewAvailability();
  if (!file) return;
  if (!ACCEPTED_TYPES.has(file.type)) {
    setFileError('Selecciona una imagen JPG, PNG, WEBP, HEIC o HEIF.');
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    setFileError('La imagen es demasiado grande. Recorta únicamente la tabla Seguridad Social e IRPF y vuelve a intentarlo.');
    return;
  }
  revokePreview();
  selectedFile = file;
  previewUrl = URL.createObjectURL(file);
  elements.image.src = previewUrl;
  elements.preview.hidden = false;
  elements.privacyConsent.hidden = false;
  elements.actions.hidden = false;
  updateReviewAvailability();
}

function valueBox(label, row, field) {
  const box = document.createElement('label');
  box.className = 'discounts-value';
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'text'; input.inputMode = 'decimal';
  input.value = row[field] == null ? '' : String(row[field]).replace('.', ',');
  input.placeholder = 'No indicado';
  input.addEventListener('input', () => { row[field] = input.value; });
  box.append(name, input);
  return box;
}

function rowTitle(row) {
  return row.code ? `${row.code} · ${row.label}` : row.label;
}

function rowCard(row) {
  const article = document.createElement('article');
  article.className = 'discounts-row';
  const heading = document.createElement('h4');
  heading.textContent = rowTitle(row);
  article.appendChild(heading);
  if (row.kind === 'unknown') {
    const text = document.createElement('p');
    text.className = 'discounts-unknown-text';
    text.textContent = row.sourceText || 'Texto original no legible';
    article.appendChild(text);
  }
  const company = row.section === 'company' || row.section === 'company_total';
  const labels = { value: 'Importe', base: 'Base',
    rate: company ? '% empresa' : row.section === 'worker' ? '% trabajador/a' : 'Porcentaje',
    amount: company ? 'Cuota empresa' : row.section === 'worker' || row.section === 'worker_total'
      ? 'Cuota trabajador/a' : row.kind === 'in_kind_irpf' ? 'Retención en especie' : 'Retención' };
  const detected = discountFields(row).map(field => [labels[field], field]);
  if (detected.length) {
    const values = document.createElement('div');
    values.className = 'discounts-values';
    detected.forEach(([label, field]) => values.appendChild(valueBox(label, row, field)));
    article.appendChild(values);
  }
  return article;
}

function renderGroup(title, rows) {
  if (!rows.length) return null;
  const section = document.createElement('section');
  section.className = 'discounts-group';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const list = document.createElement('div');
  list.className = 'discounts-list';
  rows.forEach((row) => list.appendChild(rowCard(row)));
  section.append(heading, list);
  return section;
}

function renderResults(rows) {
  latestRows = rows.map(row => ({ ...row }));
  rows = latestRows;
  const groups = [
    ['Bases y prorratas', rows.filter((row) => row.section === 'bases')],
    ['Seguridad Social – trabajador/a', rows.filter((row) => row.section === 'worker')],
    ['IRPF', rows.filter((row) => row.section === 'irpf')],
    ['Seguridad Social – empresa', rows.filter((row) => row.section === 'company')],
    ['Aportaciones de la empresa', rows.filter((row) => row.section === 'contributions')],
    ['Total Cotiz. SS e IRPF', rows.filter((row) => row.section === 'worker_total' || row.section === 'company_total')],
    ['Otros conceptos detectados', rows.filter((row) => row.section === 'unknown')],
  ];
  elements.resultsContent.replaceChildren(...groups.map(([title, items]) => renderGroup(title, items)).filter(Boolean));

  elements.results.hidden = false;
}

function saveDiscounts() {
  if (!latestRows.length || activeRequest) return;
  let rows;
  try { rows = confirmedDiscountRows(latestRows); }
  catch (error) { setStatus('failed', 'Revisa las cifras', error.message); return; }
  if (!rows.length) {
    setStatus('failed', 'Faltan cifras', 'Introduce al menos un importe. Los campos vacíos no se guardan como cero.');
    return;
  }
  elements.save.disabled = true;
  elements.cancel.disabled = true;
  const request = {
    rows,
    handled: false,
    onSaved: () => {},
    onError: () => {
      elements.save.disabled = false;
      elements.cancel.disabled = false;
      setStatus('failed', 'No se han podido guardar', 'Comprueba la conexión y vuelve a intentarlo. Los datos detectados siguen en pantalla.');
    },
  };
  window.dispatchEvent(new CustomEvent('str:discounts-save', { detail: request }));
  if (!request.handled) request.onError();
}

function cancelDiscounts() {
  if (activeRequest) return;
  document.getElementById('top-back')?.click();
}

async function reviewDiscounts() {
  if (!selectedFile || activeRequest) return;
  if (!elements.privacyCheckbox.checked) {
    setFileError('Confirma que la captura no contiene datos personales antes de revisarla.');
    return;
  }
  const file = selectedFile;
  const controller = new AbortController();
  activeRequest = controller;
  setBusy(true);
  setFileError();
  setStatus('checking', 'Leyendo en tu dispositivo…', 'No enviamos la captura a servicios de IA.');
  try {
    const text = await recognizeLocally(file);
    if (activeRequest !== controller || controller.signal.aborted) return;
    renderResults(localDiscountRows(text));
    setStatus('ready', 'Comprueba los descuentos', 'Revisa los importes sugeridos y completa las cuotas y porcentajes mirando la imagen. Los campos vacíos quedan sin indicar.');
  } catch {
    if (activeRequest !== controller || controller.signal.aborted) return;
    renderResults(discountTemplates());
    setStatus('warning', 'Completa las cifras manualmente', 'No se ha podido leer la imagen en este dispositivo. Puedes introducir los importes mirando la captura.');
  } finally {
    if (activeRequest === controller) { activeRequest = null; setBusy(false); }
  }
}

const manualButton = document.createElement('button');
manualButton.type = 'button';
manualButton.id = 'enter-discounts-manually';
manualButton.className = 'secondary select-image';
manualButton.textContent = 'Introducir descuentos manualmente';
manualButton.addEventListener('click', () => {
  if (activeRequest) return;
  renderResults(discountTemplates());
  setBusy(false);
  setStatus('ready', 'Introduce tus descuentos', 'Copia solo las cifras necesarias. Deja vacío lo que no aparezca en tu nómina.');
});
elements.select?.after(manualButton);

elements.select?.addEventListener('click', chooseImage);
elements.change?.addEventListener('click', chooseImage);
elements.review?.addEventListener('click', reviewDiscounts);
elements.save?.addEventListener('click', saveDiscounts);
elements.cancel?.addEventListener('click', cancelDiscounts);
elements.privacyCheckbox?.addEventListener('change', () => {
  setFileError();
  updateReviewAvailability();
});
elements.input?.addEventListener('change', (event) => selectFile(event.target.files?.[0]));
window.addEventListener('str:discounts-closed', resetReader);
window.addEventListener('str:discounts-opened', (event) => {
  const rows = event.detail?.rows;
  if (!Array.isArray(rows) || !rows.length) return;
  renderResults(rows);
  setStatus('ready', 'Descuentos guardados', 'Estos son los datos confirmados para este recibo.');
});
window.addEventListener('beforeunload', resetReader);
