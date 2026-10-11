import { describe, expect, it } from 'vitest';
import { POST as session } from '@/app/api/session/route';
import { POST as fileCase } from '@/app/api/cases/route';
import { GET as getCase } from '@/app/api/cases/[id]/route';
import { GET as events } from '@/app/api/cases/[id]/events/route';
import { POST as accept } from '@/app/api/cases/[id]/accept/route';
import { POST as message } from '@/app/api/cases/[id]/message/route';
import { GET as docket } from '@/app/api/docket/route';
import { getServer } from './runtime';

const base = 'http://localhost:3000';
const json = (body: unknown, cookie?: string, path = '/api/x', extra: Record<string, string> = {}) =>
  new Request(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extra },
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function signIn(handle: string) {
  const res = await session(json({ handle }, undefined, '/api/session'));
  expect(res.status).toBe(200);
  return res.headers.get('set-cookie')!.split(';')[0];
}

describe('routes', () => {
  it('sessions, ownership, auth failures and bad origin', async () => {
    const cookie = await signIn('route_dave');
    const taken = await session(json({ handle: 'route_dave' }, undefined, '/api/session'));
    expect(taken.status).toBe(409);
    const again = await session(json({ handle: 'route_dave' }, cookie, '/api/session'));
    expect(again.status).toBe(200);
    expect((await session(json({ handle: 'ab' }))).status).toBe(400);
    expect((await fileCase(json({}, undefined, '/api/cases'), { params: Promise.resolve({}) })).status).toBe(401);
    const evil = await fileCase(json({}, cookie, '/api/cases', { origin: 'http://evil.example' }), { params: Promise.resolve({}) });
    expect(evil.status).toBe(403);
  });

  it('files a case, hides it from strangers, streams a snapshot and rejects out of turn messages', async () => {
    await getServer().ready;
    const dave = await signIn('route_d2');
    const maya = await signIn('route_m2');
    const stranger = await signIn('route_s2');
    const filed = await fileCase(
      json({ title: 'Route test', grievance: 'A small thing.', defendantHandle: 'route_m2' }, dave, '/api/cases'),
      { params: Promise.resolve({}) },
    );
    expect(filed.status).toBe(200);
    const { id } = await filed.json();
    const view = (cookie: string) => getCase(new Request(base + `/api/cases/${id}`, { headers: { cookie } }), ctx(id));
    expect((await view(dave)).status).toBe(200);
    expect((await view(stranger)).status).toBe(404);
    expect((await accept(json({}, dave), ctx(id))).status).toBeGreaterThanOrEqual(400);
    expect((await accept(json({}, maya), ctx(id))).status).toBe(200);
    expect((await view(stranger)).status).toBe(200);
    expect((await message(json({ text: 'hi' }, dave), ctx(id))).status).toBeGreaterThanOrEqual(400);

    const controller = new AbortController();
    const res = await events(
      new Request(base + `/api/cases/${id}/events`, { headers: { cookie: dave }, signal: controller.signal }),
      ctx(id),
    );
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    let text = '';
    const dec = new TextDecoder();
    while (!text.includes('"type":"jury"')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += dec.decode(value);
    }
    expect(text).toContain('retry:');
    expect(text).toContain('"type":"state"');
    controller.abort();
    await reader.cancel().catch(() => {});

    const nope = await events(new Request(base + `/api/cases/${id}/events`, { headers: { cookie: 'hj_session=x.y' } }), ctx(id));
    expect(nope.status).toBe(401);
    const list = await docket();
    expect(Array.isArray(await list.json())).toBe(true);
  });
});
