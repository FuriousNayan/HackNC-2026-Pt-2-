'use client';

import { CONFIG } from '@/contracts';

export interface BobbleheadProps {
  headImageUrl: string;
  role: 'plaintiff' | 'defendant' | 'juror';
  speaking?: boolean;
  dimmed?: boolean;
  disconnected?: boolean;
  absent?: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}

/** Head wobbles about the neck. Reduced motion turns the animation off in CSS. */
export function Bobblehead({
  headImageUrl,
  role,
  speaking,
  dimmed,
  disconnected,
  absent,
  label,
  size = 'md',
  title,
}: BobbleheadProps) {
  const cls = [
    'bobblehead',
    `size-${size}`,
    speaking ? 'is-speaking' : '',
    dimmed ? 'is-dimmed' : '',
    disconnected ? 'is-disconnected' : '',
    absent ? 'is-absent' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} title={title}>
      <div className="bobble-body" />
      <div className="bobble-head">
        {!absent ? <img src={headImageUrl} alt={`${label || role} cartoon avatar`} /> : null}
      </div>
      {label ? <span className="bobble-label">{label}</span> : null}
      {disconnected ? <span className="presence-label">waiting {CONFIG.timers.disconnectGraceSec} seconds</span> : null}
      {absent ? <span className="presence-label">not in court yet</span> : null}
    </div>
  );
}
