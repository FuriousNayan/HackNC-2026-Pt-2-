import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { POST } from './route';
import { FIXTURES } from '@/judge/fixtures';
const request = (
  origin = 'http://127.0.0.1:3000',
  body: unknown = { input: FIXTURES['oat-milk'], mode: 'demo' },
) =>
  new Request('http://127.0.0.1:3000/api/dev/judge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  });
describe('local test endpoint', () => {
  it('is unavailable in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect((await POST(request())).status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('rejects cross-origin browser requests', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      expect((await POST(request('https://example.com'))).status).toBe(403);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('returns validated demo output', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      const r = await POST(request());
      expect(r.status).toBe(200);
      const json = await r.json();
      expect(json.source).toBe('demo');
      expect(json.output.phase).toBe('reaction');
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('rejects invalid inputs before calling the judge', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      expect((await POST(request(undefined, { input: {}, mode: 'demo' }))).status).toBe(400);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('does not claim a live call when credentials are missing', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('GEMINI_API_KEY', '');
    try {
      expect(
        (await POST(request(undefined, { input: FIXTURES['oat-milk'], mode: 'live' }))).status,
      ).toBe(422);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
