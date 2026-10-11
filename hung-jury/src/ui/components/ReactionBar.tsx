'use client';

import { useEffect, useRef, useState } from 'react';
import { CONFIG, type Reaction } from '@/contracts';
import { LjButton } from './LjButton';
import { REACTION_EMOJI } from './ReactionPops';

const ORDER: { kind: Reaction; label: string }[] = [
  { kind: 'gasp', label: 'Gasp' },
  { kind: 'gavel', label: 'Gavel' },
  { kind: 'objection', label: 'Objection' },
  { kind: 'laugh', label: 'Laugh' },
  { kind: 'boo', label: 'Boo' },
  { kind: 'order', label: 'Order' },
];

/** Cooldown here is only for feel. The server enforces the real limit. */
export function ReactionBar({ onReact }: { onReact?: (kind: Reaction) => void }) {
  const [cooling, setCooling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <div className="reaction-bar" role="group" aria-label="Courtroom reactions">
      {ORDER.map(({ kind, label }) => (
        <LjButton
          key={kind}
          variant="reaction"
          aria-label={label}
          disabled={cooling}
          onClick={() => {
            onReact?.(kind);
            setCooling(true);
            timer.current = setTimeout(() => setCooling(false), CONFIG.limits.reactionCooldownMs);
          }}
        >
          <span className="reaction-emoji" aria-hidden="true">
            {REACTION_EMOJI[kind]}
          </span>
          <span>{label}</span>
        </LjButton>
      ))}
    </div>
  );
}
