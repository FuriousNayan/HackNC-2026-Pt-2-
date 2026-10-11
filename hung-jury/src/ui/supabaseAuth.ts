import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Optional Supabase Auth in the browser. Off unless NEXT_PUBLIC_HJ_AUTH=supabase (match HJ_AUTH on the server). */
export const AUTH_ON = process.env.NEXT_PUBLIC_HJ_AUTH === 'supabase';

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Supabase is not configured');
  client ??= createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

/** The current access token, or null when nobody is signed in (or auth is off). */
export async function accessToken(): Promise<string | null> {
  if (!AUTH_ON) return null;
  try {
    return (await sb().auth.getSession()).data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Guest sign in: an anonymous Supabase user, so a handle still needs no email. */
export async function ensureSignedIn(): Promise<string> {
  const existing = await accessToken();
  if (existing) return existing;
  const { data, error } = await sb().auth.signInAnonymously();
  if (error || !data.session) throw new Error('Could not start a guest session');
  return data.session.access_token;
}

/** Redirects to Google, then back to `returnTo` with the session in the URL (supabase-js picks it up). */
export async function signInWithGoogle(returnTo: string): Promise<void> {
  const { error } = await sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}${returnTo}` } });
  if (error) throw new Error('Google sign in failed');
}
