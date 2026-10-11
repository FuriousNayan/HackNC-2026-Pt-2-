'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, MOCK_DOCKET } from '@/ui/api/client';
import { useCaseView } from '@/ui/api/useCaseView';
import { USE_MOCKS } from '@/ui/room/useRoom';
import { CaseShell } from '@/ui/components/CaseShell';
import { LjButton } from '@/ui/components/LjButton';
import { getSession, useSession } from '@/ui/session';

/** Screen 5. In mock mode this shows the oat milk summons; live mode will load it by id from Part 2. */
export default function SummonsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const handle = useSession()?.handle ?? null;
  useEffect(() => {
    const session = getSession();
    // The summons is for one signed-in handle, so sign in first and come straight back here.
    if (!USE_MOCKS && !session) router.replace(`/signin?next=${encodeURIComponent(`/summons/${id}`)}`);
  }, [id, router]);
  const { view, error } = useCaseView(id, 4000);
  const mock = MOCK_DOCKET.find((c) => c.id === id) ?? MOCK_DOCKET[0];
  const info = USE_MOCKS
    ? { ...mock, quote: 'I bought the oat milk on Sunday and it was gone by Monday. Nobody told me, nobody replaced it.' }
    : view
      ? { number: view.number, title: view.title, plaintiff: view.plaintiff.handle, quote: view.grievance }
      : null;

  const accept = async () => {
    setBusy(true);
    try {
      await api.accept(id);
    } catch {
      setBusy(false);
      return;
    }
    // The waiting room checks for a handle and a bobblehead before letting the defendant in.
    router.push(`/waiting/${id}?role=defendant`);
  };

  const decline = async () => {
    setBusy(true);
    await api.decline(id).catch(() => undefined);
    router.push('/');
  };

  if (!info)
    return (
      <CaseShell handle={handle}>
        <div className="narrow">
          <p>{error ? 'This summons could not be found. Make sure you are signed in with the handle it was sent to, or ask the sender to check the handle they typed.' : 'Loading the summons...'}</p>
        </div>
      </CaseShell>
    );

  return (
    <CaseShell handle={handle}>
      <div className="narrow">
        <div className="page-intro">
          <div className="court-eyebrow mono">
            <span /> CASE NO. {info.number} <span />
          </div>
          <h1>
            You have been <span>summoned.</span>
          </h1>
        </div>
        <section className="parchment form-card" aria-label="Summons">
          <p>
            <strong>@{info.plaintiff}</strong> has filed a charge against you in the matter of{' '}
            <em>{info.title}</em>.
          </p>
          <p className="summons-quote">“{info.quote}”</p>
          <div className="row-actions">
            <LjButton disabled={busy} onClick={accept} style={{ height: 48 }}>
              Accept and enter court
            </LjButton>
            <button className="b b-outline" style={{ height: 48 }} disabled={busy} onClick={decline}>
              Decline
            </button>
          </div>
        </section>
      </div>
    </CaseShell>
  );
}
