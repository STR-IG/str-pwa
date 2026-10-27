export function allowedPayrollPeriod(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: 'numeric' }).formatToParts(date);
  const year = Number(parts.find(p => p.type === 'year').value);
  const month = Number(parts.find(p => p.type === 'month').value);
  // Payrolls are reviewed in the month following their period.
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

// Compatibility interface for the monthly reviewer. All bytes stay in RAM.
// Each page owns its own instance; there is no network or browser persistence.
export function createPayrollSession({ now = () => new Date() } = {}) {
  const files = new Map();
  let closed = false;
  const period = allowedPayrollPeriod(now());
  function available(path) {
    const current = allowedPayrollPeriod(now());
    if (current.year !== period.year || current.month !== period.month) { closed = true; files.clear(); }
    const [, year, month] = path.split('/');
    return !closed && (!year || Number(year) === period.year) && (!month || Number(month) === period.month);
  }
  return {
    async upload(path, blob) {
      if (!available(path)) return { data: null, error: new Error('SESSION_CLOSED') };
      files.set(path, { blob, updated_at: new Date().toISOString() });
      return { data: { path }, error: null };
    },
    async download(path) {
      const file = available(path) ? files.get(path) : null;
      return file ? { data: file.blob, error: null }
        : { data: null, error: new Error('NOT_FOUND') };
    },
    async list(path, { offset = 0, limit = 100 } = {}) {
      if (!available(path)) return { data: [], error: null };
      const prefix = path.replace(/\/$/, '') + '/';
      const items = new Map();
      for (const [key, file] of files) {
        if (!key.startsWith(prefix)) continue;
        const relative = key.slice(prefix.length);
        const name = relative.split('/')[0];
        const folder = relative.includes('/');
        items.set(name, { name, id: folder ? null : key,
          updated_at: folder ? null : file.updated_at,
          metadata: folder ? null : { mimetype: file.blob.type, size: file.blob.size } });
      }
      return { data: [...items.values()].sort((a, b) => a.name.localeCompare(b.name))
        .slice(offset, offset + limit), error: null };
    },
    async remove(paths) {
      paths.forEach(path => files.delete(path));
      return { data: paths.map(name => ({ name })), error: null };
    },
    clear() { files.clear(); },
    close() { closed = true; files.clear(); }
  };
}
