import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { accessHandler } from './permit-quota-core.js';

export function servePermit(handler: (req: Request) => Promise<Response>) {
  let adminClient: ReturnType<typeof createClient> | null = null;
  const getAdminClient = () => {
    if (adminClient) return adminClient;
    let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    try { key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || key; } catch { /* Legacy key fallback. */ }
    const url = Deno.env.get('SUPABASE_URL') || '';
    if (!url || !key) throw new Error('SERVER_CONFIGURATION');
    adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return adminClient;
  };

  Deno.serve(accessHandler(handler, async (req: Request) => {
    const authorization = req.headers.get('Authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return false;

    const admin = getAdminClient();
    const { data: { user }, error } = await admin.auth.getUser(match[1]);
    if (error || !user?.email) return false;

    const { data, error: accessError } = await admin
      .from('private_access_allowlist')
      .select('email')
      .eq('email', user.email.trim().toLowerCase())
      .eq('active', true)
      .maybeSingle();
    if (accessError) throw new Error('ACCESS_LOOKUP_FAILED');
    return Boolean(data);
  }));
}
