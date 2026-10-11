import 'server-only';
import { JUDGE_CONFIG as C } from '@/contracts';
import { runJudge } from '@/judge/engine';
import { judgeInputSchema } from '@/judge/schema';
import { z } from 'zod';
export const runtime = 'nodejs';
const bodySchema = z.object({ input: judgeInputSchema, mode: z.enum(['demo', 'live']) }).strict();
let calls: number[] = [];
let active = 0;
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
async function limitedText(request: Request): Promise<string> {
  if (!request.body) throw new Error('Missing body');
  const reader = request.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > C.devBodyBytes) {
        await reader.cancel();
        throw new Error('Request too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(data);
}
export async function POST(request: Request) {
  // Local test harness only. Part 2 must call judgeTurn directly from authenticated routes.
  if (process.env.NODE_ENV !== 'development') return response({ error: 'Not found' }, 404);
  const url = new URL(request.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    return response({ error: 'Local testing only' }, 403);
  const publicUrl = new URL('http://' + (request.headers.get('host') ?? url.host));
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(publicUrl.hostname))
    return response({ error: 'Local testing only' }, 403);
  const origin = request.headers.get('origin');
  if (origin && origin !== publicUrl.origin) return response({ error: 'Origin not allowed' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return response({ error: 'Use application/json' }, 415);
  const now = Date.now();
  calls = calls.filter((t) => now - t < 60000);
  if (calls.length >= C.devCallsPerMinute || active >= C.devConcurrentCalls)
    return response({ error: 'Please wait a moment before another judge turn.' }, 429);
  calls.push(now);
  active++;
  try {
    const parsed = bodySchema.safeParse(JSON.parse(await limitedText(request)));
    if (!parsed.success)
      return response(
        {
          error: 'Invalid case input',
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
        400,
      );
    const { input, mode } = parsed.data;
    if (
      mode === 'live' &&
      (!process.env[C.env.apiKey]?.trim() || !process.env[C.env.model]?.trim())
    )
      return response(
        { error: 'Add GEMINI_API_KEY and GEMINI_MODEL to .env.local, then restart the website.' },
        422,
      );
    const started = Date.now();
    const result = await runJudge(input, { demo: mode === 'demo' });
    return response({ ...result, elapsedMs: Date.now() - started });
  } catch {
    return response(
      { error: 'The request could not be processed. Check its size and JSON format.' },
      400,
    );
  } finally {
    active--;
  }
}
