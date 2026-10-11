'use client';

import Link from 'next/link';
import { GavelIcon, UserGlyph } from './Icons';

export interface SiteHeaderProps {
  /** null when nobody is signed in: the chip becomes a sign in link */
  handle: string | null;
}

export function SiteHeader({ handle }: SiteHeaderProps) {
  return (
    <header className="hj-header">
      <Link href="/" className="hj-logo" aria-label="Hung Jury home">
        <GavelIcon size={24} style={{ color: 'var(--brass-500)' }} />
        <span>
          Hung Jury<span className="dot">.</span>
        </span>
      </Link>

      {handle ? (
        <Link href="/avatar" className="hj-user" aria-label={`Signed in as ${handle}`}>
          <span className="av">
            <UserGlyph size={15} style={{ color: '#2b1b12' }} />
          </span>
          {handle}
        </Link>
      ) : (
        <Link href="/signin" className="hj-user" style={{ paddingLeft: 18 }}>
          Sign in
        </Link>
      )}
    </header>
  );
}
