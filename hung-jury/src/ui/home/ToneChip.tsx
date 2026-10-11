import type { CSSProperties } from 'react';
import { toneBand, toneColor } from '@/contracts';

export const BAND_LABEL = {
  leaning_serious: 'Leaning serious',
  medium: 'Medium',
  silly: 'Silly',
  absurd: 'Absurd',
} as const;

/** Pill colored from the same tone blend the courtroom uses. The tone value comes from the server. */
export function ToneChip({ tone }: { tone: number }) {
  return (
    <span className="hj-chip" style={{ ['--chip' as string]: toneColor(tone) } as CSSProperties}>
      <i />
      {BAND_LABEL[toneBand(tone)]}
    </span>
  );
}
