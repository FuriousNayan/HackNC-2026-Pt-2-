import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { redact, preFilter } from '../src/safety';
import { configureMedia, resetMediaRuntime, type MediaStorage } from '../src/media/runtime';
import { speak } from '../src/media/voice';
import { processAvatarForOwner, deleteAvatarHeads } from '../src/media/avatar';
import { verdictCardPng, renderVerdictCard } from '../src/media/cards';
import { POST as ttsPost } from '../src/app/api/tts/route';
import { POST as avatarPost } from '../src/app/api/avatar/route';
import type { VerdictCardData } from '../src/contracts';
const fixture = JSON.parse(
  await readFile(new URL('../fixtures/media/verdict.json', import.meta.url), 'utf8'),
) as VerdictCardData;
function memory() {
  const files = new Map<string, Uint8Array>();
  const store: MediaStorage = {
    async read(k) {
      return files.get(k) ?? null;
    },
    async write(k, b) {
      files.set(k, b);
    },
    async url(k) {
      return 'https://media.test/' + k;
    },
    async deletePrefix(prefix) {
      for (const key of files.keys()) if (key.startsWith(prefix + '/')) files.delete(key);
    },
  };
  return { files, store };
}
beforeEach(() => {
  resetMediaRuntime();
  process.env.ELEVENLABS_VOICE_ID = 'test-voice';
  process.env.ELEVENLABS_API_KEY = 'test-key';
  delete process.env.DEMO_MODE;
});
test('PII redaction is idempotent and retains ordinary testimony', () => {
  const input =
    'Email someone@example.com, call (919) 555-0123 or 9195550123; 123 Main Street Apt 4; https://example.com/private and @dave.';
  const result = redact(input);
  assert.ok(!result.includes('919'));
  assert.ok(!result.includes('someone'));
  assert.ok(!result.includes('Main'));
  assert.equal(redact(result), result);
  assert.equal(
    redact('He ate my leftovers and left no note'),
    'He ate my leftovers and left no note',
  );
});
test('filters serious content, unicode punctuation, and repeat contact', () => {
  assert.deepEqual(preFilter('He ate my leftovers and left no note'), { ok: true });
  assert.equal(preFilter('I’ll make him regret this').category, 'threat');
  assert.equal(preFilter('She keeps texting me after I told her to stop').category, 'harassment');
  assert.equal(preFilter('I want to end my life').category, 'self_harm');
});
test('voice caches, deduplicates concurrent calls and varies by settings', async () => {
  const { files, store } = memory();
  configureMedia({ storage: store });
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(new Uint8Array([73, 68, 51, 1]), {
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  };
  try {
    const [a, b] = await Promise.all([speak('Order.', 0.5), speak('Order.', 0.5)]);
    assert.equal(a.audioUrl, b.audioUrl);
    await speak('Order.', 0.5);
    assert.equal(calls, 1);
    await speak('Order.', 0.9);
    assert.equal(calls, 2);
    assert.equal(files.size, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test('demo mode never falls through to a live voice call', async () => {
  const { store } = memory();
  configureMedia({ storage: store });
  process.env.DEMO_MODE = 'true';
  await assert.rejects(speak('Not cached.', 0.5), /not cached/);
});
test('provider failures do not poison the cache', async () => {
  const { files, store } = memory();
  configureMedia({ storage: store });
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 429 });
  try {
    await assert.rejects(speak('Order.', 0.5), /429/);
    assert.equal(files.size, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test('avatar moderation precedes storage; metadata stripped and cleanup works', async () => {
  const { files, store } = memory();
  const bytes = await sharp({ create: { width: 256, height: 256, channels: 3, background: 'red' } })
      .png()
      .toBuffer(),
    blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
  configureMedia({ storage: store, moderateImage: async () => ({ safe: false, hasFace: true }) });
  assert.deepEqual(await processAvatarForOwner(blob, 'user-1'), { error: 'unsafe' });
  assert.equal(files.size, 0);
  configureMedia({ moderateImage: async () => ({ safe: true, hasFace: false }) });
  assert.deepEqual(await processAvatarForOwner(blob, 'user-1'), { error: 'no_face' });
  configureMedia({ moderateImage: async () => ({ safe: true, hasFace: true }) });
  assert.ok('headImageUrl' in (await processAvatarForOwner(blob, 'user-1')));
  assert.equal(files.size, 1);
  await deleteAvatarHeads('user-1');
  assert.equal(files.size, 0);
});
test('original large images and forged image bodies are rejected', async () => {
  const bytes = await sharp({ create: { width: 512, height: 512, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
  await assert.rejects(
    processAvatarForOwner(new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'user'),
    /cropped head/,
  );
  await assert.rejects(processAvatarForOwner(new Blob(['fake'], { type: 'image/png' }), 'user'));
});
test('cards render both sizes and never render safety-closed cases', async () => {
  await mkdir('.media-cache/previews', { recursive: true });
  for (const format of ['portrait', 'square'] as const) {
    const bytes = await verdictCardPng(fixture, format);
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, format === 'portrait' ? 1350 : 1080);
    await writeFile(`.media-cache/previews/${format}.png`, bytes);
  }
  await assert.rejects(verdictCardPng({ ...fixture, safetyClosed: true }, 'square'), /Safety/);
});
test('card cache is checked against fresh case visibility', async () => {
  const { store } = memory();
  let closed = false;
  configureMedia({
    storage: store,
    loadVerdict: async () => ({ ...fixture, safetyClosed: closed }),
  });
  await renderVerdictCard(fixture.caseId, 'square');
  closed = true;
  await assert.rejects(renderVerdictCard(fixture.caseId, 'square'), /unavailable/);
});
test('routes deny access without backend authorization', async () => {
  assert.equal(
    (await ttsPost(new Request('https://court.test/api/tts', { method: 'POST', body: '{}' })))
      .status,
    401,
  );
  assert.equal(
    (await avatarPost(new Request('https://court.test/api/avatar', { method: 'POST' }))).status,
    401,
  );
});
test('routes reject malformed and cross-origin requests before providers', async () => {
  configureMedia({ authorize: async () => ({ userId: 'user' }) });
  assert.equal(
    (await ttsPost(new Request('https://court.test/api/tts', { method: 'POST', body: 'null' })))
      .status,
    400,
  );
  assert.equal(
    (
      await ttsPost(
        new Request('https://court.test/api/tts', {
          method: 'POST',
          headers: { origin: 'https://other.test' },
          body: '{}',
        }),
      )
    ).status,
    403,
  );
});

test('route body limits apply even when Content-Length is understated', async () => {
  configureMedia({ authorize: async () => ({ userId: 'user' }) });
  const body = 'x'.repeat(20000);
  const request = new Request('https://court.test/api/tts', {
    method: 'POST',
    headers: { 'content-length': '1' },
    body,
  });
  assert.equal((await ttsPost(request)).status, 400);
});

test('configured public origin supports proxy URLs and denies other sites', async () => {
  const old = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'https://court.test';
  configureMedia({ authorize: async () => ({ userId: 'user' }) });
  try {
    assert.equal(
      (
        await ttsPost(
          new Request('http://localhost:3000/api/tts', {
            method: 'POST',
            headers: { origin: 'https://court.test' },
            body: 'null',
          }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await ttsPost(
          new Request('http://localhost:3000/api/tts', {
            method: 'POST',
            headers: { origin: 'https://other.test' },
            body: '{}',
          }),
        )
      ).status,
      403,
    );
  } finally {
    if (old === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = old;
  }
});
test('authorized routes return cached speech and store only a moderated crop', async () => {
  const { store, files } = memory();
  configureMedia({
    storage: store,
    authorize: async () => ({ userId: 'user-2' }),
    moderateImage: async () => ({ safe: true, hasFace: true }),
  });
  // Prepopulate matching audio through the real cache key helper.
  const { voiceRequest } = await import('../src/media/voice');
  const key = voiceRequest('Order.', 0.5).key;
  files.set(key, new Uint8Array([73, 68, 51]));
  const tts = await ttsPost(
    new Request('https://court.test/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Order.', toneDial: 0.5 }),
    }),
  );
  assert.equal(tts.status, 200);
  assert.ok((await tts.json()).audioUrl.includes(key));
  const bytes = await sharp({ create: { width: 256, height: 256, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'head.png');
  const request = new Request('https://court.test/api/avatar', { method: 'POST', body: form });
  request.headers.set('content-length', String((await request.clone().arrayBuffer()).byteLength));
  const response = await avatarPost(request);
  assert.equal(response.status, 200);
  assert.ok((await response.json()).headImageUrl.includes('heads/user-2/'));
  assert.equal(files.size, 2);
});

test('TTS authorization receives validated bounded speech, not an unbounded body clone', async () => {
  const { store, files } = memory();
  const { voiceRequest } = await import('../src/media/voice');
  files.set(voiceRequest('Order.', 0.5).key, new Uint8Array([73, 68, 51]));
  const seen: unknown[] = [];
  configureMedia({
    storage: store,
    authorize: async (request, action, speech) => {
      seen.push({ bodyUsed: request.bodyUsed, action, speech });
      return speech?.text === 'Order.' ? { userId: 'user' } : null;
    },
  });
  const allowed = await ttsPost(
    new Request('https://court.test/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Order.', toneDial: 0.5 }),
    }),
  );
  assert.equal(allowed.status, 200);
  assert.deepEqual(seen, [
    { bodyUsed: true, action: 'tts', speech: { text: 'Order.', toneDial: 0.5, kind: 'quick' } },
  ]);
  const denied = await ttsPost(
    new Request('https://court.test/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Unowned text', toneDial: 0.5 }),
    }),
  );
  assert.equal(denied.status, 401);
});
test('oversized TTS bodies never reach an authorization body parser', async () => {
  let calls = 0;
  configureMedia({
    authorize: async () => {
      calls++;
      return { userId: 'user' };
    },
  });
  const response = await ttsPost(
    new Request('https://court.test/api/tts', {
      method: 'POST',
      headers: { 'content-length': '1' },
      body: 'x'.repeat(20000),
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});
test('long wide text fits inside both card content boundaries', async () => {
  const wide = {
    ...fixture,
    title: 'W'.repeat(120),
    headline: 'W'.repeat(120),
    sentence: 'W'.repeat(300),
    plaintiff: 'W'.repeat(40),
    defendant: 'W'.repeat(40),
  };
  for (const format of ['portrait', 'square'] as const) {
    const { data, info } = await sharp(await verdictCardPng(wide, format))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let overflow = 0;
    for (let y = 180; y < 800; y++)
      for (let x = 1001; x < 1060; x++) {
        const offset = (y * info.width + x) * 4;
        if (data[offset] < 60 && data[offset + 1] < 60 && data[offset + 2] < 60) overflow++;
      }
    assert.equal(overflow, 0, 'Card text must remain inside the right content boundary');
  }
});

test('cards deny missing safety status even when an old image is cached', async () => {
  const { store } = memory();
  configureMedia({
    storage: store,
    loadVerdict: async () =>
      ({ ...fixture, safetyClosed: undefined }) as unknown as VerdictCardData,
  });
  await assert.rejects(renderVerdictCard(fixture.caseId, 'square'), /unavailable/);
  await assert.rejects(
    verdictCardPng({ ...fixture, safetyClosed: undefined } as unknown as VerdictCardData, 'square'),
    /Safety/,
  );
});
test('malformed moderation adapter flags never permit an avatar upload', async () => {
  const { store, files } = memory();
  const bytes = await sharp({ create: { width: 256, height: 256, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
  const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
  configureMedia({
    storage: store,
    moderateImage: async () =>
      ({ safe: 'false', hasFace: true }) as unknown as { safe: boolean; hasFace: boolean },
  });
  assert.deepEqual(await processAvatarForOwner(blob, 'user'), { error: 'unsafe' });
  assert.equal(files.size, 0);
});
