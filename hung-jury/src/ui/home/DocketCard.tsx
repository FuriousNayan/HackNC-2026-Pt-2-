import Link from 'next/link';
import type { DocketItem } from '@/ui/api/client';
import { ArrowUpRight, EyeIcon } from './Icons';
import { ToneChip } from './ToneChip';

export function DocketCard({ item }: { item: DocketItem }) {
  return (
    <article className="hj-card hj-case">
      <div className="top">
        <span>{item.number}</span>
        {item.status === 'live' ? (
          <span className="live">
            <i />
            LIVE
          </span>
        ) : null}
      </div>

      <div className="cat">{item.category}</div>
      <h3>{item.title}</h3>

      <div className="hj-parties">
        {item.plaintiff}
        <i>v.</i>
        {item.defendant}
      </div>

      <div className="hj-meta">
        <ToneChip tone={item.tone} />
        <span className="hj-views">
          <EyeIcon size={16} />
          {item.viewers} watching
        </span>
      </div>

      <Link href={`/case/${item.id}`} className="hj-join">
        Join as juror
        <ArrowUpRight size={15} />
      </Link>
    </article>
  );
}
