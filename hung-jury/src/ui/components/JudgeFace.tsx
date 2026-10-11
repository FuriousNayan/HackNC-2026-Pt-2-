'use client';

import type { Face } from '@/contracts';

export function JudgeFace({ face }: { face: Face }) {
  return (
    <svg
      key={face}
      className={`judge-face face-${face}`}
      viewBox="0 0 180 180"
      role="img"
      aria-label={`Judge looking ${face}`}
    >
      <path d="M35 161Q45 123 90 125Q135 123 146 161" className="judge-robe" />
      <path d="M70 130L90 157L110 130" className="judge-collar" />
      <ellipse cx="90" cy="79" rx="54" ry="62" className="wig" />
      {[35, 145].map((x) =>
        [55, 76, 97, 115].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="14" className="wig-curl" />),
      )}
      <ellipse cx="90" cy="86" rx="39" ry="45" className="judge-skin" />
      <path d="M53 63Q49 20 90 23Q131 21 130 65Q110 48 90 46Q70 49 53 63" className="wig" />
      <path
        d={face === 'stern' ? 'M62 72L79 78M102 78L118 72' : 'M62 71Q70 65 79 71M102 71Q111 65 119 71'}
        className="face-lines"
      />
      <circle cx="72" cy="83" r={face === 'shocked' ? 5 : 3} className="face-ink" />
      <circle cx="109" cy="83" r={face === 'shocked' ? 5 : 3} className="face-ink" />
      <path d="M87 83L81 99L94 99" className="nose-line" />
      <circle cx="59" cy="99" r="7" className="cheek" />
      <circle cx="120" cy="99" r="7" className="cheek" />
      {face === 'speaking' || face === 'shocked' ? (
        <ellipse cx="90" cy="115" rx={face === 'speaking' ? 13 : 8} ry="10" className="face-ink" />
      ) : (
        <path
          d={
            face === 'amused'
              ? 'M73 110Q90 132 107 110'
              : face === 'stern'
                ? 'M78 118Q90 111 103 118'
                : 'M79 113Q90 119 102 113'
          }
          className="face-lines"
        />
      )}
      <path d="M68 127Q90 137 112 127" className="wig-curl" />
    </svg>
  );
}
