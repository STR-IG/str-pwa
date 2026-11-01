export function accessHandler(handler, isAuthorized) {
  return async req => {
    const origin = req.headers.get('Origin') || '';
    const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const allowedOrigin = !origin || origin === 'https://str-ig.github.io' || local;
    const headers = {
      'Access-Control-Allow-Origin': local ? origin : 'https://str-ig.github.io',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Vary': 'Origin'
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
    if (!allowedOrigin) return reply({ error: 'ORIGIN_NOT_ALLOWED' }, 403);

    const authorization = req.headers.get('Authorization') || '';
    if (!/^Bearer\s+.+$/i.test(authorization)) return reply({ error: 'AUTH_REQUIRED' }, 401);

    let authorized = false;
    try {
      authorized = await isAuthorized(req);
    } catch {
      return reply({ error: 'ACCESS_CHECK_FAILED' }, 503);
    }
    if (!authorized) return reply({ error: 'ACCESS_NOT_ACTIVE' }, 403);

    try {
      const response = await handler(req);
      const responseHeaders = new Headers(response.headers);
      for (const [name, value] of Object.entries(headers)) responseHeaders.set(name, value);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } catch {
      return reply({ error: 'REQUEST_FAILED' }, 502);
    }
  };
}
