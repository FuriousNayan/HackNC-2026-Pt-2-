'use client';

import { TOKENS } from '@/contracts';

const COLORS = [TOKENS.brass500, TOKENS.toneSilly, TOKENS.parchment100, TOKENS.toneSerious, TOKENS.verdictGreen];

/** Deterministic pseudo random so server and client render the same pieces. */
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function Confetti({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${rand(i, 1) * 100}%`,
            background: COLORS[i % COLORS.length],
            animationDuration: `${2.4 + rand(i, 2) * 2.2}s`,
            animationDelay: `${-rand(i, 3) * 4}s`,
          }}
        />
      ))}
    </div>
  );
}
