import { readJson, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>(
  async ({ server, user, request, params }) => {
    const body = await readJson(request);
    return server.engine.vote(user, params.id, body.vote);
  },
  { write: true },
);
