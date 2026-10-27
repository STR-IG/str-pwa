// Payroll documents are session-only. This endpoint must never read request bodies or use Storage.
const headers = {
  'Access-Control-Allow-Origin': 'https://str-ig.github.io',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};
Deno.serve((req: Request) => new Response(req.method === 'OPTIONS' ? null : JSON.stringify({
  error: 'PAYROLL_STORAGE_RETIRED',
  message: 'Las nóminas y registros de jornada solo se revisan en la memoria del dispositivo.'
}), { status: req.method === 'OPTIONS' ? 204 : 410, headers }));
