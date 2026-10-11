import { errorResponse } from '@/server/http';
import { getServer } from '@/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The docket lists only public, accepted cases and no private text, so guests can read it. */
export async function GET(): Promise<Response> {
  try {
    const server = getServer();
    await server.ready;
    return Response.json(await server.engine.docket());
  } catch (error) {
    return errorResponse(error);
  }
}
