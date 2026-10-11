// Tiny pure functions shared so the judge, the voice, and the UI never
// disagree about the dial. Matches the Part 3/4 handoff's contracts/helpers.ts
// (toneColor included here, not in tokens.ts, so src/media/cards.ts's
// `import { CONFIG, TOKENS, toneColor, ... } from '../contracts'` resolves).

import { CONFIG } from './config';
import { TOKENS } from './tokens';

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const nextDial = (previous: number, toneScore: number) =>
  clamp(
    CONFIG.tone.smoothing * previous + (1 - CONFIG.tone.smoothing) * toneScore,
    CONFIG.tone.floor,
    CONFIG.tone.ceiling,
  );

export type ToneBand = 'leaning_serious' | 'medium' | 'silly' | 'absurd';

export function toneBand(dial: number): ToneBand {
  const b = CONFIG.tone.bands;
  return dial < b.medium[0] ? 'leaning_serious' : dial < b.silly[0] ? 'medium' : dial < b.absurd[0] ? 'silly' : 'absurd';
}

export function voiceSettingsFor(dial: number) {
  if (!Number.isFinite(dial) || dial < 0 || dial > 1) throw new Error('toneDial must be between 0 and 1');
  return CONFIG.voice.settingsByBand.find((b) => dial <= b.upTo)!;
}

/**
 * Blends tone-serious to tone-silly across the range from
 * CONFIG.tone.floor to CONFIG.tone.ceiling. Used to recolor the dial, the
 * spotlight, and the verdict card border (src/media/cards.ts).
 */
export function toneColor(dial: number): string {
  const t = clamp((dial - CONFIG.tone.floor) / (CONFIG.tone.ceiling - CONFIG.tone.floor), 0, 1);
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = rgb(TOKENS.toneSerious);
  const b = rgb(TOKENS.toneSilly);
  return (
    '#' +
    a
      .map((v, i) =>
        Math.round(v + (b[i] - v) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
