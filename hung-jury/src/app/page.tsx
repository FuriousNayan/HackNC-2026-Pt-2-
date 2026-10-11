'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CONFIG } from '@/contracts';
import { api, MOCK_DOCKET, type DocketItem } from '@/ui/api/client';
import { DocketCard } from '@/ui/home/DocketCard';
import { FileCaseCard, type FileCaseValues } from '@/ui/home/FileCaseCard';
import { HeroScene } from '@/ui/home/HeroScene';
import { ArrowUpRight, BroadcastIcon, ScalesIcon } from '@/ui/home/Icons';
import { SiteFooter } from '@/ui/home/SiteFooter';
import { SiteHeader } from '@/ui/home/SiteHeader';
import { USE_MOCKS } from '@/ui/room/useRoom';
import { getSession, setSession, useSession } from '@/ui/session';

export default function HomePage() {
  const router = useRouter();
  const handle = useSession()?.handle ?? null;
  const [docket, setDocket] = useState<DocketItem[] | null>(null);
  const [docketError, setDocketError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Mock mode: act as "dave" so the whole flow works before real auth exists.
    if (!getSession() && USE_MOCKS)
      setSession({ handle: 'dave', avatar: { kind: 'avatar', headImageUrl: '/art/avatars/a1.svg' } });
  }, []);

  useEffect(() => {
    api
      .docket()
      .then(setDocket)
      .catch(() => setDocketError(true));
  }, []);

  // The featured case sits beside the form. Fall back to the first mock case while loading.
  const featured = docket?.[0] ?? (USE_MOCKS ? MOCK_DOCKET[0] : null);

  const file = async (values: FileCaseValues) => {
    if (!getSession()) {
      router.push('/signin?next=/');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.fileCase(values);
      // The filer waits in the room as plaintiff. The defendant opens the summons link.
      router.push(`/waiting/${id}?role=plaintiff`);
    } catch {
      setError(`The summons could not be sent. Filing is limited to ${CONFIG.limits.filingsPerHour} per hour.`);
      setBusy(false);
    }
  };

  return (
    <div className="hj-page">
      <div className="hj-shell">
        <SiteHeader handle={handle} />

        <section className="hj-hero">
          <div className="hj-eyebrow lines">The internet&apos;s least honorable court</div>
          <h1 className="hj-title">
            Hung Jury<span className="dot">.</span>
          </h1>
          <p className="hj-tagline">Arguments too small for a real authority and too annoying to drop.</p>
          <div className="hj-divider">
            <span />
            <ScalesIcon size={22} />
            <span />
          </div>
        </section>

        <main className="hj-main">
          <FileCaseCard onSubmit={file} busy={busy} error={error} />

          <aside aria-label="Live from the courthouse">
            <div className="hj-live-head">
              <div className="hj-eyebrow">
                <BroadcastIcon size={14} />
                Live from the courthouse
              </div>
              <div className="hj-allrise">
                <div className="big">All rise.</div>
                <div className="small">Or don&apos;t. We&apos;re online.</div>
              </div>
            </div>

            <div className="hj-scene">
              <HeroScene />
            </div>

            {featured ? (
            <div className="hj-featured">
              <div className="hj-eyebrow">On the docket / {featured.number}</div>
              <h3>{featured.title}</h3>
              <p>{featured.blurb}</p>
              <Link href={`/case/${featured.id}`} className="hj-ghost">
                Take a seat in the jury
                <ArrowUpRight size={15} />
              </Link>
              <p className="hj-aside">No law degrees. Just strong opinions.</p>
            </div>
            ) : null}
          </aside>
        </main>

        <section className="hj-docket" aria-label="Live docket">
          <div className="hj-docket-head">
            <h2>
              Live docket
              <span className="hj-green" aria-hidden />
            </h2>
            <span className="tag">The court is in session</span>
          </div>

          <div className="hj-grid">
            {docketError ? <p className="hj-empty">The docket could not load. Try again in a moment.</p> : null}
            {docket === null && !docketError ? <p className="hj-empty">Loading the docket...</p> : null}
            {docket?.length === 0 ? <p className="hj-empty">No live cases right now. File one.</p> : null}
            {docket?.map((item) => <DocketCard key={item.id} item={item} />)}
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
