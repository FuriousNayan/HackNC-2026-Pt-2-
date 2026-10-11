import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only client authenticated with the service role key. Used by API
 * routes to bypass RLS for writes the routes themselves authorize, and by
 * the judge path, which is the only writer of judge_turns and verdicts.
 *
 * Never import this file from client components.
 */
let serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Fill in .env.local from .env.example.',
    );
  }

  serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}
