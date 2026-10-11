import { fallbackFor } from '../judge/fallback';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXTURES } from '../judge/fixtures';
import { demoFor } from '../judge/demo';
import { judgeTurnWithMedia, prepareJudgeInput, prepareText } from './turn';
import { configureMedia, resetMediaRuntime } from '../media/runtime';
import { speak } from '../media/voice';
import { CONFIG, JUDGE_CONFIG, nextDial, voiceSettingsFor } from '../contracts';
const input = () => structuredClone(FIXTURES['oat-milk']);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetMediaRuntime();
});
describe('combined judge and media handoff', () => {
  it('filters threats before redaction, judge calls, or audio', async () => {
    const raw = input();
    raw.grievance = 'I will shoot you. Email me at danger@example.com';
    const judge = vi.fn(),
      voice = vi.fn();
    const result = await judgeTurnWithMedia(
      raw,
      { isNewArguerMessage: true },
      { judge, speak: voice },
    );
    expect(result.kind).toBe('safety');
    expect(result.output.verdict).toBeNull();
    expect(judge).not.toHaveBeenCalled();
    expect(voice).not.toHaveBeenCalled();
    expect(prepareText(raw.grievance).ok).toBe(false);
  });
  it('redacts record text and memory without changing public participant identities', () => {
    const raw = input();
    raw.grievance += ' Contact me: test@example.com';
    raw.transcript[0].text += ' 919-555-0123';
    raw.precedents[0].summary += ' https://private.example.com';
    const before = structuredClone(raw),
      result = prepareJudgeInput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.input)).not.toContain('test@example.com');
    expect(JSON.stringify(result.input)).not.toContain('919-555-0123');
    expect(JSON.stringify(result.input)).not.toContain('private.example.com');
    expect(result.input.parties).toEqual(raw.parties);
    expect(raw).toEqual(before);
  });
  it('rejects invalid backend input instead of creating a fallback trial event', async () => {
    const raw = input();
    raw.toneDial = NaN;
    await expect(judgeTurnWithMedia(raw, { isNewArguerMessage: false })).rejects.toThrow();
  });
  it('passes exact redacted speech and smoothed dial to voice once', async () => {
    const raw = input(),
      out = demoFor(raw);
    out.speech = 'Contact test@example.com.';
    const judge = vi.fn(async () => out),
      voice = vi.fn(async () => ({ audioUrl: 'https://media.test/speech.mp3' }));
    const result = await judgeTurnWithMedia(
      raw,
      { isNewArguerMessage: true },
      { judge, speak: voice },
    );
    expect(result.kind).toBe('judge');
    if (result.kind !== 'judge') return;
    expect(result.toneDial).toBe(nextDial(raw.toneDial, out.tone_score));
    expect(voice).toHaveBeenCalledExactlyOnceWith(result.event.speech, result.toneDial, 'quick');
    expect(result.event.speech).toBe('Contact [redacted].');
    expect(result.event.audioUrl).toContain('speech.mp3');
  });
  it.each(['opening', 'cross', 'verdict'] as const)(
    'does not score an old message during %s',
    async (phase) => {
      const raw = input();
      raw.phase = phase;
      if (phase === 'cross') raw.target = 'defendant';
      const result = await judgeTurnWithMedia(
        raw,
        { isNewArguerMessage: true },
        { judge: async () => demoFor(raw), speak: async () => ({ audioUrl: 'cached' }) },
      );
      expect(result.kind).toBe('judge');
      if (result.kind === 'judge') expect(result.toneDial).toBe(raw.toneDial);
    },
  );
  it('scores cross-answer reactions once, and skips already scored messages', async () => {
    const raw = input();
    raw.phase = 'cross';
    raw.turnKind = 'reaction';
    const services = {
      judge: async () => demoFor(raw),
      speak: async () => ({ audioUrl: 'cached' }),
    };
    const fresh = await judgeTurnWithMedia(raw, { isNewArguerMessage: true }, services),
      repeat = await judgeTurnWithMedia(raw, { isNewArguerMessage: false }, services);
    if (fresh.kind !== 'judge' || repeat.kind !== 'judge') throw new Error('Unexpected safety');
    expect(fresh.toneDial).toBe(nextDial(raw.toneDial, fresh.output.tone_score));
    expect(repeat.toneDial).toBe(raw.toneDial);
  });
  it('does not request audio for model safety flags', async () => {
    const raw = input(),
      out = demoFor(raw);
    out.safety_flag = true;
    out.verdict = null;
    const voice = vi.fn();
    const result = await judgeTurnWithMedia(
      raw,
      { isNewArguerMessage: true },
      { judge: async () => out, speak: voice },
    );
    expect(result.kind).toBe('safety');
    expect(voice).not.toHaveBeenCalled();
  });
  it('falls back to text when voice rejects', async () => {
    const raw = input();
    const result = await judgeTurnWithMedia(
      raw,
      { isNewArguerMessage: false },
      {
        judge: async () => demoFor(raw),
        speak: async () => {
          throw new Error('Unavailable');
        },
      },
    );
    expect(result.kind).toBe('judge');
    if (result.kind === 'judge') expect(result.event.audioUrl).toBeNull();
  });
  it('returns after the three-second budget and never emits a late result', async () => {
    vi.useFakeTimers();
    const raw = input();
    let finish!: (value: { audioUrl: string }) => void;
    const voice = vi.fn(
      () =>
        new Promise<{ audioUrl: string }>((resolve) => {
          finish = resolve;
        }),
    );
    const task = judgeTurnWithMedia(
      raw,
      { isNewArguerMessage: false },
      { judge: async () => demoFor(raw), speak: voice },
    );
    await vi.advanceTimersByTimeAsync(CONFIG.voice.ttsTimeoutMs);
    const result = await task;
    expect(result.kind).toBe('judge');
    if (result.kind !== 'judge') return;
    expect(result.event.audioUrl).toBeNull();
    finish({ audioUrl: 'late' });
    await Promise.resolve();
    expect(result.event.audioUrl).toBeNull();
    expect(voice).toHaveBeenCalledTimes(1);
  });
  it('runs the real demo judge through the real voice cache without network', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('ELEVENLABS_VOICE_ID', 'test-voice');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    configureMedia({
      storage: {
        read: async () => new Uint8Array([73, 68, 51]),
        write: async () => {},
        url: async () => 'https://media.test/cached.mp3',
        deletePrefix: async () => {},
      },
    });
    const raw = input();
    raw.phase = 'verdict';
    const result = await judgeTurnWithMedia(raw, { isNewArguerMessage: false });
    expect(result.kind).toBe('judge');
    if (result.kind !== 'judge') return;
    expect(result.output.verdict?.ruling).toBe('guilty');
    expect(result.event.audioUrl).toContain('cached');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses the actual demo speech unchanged for an uncached voice generation', async () => {
    vi.stubEnv('DEMO_MODE', 'false');
    vi.stubEnv('ELEVENLABS_VOICE_ID', 'test-voice');
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key');
    let written = false;
    configureMedia({
      storage: {
        read: async () => null,
        write: async () => {
          written = true;
        },
        url: async () => 'https://media.test/generated.mp3',
        deletePrefix: async () => {},
      },
    });
    const fetch = vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(new Uint8Array([73, 68, 51])),
    );
    vi.stubGlobal('fetch', fetch);
    const raw = input();
    raw.phase = 'verdict';
    const result = await judgeTurnWithMedia(
      raw,
      { isNewArguerMessage: false },
      { judge: async () => demoFor(raw), speak },
    );
    if (result.kind !== 'judge') throw new Error('Unexpected safety');
    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(body.text).toBe(result.event.speech);
    expect(body.model_id).toBe('eleven_multilingual_v2');
    expect(written).toBe(true);
  });
});

import { demoManifest } from '../../scripts/demo-manifest';
import manifest from '../../fixtures/media/demo-lines.json';
it('demo audio manifest matches current judge scripts', () => {
  expect(demoManifest()).toEqual(manifest);
});
it('rejects input if redaction expands it past the shared limit', () => {
  const raw = input();
  raw.caseTitle = 'a'.repeat(113) + ' a@b.co';
  expect(raw.caseTitle.length).toBe(120);
  expect(() => prepareJudgeInput(raw)).toThrow();
});
it('suppresses unsafe generated speech before requesting voice', async () => {
  const raw = input(),
    out = demoFor(raw);
  out.speech = 'I will shoot you.';
  const voice = vi.fn();
  const result = await judgeTurnWithMedia(
    raw,
    { isNewArguerMessage: false },
    { judge: async () => out, speak: voice },
  );
  expect(result.kind).toBe('safety');
  expect(voice).not.toHaveBeenCalled();
});

it('keeps the input dial and scoring decision stable while a judge call is pending', async () => {
  const raw = input(),
    options = { isNewArguerMessage: true };
  const original = structuredClone(raw),
    out = demoFor(original);
  let release!: (value: typeof out) => void;
  const task = judgeTurnWithMedia(raw, options, {
    judge: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    speak: async () => ({ audioUrl: 'cached' }),
  });
  raw.toneDial = 0.99;
  raw.phase = 'verdict';
  options.isNewArguerMessage = false;
  release(out);
  const result = await task;
  expect(result.kind).toBe('judge');
  if (result.kind === 'judge')
    expect(result.toneDial).toBe(nextDial(original.toneDial, out.tone_score));
});
it('demo manifest contains the actual speech/voice pair when smoothing crosses a band', () => {
  const raw = input();
  raw.transcript = raw.transcript.slice(0, 1);
  raw.toneDial = 0.55;
  const output = demoFor(raw),
    voicedDial = nextDial(raw.toneDial, output.tone_score);
  expect(voicedDial).toBeGreaterThan(0.65);
  const effective = voiceSettingsFor(voicedDial);
  expect(
    demoManifest().some(
      (line) =>
        line.text === output.speech &&
        line.kind === 'quick' &&
        JSON.stringify(voiceSettingsFor(line.toneDial)) === JSON.stringify(effective),
    ),
  ).toBe(true);
});
it.each([0.45, 0.65, 0.85])('caches exact shared tone boundaries at %s', (dial) => {
  const raw = input();
  raw.phase = 'opening';
  raw.transcript = [];
  raw.toneDial = dial;
  const output = demoFor(raw);
  expect(
    demoManifest().some(
      (line) =>
        line.text === output.speech &&
        JSON.stringify(voiceSettingsFor(line.toneDial)) === JSON.stringify(voiceSettingsFor(dial)),
    ),
  ).toBe(true);
});
it('includes every neutral phase fallback at every voice band', () => {
  for (const phase of JUDGE_CONFIG.phases)
    for (const dial of [0.4, 0.55, 0.75, 0.9]) {
      const output = fallbackFor(phase, 'defendant');
      expect(
        demoManifest().some(
          (line) =>
            line.text === output.speech &&
            line.kind === (output.verdict ? 'verdict' : 'quick') &&
            JSON.stringify(voiceSettingsFor(line.toneDial)) ===
              JSON.stringify(voiceSettingsFor(dial)),
        ),
      ).toBe(true);
    }
});
