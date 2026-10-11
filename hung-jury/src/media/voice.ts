import { createHash } from 'node:crypto';
import { MEDIA_CONFIG, voiceSettingsFor, type SpeechKind } from '../contracts';
import { storage } from './storage';
const pending = new Map<string, Promise<{ audioUrl: string }>>();
export function voiceRequest(text: string, toneDial: number, kind: SpeechKind = 'quick') {
  if (typeof text !== 'string' || !text.trim() || text.length > MEDIA_CONFIG.maxSpeechChars)
    throw new Error('Invalid judge speech');
  if (kind !== 'quick' && kind !== 'verdict') throw new Error('Invalid speech kind');
  const { upTo: _upTo, ...settings } = voiceSettingsFor(toneDial),
    e = MEDIA_CONFIG.env;
  const voice = process.env[e.voice];
  if (!voice) throw new Error('ELEVENLABS_VOICE_ID is missing');
  const model = process.env[kind === 'verdict' ? e.verdict : e.fast] || MEDIA_CONFIG.models[kind];
  // This implementation uses numeric v2 settings. v3 needs a separate preset mapping.
  if (model === 'eleven_v3') throw new Error('eleven_v3 needs a preset adapter; use a v2 model');
  const hash = createHash('sha256')
    .update(JSON.stringify({ text, voice, model, settings }))
    .digest('hex');
  return { voice, model, settings, key: `audio/${hash}.mp3` };
}
export async function speak(
  text: string,
  toneDial: number,
  kind: SpeechKind = 'quick',
): Promise<{ audioUrl: string }> {
  const request = voiceRequest(text, toneDial, kind),
    existing = pending.get(request.key);
  if (existing) return existing;
  const task = (async () => {
    const store = storage();
    if (await store.read(request.key)) return { audioUrl: await store.url(request.key) };
    if (process.env[MEDIA_CONFIG.env.demo] === 'true')
      throw new Error('Demo audio is not cached; run pregen-demo first');
    const key = process.env[MEDIA_CONFIG.env.key];
    if (!key) throw new Error('ELEVENLABS_API_KEY is missing');
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(request.voice)}/stream?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: request.model,
          voice_settings: { ...request.settings, similarity_boost: 0.75 },
        }),
        signal: AbortSignal.timeout(MEDIA_CONFIG.providerTimeoutMs),
      },
    );
    if (!response.ok || !response.body) {
      let code = '';
      try {
        const body = await response.json();
        const status = body?.detail?.status;
        if (typeof status === 'string' && /^[a-z0-9_]+$/i.test(status)) code = `: ${status}`;
      } catch {
        /* Some upstream errors have no JSON body. */
      }
      throw new Error(`ElevenLabs generation failed (${response.status}${code})`);
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
        length += value.length;
      }
    } finally {
      reader.releaseLock();
    }
    if (!length) throw new Error('ElevenLabs returned empty audio');
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    await store.write(request.key, bytes, 'audio/mpeg');
    return { audioUrl: await store.url(request.key) };
  })();
  pending.set(request.key, task);
  try {
    return await task;
  } finally {
    pending.delete(request.key);
  }
}
