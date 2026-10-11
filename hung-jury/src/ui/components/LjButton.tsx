import type { ButtonHTMLAttributes } from 'react';

export type LjVariant = 'default' | 'ghost' | 'outline' | 'guilty' | 'innocent' | 'reaction' | 'destructive';
export type LjSize = 'default' | 'sm' | 'lg' | 'icon';

export interface LjButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: LjVariant;
  size?: LjSize;
}

/** Plain-CSS version of the Lovable shadcn Button. Styles live in lovable-base.css. */
export function LjButton({ variant = 'default', size = 'default', className = '', type = 'button', ...rest }: LjButtonProps) {
  const cls = ['b', variant === 'default' ? '' : `b-${variant}`, size === 'default' ? '' : `b-${size}`, className]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={cls} {...rest} />;
}
