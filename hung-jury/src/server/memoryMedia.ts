import type { MediaStorage } from '@/media/runtime';

/**
 * Fallback media cache used when Supabase Storage is not configured (no service role key or bucket).
 * Audio and cropped heads live in server memory and are served by GET /api/media/<key>. Keys are unguessable
 * (a sha256 of the speech, or a random uuid), and only those two shapes are ever served. Memory is lost on
 * restart, which only costs a regenerated line of speech.
 */
const MAX_ENTRIES = 400;
export const MEDIA_KEY = /^(audio\/[a-f0-9]{64}\.mp3|heads\/[A-Za-z0-9_-]{1,40}\/[a-f0-9-]{36}\.png)$/;

type Entry = { bytes: Uint8Array; type: string };
const files = new Map<string, Entry>();

export function readMemoryMedia(key: string): Entry | undefined {
  return files.get(key);
}

export function memoryMediaStorage(): MediaStorage {
  return {
    async read(key) {
      return files.get(key)?.bytes ?? null;
    },
    async write(key, bytes, type) {
      if (!MEDIA_KEY.test(key)) throw new Error('Invalid media key');
      files.delete(key);
      files.set(key, { bytes, type });
      while (files.size > MAX_ENTRIES) files.delete(files.keys().next().value as string);
    },
    async url(key) {
      if (!files.has(key)) throw new Error('Not found');
      return `/api/media/${key}`;
    },
    async deletePrefix(prefix) {
      for (const k of [...files.keys()]) if (k === prefix || k.startsWith(`${prefix}/`)) files.delete(k);
    },
  };
}

export function supabaseStorageConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_MEDIA_BUCKET);
}
