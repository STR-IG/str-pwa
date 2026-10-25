// Compatibility interface for the monthly reviewer. All bytes stay in RAM.
// Each page owns its own instance; there is no network or browser persistence.
export function createPayrollSession() {
  const files = new Map();
  let closed = false;
  return {
    async upload(path, blob) {
      if (closed) return { data: null, error: new Error('SESSION_CLOSED') };
      files.set(path, { blob, updated_at: new Date().toISOString() });
      return { data: { path }, error: null };
    },
    async download(path) {
      const file = files.get(path);
      return file ? { data: file.blob, error: null }
        : { data: null, error: new Error('NOT_FOUND') };
    },
    async list(path, { offset = 0, limit = 100 } = {}) {
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
