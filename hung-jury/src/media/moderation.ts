import { MEDIA_CONFIG } from '../contracts';
import { optionalAdapter } from './runtime';
export async function moderateImage(
  bytes: Uint8Array,
): Promise<{ safe: boolean; hasFace: boolean }> {
  const injected = optionalAdapter('moderateImage');
  if (injected) return injected(bytes);
  const key = process.env[MEDIA_CONFIG.env.visionKey];
  if (!key) throw new Error('Image moderation is not configured; photo uploads remain disabled');
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(MEDIA_CONFIG.providerTimeoutMs),
      body: JSON.stringify({
        requests: [
          {
            image: { content: Buffer.from(bytes).toString('base64') },
            features: [
              { type: 'SAFE_SEARCH_DETECTION' },
              { type: 'FACE_DETECTION', maxResults: 2 },
            ],
          },
        ],
      }),
    },
  );
  if (!response.ok) throw new Error('Image moderation provider failed');
  const body = await response.json(),
    result = body.responses?.[0],
    safe = result?.safeSearchAnnotation;
  if (result?.error || !safe) throw new Error('Image moderation returned no result');
  const allowed = new Set(['VERY_UNLIKELY', 'UNLIKELY', 'POSSIBLE']);
  return {
    safe: ['adult', 'racy', 'violence'].every((k) => allowed.has(safe[k])),
    hasFace:
      Array.isArray(result.faceAnnotations) &&
      result.faceAnnotations.some(
        (f: { detectionConfidence?: number }) => (f.detectionConfidence ?? 0) >= 0.5,
      ),
  };
}
