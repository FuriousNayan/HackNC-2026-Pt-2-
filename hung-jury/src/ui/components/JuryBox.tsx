'use client';

import { CONFIG } from '@/contracts';
import type { RoomState } from '../room/types';
import { Bobblehead } from './Bobblehead';
import { ReactionPops } from './ReactionPops';

/** Seats come straight from the jury event. Extra viewers become a "+N watching" counter. */
export function JuryBox({ jury, reactions }: Pick<RoomState, 'jury' | 'reactions'>) {
  const seats = CONFIG.limits.jurySeats;
  const seated = jury.jurors.slice(0, seats);
  const extra = Math.max(0, jury.viewers - seated.length);
  return (
    <div className="jury-box" aria-label="Jury box">
      <ReactionPops pops={reactions} />
      <div className="jury-seats">
        {Array.from({ length: seats }).map((_, i) => {
          const juror = seated[i];
          return juror ? (
            <Bobblehead key={i} role="juror" size="sm" headImageUrl={juror.headImageUrl} title={juror.handle} />
          ) : (
            <span className="empty-seat" key={i} />
          );
        })}
      </div>
      <div className="jury-front">JURY OF PUBLIC OPINION</div>
      {extra > 0 ? <span className="jury-viewers">+{extra} watching</span> : null}
    </div>
  );
}
