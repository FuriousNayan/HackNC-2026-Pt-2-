'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Eye } from 'lucide-react';
import type { Role } from '@/contracts';
import { api, MOCK_DOCKET } from '@/ui/api/client';
import { useCaseView } from '@/ui/api/useCaseView';
import { CaseShell } from '@/ui/components/CaseShell';
import { Courtroom } from '@/ui/components/Courtroom';
import { LiveVideo, VIDEO_ON } from '@/ui/components/LiveVideo';
import { MockBar } from '@/ui/components/MockBar';
import { SafetyScreen } from '@/ui/components/SafetyScreen';
import { DEMO_PARTICIPANTS } from '@/ui/mocks/participants';
import { USE_MOCKS, useRoomController } from '@/ui/room/useRoom';
import { useSession } from '@/ui/session';

export default function CasePage() {
  const params = useParams<{ id: string }>();
  const caseId = params.id;
  const { state, controls } = useRoomController(caseId);
  const [meRole, setMeRole] = useState<Role>('juror');
  const { view, error: missing } = useCaseView(caseId);
  const [disconnected, setDisconnected] = useState<Role | null>(null);
  const handle = useSession()?.handle ?? null;

  // Anyone who is not an arguer takes a jury seat (or stays a plain viewer when the box is full).
  const needsSeat = !USE_MOCKS && view !== null && view.you.role === null && view.status !== 'filed';
  useEffect(() => {
    if (needsSeat) void api.join(caseId).catch(() => undefined);
  }, [needsSeat, caseId]);

  if (state.safety) return <SafetyScreen />;

  if (!USE_MOCKS && !view)
    return (
      <CaseShell handle={handle}>
        <div className="narrow">
          <p>{missing ? 'This case could not be found, or you need to sign in first.' : 'Entering court...'}</p>
        </div>
      </CaseShell>
    );

  const mock = MOCK_DOCKET.find((c) => c.id === caseId) ?? MOCK_DOCKET[0];
  const info =
    USE_MOCKS || !view
      ? mock
      : { number: view.number, title: view.title, plaintiff: view.plaintiff.handle, defendant: view.defendant?.handle ?? '' };
  const liveRole: Role = view?.you.role ?? 'juror';
  const me = USE_MOCKS
    ? { role: meRole, handle: meRole === 'plaintiff' ? 'dave' : meRole === 'defendant' ? 'maya' : handle ?? 'jo' }
    : { role: liveRole, handle: view?.you.handle ?? handle ?? 'guest' };
  const participants =
    USE_MOCKS || !view || !view.defendant
      ? {
          plaintiff: { ...DEMO_PARTICIPANTS.plaintiff, handle: info.plaintiff },
          defendant: { ...DEMO_PARTICIPANTS.defendant, handle: info.defendant },
        }
      : { plaintiff: view.plaintiff, defendant: view.defendant };
  const watching = Math.max(state.jury.viewers, state.jury.jurors.length);

  return (
    <CaseShell handle={handle}>
      <div className="case-header">
        <div>
          <Link href="/" className="back-link">
            <ArrowLeft size={14} /> Back to the docket
          </Link>
          <h1>{info.title}</h1>
          <p>
            @{info.plaintiff} v. @{info.defendant} <span> • </span> <Eye size={12} className="inline" /> {watching} watching
          </p>
        </div>
        <span className="mono">{info.number} / COURT IN SESSION</span>
      </div>

      <Courtroom
        caseId={caseId}
        state={state}
        participants={participants}
        me={me}
        forceDisconnected={USE_MOCKS ? disconnected : null}
        actions={{
          send: (text) => api.message(caseId, text).then(() => undefined),
          vote: (v) => void api.vote(caseId, v),
          react: (k) => void api.react(caseId, k),
          report: () => void api.report(caseId, 'not_funny'),
        }}
      />

      {VIDEO_ON && !USE_MOCKS && view && (view.you.role === 'plaintiff' || view.you.role === 'defendant') ? (
        <LiveVideo
          caseId={caseId}
          active={!state.safety && (view.status === 'accepted' || view.status === 'live')}
          otherHandle={view.you.role === 'plaintiff' ? (view.defendant?.handle ?? '') : view.plaintiff.handle}
        />
      ) : null}

      <MockBar
        controls={controls}
        meRole={meRole}
        setMeRole={setMeRole}
        disconnected={disconnected}
        setDisconnected={setDisconnected}
      />
    </CaseShell>
  );
}
