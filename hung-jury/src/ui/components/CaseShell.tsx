'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Gavel, Scale } from 'lucide-react';
import { CONFIG } from '@/contracts';

/** Page chrome shared by the courtroom and waiting room: Lovable header and footer. */
export function CaseShell({ handle, children }: { handle: string | null; children: ReactNode }) {
  return (
    <div className="lj">
      <main className="case-page">
        <header className="site-header">
          <Link href="/" className="small-logo">
            <Gavel />HUNG JURY<span className="logo-period">.</span>
          </Link>
          {handle ? (
            <span className="handle-chip">
              <span className="tiny-avatar">👤</span> {handle}
            </span>
          ) : (
            <Link href="/signin" className="handle-chip" style={{ paddingLeft: 14 }}>
              Sign in
            </Link>
          )}
        </header>
        {children}
        <footer className="site-footer">
          <span>
            <Scale size={16} /> {CONFIG.app.disclaimer}
          </span>
          <span className="mono">IN PETTINESS WE TRUST</span>
        </footer>
      </main>
    </div>
  );
}
