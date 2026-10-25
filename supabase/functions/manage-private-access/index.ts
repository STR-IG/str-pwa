import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { accessHandler } from './handler.mjs';

Deno.serve(accessHandler({ createClient, env: (name: string) => Deno.env.get(name) }));
