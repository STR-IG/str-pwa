import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { quotaHandler } from './permit-quota-core.js';

export function servePermit(handler: (req: Request, subject: string) => Promise<Response>, statusOnly = false) {
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

  Deno.serve(quotaHandler(handler, async (args: Record<string, unknown>) => {
    return await getAdminClient().rpc('permit_query_quota', args);
  }, statusOnly, async (req: Request) => {
    const authorization = req.headers.get('Authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return false;

    try {
      const admin = getAdminClient();
      const { data: { user }, error } = await admin.auth.getUser(match[1]);
      if (error || !user?.email) return false;
      const { data, error: allowlistError } = await admin
        .from('committee_admins')
        .select('email')
        .eq('email', user.email.toLowerCase())
        .eq('active', true)
        .maybeSingle();
      return !allowlistError && Boolean(data);
    } catch {
      return false;
    }
  }));
}
