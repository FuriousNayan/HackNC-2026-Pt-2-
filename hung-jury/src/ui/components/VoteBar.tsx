'use client';

import { useState, type CSSProperties } from 'react';
import { Check, ThumbsDown, ThumbsUp } from 'lucide-react';
import { LjButton } from './LjButton';

export interface VoteBarProps {
  guiltyPct: number;
  notGuiltyPct: number;
  /** only jurors get the buttons */
  canVote: boolean;
  onVote?: (vote: 'guilty' | 'not_guilty') => void;
}

/** Percentages are drawn exactly as the server sent them. */
export function VoteBar({ guiltyPct, notGuiltyPct, canVote, onVote }: VoteBarProps) {
  const [voted, setVoted] = useState(false);
  const empty = guiltyPct === 0 && notGuiltyPct === 0;
  const cast = (v: 'guilty' | 'not_guilty') => {
    setVoted(true);
    onVote?.(v);
  };
  return (
    <section className="vote-panel" aria-label="Jury vote">
      <div className="vote-heading">
        <h3>The jury is out.</h3>
        <span className="mono">{voted ? 'YOUR VOTE IS ON RECORD' : 'WHAT’S YOUR VERDICT?'}</span>
      </div>
      <div
        className="vote-split"
        style={{ '--guilty-width': `${empty ? 50 : guiltyPct}%`, '--innocent-width': `${empty ? 50 : notGuiltyPct}%` } as CSSProperties}
      >
        <span className="guilty-segment">
          {guiltyPct}% <small>Guilty</small>
        </span>
        <span className="innocent-segment">
          {notGuiltyPct}% <small>Not guilty</small>
        </span>
      </div>
      <div className="vote-buttons">
        <LjButton variant="guilty" disabled={!canVote || voted} onClick={() => cast('guilty')}>
          <ThumbsDown /> Guilty
        </LjButton>
        <LjButton variant="innocent" disabled={!canVote || voted} onClick={() => cast('not_guilty')}>
          <ThumbsUp /> Not guilty
        </LjButton>
      </div>
      {voted ? (
        <span className="vote-cast" role="status">
          <Check size={16} /> Vote cast
        </span>
      ) : null}
    </section>
  );
}
