import { SERVER_CONFIG } from './constants';
import { authenticate, type User } from './auth';
import { ApiError, badRequest, forbidden } from './errors';
import { getServer, type Server } from './runtime';

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return origin === new URL(process.env.APP_ORIGIN || request.url).origin;
  } catch {
    return false;
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > SERVER_CONFIG.maxBodyBytes) throw new ApiError(413, 'Request too large', 'too_large');
  const text = await request.text();
  if (text.length > SERVER_CONFIG.maxBodyBytes) throw new ApiError(413, 'Request too large', 'too_large');
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
    return value as Record<string, unknown>;
  } catch {
    throw badRequest('Invalid JSON', 'bad_json');
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError)
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  console.error('[hung-jury] unhandled route error', error);
  return Response.json({ error: 'Something went wrong' }, { status: 500 });
}

export interface Ctx<P> {
  server: Server;
  user: User;
  request: Request;
  params: P;
}

/** Wraps a route: ready, same-origin check for writes, auth, error to JSON. */
export function route<P = Record<string, never>>(
  handler: (ctx: Ctx<P>) => Promise<Response | unknown>,
  opts: { write?: boolean } = {},
) {
  return async (request: Request, context: { params: Promise<P> }): Promise<Response> => {
    try {
      if (opts.write && !sameOrigin(request)) throw forbidden('Bad origin');
      const server = getServer();
      await server.ready;
      const user = await authenticate(request, server.store);
      const out = await handler({ server, user, request, params: await context.params });
      return out instanceof Response ? out : Response.json(out);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
