import { notFound } from '@/server/errors';
import { route } from '@/server/http';
import { ApiError } from '@/server/errors';
import { mintJoinToken, videoConfig, videoOn } from '@/server/video';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/cases/:id/video returns { url, token, room } for the two arguers only. 404 when HJ_VIDEO is off. */
export const POST = route<{ id: string }>(
  async ({ server, user, params }) => {
    if (!videoOn()) throw notFound('Not found');
    const cfg = videoConfig();
    if (!cfg) throw new ApiError(503, 'Video is not configured', 'video_unavailable');
    await server.engine.videoAccess(user, params.id);
    return mintJoinToken(cfg, params.id, user.handle);
  },
  { write: true },
);
