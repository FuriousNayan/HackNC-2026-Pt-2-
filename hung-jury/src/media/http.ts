import { adapter, type TtsAuthorizationContext } from './runtime';
export async function authorizeMedia(
  request: Request,
  action: 'avatar' | 'tts',
  speech?: TtsAuthorizationContext,
) {
  try {
    return await adapter('authorize')(request, action, speech);
  } catch {
    return null;
  }
}
export function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return origin === new URL(process.env.APP_ORIGIN || request.url).origin;
  } catch {
    return false;
  }
}

export async function readLimitedBody(request: Request, maxBytes: number): Promise<ArrayBuffer> {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('Request too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes.buffer;
}
