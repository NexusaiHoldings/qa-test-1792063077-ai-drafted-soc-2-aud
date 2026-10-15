/**
 * Proxy GET /api/runtime/threads/[threadId]/stream → portfolio-runtime SSE.
 *
 * Sprint sse-edge-runtime-investigation-001 (2026-05-26) finding chain:
 *   1. /api/edge-canary returns 200 from Edge runtime — Edge works
 *   2. /api/edge-fetch-test fetches runtime.nexusaiholdings.com in 5ms,
 *      200, 261 bytes — Vercel Edge → Cloudflare tunnel works
 *   3. Direct `new Response(upstream.body, ...)` pass-through HANGS
 *      indefinitely — Vercel Edge / Cloudflare seemingly waits for the
 *      upstream stream to close before flushing the response. SSE is
 *      an infinite stream (server holds 10min); the wait never resolves.
 *
 * Fix: explicitly construct a ReadableStream that pumps bytes from the
 * upstream reader into the response controller. The ReadableStream
 * abstraction forces Vercel's runtime to treat the response as
 * incrementally available, not buffered. The bytes are byte-identical
 * to the upstream; this is purely a wrapper to signal streaming intent.
 */

export const runtime = "edge";
export const dynamic = "force-dynamic";

const RUNTIME_BASE_URL = process.env.RUNTIME_BASE_URL ?? "";
const RUNTIME_AUTH_TOKEN = process.env.RUNTIME_AUTH_TOKEN ?? "";
const COMPANY_SLUG = process.env.COMPANY_SLUG ?? "unknown";

export async function GET(
  _req: Request,
  { params }: { params: { threadId: string } },
): Promise<Response> {
  if (!RUNTIME_BASE_URL || !RUNTIME_AUTH_TOKEN) {
    return new Response("runtime env not configured", { status: 503 });
  }

  const upstreamUrl =
    RUNTIME_BASE_URL.replace(/\/+$/, "") +
    `/companies/${encodeURIComponent(COMPANY_SLUG)}` +
    `/threads/${encodeURIComponent(params.threadId)}/stream`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${RUNTIME_AUTH_TOKEN}`,
      },
    });
  } catch (err) {
    return new Response(`upstream unavailable: ${err}`, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(`upstream HTTP ${upstream.status}`, {
      status: upstream.status,
    });
  }

  // Eager-pump ReadableStream wrapper. Critical: use start() not pull().
  //
  // pull() is only invoked when the consumer (Vercel runtime) requests
  // more bytes — which it won't do until response headers have flushed —
  // which won't happen until first bytes arrive — chicken-and-egg deadlock.
  //
  // start() runs immediately when the stream is constructed. Kick the
  // pump asynchronously so it reads upstream + enqueues bytes as they
  // arrive, independent of consumer pull cycles. Vercel sees enqueue()
  // calls happening and flushes response headers + bytes.
  const upstreamReader = upstream.body.getReader();
  const stream = new ReadableStream({
    start(controller) {
      void (async function pump() {
        try {
          for (;;) {
            const { done, value } = await upstreamReader.read();
            if (done) {
              controller.close();
              return;
            }
            controller.enqueue(value);
          }
        } catch (err) {
          try {
            controller.error(err);
          } catch {
            /* already closed */
          }
        }
      })();
    },
    cancel(reason) {
      // Client disconnected — release the upstream reader so the
      // tunnel + runtime worker can free the connection.
      void upstreamReader.cancel(reason);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
