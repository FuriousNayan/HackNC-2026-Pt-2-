'use client';

import { useEffect, useRef, useState } from 'react';
import { Flag, Volume2, VolumeX, X } from 'lucide-react';
import { toneBand, type Reaction, type Role } from '@/contracts';
import type { RoomState } from '../room/types';
import {
  latestMessage,
  speakerOf,
  timerTotalSec,
  type Me,
  type Participants,
} from '../room/selectors';
import { useJudgeAudio } from '../room/useJudgeAudio';
import { CourtScene } from './CourtScene';
import { LjButton } from './LjButton';
import { MessageBox } from './MessageBox';
import { ReactionBar } from './ReactionBar';
import { SafetyScreen } from './SafetyScreen';
import { SubtitleBar } from './SubtitleBar';
import { Timer } from './Timer';
import { ToneMeter } from './ToneMeter';
import { VerdictPanel, verdictShareText } from './VerdictPanel';
import { VoteBar } from './VoteBar';

export interface CourtroomActions {
  send: (text: string) => void | Promise<void>;
  vote: (vote: 'guilty' | 'not_guilty') => void;
  react: (kind: Reaction) => void;
  report: () => void;
}

export interface CourtroomProps {
  caseId: string;
  state: RoomState;
  participants: Participants;
  me: Me;
  actions: CourtroomActions;
  /** design-state override used by the mock dev bar to show a grayed arguer */
  forceDisconnected?: Role | null;
  /** waiting room: an arguer who has not entered court yet */
  absent?: Role | null;
}

const TURN_CAPTION: Record<string, string> = {
  opening: 'The judge opens court',
  statements: 'Time to make your case',
  cross: 'Answer the judge',
  rebuttal: 'Rebuttal',
  closing: 'Closing words',
  verdict: 'The jury is voting',
};

/** The two column courtroom: scene and controls on the left, the jury panel on the right. */
export function Courtroom({
  caseId,
  state,
  participants,
  me,
  actions,
  forceDisconnected = null,
  absent = null,
}: CourtroomProps) {
  const speaker = speakerOf(state);
  const disconnected = (forceDisconnected ?? state.disconnectedRole) as 'plaintiff' | 'defendant' | null;
  const verdict = state.judge?.verdict ?? null;
  const audio = useJudgeAudio(state.judge, state.safety !== null);
  const [shareStatus, setShareStatus] = useState('');
  const [closedSeq, setClosedSeq] = useState<number | null>(null);

  // Gavel strike: bench shake plus flash whenever a judge event carries the gavel sfx.
  const [gavelKey, setGavelKey] = useState(0);
  const lastSeq = useRef(-1);
  useEffect(() => {
    if (state.judge?.sfx === 'gavel' && state.judge.seq !== lastSeq.current) {
      lastSeq.current = state.judge.seq;
      setGavelKey((n) => n + 1);
    }
  }, [state.judge?.seq, state.judge?.sfx]);

  // A safety event replaces everything immediately.
  if (state.safety) return <SafetyScreen />;

  const myTurn =
    (me.role === 'plaintiff' || me.role === 'defendant') &&
    state.activeRole === me.role &&
    state.phase !== 'waiting' &&
    state.phase !== 'verdict';

  const showVerdict = !!verdict && closedSeq !== state.judge?.seq;
  const share = async () => {
    if (!verdict) return;
    const text = verdictShareText(verdict, state.jury.guiltyPct, state.jury.notGuiltyPct);
    try {
      // Best case: share the real card image. Falls back to text, then to the clipboard.
      let file: File | null = null;
      try {
        const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/card?format=portrait`);
        if (res.ok) file = new File([await res.blob()], 'hung-jury-verdict.png', { type: 'image/png' });
      } catch {
        file = null;
      }
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Hung Jury verdict', text, files: [file] });
        setShareStatus('Verdict shared.');
      } else if (navigator.share) {
        await navigator.share({ title: 'Hung Jury verdict', text });
        setShareStatus('Verdict shared.');
      } else if (file) {
        window.open(URL.createObjectURL(file), '_blank', 'noopener');
        setShareStatus('Verdict card opened in a new tab.');
      } else {
        await navigator.clipboard.writeText(text);
        setShareStatus('Verdict copied to clipboard.');
      }
    } catch {
      setShareStatus('Sharing unavailable. Please try again.');
    }
  };

  const canVote = me.role === 'juror' && state.phase !== 'waiting' && !verdict;
  void toneBand;

  return (
    <>
      <div className="court-layout">
        <div className="court-main">
          <CourtScene
            state={state}
            participants={participants}
            speaker={speaker}
            disconnectedRole={disconnected}
            absentRole={absent as 'plaintiff' | 'defendant' | null}
            gavelStrikeKey={gavelKey}
            verdictMoment={!!verdict}
          />
          <div className="court-stats">
            <Timer
              timerEndsAt={state.timerEndsAt}
              totalSec={timerTotalSec(state)}
              caption={TURN_CAPTION[state.phase] ?? 'The court is gathering'}
            />
            <ToneMeter dial={state.toneDial} />
          </div>

          <SubtitleBar judge={state.judge} message={latestMessage(state)} voiceStatus={audio.status} />

          <div className="audio-row">
            {!audio.unlocked ? (
              <LjButton variant="ghost" onClick={audio.unlock}>
                <Volume2 /> Tap to enable sound
              </LjButton>
            ) : (
              <LjButton variant="ghost" onClick={() => audio.setMuted(!audio.muted)}>
                {audio.muted ? <Volume2 /> : <VolumeX />}
                {audio.muted ? 'Unmute' : 'Mute'}
              </LjButton>
            )}
            <LjButton variant="ghost" onClick={actions.report}>
              <Flag /> This isn’t funny
            </LjButton>
          </div>

          {myTurn ? <MessageBox phase={state.phase} eventCount={state.eventCount} onSend={actions.send} /> : null}
        </div>

        <aside className="court-side">
          <h2 className="jury-side-heading">A seat. A say.</h2>
          <p className="jury-side-intro">
            The evidence is questionable.
            <br />
            Your opinion is welcome.
          </p>
          <VoteBar
            guiltyPct={state.jury.guiltyPct}
            notGuiltyPct={state.jury.notGuiltyPct}
            canVote={canVote}
            onVote={actions.vote}
          />
          <h3 className="reactions-heading mono">THE GALLERY HAS FEELINGS</h3>
          <ReactionBar onReact={actions.react} />
        </aside>
      </div>

      {showVerdict && verdict ? (
        <div className="verdict-overlay" role="dialog" aria-modal="true" aria-label="Verdict">
          <div className="verdict-wrapper">
            <LjButton
              variant="ghost"
              size="icon"
              className="verdict-close"
              aria-label="Close verdict"
              onClick={() => setClosedSeq(state.judge?.seq ?? null)}
            >
              <X />
            </LjButton>
            <VerdictPanel
              verdict={verdict}
              guiltyPct={state.jury.guiltyPct}
              notGuiltyPct={state.jury.notGuiltyPct}
              caseId={caseId}
              onShare={() => void share()}
            />
            {shareStatus ? (
              <p role="status" className="share-status">
                {shareStatus}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
