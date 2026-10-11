import { parseCredential, registerSession, sessionCookie } from '@/server/auth';
import { errorResponse, readJson, sameOrigin } from '@/server/http';
import { getServer } from '@/server/runtime';
import { forbidden } from '@/server/errors';
import { requireSupabaseUser, supabaseAuthOn } from '@/server/supabaseAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/session { handle, avatar? } claims a handle (or reclaims it with the cookie) and sets the session cookie. */
export async function POST(request: Request): Promise<Response> {
  try {
    if (!sameOrigin(request)) throw forbidden('Bad origin');
    const server = getServer();
    await server.ready;
    const body = await readJson(request);
    const authUserId = supabaseAuthOn() ? await requireSupabaseUser(request) : undefined;
    const result = await registerSession(server.store, body as never, parseCredential(request), authUserId);
    const secure = new URL(request.url).protocol === 'https:' || process.env.NODE_ENV === 'production';
    return Response.json(
      { handle: result.handle, created: result.created },
      { headers: { 'Set-Cookie': sessionCookie(result.handle, result.token, secure) } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
