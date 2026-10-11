'use client';

import { useSyncExternalStore } from 'react';
import type { AvatarKind } from '@/contracts';

/**
 * Local stand-in for the signed-in user until Part 2's Supabase Auth is wired in.
 * Handles only, never real names. Storage can be blocked, so every access is guarded.
 */
export interface Session {
  handle: string;
  avatar?: { kind: AvatarKind; headImageUrl: string };
}

const KEY = 'hungjury.session';

export function getSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

const EVENT = 'hungjury:session';
let memorySession: Session | null = null;

export function setSession(session: Session) {
  memorySession = session;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // storage blocked: the session lasts only for this page load
  }
  window.dispatchEvent(new Event(EVENT));
}

let cachedRaw: string | null | undefined;
let cachedSession: Session | null = null;

/** Stable snapshot for useSyncExternalStore: the same object until the stored value changes. */
function snapshot(): Session | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return memorySession;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedSession = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      cachedSession = null;
    }
  }
  return cachedSession ?? memorySession;
}

/** The signed-in handle and avatar. null on the server and before sign in. Updates when the session changes. */
export function useSession(): Session | null {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener(EVENT, notify);
      window.addEventListener('storage', notify);
      return () => {
        window.removeEventListener(EVENT, notify);
        window.removeEventListener('storage', notify);
      };
    },
    snapshot,
    () => null,
  );
}

export function clearSession() {
  memorySession = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Handles are public, so keep them short, lowercase and free of anything that looks like contact info. */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}
