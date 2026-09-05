import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { formatMoney, formatRate, normalizeDiscountsResponse } from './discounts-reader.mjs?v=2';

const SUPABASE_URL = 'https://icneigdnuntzugisexaz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/lab-read-payroll-variables`;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
});

const elements = {
  input: document.getElementById('discounts-image'),
  select: document.getElementById('select-discounts-image'),
  change: document.getElementById('change-discounts-image'),
  review: document.getElementById('review-discounts'),
  preview: document.getElementById('discounts-preview'),
  image: document.getElementById('discounts-preview-image'),
  actions: document.getElementById('discounts-actions'),
  fileError: document.getElementById('discounts-file-error'),
  status: document.getElementById('discounts-status'),
  statusIcon: document.getElementById('discounts-status-icon'),
  statusTitle: document.getElementById('discounts-status-title'),
  statusMessage: document.getElementById('discounts-status-message'),
  results: document.getElementById('discounts-results'),
  resultsContent: document.getElementById('discounts-results-content'),
};

let selectedFile = null;
let previewUrl = '';
let activeRequest = null;

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
  elements.change.disabled = busy;
  elements.review.disabled = busy;
  elements.input.disabled = busy;
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
  revokePreview();
  selectedFile = null;
  elements.input.value = '';
  elements.preview.hidden = true;
  elements.actions.hidden = true;
  setFileError();
  clearResults();
  setBusy(false);
}

function selectFile(file) {
  setFileError();
  clearResults();
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
  elements.actions.hidden = false;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function prepareImageDataUrl(file) {
  const temporaryUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(temporaryUrl);
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    if (!longest) throw new Error('IMAGE_DECODE_FAILED');
    const scale = Math.min(1, 2200 / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('CANVAS_UNAVAILABLE');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    URL.revokeObjectURL(temporaryUrl);
  }
}

function valueBox(label, value) {
  const box = document.createElement('div');
  box.className = 'discounts-value';
  const name = document.createElement('span');
  name.textContent = label;
  const result = document.createElement('strong');
  result.textContent = value;
  box.append(name, result);
  return box;
}

function rowTitle(row) {
  return row.code ? `${row.code} · ${row.label}` : row.label;
}

function detectedValues(row) {
  if (row.section === 'bases' || row.section === 'contributions') {
    return [['Importe', formatMoney(row.value)]];
  }
  if (row.section === 'worker') {
    return [
      ['Base', formatMoney(row.base)],
      ['% trabajador/a', formatRate(row.rate)],
      ['Cuota trabajador/a', formatMoney(row.amount)],
    ];
  }
  if (row.section === 'company') {
    return [
      ['Base', formatMoney(row.base)],
      ['% empresa', formatRate(row.rate)],
      ['Cuota empresa', formatMoney(row.amount)],
    ];
  }
  if (row.section === 'irpf') {
    return [
      [row.kind === 'irpf' ? 'Base IRPF' : 'Base', formatMoney(row.base)],
      ['Porcentaje', formatRate(row.rate)],
      [row.kind === 'in_kind_irpf' ? 'Retención en especie' : 'Retención', formatMoney(row.amount)],
    ];
  }
  if (row.section === 'worker_total') return [['Cuota trabajador/a', formatMoney(row.amount)]];
  if (row.section === 'company_total') return [['Cuota empresa', formatMoney(row.amount)]];

  const values = [];
  if (row.value !== null) values.push(['Importe', formatMoney(row.value)]);
  if (row.base !== null) values.push(['Base', formatMoney(row.base)]);
  if (row.rate !== null) values.push(['Porcentaje', formatRate(row.rate)]);
  if (row.amount !== null) values.push(['Importe detectado', formatMoney(row.amount)]);
  return values;
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
  const detected = detectedValues(row);
  if (detected.length) {
    const values = document.createElement('div');
    values.className = 'discounts-values';
    detected.forEach(([label, value]) => values.appendChild(valueBox(label, value)));
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

function readableError(status, code) {
  if (status === 401 || status === 403) return 'Tu sesión privada ha caducado. Vuelve a entrar y repite la revisión.';
  if (code === 'INVALID_IMAGE') return 'No se ha podido preparar esta imagen. Prueba con una captura JPG, PNG o WEBP.';
  if (code === 'IMAGE_TOO_LARGE') return 'La captura es demasiado grande. Recorta únicamente la tabla Seguridad Social e IRPF.';
  return 'No se ha podido revisar la captura. Comprueba la conexión y vuelve a intentarlo.';
}

async function reviewDiscounts() {
  if (!selectedFile || activeRequest) return;
  setFileError();
  elements.results.hidden = true;
  setBusy(true);
  setStatus('checking', 'Revisando descuentos…', 'Buscando únicamente datos de Seguridad Social e IRPF.');
  const controller = new AbortController();
  activeRequest = controller;
  try {
    const imageDataUrl = await prepareImageDataUrl(selectedFile);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('SESSION_REQUIRED');
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageDataUrl, readDiscounts: true }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload?.error || 'REQUEST_FAILED'), { status: response.status });
    const normalized = normalizeDiscountsResponse(payload);
    if (!normalized.readable) {
      setStatus('failed', 'No se puede leer esta captura', 'Comprueba que esté nítida, completa y que contenga la tabla Seguridad Social e IRPF. Después selecciona otra imagen.');
      return;
    }
    renderResults(normalized.rows);
    setStatus('ready', 'Lectura completada', 'Revisa los datos detectados. Las cifras ausentes o no legibles se muestran como “No indicado”.');
  } catch (error) {
    if (error?.name === 'AbortError') return;
    const message = error?.message === 'SESSION_REQUIRED'
      ? 'Tu sesión privada ha caducado. Vuelve a entrar y repite la revisión.'
      : error?.message === 'IMAGE_DECODE_FAILED'
        ? 'No se ha podido abrir esta imagen. En iPhone, prueba a guardarla como JPG o PNG y vuelve a seleccionarla.'
        : readableError(error?.status, error?.message);
    setStatus('failed', 'No se ha podido revisar', message);
  } finally {
    if (activeRequest === controller) activeRequest = null;
    setBusy(false);
  }
}

elements.select?.addEventListener('click', chooseImage);
elements.change?.addEventListener('click', chooseImage);
elements.review?.addEventListener('click', reviewDiscounts);
elements.input?.addEventListener('change', (event) => selectFile(event.target.files?.[0]));
window.addEventListener('str:discounts-closed', resetReader);
window.addEventListener('beforeunload', resetReader);
