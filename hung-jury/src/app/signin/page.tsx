'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api } from '@/ui/api/client';
import { CaseShell } from '@/ui/components/CaseShell';
import { LjButton } from '@/ui/components/LjButton';
import { AUTH_ON, ensureSignedIn, signInWithGoogle } from '@/ui/supabaseAuth';
import { HANDLE_PATTERN, getSession, normalizeHandle, setSession } from '@/ui/session';

function SignInForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/avatar';
  const [raw, setRaw] = useState('');
  const handle = normalizeHandle(raw);
  const valid = HANDLE_PATTERN.test(handle);
  const bad = raw.length > 0 && !valid;

  const [error, setError] = useState('');
  const finish = async () => {
    if (!valid) return;
    setError('');
    let claimed = handle;
    try {
      if (AUTH_ON) await ensureSignedIn();
      // Claims the handle on the server and sets the session cookie that authenticates every request.
      // With auth on, a person who already owns a handle gets that one back.
      claimed = (await api.session(handle, getSession()?.avatar)).handle ?? handle;
    } catch {
      setError('That handle is taken, or the server is unavailable. Try another one.');
      return;
    }
    // Keep any avatar the person already picked.
    setSession({ handle: claimed, avatar: getSession()?.avatar });
    router.push(next);
  };

  return (
    <CaseShell handle={null}>
      <div className="narrow">
        <div className="page-intro">
          <div className="court-eyebrow mono">
            <span /> THE CLERK’S DESK <span />
          </div>
          <h1>
            Pick a <span>handle.</span>
          </h1>
          <p>You never need to give your real name.</p>
        </div>

        <form
          className="parchment form-card"
          aria-label="Sign in"
          onSubmit={(e) => {
            e.preventDefault();
            finish();
          }}
        >
          <label>
            Handle
            <div className="handle-input">
              <span>@</span>
              <input
                value={raw}
                onChange={(e) => setRaw(e.target.value.replace(/^@/, ''))}
                placeholder="dave"
                autoComplete="off"
                autoCapitalize="none"
                aria-invalid={bad}
              />
            </div>
            <span className={`hint ${bad || error ? 'bad' : ''}`}>
              {error || '3 to 20 letters, numbers or underscores.'}
            </span>
          </label>
          <p className="privacy-note">
            Your handle is shown publicly to everyone in the courtroom. Do not use your real name, phone number or
            email.
          </p>
          <LjButton type="submit" disabled={!valid}>
            Continue as guest
          </LjButton>
          <LjButton
            variant="outline"
            type="button"
            disabled={!AUTH_ON}
            title={AUTH_ON ? undefined : 'Available once Supabase Auth is turned on'}
            onClick={() => {
              void signInWithGoogle(`/signin?next=${encodeURIComponent(next)}`).catch(() => setError('Google sign in failed.'));
            }}
          >
            Continue with Google
          </LjButton>
        </form>
      </div>
    </CaseShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
