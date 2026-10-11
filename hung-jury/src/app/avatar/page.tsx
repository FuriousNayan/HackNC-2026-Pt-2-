'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { api } from '@/ui/api/client';
import { CaseShell } from '@/ui/components/CaseShell';
import { AvatarPicker } from '@/components/AvatarPicker';
import { getSession, setSession, useSession } from '@/ui/session';

function AvatarScreen() {
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/';
  const session = useSession();

  useEffect(() => {
    if (!getSession()) router.replace(`/signin?next=${encodeURIComponent('/avatar?next=' + next)}`);
  }, [router, next]);

  if (!session) return null;

  return (
    <CaseShell handle={session.handle}>
      <div className="narrow">
        <div className="page-intro">
          <div className="court-eyebrow mono">
            <span /> FACE FOR THE COURT <span />
          </div>
          <h1>
            Pick your <span>bobblehead.</span>
          </h1>
          <p>
            You appear in court as <strong>@{session.handle}</strong>.
          </p>
        </div>

        {/* Swap for Part 4's <AvatarPicker> at Gate 3. The props are the same. */}
        <AvatarPicker
          defaultKind={session.avatar?.kind}
          onDone={(avatar) => {
            setSession({ ...session, avatar });
            // Reclaims the handle with the session cookie and stores the head image for the courtroom.
            void api.session(session.handle, avatar).catch(() => {});
            router.push(next);
          }}
        />
      </div>
    </CaseShell>
  );
}

export default function AvatarPage() {
  return (
    <Suspense fallback={null}>
      <AvatarScreen />
    </Suspense>
  );
}
