import '@/server/media-bootstrap';
import { optionalAdapter } from '../../../media/runtime';
import { MEDIA_CONFIG } from '../../../contracts';
import { speak } from '../../../media/voice';
import { authorizeMedia, jsonError, sameOrigin, readLimitedBody } from '../../../media/http';
export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return jsonError('Forbidden', 403);
  if (!optionalAdapter('authorize'))
    return jsonError('Unauthorized or media integration not configured', 401);
  if (Number(request.headers.get('content-length')) > MEDIA_CONFIG.maxSpeechChars * 8)
    return jsonError('Request too large', 413);
  let input;
  try {
    const raw = new TextDecoder().decode(
      await readLimitedBody(request, MEDIA_CONFIG.maxSpeechChars * 8),
    );
    if (raw.length > MEDIA_CONFIG.maxSpeechChars * 8) return jsonError('Request too large', 413);
    input = JSON.parse(raw);
  } catch {
    return jsonError('Invalid JSON', 400);
  }
  if (
    !input ||
    typeof input.text !== 'string' ||
    !input.text.trim() ||
    input.text.length > MEDIA_CONFIG.maxSpeechChars ||
    typeof input.toneDial !== 'number' ||
    !Number.isFinite(input.toneDial) ||
    input.toneDial < 0 ||
    input.toneDial > 1 ||
    (input.kind !== undefined && input.kind !== 'quick' && input.kind !== 'verdict')
  )
    return jsonError('Invalid TTS request', 400);
  if (
    !(await authorizeMedia(request, 'tts', {
      text: input.text,
      toneDial: input.toneDial,
      kind: input.kind ?? 'quick',
    }))
  )
    return jsonError('Unauthorized judge speech', 401);
  try {
    return Response.json(await speak(input.text, input.toneDial, input.kind));
  } catch {
    return jsonError('Voice unavailable; use subtitles or browser speech', 503);
  }
}
