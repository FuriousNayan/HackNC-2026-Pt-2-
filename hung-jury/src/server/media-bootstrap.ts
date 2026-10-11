import { configureMedia, type MediaStorage } from '@/media/runtime';
import { authenticate } from './auth';
import { memoryMediaStorage, supabaseStorageConfigured } from './memoryMedia';
import { getServer } from './runtime';

/**
 * Wires Part 4's media adapters. Import this file at the top of every route that uses media.
 *
 * MOCK MODE ONLY (NEXT_PUBLIC_USE_MOCKS=true): lets the avatar upload and the TTS route work on a laptop with
 * no Supabase, no auth and no Vision key. Everything is in memory, any visitor counts as one guest, and uploads
 * are not moderated. In any other mode nothing is configured, so the routes deny every request (their default).
 * Part 2 replaces this with real auth, private storage and moderation. See the questions list.
 */
const MOCK = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

function memoryStorage(): MediaStorage {
  const files = new Map<string, { bytes: Uint8Array; type: string }>();
  return {
    async read(key) {
      return files.get(key)?.bytes ?? null;
    },
    async write(key, bytes, type) {
      files.set(key, { bytes, type });
    },
    // A data URL works as an <img> or <audio> source with no file server.
    async url(key) {
      const f = files.get(key);
      if (!f) throw new Error('Not found');
      return `data:${f.type};base64,${Buffer.from(f.bytes).toString('base64')}`;
    },
    async deletePrefix(prefix) {
      for (const k of [...files.keys()]) if (k.startsWith(prefix)) files.delete(k);
    },
  };
}

if (MOCK) {
  configureMedia({
    storage: memoryStorage(),
    authorize: async () => ({ userId: 'mock-guest' }),
    moderateImage: async () => ({ safe: true, hasFace: true }),
    // Mock verdict that matches the oat milk fixture. Part 2 supplies the real loader.
    loadVerdict: async (caseId) => ({
      caseId,
      caseNumber: 'HJ-0024',
      title: 'The Case of the Missing Oat Milk',
      plaintiff: 'dave',
      defendant: 'maya',
      ruling: 'guilty',
      headline: 'The Case of the Missing Oat Milk: Guilty',
      sentence: 'One dramatic apology, read to the entire kitchen.',
      toneDial: 0.8,
      juryGuiltyPct: 30,
      safetyClosed: false,
    }),
  });
}

if (!MOCK) {
  // Real mode: session auth plus per-user limits, tts replay only for speech the judge actually said in a case
  // the caller may see, and verdict cards only for finished, public, non safety-closed cases.
  // Storage and image moderation need no wiring here: Part 4's defaults (src/media/storage.ts and moderation.ts)
  // read NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_MEDIA_BUCKET and GOOGLE_VISION_API_KEY.
  // If any is missing the avatar route answers 503 and the picker tells the user to choose a preset instead.
  // Without Supabase Storage keys, cache audio and heads in server memory so the judge's voice still works.
  if (!supabaseStorageConfigured()) configureMedia({ storage: memoryMediaStorage() });
  configureMedia({
    authorize: async (request, action, speech) => {
      const server = getServer();
      const user = await authenticate(request, server.store);
      if (action === 'avatar') return server.engine.allowAvatarUpload(user) ? { userId: user.handle } : null;
      if (!speech) return null;
      return (await server.engine.authorizeSpeech(user, speech)) ? { userId: user.handle } : null;
    },
    loadVerdict: async (caseId) => getServer().engine.verdictCardData(caseId),
  });
}
