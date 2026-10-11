'use client';

import type { Reaction } from '@/contracts';
import type { ReactionPop } from '../room/types';

export const REACTION_EMOJI: Record<Reaction, string> = {
  gasp: '😮',
  gavel: '🔨',
  objection: '🙋',
  laugh: '😂',
  boo: '👎',
  order: '⚖️',
};

/** Floating emoji stickers above the jury box. Spectators never type free text. */
export function ReactionPops({ pops }: { pops: ReactionPop[] }) {
  return (
    <div className="reaction-stickers" aria-hidden>
      {pops.map((p) => (
        <span key={p.id} className="reaction-sticker" style={{ left: `${20 + ((p.id * 37) % 55)}%` }} title={p.fromHandle}>
          {REACTION_EMOJI[p.kind]}
        </span>
      ))}
    </div>
  );
}
