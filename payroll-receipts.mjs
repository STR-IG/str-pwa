// Independent receipts; the first three path segments preserve existing Storage RLS.
export const isReceiptId = value => /^receipt-\d{13}-[0-9a-f-]{36}$/.test(value);
export const newReceiptId = () => `receipt-${Date.now()}-${crypto.randomUUID()}`;
export const receiptCreatedAt = id => isReceiptId(id) ? new Date(Number(id.split('-')[1])).toISOString() : null;

export async function listFiles(bucket, path) {
  const result = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(path, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < 100) return result;
  }
}

export async function monthReceipts(bucket, folder) {
  const files = await listFiles(bucket, folder);
  const receipts = [];
  if (files.some(file => file.id && ['timesheet', 'payroll', 'review'].includes(file.name))) {
    receipts.push({ id: '', folder, files }); // Legacy receipt, never moved or deleted.
  }
  for (const item of files.filter(file => !file.id && isReceiptId(file.name))) {
    const path = `${folder}/${item.name}`;
    receipts.push({ id: item.name, folder: path, files: await listFiles(bucket, path) });
  }
  return receipts;
}

export async function sha256(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Exact file duplicates, not equal amounts/months. Any read error fails closed.
export async function assertUniquePayroll(bucket, folder, blob, currentPath, sourceHash = '') {
  const hash = await sha256(blob);
  for (const receipt of await monthReceipts(bucket, folder)) {
    const path = `${receipt.folder}/payroll`;
    if (path === currentPath || !receipt.files.some(file => file.id && file.name === 'payroll')) continue;
    if (sourceHash && receipt.files.some(file => file.id && file.name === 'review')) {
      const result = await bucket.download(`${receipt.folder}/review`);
      if (result.error) throw result.error;
      let review;
      try { review = JSON.parse(await result.data.text()); } catch { /* Legacy invalid JSON: compare saved bytes. */ }
      if (review?.payrollSourceHash === sourceHash) throw new Error('DUPLICATE_PAYROLL');
    }
    const { data, error } = await bucket.download(path);
    if (error) throw error;
    if (await sha256(data) === hash) throw new Error('DUPLICATE_PAYROLL');
  }
  return hash;
}
