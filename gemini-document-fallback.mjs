const SUPABASE_URL = 'https://icneigdnuntzugisexaz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/gemini-str`;

export const GEMINI_FIELDS = Object.freeze({
  rotation: 'plus_rotatividad',
  meals: 'comidas_can_guasch',
  night: 'plus_nocturno',
  shift: 'plus_turno',
  holiday: 'plus_festivo',
  shift12: 'plus_turno_12h',
  holidayDiets: 'dietas_festivos',
  vacation: 'pluses_vacaciones',
});

const STR_LABELS = Object.freeze({
  rotation: 'Plus rotatividad',
  meals: 'Comidas Can Guasch',
  night: 'Plus Nocturno',
  shift: 'Plus de turno',
  holiday: 'Plus Festivo',
  shift12: 'Plus de turno 12 horas',
  holidayDiets: 'Dietas Festivos',
  vacation: 'Pluses Vacaciones',
});

function quantity(value) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!normalized || !/^(?:\d+|\d+[.]\d+)$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function sameQuantity(left, right) {
  const a = quantity(left);
  const b = quantity(right);
  return a !== null && b !== null && Math.abs(a - b) < 0.001;
}

export function inputValues(fieldMap, documentRef = document) {
  const values = new Map();
  Object.entries(fieldMap).forEach(([key, id]) => {
    const value = documentRef.getElementById(id)?.value?.trim();
    if (quantity(value) !== null) values.set(key, value);
  });
  return values;
}

export function conceptValues(concepts, conceptKey) {
  const values = new Map();
  for (const item of concepts || []) {
    const key = conceptKey(item?.name);
    const value = String(item?.value ?? '').trim();
    if (key && !values.has(key) && quantity(value) !== null) values.set(key, value);
  }
  return values;
}

export function payrollFallbackKeys(remoteValues, localValues, expectedKeys) {
  const requested = new Set();
  for (const key of Object.keys(GEMINI_FIELDS)) {
    const remote = remoteValues.get(key);
    const local = localValues.get(key);
    if (remote !== undefined && local !== undefined && !sameQuantity(remote, local)) requested.add(key);
    if (remote === undefined && (local !== undefined || expectedKeys.has(key))) requested.add(key);
  }
  return [...requested];
}

export function timesheetFallbackKeys(remoteValues, localValues) {
  const requested = new Set();
  for (const key of Object.keys(GEMINI_FIELDS)) {
    const remote = remoteValues.get(key);
    const local = localValues.get(key);
    if (remote !== undefined && local !== undefined && !sameQuantity(remote, local)) requested.add(key);
  }
  const visibleKeys = new Set([...remoteValues.keys(), ...localValues.keys()]);
  if (visibleKeys.size <= 2) {
    for (const key of Object.keys(GEMINI_FIELDS)) {
      if (!visibleKeys.has(key)) requested.add(key);
    }
  }
  return [...requested];
}

export function mergeGeminiFields(concepts, fields, requestedKeys, localValues, conceptKey) {
  const merged = (concepts || []).map((item) => ({ ...item, engine: item?.engine || 'str' }));
  const positions = new Map();
  merged.forEach((item, index) => {
    const key = conceptKey(item?.name);
    if (key && !positions.has(key)) positions.set(key, index);
  });

  for (const key of requestedKeys) {
    const field = fields?.[GEMINI_FIELDS[key]];
    if (field?.found !== true || quantity(field.value) === null) continue;
    const value = String(field.value).replace('.', ',');
    const position = positions.get(key);
    if (position === undefined) {
      merged.push({ name: STR_LABELS[key], value, engine: 'gemini' });
      positions.set(key, merged.length - 1);
      continue;
    }
    const current = merged[position];
    const local = localValues.get(key);
    if (local !== undefined && sameQuantity(value, local) && !sameQuantity(value, current.value)) {
      merged[position] = { ...current, value, engine: 'gemini' };
    }
  }
  return merged;
}

async function focusedImageDataUrl(img, documentType) {
  if (!img?.naturalWidth || !img?.naturalHeight) {
    await new Promise((resolve, reject) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', reject, { once: true });
    });
  }
  const region = documentType === 'timesheet'
    ? { top: 0.46, height: 0.54 }
    : { top: 0.04, height: 0.78 };
  const sourceY = Math.round(img.naturalHeight * region.top);
  const sourceHeight = Math.max(1, Math.round(img.naturalHeight * region.height));
  const scale = Math.min(1, 1400 / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(img, 0, sourceY, img.naturalWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

export async function readGeminiFallback({ session, documentType, img, requestedKeys }) {
  if (!session?.access_token || !['payroll', 'timesheet'].includes(documentType) || !requestedKeys.length) return null;
  const requestedFields = requestedKeys.map((key) => GEMINI_FIELDS[key]).filter(Boolean);
  if (!requestedFields.length) return null;
  const imageDataUrl = await focusedImageDataUrl(img, documentType);
  const adminAffiliate = String(new URLSearchParams(window.location.search).get('adminAffiliate') || '').trim().toLowerCase();
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'read_document_fallback',
      document_type: documentType,
      requested_fields: requestedFields,
      image_data_url: imageDataUrl,
      ...(adminAffiliate ? { admin_affiliate: adminAffiliate } : {}),
    }),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  if (!data?.fields || typeof data.fields !== 'object' || Array.isArray(data.fields)) return null;
  return data.fields;
}
