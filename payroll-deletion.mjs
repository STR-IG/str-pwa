import { listFiles, isReceiptId } from './payroll-receipts.mjs?v=1';

const segment = value => typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value) && value !== '.' && value !== '..';

export function deletionTarget(userId, { scope, year, month, receiptId = '' }) {
  if (!segment(userId) || !['all', 'month', 'receipt', 'payroll', 'timesheet', 'discounts'].includes(scope)) throw Error('INVALID_DELETE_TARGET');
  if (scope === 'all') return userId;
  if (!/^\d{4}$/.test(String(year)) || !Number.isInteger(Number(month)) || Number(month) < 1 || Number(month) > 12) throw Error('INVALID_DELETE_PERIOD');
  const folder = `${userId}/${year}/${String(month).padStart(2, '0')}`;
  if (['month', 'timesheet'].includes(scope)) return folder;
  if (receiptId && !isReceiptId(receiptId)) throw Error('INVALID_DELETE_RECEIPT');
  return `${folder}${receiptId ? `/${receiptId}` : ''}`;
}

// Enumerate before deleting; never mutate a paginated listing while walking it.
export async function documentPaths(bucket, root) {
  const paths = [];
  const visit = async (folder, depth) => {
    if (depth > 6) throw Error('INVALID_DOCUMENT_TREE');
    for (const item of await listFiles(bucket, folder)) {
      if (!segment(item.name)) throw Error('INVALID_DOCUMENT_PATH');
      const path = `${folder}/${item.name}`;
      if (item.id != null) paths.push(path);
      else await visit(path, depth + 1);
    }
  };
  await visit(root, 0);
  return paths;
}

export function stripReview(review, scope) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) throw Error('INVALID_REVIEW');
  const next = { ...review, updatedAt: new Date().toISOString() };
  delete next.comparisons;
  delete next.incidentCount;
  if (scope === 'timesheet') {
    delete next.timesheet;
    delete next.paymentInfo;
    next.status = 'pending';
  } else if (scope === 'discounts') {
    delete next.discounts;
    delete next.paymentInfo;
    if (next.supplemental) {
      next.supplemental = { ...next.supplemental };
      delete next.supplemental['0038'];
    }
    // The economic reader can also hold deduction amounts. Remove those copies
    // so the statistics cannot redisplay erased deductions from another field.
    if (next.payrollEconomics) next.payrollEconomics = {
      ...next.payrollEconomics,
      totals: { ...next.payrollEconomics.totals, deductions: null, net: null },
      concepts: (next.payrollEconomics.concepts || []).filter(item => item.side !== 'deductions')
    };
  }
  return next;
}

export async function deletePayrollData({ bucket, userId, scope, year, month, receiptId = '' }) {
  const root = deletionTarget(userId, { scope, year, month, receiptId });
  const paths = await documentPaths(bucket, root);
  const monthRoot = scope === 'all' ? null : deletionTarget(userId, { scope: 'month', year, month });
  const summaryPath = monthRoot && `${monthRoot}/month-summary/review`;
  let remove = [];
  const rewrites = [];
  if (['all', 'month'].includes(scope)) remove = paths;
  else if (scope === 'receipt') remove = paths.filter(path => path === `${root}/payroll` || path === `${root}/timesheet` || path === `${root}/review`);
  else if (scope === 'payroll') remove = paths.filter(path => path === `${root}/payroll` || path === `${root}/review`);
  else {
    remove = scope === 'timesheet' ? paths.filter(path => path.endsWith('/timesheet') || path === summaryPath) : [];
    const reviewPaths = paths.filter(path => path.endsWith('/review') && path !== summaryPath
      && (scope === 'timesheet' || path === `${root}/review`));
    // Parse every affected review before making changes. A corrupt review must
    // not silently survive a successful-looking deletion.
    for (const path of reviewPaths) {
      const result = await bucket.download(path);
      if (result.error || !result.data) throw result.error || Error('REVIEW_UNAVAILABLE');
      const next = stripReview(JSON.parse(await result.data.text()), scope);
      rewrites.push({ path, next });
    }
  }
  if (summaryPath && !remove.includes(summaryPath)) remove.unshift(summaryPath);
  // Invalidating the monthly closure precedes any partial operation.
  remove = [...new Set(remove)].sort((a, b) => Number(b.endsWith('/month-summary/review')) - Number(a.endsWith('/month-summary/review')));
  for (let i = 0; i < remove.length; i += 50) {
    const result = await bucket.remove(remove.slice(i, i + 50));
    if (result.error) throw result.error;
  }
  for (const { path, next } of rewrites) {
    const result = await bucket.upload(path, new Blob([JSON.stringify(next)], { type: 'application/json' }), {
      contentType: 'application/json', cacheControl: '0', upsert: true
    });
    if (result.error) throw result.error;
  }
  const remaining = await documentPaths(bucket, root);
  if (remaining.some(path => remove.includes(path)) || (['all', 'month'].includes(scope) && remaining.length)) throw Error('DELETE_INCOMPLETE');
  for (const { path, next } of rewrites) {
    const result = await bucket.download(path);
    if (result.error || !result.data || JSON.stringify(JSON.parse(await result.data.text())) !== JSON.stringify(next)) throw Error('DELETE_VERIFY_FAILED');
  }
  if (summaryPath && root !== monthRoot) {
    if ((await documentPaths(bucket, `${monthRoot}/month-summary`)).includes(summaryPath)) throw Error('DELETE_INCOMPLETE');
  }
  return { removed: remove.length, updated: rewrites.length };
}

export async function clearLocalPayrollData(userId, environment = globalThis, target = { scope: 'all' }) {
  if (!segment(userId)) throw Error('INVALID_USER');
  const storage = environment.localStorage;
  if (storage) {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    let prefix = `strLabSchedule:${userId}:`;
    if (target.scope !== 'all') {
      deletionTarget(userId, target);
      prefix += `${target.year}-${String(target.month).padStart(2, '0')}`;
      if (!['month', 'timesheet'].includes(target.scope) && target.receiptId) prefix += `/${target.receiptId}`;
    }
    const wholeMonth = ['month', 'timesheet'].includes(target.scope);
    for (const key of keys) if (key === prefix || (wholeMonth && key?.startsWith(`${prefix}/`)) || (target.scope === 'all' && key?.startsWith(prefix))) storage.removeItem(key);
  }
  if (environment.caches) {
    for (const name of await environment.caches.keys()) {
      const cache = await environment.caches.open(name);
      for (const request of await cache.keys()) {
        const pathname = decodeURIComponent(new URL(request.url).pathname);
        if (pathname.includes(`/storage/v1/object/`) && pathname.includes(`/payroll-documents/${userId}/`)) {
          if (!(await cache.delete(request))) throw Error('LOCAL_DELETE_INCOMPLETE');
        }
      }
    }
  }
}

export function confirmDeletion(scope, description, environment = globalThis) {
  const detail = {
    all: 'Se eliminarán todas las imágenes de nóminas y registros, revisiones, descuentos y cierres mensuales. También desaparecerán sus estadísticas.',
    month: 'Se eliminarán todos los documentos, recibos, revisiones y descuentos de este mes, incluido el cierre mensual.',
    receipt: 'Se eliminarán la nómina, la copia del registro y toda la revisión y descuentos de este recibo.',
    payroll: 'Se eliminarán la imagen de esta nómina, su revisión, cifras y descuentos. Se conserva la imagen del registro.',
    timesheet: 'Se eliminarán todas las copias del registro de este mes y sus cantidades guardadas. Se conservan las nóminas, que quedarán pendientes de revisar.',
    discounts: 'Se eliminarán los descuentos de este recibo y las deducciones y neto del resumen económico. Las imágenes se conservan y pueden seguir mostrando esas cifras.'
  }[scope];
  if (!detail) return false;
  const text = `${description}\n\n${detail}\n\nNo se puede deshacer. Este borrado no garantiza la eliminación inmediata de respaldos ni de datos enviados anteriormente a proveedores de IA.`;
  return scope === 'all' ? environment.prompt(`${text}\n\nEscribe BORRAR para confirmar:`) === 'BORRAR' : environment.confirm(text);
}
