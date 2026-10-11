import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { AvatarKind } from '@/contracts';
import { HANDLE_PATTERN, RESERVED_HANDLES, SERVER_CONFIG } from './constants';
import { badRequest, conflict, unauthorized } from './errors';
import type { CaseStore, Profile } from './store';

/**
 * Handle based sessions with no database and no passwords.
 *
 * Signing in claims a handle and returns a random secret. The browser keeps it in an HttpOnly cookie
 * (EventSource cannot send custom headers, so the cookie is what authenticates the SSE stream). Anyone
 * can claim a free handle, but nobody can take over a claimed one without its secret. Claims live in
 * memory, so a server restart frees every handle. Swap `authenticate` for real auth (Supabase Auth,
 * NextAuth) when there is a user table. Everything else only depends on the returned `User`.
 */

export interface User {
  handle: string;
}

export const SESSION_COOKIE = 'hj_session';

export function normalizeHandle(raw: unknown): string {
  if (typeof raw !== 'string') throw badRequest('Handle is required', 'bad_handle');
  const handle = raw.trim().replace(/^@/, '').toLowerCase();
  if (!HANDLE_PATTERN.test(handle))
    throw badRequest('Handles are 3 to 20 lowercase letters, numbers or underscores', 'bad_handle');
  if (RESERVED_HANDLES.has(handle)) throw badRequest('That handle is reserved', 'bad_handle');
  return handle;
}

export function parseCredential(request: Request): { handle: string; token: string } | null {
  const auth = request.headers.get('authorization');
  const header = request.headers.get('x-hj-session');
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const raw = (auth?.startsWith('Bearer ') ? auth.slice(7) : null) ?? header ?? cookie;
  if (!raw) return null;
  const value = decodeURIComponent(raw);
  const dot = value.indexOf('.');
  if (dot < 1) return null;
  return { handle: value.slice(0, dot), token: value.slice(dot + 1) };
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function authenticate(request: Request, store: CaseStore): Promise<User> {
  const cred = parseCredential(request);
  if (!cred) throw unauthorized();
  const profile = await store.getProfile(cred.handle);
  if (!profile?.token || !sameSecret(profile.token, cred.token)) throw unauthorized('Invalid session');
  return { handle: profile.handle };
}

const IMAGE_URL = /^(data:image\/(png|jpeg|webp|svg\+xml)[;,]|https:\/\/|\/)/i;
export function validateHeadImage(url: unknown): string {
  if (
    typeof url !== 'string' ||
    !url ||
    url.length > SERVER_CONFIG.maxHeadImageChars ||
    !IMAGE_URL.test(url) ||
    url.startsWith('//')
  )
    throw badRequest('Invalid avatar image', 'bad_avatar');
  return url;
}

export interface RegisterInput {
  handle: unknown;
  avatar?: { kind?: unknown; headImageUrl?: unknown } | null;
}

const KINDS: readonly AvatarKind[] = ['avatar', 'photo', 'webcam'];

export async function registerSession(
  store: CaseStore,
  input: RegisterInput,
  credential: { handle: string; token: string } | null,
  /** Verified Supabase user id when HJ_AUTH=supabase, otherwise undefined. */
  authUserId?: string,
): Promise<{ handle: string; token: string; created: boolean }> {
  let handle = normalizeHandle(input.handle);
  let existing = await store.getProfile(handle);
  let token: string;
  let created = false;
  if (authUserId) {
    // One handle per signed in person. Asking for another handle returns the one they already own.
    const mine = await store.findProfileByAuthId(authUserId);
    if (mine) {
      handle = mine.handle;
      existing = mine;
    }
    if (existing?.authUserId && existing.authUserId !== authUserId)
      throw conflict('That handle is already taken', 'handle_taken');
    if (existing && !existing.authUserId) {
      // A handle claimed before sign in was required. Only its holder (same cookie) may bind it.
      if (!existing.token || !credential || credential.handle !== handle || !sameSecret(existing.token, credential.token))
        throw conflict('That handle is already taken', 'handle_taken');
    }
    token = existing?.token ?? randomBytes(24).toString('base64url');
    created = !existing;
  } else if (existing?.token) {
    if (existing.authUserId) throw conflict('That handle is already taken', 'handle_taken');
    if (!credential || credential.handle !== handle || !sameSecret(existing.token, credential.token))
      throw conflict('That handle is already taken', 'handle_taken');
    token = existing.token;
  } else {
    token = randomBytes(24).toString('base64url');
    created = true;
  }
  let avatar: Profile['avatar'] = existing?.avatar ?? null;
  if (input.avatar) {
    const kind = input.avatar.kind as AvatarKind;
    if (!KINDS.includes(kind)) throw badRequest('Invalid avatar kind', 'bad_avatar');
    avatar = { kind, headImageUrl: validateHeadImage(input.avatar.headImageUrl) };
  }
  await store.upsertProfile({
    handle,
    token,
    avatar,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    ...(authUserId ? { authUserId } : existing?.authUserId ? { authUserId: existing.authUserId } : {}),
  });
  return { handle, token, created };
}

export function sessionCookie(handle: string, token: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(`${handle}.${token}`)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SERVER_CONFIG.sessionMaxAgeSec}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
