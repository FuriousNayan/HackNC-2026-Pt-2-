import { route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/groups lists the groups the signed-in user belongs to. */
export const GET = route(async ({ server, user }) => server.engine.myGroups(user));
