'use client';

import { useEffect, useState, type CSSProperties } from 'react';

export interface TimerProps {
  /** Server timestamp. The ring only reads the clock against it; it never owns a countdown. */
  timerEndsAt: string | null;
  totalSec: number;
  caption?: string;
}

export function Timer({ timerEndsAt, totalSec, caption = 'Time to make your case' }: TimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timerEndsAt) return;
// eslint-disable-next-line react-hooks/set-state-in-effect -- sync the clock when a new deadline arrives
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [timerEndsAt]);

  const active = !!timerEndsAt && totalSec > 0;
  const leftMs = active ? Math.max(0, Date.parse(timerEndsAt!) - now) : 0;
  const leftSec = Math.ceil(leftMs / 1000);
  const frac = active ? Math.min(1, leftMs / (totalSec * 1000)) : 0;

  return (
    <div className={`turn-timer ${active && leftSec < 5 ? 'time-low' : ''}`}>
      <div
        className="timer-ring"
        style={{ '--progress': `${frac * 100}%` } as CSSProperties}
        role="timer"
        aria-label={active ? `${leftSec} seconds left` : 'No timer running'}
      >
        <span className="mono">
          {active ? leftSec : '·'}
          <small>SEC</small>
        </span>
      </div>
      <div>
        <span className="eyebrow">ON THE FLOOR</span>
        <strong>{caption}</strong>
      </div>
    </div>
  );
}
