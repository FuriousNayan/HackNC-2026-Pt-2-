import '@/server/media-bootstrap';
import { MEDIA_CONFIG } from '../../../contracts';
import { processAvatarForOwner } from '../../../media/avatar';
import { authorizeMedia, jsonError, sameOrigin, readLimitedBody } from '../../../media/http';
export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return jsonError('Forbidden', 403);
  const user = await authorizeMedia(request, 'avatar');
  if (!user) return jsonError('Unauthorized or media integration not configured', 401);
  // Require a bounded body before multipart parsing. Host also needs a platform body limit.
  const length = Number(request.headers.get('content-length'));
  if (!Number.isFinite(length) || length <= 0) return jsonError('Content-Length required', 411);
  if (length > MEDIA_CONFIG.maxUploadBytes + 64 * 1024) return jsonError('Image too large', 413);
  let file;
  try {
    const bytes = await readLimitedBody(request, MEDIA_CONFIG.maxUploadBytes + 64 * 1024);
    file = (
      await new Response(bytes, {
        headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
      }).formData()
    ).get('file');
  } catch {
    return jsonError('Invalid multipart upload', 400);
  }
  if (!(file instanceof Blob)) return jsonError('A cropped image file is required', 400);
  if (
    file.size > MEDIA_CONFIG.maxUploadBytes ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
  )
    return jsonError('Invalid image file', 400);
  try {
    const result = await processAvatarForOwner(file, user.userId);
    return Response.json(result, { status: 'error' in result ? 422 : 200 });
  } catch {
    return jsonError('Image processing or safety check unavailable', 503);
  }
}
