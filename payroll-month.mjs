import { monthReceipts, listFiles, sha256 } from './payroll-receipts.mjs?v=1';

// A monthly closure is separate from legacy and independent receipt folders.
const closurePath = folder => `${folder}/month-summary/review`;
const fail = message => { throw new Error(message); };
const quantity = value => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const number = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const round = value => Math.round(value * 100) / 100;

export async function collectMonth(bucket, folder, keys) {
  const [userId, year, month] = folder.split('/');
  const receipts = await monthReceipts(bucket, folder);
  if (!receipts.length) fail('No hay nóminas guardadas en este mes.');
  const totals = Object.fromEntries(keys.map(key => [key, 0]));
  let register;
  const signatures = [];
  const payrollHashes = new Set();
  const sourceHashes = new Set();
  for (const [index, receipt] of receipts.entries()) {
    const label = `Nómina ${index + 1}`;
    const has = name => receipt.files.some(file => file.id && file.name === name);
    if (!['timesheet', 'payroll', 'review'].every(has)) fail(`${label}: falta guardar algún documento o confirmar sus cantidades. Completa ese recibo antes de cerrar el mes.`);
    const blobs = await Promise.all(['timesheet', 'payroll', 'review'].map(async name => {
      const { data, error } = await bucket.download(`${receipt.folder}/${name}`);
      if (error || !data) fail('No se han podido leer todos los recibos. Comprueba la conexión y vuelve a intentarlo.');
      return data;
    }));
    let review;
    try { review = JSON.parse(await blobs[2].text()); } catch { fail(`${label}: la revisión no se ha podido leer. Vuelve a revisar ese recibo.`); }
    const expectedPeriod = `${year}-${month}${receipt.id ? `/${receipt.id}` : ''}`;
    if (review?.status !== 'complete' || review.period !== expectedPeriod || (review.userId && review.userId !== userId)) fail(`${label}: la revisión está pendiente o no corresponde a este mes.`);
    const values = {};
    const reference = {};
    if (!keys.some(key => quantity(review.timesheet?.[key]) !== null)) fail(`${label}: falta confirmar el registro de jornada mensual.`);
    for (const key of keys) {
      values[key] = quantity(review.payroll?.[key]);
      // Older forms omitted a concept only when absent from both documents.
      if (review.version !== 2 && review.payroll?.[key] === undefined && review.timesheet?.[key] === undefined) values[key] = 0;
      if (values[key] === null) fail(`${label}: quedan conceptos sin confirmar. Abre el recibo y pulsa Volver a leer nómina; confirma todas las cantidades, incluido 0 solo si el concepto no aparece.`);
      // The existing timesheet form explicitly uses a blank for an absent concept.
      reference[key] = review.timesheet?.[key] === undefined ? 0 : quantity(review.timesheet[key]);
      if (reference[key] === null) fail(`${label}: faltan cantidades confirmadas del registro mensual. Revisa el registro antes de cerrar el mes.`);
    }
    if (!register) register = reference;
    if (keys.some(key => round(register[key]) !== round(reference[key]))) fail('Los registros de jornada confirmados no coinciden. Todas las nóminas deben contrastarse con el mismo registro mensual; revisa sus cantidades antes de cerrar.');
    const hashes = await Promise.all(blobs.map(sha256));
    if (payrollHashes.has(hashes[1]) || (review.payrollSourceHash && sourceHashes.has(review.payrollSourceHash))) fail('Hay una nómina duplicada entre los recibos del mes. Revisa los documentos antes de cerrar.');
    payrollHashes.add(hashes[1]);
    if (review.payrollSourceHash) sourceHashes.add(review.payrollSourceHash);
    signatures.push({ id: receipt.id, hashes });
    for (const key of keys) totals[key] = round(totals[key] + values[key]);
  }
  return { fingerprint: await sha256(new Blob([JSON.stringify(signatures)])), receiptCount: receipts.length,
    receiptIds: receipts.map(receipt => receipt.id), timesheet: register, payroll: totals };
}

function resultFor(folder, snapshot, compare) {
  const [userId, year, month] = folder.split('/');
  return { version: 1, scope: 'month', status: 'complete', userId, year: Number(year), month: Number(month),
    ...snapshot, comparisons: compare(new Map(Object.entries(snapshot.timesheet)), new Map(Object.entries(snapshot.payroll))) };
}

export async function closeMonth(bucket, folder, keys, compare) {
  const snapshot = await collectMonth(bucket, folder, keys);
  const result = { ...resultFor(folder, snapshot, compare), closedAt: new Date().toISOString() };
  const { error } = await bucket.upload(closurePath(folder), new Blob([JSON.stringify(result)], {type:'application/json'}), {
    contentType: 'application/json', cacheControl: '0', upsert: true
  });
  if (error) fail('No se ha podido guardar el cierre mensual. Tus recibos siguen guardados; vuelve a intentarlo.');
  // A receipt added/changed during the request must never produce a final result.
  if ((await collectMonth(bucket, folder, keys)).fingerprint !== snapshot.fingerprint) fail('Los recibos han cambiado mientras se cerraba el mes. Revisa la lista y vuelve a confirmar que están todos.');
  return result;
}

export async function readMonthClosure(bucket, folder, keys, compare) {
  const files = await listFiles(bucket, `${folder}/month-summary`);
  if (!files.some(file => file.id && file.name === 'review')) return null;
  const { data, error } = await bucket.download(closurePath(folder));
  if (error || !data) fail('No se ha podido recuperar el cierre mensual. Comprueba la conexión.');
  let saved;
  try { saved = JSON.parse(await data.text()); } catch { fail('El cierre guardado no se ha podido leer. Vuelve a cerrar el mes.'); }
  const snapshot = await collectMonth(bucket, folder, keys);
  if (saved?.scope !== 'month' || saved.status !== 'complete' || saved.fingerprint !== snapshot.fingerprint) return null;
  return { ...resultFor(folder, snapshot, compare), closedAt: saved.closedAt };
}
