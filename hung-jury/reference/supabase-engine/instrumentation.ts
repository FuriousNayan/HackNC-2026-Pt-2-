// Next.js calls register() once per server process at startup (stable in
// the App Router; see https://nextjs.org/docs/app/guides/instrumentation).
// This is where Part 4's media runtime gets its real adapters
// (docs/BACKEND-HANDOFF.md section 3), rather than inside the route
// handlers themselves — those files are also imported directly by
// tests/media.test.ts, which expects to control configureMedia() itself.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureMediaConfigured } = await import('@/server/mediaBootstrap');
    ensureMediaConfigured();
  }
}
