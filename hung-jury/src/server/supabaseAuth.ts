import { ApiError, unauthorized } from './errors';

/**
 * Optional Supabase Auth (HJ_AUTH=supabase). Off by default, in which case handle sessions work exactly as before.
 *
 * When on, claiming a handle needs a valid Supabase access token (Google or anonymous sign in), sent in the
 * x-sb-token header (Authorization is already used by the handle session). The token is verified with
 * Supabase's /auth/v1/user endpoint, so there is no JWT secret to manage. The handle is bound to that user id,
 * which lets the same person reclaim it from another device. Everything after sign in still uses the hj_session
 * cookie, so SSE and every route are unchanged.
 */
export const SB_TOKEN_HEADER = 'x-sb-token';

export function supabaseAuthOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.HJ_AUTH === 'supabase';
}

/** Returns the Supabase user id for the request, or throws 401. Fails closed on any error. */
export async function requireSupabaseUser(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const token = request.headers.get(SB_TOKEN_HEADER)?.trim();
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token) throw unauthorized('Sign in first');
  if (!url || !anon) throw unauthorized('Auth is not configured');
  try {
    const res = await fetchImpl(`${url}/auth/v1/user`, {
      headers: { apikey: anon, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw unauthorized('Invalid sign in');
    const body = (await res.json()) as { id?: unknown };
    if (typeof body.id !== 'string' || !body.id) throw unauthorized('Invalid sign in');
    return body.id;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unauthorized('Could not verify sign in');
  }
}
