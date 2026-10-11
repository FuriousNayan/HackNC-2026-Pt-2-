import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { clamp, nextDial, toneBand, voiceSettingsFor } from './helpers';

describe('clamp', () => {
  it('clamps below the floor', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
  });
  it('clamps above the ceiling', () => {
    expect(clamp(2, 0, 1)).toBe(1);
  });
  it('passes through in range', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

describe('nextDial', () => {
  it('smooths toward the tone score using CONFIG.tone.smoothing', () => {
    const dial = nextDial(0.5, 1);
    expect(dial).toBeCloseTo(0.6 * 0.5 + 0.4 * 1, 10);
  });

  it('never drops below the floor', () => {
    const dial = nextDial(CONFIG.tone.floor, 0);
    expect(dial).toBeGreaterThanOrEqual(CONFIG.tone.floor);
  });

  it('never exceeds the ceiling', () => {
    const dial = nextDial(CONFIG.tone.ceiling, 1);
    expect(dial).toBeLessThanOrEqual(CONFIG.tone.ceiling);
  });
});

describe('toneBand', () => {
  it('bands a serious dial', () => {
    expect(toneBand(0.35)).toBe('leaning_serious');
  });
  it('bands a medium dial', () => {
    expect(toneBand(0.5)).toBe('medium');
  });
  it('bands a silly dial', () => {
    expect(toneBand(0.7)).toBe('silly');
  });
  it('bands an absurd dial', () => {
    expect(toneBand(0.95)).toBe('absurd');
  });
});

describe('voiceSettingsFor', () => {
  it('returns settings for the matching band', () => {
    const settings = voiceSettingsFor(0.4);
    expect(settings.upTo).toBe(0.45);
  });
});
