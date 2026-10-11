import { readJson, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(
  async ({ server, user, request }) => server.engine.fileCase(user, await readJson(request)),
  { write: true },
);
