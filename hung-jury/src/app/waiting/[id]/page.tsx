'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CONFIG, type Role } from '@/contracts';
import { api } from '@/ui/api/client';
import { useCaseView } from '@/ui/api/useCaseView';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CaseShell } from '@/ui/components/CaseShell';
import { CourtScene } from '@/ui/components/CourtScene';
import { LjButton } from '@/ui/components/LjButton';
import { DEMO_PARTICIPANTS } from '@/ui/mocks/participants';
import type { Participants } from '@/ui/room/selectors';
import { USE_MOCKS, useRoomController } from '@/ui/room/useRoom';
import { getSession, useSession } from '@/ui/session';

function WaitingRoom() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const role: Role = useSearchParams().get('role') === 'defendant' ? 'defendant' : 'plaintiff';
  const session = useSession();
  const [otherArriver, setOtherArriver] = useState(false);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState<'summons' | 'jury' | null>(null);
  const { state } = useRoomController(id, 'waiting');
  const { view, error: missing } = useCaseView(id, 1500);

  // Guard: need a handle and a bobblehead before entering the room.
  useEffect(() => {
    const here = `/waiting/${id}?role=${role}`;
    const s = getSession();
    if (!s) router.replace(`/signin?next=${encodeURIComponent(here)}`);
    else if (!s.avatar) router.replace(`/avatar?next=${encodeURIComponent(here)}`);
  }, [id, role, router]);

  // The server decides when the trial begins. When the phase leaves "waiting", everyone moves into court.
  useEffect(() => {
    if (state.phase !== 'waiting') router.push(`/case/${id}`);
  }, [state.phase, id, router]);
  useEffect(() => {
    if (view && (view.status === 'live' || view.status === 'verdict')) router.push(`/case/${id}`);
  }, [view, id, router]);

  if (!session?.avatar) return null;

  const otherRole: Role = role === 'plaintiff' ? 'defendant' : 'plaintiff';
  const mine = { handle: session.handle, headImageUrl: session.avatar.headImageUrl };
  const liveSeat = view ? (otherRole === 'plaintiff' ? view.plaintiff : view.defendant) : null;
  const theirs = USE_MOCKS || !liveSeat ? DEMO_PARTICIPANTS[otherRole as 'plaintiff' | 'defendant'] : liveSeat;
  const participants: Participants =
    role === 'plaintiff' ? { plaintiff: mine, defendant: theirs } : { plaintiff: theirs, defendant: mine };

  // Live mode: the server reports who is connected (SSE or polling). Mock mode uses the dev button.
  const bothHere = USE_MOCKS ? otherArriver : Boolean(view?.present.plaintiff && view.present.defendant);
  const accepted = USE_MOCKS || view?.status === 'accepted';
  const isFiler = role === 'plaintiff';
  const seated = state.jury.jurors.length;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const summonsLink = `${origin}/summons/${id}`;
  const juryLink = `${origin}/case/${id}`;
  const defendantHandle = view?.defendant?.handle ?? null;

  const copy = async (which: 'summons' | 'jury', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const start = async () => {
    if (!bothHere || starting) return;
    setStarting(true);
    try {
      await api.start(id);
      // In live mode the server's opening event moves the room on. In mock mode go straight in.
      if (USE_MOCKS) router.push(`/case/${id}`);
    } catch {
      setStarting(false);
    }
  };

  return (
    <CaseShell handle={session.handle}>
      <div className="case-header">
        <div>
          <Link href="/" className="back-link">
            <ArrowLeft size={14} /> Back to the docket
          </Link>
          <h1>Waiting room</h1>
          <p>
            {missing
              ? 'This case could not be found.'
              : bothHere
                ? 'Both sides are here.'
                : accepted || !view
                  ? `Waiting for the ${otherRole} to enter court.`
                  : 'Waiting for the defendant to accept the summons.'}
          </p>
        </div>
        <span className="mono">COURT NOT YET IN SESSION</span>
      </div>

      <div className="waiting-layout">
        <div className="court-main">
          <CourtScene
            state={state}
            participants={participants}
            speaker={null}
            absentRole={bothHere ? null : otherRole}
          />
        </div>

        <aside className="parchment invite-card" aria-label="Invite">
          {isFiler ? (
            <>
              <span className="mono eyebrow">STEP 1: SUMMON THE DEFENDANT</span>
              <h2>Send the summons{defendantHandle ? ` to @${defendantHandle}` : ''}</h2>
              <p>
                {accepted
                  ? 'The defendant accepted the summons.'
                  : 'Send this link only to the person you are charging. They must sign in with their own handle to accept it.'}
              </p>
              <div className="invite-row">
                <input readOnly value={summonsLink} aria-label="Summons link" onFocus={(e) => e.currentTarget.select()} />
                <LjButton variant="outline" onClick={() => copy('summons', summonsLink)} style={{ height: 'auto' }}>
                  {copied === 'summons' ? 'Copied' : 'Copy'}
                </LjButton>
              </div>
            </>
          ) : null}

          <span className="mono eyebrow">{isFiler ? 'OPTIONAL: INVITE A JURY' : 'TAKE A SEAT'}</span>
          <h2>Fill the jury box</h2>
          <p>
            {seated} of {CONFIG.limits.jurySeats} jury seats filled. The jury is optional: with no jurors the judge
            still hears the case. Share this link so friends can watch and vote.
          </p>
          <div className="invite-row">
            <input readOnly value={juryLink} aria-label="Jury link" onFocus={(e) => e.currentTarget.select()} />
            <LjButton variant="outline" onClick={() => copy('jury', juryLink)} style={{ height: 'auto' }}>
              {copied === 'jury' ? 'Copied' : 'Copy'}
            </LjButton>
          </div>
          {isFiler ? (
            <>
              <LjButton disabled={!bothHere || !accepted || starting} onClick={start}>
                {starting ? 'Starting...' : 'Start trial'}
              </LjButton>
              {!accepted ? (
                <p style={{ textAlign: 'center' }}>Locked until the defendant accepts the summons.</p>
              ) : !bothHere ? (
                <p style={{ textAlign: 'center' }}>Locked until the defendant is in this waiting room.</p>
              ) : null}
            </>
          ) : (
            <p style={{ textAlign: 'center' }}>The filer starts the trial once both sides are present.</p>
          )}
          {USE_MOCKS ? (
            <button className="mini-link" onClick={() => setOtherArriver((v) => !v)}>
              Mock: {otherArriver ? 'remove' : 'bring in'} the {otherRole}
            </button>
          ) : null}
        </aside>
      </div>
    </CaseShell>
  );
}

export default function WaitingPage() {
  return (
    <Suspense fallback={null}>
      <WaitingRoom />
    </Suspense>
  );
}
