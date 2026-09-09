export function adminPayrollApi({ supabase, endpoint, publishableKey, email }) {
  async function token() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('UNAUTHORIZED');
    return session.access_token;
  }

  async function request(action, body = {}, binary = false) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await token()}`,
        apikey: publishableKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, email, ...body })
    });
    if (binary) {
      if (!response.ok) throw new Error('DOWNLOAD_FAILED');
      return response.blob();
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'ADMIN_REQUEST_FAILED');
    return result;
  }

  const bucket = {
    async list(path) {
      try { return { data: (await request('list', { path })).data || [], error: null }; }
      catch (error) { return { data: null, error }; }
    },
    async download(path) {
      try { return { data: await request('download', { path }, true), error: null }; }
      catch (error) { return { data: null, error }; }
    },
    async upload(path, file, options = {}) {
      try {
        const form = new FormData();
        form.set('action', 'upload'); form.set('email', email); form.set('path', path);
        form.set('upsert', String(Boolean(options.upsert)));
        form.set('file', file, file.name || 'document');
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${await token()}`, apikey: publishableKey },
          body: form
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'UPLOAD_FAILED');
        return { data: result, error: null };
      } catch (error) { return { data: null, error }; }
    },
    async remove(paths) {
      try { return { data: await request('remove', { paths }), error: null }; }
      catch (error) { return { data: null, error }; }
    }
  };

  return {
    resolve: () => request('resolve'),
    summary: () => request('summary'),
    bucket
  };
}
