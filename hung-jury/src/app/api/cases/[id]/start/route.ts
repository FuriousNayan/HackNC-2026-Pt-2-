import { route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>(
  async ({ server, user, params }) => server.engine.start(user, params.id),
  { write: true },
);
