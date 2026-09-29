import { createLookup, validateCriteria } from './lookup.mjs';

const lookup = createLookup();
const origins = new Set(['https://str-ig.github.io', 'http://localhost:8000']);
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const headers = {
    'Access-Control-Allow-Origin': origins.has(origin) ? origin : 'https://str-ig.github.io',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin'
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return json({ error: 'FORBIDDEN' }, 403);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: 'UNAUTHORIZED' }, 401);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !key) return json({ error: 'SERVER_CONFIGURATION' }, 503);
    // Both requests use the caller's JWT; no service-role access or user metadata.
    const authHeaders = { authorization, apikey: key, 'Content-Type': 'application/json' };
    const user = await fetch(`${url}/auth/v1/user`, { headers: authHeaders, signal: AbortSignal.timeout(8000) });
    if (!user.ok) return json({ error: 'UNAUTHORIZED' }, 401);
    const access = await fetch(`${url}/rest/v1/rpc/is_current_user_private_access_allowed`, { method: 'POST', headers: authHeaders, body: '{}', signal: AbortSignal.timeout(8000) });
    if (!access.ok) return json({ error: 'ACCESS_UNAVAILABLE' }, 503);
    if (await access.json() !== true) return json({ error: 'FORBIDDEN' }, 403);
    const raw = await req.text();
    if (raw.length > 2048) return json({ error: 'INVALID_CRITERIA' }, 400);
    let criteria;
    try { criteria = validateCriteria(JSON.parse(raw)); }
    catch { return json({ error: 'INVALID_CRITERIA' }, 400); }
    return json(await lookup(criteria));
  } catch (_) {
    // A changed or unreachable source is never reported as 'no document'.
    return json({ error: 'SOURCE_UNAVAILABLE' }, 502);
  }
});
