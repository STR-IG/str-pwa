import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { permitCaseHandler } from "../_shared/permit-case-core.js";

let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
try { key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || key; } catch { /* Legacy fallback. */ }
const admin = createClient(Deno.env.get('SUPABASE_URL') || '', key, { auth: { persistSession: false, autoRefreshToken: false } });
// Gateway permits preflight; the handler verifies the actual user and active affiliation.
Deno.serve(permitCaseHandler(admin));
