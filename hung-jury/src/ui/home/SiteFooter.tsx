import Link from 'next/link';
import { CONFIG } from '@/contracts';
import { ArrowUpRight, ScalesIcon } from './Icons';

export function SiteFooter() {
  return (
    <footer className="hj-footer">
      <span className="left">
        <ScalesIcon size={16} />
        {CONFIG.app.disclaimer}
      </span>
      <Link href="/history">
        Leaderboard and case history
        <ArrowUpRight size={14} />
      </Link>
    </footer>
  );
}
