// Device keys are anonymous browser credentials, not proof of a person's identity.
export async function permitSubject(req) {
  const key = req.headers.get('X-Permit-Device') || '';
  if (!/^[a-f0-9]{64}$/.test(key)) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function quotaHandler(handler, rpc, statusOnly = false, isUnlimitedAdmin = async () => false) {
  return async req => {
    const origin = req.headers.get('Origin') || '';
    const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const headers = {
      'Access-Control-Allow-Origin': local ? origin : 'https://str-ig.github.io',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-permit-device',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin'
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
    if (origin && origin !== 'https://str-ig.github.io' && !local) return reply({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
    const subject = await permitSubject(req);
    if (!subject) return reply({ error: 'BROWSER_KEY_REQUIRED' }, 401);
    let reservation;
    const call = async (action, id = null) => {
      const { data, error } = await rpc({ p_subject: subject, p_action: action, p_reservation: id });
      if (error || !data || !Number.isInteger(data.remaining)) throw new Error('QUOTA_UNAVAILABLE');
      return data;
    };
    try {
      const unlimited = await isUnlimitedAdmin(req).catch(() => false);
      if (unlimited) {
        const quota = { allowed: true, remaining: -1, unlimited: true };
        if (statusOnly) return reply({ quota });
        const response = await handler(req, subject);
        const body = await response.json().catch(() => ({ error: 'INVALID_RESPONSE' }));
        const success = response.ok && body?.guidance && typeof body.guidance === 'object';
        return reply({ ...body, quota }, success ? response.status : (response.ok ? 502 : response.status));
      }
      const quota = await call(statusOnly ? 'status' : 'reserve');
      if (statusOnly) return reply({ quota });
      if (!quota.allowed) return reply({ error: 'MONTHLY_LIMIT_REACHED', quota }, 429);
      reservation = quota.reservation;
      if (!reservation) throw new Error('QUOTA_UNAVAILABLE');
      const response = await handler(req, subject);
      const body = await response.json();
      // An invalid questionnaire or an AI failure never consumes a completed query.
      const success = response.ok && body?.guidance && typeof body.guidance === 'object';
      const finalQuota = await call(success ? 'complete' : 'release', reservation);
      reservation = null;
      return reply({ ...body, quota: finalQuota }, success ? response.status : (response.ok ? 502 : response.status));
    } catch {
      if (reservation) {
        try { await call('release', reservation); } catch { /* Expires after five minutes if the DB is unavailable. */ }
      }
      return reply({ error: 'QUOTA_UNAVAILABLE' }, 503);
    }
  };
}
