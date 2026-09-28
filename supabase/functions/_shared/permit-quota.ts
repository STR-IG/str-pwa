import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { quotaHandler } from './permit-quota-core.js';

export function servePermit(handler: (req: Request, subject: string) => Promise<Response>, statusOnly = false) {
  Deno.serve(quotaHandler(handler, async (args: Record<string, unknown>) => {
    let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    try { key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || key; } catch { /* Legacy key fallback. */ }
    const url = Deno.env.get('SUPABASE_URL') || '';
    if (!url || !key) throw new Error('SERVER_CONFIGURATION');
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return await admin.rpc('permit_query_quota', args);
  }, statusOnly));
}
