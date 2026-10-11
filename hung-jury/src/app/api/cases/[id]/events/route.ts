import { SERVER_CONFIG } from '@/server/constants';
import { authenticate } from '@/server/auth';
import { errorResponse } from '@/server/http';
import { getServer } from '@/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cases/:id/events is the realtime stream (Server-Sent Events). Each frame is
 * `id: <seq>` plus `data: <RoomEvent JSON>`. A reconnecting browser sends Last-Event-ID automatically and
 * resumes without a gap. A new connection first receives a snapshot of the room.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const server = getServer();
    await server.ready;
    const user = await authenticate(request, server.store);
    const { id } = await ctx.params;
    await server.engine.view(user, id); // 404 as plain HTTP when the case is not visible
    const raw = request.headers.get('last-event-id');
    const last = raw && /^\d+$/.test(raw) ? Number(raw) : undefined;

    const encoder = new TextEncoder();
    let detach: (() => void) | null = null;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    let closed = false;

    const shutdown = () => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      detach?.();
      try {
        controllerRef?.close();
      } catch {
        // already closed
      }
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controllerRef = controller;
        controller.enqueue(encoder.encode(`retry: ${SERVER_CONFIG.sseRetryMs}\n\n`));
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            shutdown();
          }
        }, SERVER_CONFIG.sseHeartbeatMs);
        try {
          detach = await server.engine.openStream(
            user,
            id,
            {
              send: (frame) =>
                controller.enqueue(
                  encoder.encode(`id: ${frame.id}\ndata: ${JSON.stringify(frame.event)}\n\n`),
                ),
              close: shutdown,
            },
            last,
          );
          if (closed) detach();
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : 'error' })}\n\n`,
            ),
          );
          shutdown();
        }
      },
      cancel: shutdown,
    });
    request.signal.addEventListener('abort', shutdown);
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
