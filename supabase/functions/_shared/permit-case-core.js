import { validDutyFacts, dutyFacts, validDutyGuidance, dutySections } from '../../../public-duty.js';

export function permitCaseHandler(admin) {
  return async req => {
    const origin = req.headers.get('Origin') || '';
    const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const headers = { 'Access-Control-Allow-Origin': local ? origin : 'https://str-ig.github.io',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    const reply = (body, status = 200) => Response.json(body, { status, headers });
    if (origin && !local && origin !== 'https://str-ig.github.io') return reply({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
    try {
      const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
      if (!token) return reply({ error: 'UNAUTHORIZED' }, 401);
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data?.user?.email || !data.user.email_confirmed_at) return reply({ error: 'UNAUTHORIZED' }, 401);
      const user = data.user, email = user.email.trim().toLowerCase();
      const body = await req.json().catch(() => null);
      if (body?.action === 'list') {
        const { data: committee, error: checkError } = await admin.from('committee_admins').select('email').eq('email', email).eq('active', true).maybeSingle();
        if (checkError) return reply({ error: 'AUTHORIZATION_CHECK_FAILED' }, 503);
        if (!committee) return reply({ error: 'FORBIDDEN' }, 403);
        const { data: cases, error: readError } = await admin.from('permit_cases').select('id, created_at, email, facts, guidance').order('created_at', { ascending: false }).limit(100);
        if (readError) return reply({ error: 'READ_FAILED' }, 500);
        return reply({ cases });
      }
      // Membership is checked again for every submission, independently of client UI or JWT metadata.
      const { data: member, error: checkError } = await admin.from('private_access_allowlist').select('email').eq('email', email).eq('active', true).maybeSingle();
      if (checkError) return reply({ error: 'AUTHORIZATION_CHECK_FAILED' }, 503);
      if (!member) return reply({ error: 'FORBIDDEN' }, 403);
      if (!validDutyFacts(body?.facts) || !validDutyGuidance(body?.guidance) || typeof body?.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) return reply({ error: 'INVALID_CASE' }, 400);
      // Idempotency avoids duplicate cases if a request is retried after a timeout.
      const { error: writeError } = await admin.from('permit_cases').upsert({ id: body.id, user_id: user.id, email,
        facts: dutyFacts(body.facts), guidance: Object.fromEntries(Object.keys(dutySections).map(k => [k, body.guidance[k]]))
      }, { onConflict: 'user_id,id', ignoreDuplicates: true });
      if (writeError) return reply({ error: 'SEND_FAILED' }, 500);
      return reply({ sent: true });
    } catch { return reply({ error: 'SERVER_UNAVAILABLE' }, 503); }
  };
}
