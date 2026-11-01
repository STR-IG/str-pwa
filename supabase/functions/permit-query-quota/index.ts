const headers = {
  'Access-Control-Allow-Origin': 'https://str-ig.github.io',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

Deno.serve(req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  return new Response(JSON.stringify({ error: 'ENDPOINT_RETIRED' }), { status: 410, headers });
});
