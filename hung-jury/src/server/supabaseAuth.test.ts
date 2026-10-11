import { describe, expect, it } from 'vitest';
import { registerSession } from './auth';
import { ApiError } from './errors';
import { InMemoryStore, type CaseStore } from './store';
import { requireSupabaseUser, supabaseAuthOn } from './supabaseAuth';
import { pgliteStore } from './testPg';

const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co/', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' };
const req = (token?: string) => new Request('http://localhost/api/session', { method: 'POST', headers: token ? { 'x-sb-token': token } : {} });
const fakeSupabase = (users: Record<string, string>) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe('https://x.supabase.co/auth/v1/user');
    const bearer = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? '';
    return users[bearer] ? Response.json({ id: users[bearer] }) : new Response('{}', { status: 401 });
  }) as typeof fetch;

describe('supabase token verifier', () => {
  it('is off unless HJ_AUTH=supabase', () => {
    expect(supabaseAuthOn({})).toBe(false);
    expect(supabaseAuthOn({ HJ_AUTH: 'supabase' })).toBe(true);
  });
  it('accepts a valid token and fails closed otherwise', async () => {
    const f = fakeSupabase({ good: 'user-1' });
    expect(await requireSupabaseUser(req('good'), env, f)).toBe('user-1');
    await expect(requireSupabaseUser(req(), env, f)).rejects.toMatchObject({ status: 401 });
    await expect(requireSupabaseUser(req('bad'), env, f)).rejects.toMatchObject({ status: 401 });
    await expect(requireSupabaseUser(req('good'), {}, f)).rejects.toBeInstanceOf(ApiError);
    const down = (async () => {
      throw new Error('network');
    }) as typeof fetch;
    await expect(requireSupabaseUser(req('good'), env, down)).rejects.toMatchObject({ status: 401 });
  });
});

describe.each([
  ['memory', async () => new InMemoryStore()],
  ['pg', async () => (await pgliteStore()) as CaseStore],
])('handle binding (%s)', (_name, make) => {
  it('binds a handle to the signed in user, lets them reclaim it, and blocks everyone else', async () => {
    const store = await make();
    const first = await registerSession(store, { handle: 'ana_x' }, null, 'user-a');
    expect(first.created).toBe(true);
    // Another device, same person, no cookie: gets the same session secret.
    const again = await registerSession(store, { handle: 'ana_x' }, null, 'user-a');
    expect(again).toMatchObject({ handle: 'ana_x', token: first.token, created: false });
    // A different person cannot take it, with or without the cookie.
    await expect(registerSession(store, { handle: 'ana_x' }, { handle: 'ana_x', token: first.token }, 'user-b')).rejects.toMatchObject({ status: 409 });
    // Without sign in (flag off path) a bound handle is never claimable, even with the secret.
    await expect(registerSession(store, { handle: 'ana_x' }, { handle: 'ana_x', token: first.token })).rejects.toMatchObject({ status: 409 });
    // One handle per person: asking for another returns the one they own.
    const other = await registerSession(store, { handle: 'ana_two' }, null, 'user-a');
    expect(other.handle).toBe('ana_x');
    expect(await store.getProfile('ana_two')).toBeUndefined();
    expect((await store.findProfileByAuthId('user-a'))?.handle).toBe('ana_x');
  });
  it('binds a pre-existing guest handle only for its cookie holder', async () => {
    const store = await make();
    const guest = await registerSession(store, { handle: 'old_guest' }, null);
    await expect(registerSession(store, { handle: 'old_guest' }, null, 'user-c')).rejects.toMatchObject({ status: 409 });
    const bound = await registerSession(store, { handle: 'old_guest' }, { handle: 'old_guest', token: guest.token }, 'user-c');
    expect(bound.token).toBe(guest.token);
    expect((await store.getProfile('old_guest'))?.authUserId).toBe('user-c');
  });
});
