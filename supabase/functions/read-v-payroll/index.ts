// Retired: V documents are now read locally. Do not forward any request content.
Deno.serve((req: Request) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://str-ig.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json', 'Cache-Control': 'no-store'
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  return new Response(JSON.stringify({ error: 'V_LOCAL_REVIEW_REQUIRED', message: 'Actualiza la app: la lectura de la V se realiza en tu dispositivo.' }), { status: 410, headers });
});
