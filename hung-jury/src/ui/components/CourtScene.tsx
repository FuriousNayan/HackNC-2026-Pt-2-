'use client';

import type { CSSProperties } from 'react';
import { toneBand, toneColor, type Face } from '@/contracts';
import type { RoomState } from '../room/types';
import type { Participants } from '../room/selectors';
import { Bobblehead } from './Bobblehead';
import { JudgeFace } from './JudgeFace';
import { JuryBox } from './JuryBox';

export interface CourtSceneProps {
  state: RoomState;
  participants: Participants;
  speaker: 'judge' | 'plaintiff' | 'defendant' | null;
  disconnectedRole?: 'plaintiff' | 'defendant' | null;
  absentRole?: 'plaintiff' | 'defendant' | null;
  gavelStrikeKey?: number;
  verdictMoment?: boolean;
  /** homepage style card variant, no caption and no click targets */
  className?: string;
}

/** The layered courtroom. Pure drawing: everything it shows comes from RoomState. */
export function CourtScene({
  state,
  participants,
  speaker,
  disconnectedRole = null,
  absentRole = null,
  gavelStrikeKey = 0,
  verdictMoment = false,
  className = '',
}: CourtSceneProps) {
  const dial = state.toneDial;
  const band = toneBand(dial);
  const face: Face = state.judge?.face ?? 'neutral';
  const dimmedFor = (who: 'plaintiff' | 'defendant') => speaker !== null && speaker !== who;

  return (
    <div
      className={`courtroom band-${band} ${verdictMoment ? 'verdict-moment' : ''} ${className}`}
      style={{ '--tone-color': toneColor(dial) } as CSSProperties}
      role="img"
      aria-label="A cartoon courtroom with judge, two arguers and a twelve-seat jury"
    >
      <div className="room-wall" />
      <div className="wall-trim" />
      <div className="court-window">
        <i />
        <i />
      </div>
      <div className="court-seal">
        ⚖
        <span>
          IN PETTINESS
          <br />
          WE TRUST
        </span>
      </div>
      <div className="court-flag">
        <span />
      </div>

      <div className={`judge-station ${speaker === 'judge' ? 'judge-active' : ''}`}>
        <JudgeFace face={face} />
        <div className={`judge-bench ${gavelStrikeKey ? 'bench-strike' : ''}`} key={gavelStrikeKey}>
          <div className={`gavel ${gavelStrikeKey ? 'striking' : ''}`}>🔨</div>
          <div className="bench-inset" />
          <span className="judge-plaque">THE HON. JUDGE JUDY-ISH</span>
        </div>
      </div>

      <JuryBox jury={state.jury} reactions={state.reactions} />

      {(['plaintiff', 'defendant'] as const).map((role) => (
        <div key={role} className={`arguer ${role}-station`}>
          <Bobblehead
            role={role}
            headImageUrl={participants[role].headImageUrl}
            label={`@${participants[role].handle}`}
            speaking={speaker === role}
            dimmed={dimmedFor(role)}
            disconnected={disconnectedRole === role}
            absent={absentRole === role}
          />
          <div className="arguer-table">
            <span>{role === 'plaintiff' ? 'Plaintiff' : 'Defendant'}</span>
          </div>
        </div>
      ))}

      <div className="gallery">
        <div className="gallery-people">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        <div className="gallery-bench" />
        <div className="gallery-bench second" />
      </div>

      {band === 'silly' || band === 'absurd' ? (
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: band === 'absurd' ? 24 : 8 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      ) : null}

      <span className="scene-caption mono">EST. FIVE MINUTES AGO</span>
      {gavelStrikeKey > 0 ? <div className="gavel-flash" key={`flash${gavelStrikeKey}`} /> : null}
    </div>
  );
}
