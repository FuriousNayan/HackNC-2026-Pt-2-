import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number, rest: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  ...rest,
});

export const GavelIcon = ({ size = 22, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M14 13 4.5 20.5a1.6 1.6 0 0 1-2.2-2.2L10 9" />
    <path d="m12.5 5.5 5-3 4 4-3 5z" />
    <path d="m11 8.5 4.5 4.5" />
    <path d="M3 22h8" />
  </svg>
);

export const ScalesIcon = ({ size = 20, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M12 3v18" />
    <path d="M7 21h10" />
    <path d="M5 7h14" />
    <path d="m5 7-3 7a3.5 3.5 0 0 0 6 0z" />
    <path d="m19 7-3 7a3.5 3.5 0 0 0 6 0z" />
  </svg>
);

export const BroadcastIcon = ({ size = 14, ...r }: P) => (
  <svg {...base(size, r)}>
    <circle cx="12" cy="12" r="2" />
    <path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4" />
    <path d="M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2" />
  </svg>
);

export const LockIcon = ({ size = 15, ...r }: P) => (
  <svg {...base(size, r)}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

export const EyeIcon = ({ size = 16, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const ArrowUpRight = ({ size = 16, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </svg>
);

export const ArrowRight = ({ size = 16, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

export const UserGlyph = ({ size = 16, ...r }: P) => (
  <svg {...base(size, { ...r, strokeWidth: 1.8 })}>
    <rect x="7" y="4" width="10" height="16" rx="3" />
    <path d="M10 9h4M10 13h4" />
  </svg>
);
