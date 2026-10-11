'use client';

import type { CSSProperties } from 'react';
import { CONFIG, toneBand, toneColor } from '@/contracts';
import { BAND_LABEL } from '../home/ToneChip';

/** Read-only. The dial value comes from the server in judge events. */
export function ToneMeter({ dial }: { dial: number }) {
  const { floor, ceiling } = CONFIG.tone;
  const pct = Math.min(100, Math.max(0, ((dial - floor) / (ceiling - floor)) * 100));
  const band = toneBand(dial);
  const color = toneColor(dial);
  return (
    <div className="tone-meter" style={{ '--tone-color': color, '--dial-position': `${pct}%` } as CSSProperties}>
      <div className="tone-meter-heading">
        <span className="eyebrow">THE COURT’S TEMPERAMENT</span>
        <span className="tone-chip">
          <span />
          {BAND_LABEL[band]}
        </span>
      </div>
      <div
        className="tone-track"
        role="meter"
        aria-label="Courtroom tone"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={dial}
      >
        <span />
      </div>
      <div className="tone-labels">
        <span>Serious</span>
        <span>Silly</span>
      </div>
    </div>
  );
}
