import { privateAccessMessage } from '../../../private-access-message.mjs';

const origin = 'https://str-ig.github.io';
const headers = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

export function accessHandler({ createClient, env, send = fetch }) {
  return async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
    if (req.headers.get('Origin') && req.headers.get('Origin') !== origin) return reply({ error: 'FORBIDDEN' }, 403);
    const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return reply({ error: 'UNAUTHORIZED' }, 401);
    try {
      const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
      if (!url || !key) return reply({ error: 'SERVER_CONFIGURATION' }, 503);
      const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data?.user?.email) return reply({ error: 'UNAUTHORIZED' }, 401);
      const caller = data.user.email.trim().toLowerCase();
      const role = await admin.from('committee_admins').select('email').eq('email', caller).eq('active', true).maybeSingle();
      if (role.error) return reply({ error: 'AUTHORIZATION_CHECK_FAILED' }, 503);
      if (!role.data) return reply({ error: 'FORBIDDEN' }, 403);
      const body = await req.json().catch(() => null);
      if (!body || !['add', 'send', 'stats'].includes(body.action)) return reply({ error: 'INVALID_ACTION' }, 400);
      if (body.action === 'stats') {
        if (typeof body.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)) return reply({error:'INVALID_MONTH'},400);
        const result=await admin.from('app_card_counts').select('month, card, accesses').eq('month',body.month+'-01').order('accesses',{ascending:false});
        if(result.error)return reply({error:'READ_FAILED'},503);
        return reply({counts:result.data||[]});
      }
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      let message;
      try {
        if (email.length > 254) throw Error();
        message = privateAccessMessage({ email });
      } catch { return reply({ error: 'INVALID_EMAIL' }, 400); }
      const target = await admin.from('private_access_allowlist').select('email, active').eq('email', email).maybeSingle();
      if (target.error) return reply({ error: 'LOOKUP_FAILED' }, 503);
      if (body.action === 'add') {
        if (target.data) return reply({ saved: target.data.active === true, existing: true,
          ...(target.data.active !== true ? { error: 'ACCESS_INACTIVE' } : {}) }, target.data.active === true ? 200 : 409);
        const result = await admin.from('private_access_allowlist').insert({ email, active: true });
        if (result.error) return reply({ error: result.error.code === '23505' ? 'ALREADY_EXISTS' : 'SAVE_FAILED' }, 409);
        return reply({ saved: true, existing: false });
      }
      if (!target.data || target.data.active !== true) return reply({ error: 'ACCESS_NOT_ACTIVE' }, 409);
      if (typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) {
        return reply({ error: 'INVALID_REQUEST_ID' }, 400);
      }
      const mailKey = env('RESEND_API_KEY');
      if (!mailKey) return reply({ error: 'MAIL_NOT_CONFIGURED' }, 503);
      // Fixed template and sender. No arbitrary subject, HTML, attachments or recipient lists.
      // The same intent can be retried after a timeout without sending another copy.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${caller}|${email}|${body.requestId}`));
      const idempotency = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
      let result;
      try {
        result = await send('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${mailKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `private-access-${idempotency}` },
          body: JSON.stringify({ from: 'STR-IG <acceso@str-ig.es>', to: [email], subject: message.subject, text: message.body }),
          signal: AbortSignal.timeout(15000)
        });
      } catch { return reply({ error: 'MAIL_UNCONFIRMED' }, 503); }
      if (!result.ok) return reply({ error: 'MAIL_UNCONFIRMED' }, 503);
      const accepted = await result.json().catch(() => null);
      if (!accepted?.id) return reply({ error: 'MAIL_UNCONFIRMED' }, 503);
      return reply({ sent: true });
    } catch { return reply({ error: 'REQUEST_FAILED' }, 503); }
  };
}
