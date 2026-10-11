/**
 * Static courthouse illustration for the homepage hero. Pure SVG, no data, no animation.
 * Coordinates are in a 516 x 370 box, matching the Lovable design.
 */

const SKIN = ['#E9B98F', '#D9A57B', '#B67B52', '#8D5A3B', '#F1C9A5', '#C68E64'];
const HAIR = ['#2B1B12', '#5A3A25', '#1B1410', '#8A5A2B', '#3F2A1E', '#6B4226'];

const JURY_X = [379, 401, 423, 444, 466, 488];
const GALLERY_X = [37, 99, 161, 224, 288, 351, 414, 476];

function JuryHead({ x, y, i }: { x: number; y: number; i: number }) {
  return (
    <g>
      <rect x={x - 5} y={y + 7} width={10} height={8} rx={2} fill="#2B1B12" />
      <circle cx={x} cy={y} r={8} fill={SKIN[i % SKIN.length]} />
      <path d={`M${x - 8} ${y - 1} Q${x} ${y - 11} ${x + 8} ${y - 1} Q${x} ${y - 5} ${x - 8} ${y - 1}Z`} fill={HAIR[i % HAIR.length]} />
      <circle cx={x - 3} cy={y + 1} r={0.9} fill="#1B1410" />
      <circle cx={x + 3} cy={y + 1} r={0.9} fill="#1B1410" />
    </g>
  );
}

function Silhouette({ x, i }: { x: number; i: number }) {
  const head = 284 + (i % 3 === 1 ? -6 : i % 3 === 2 ? 3 : 0);
  return (
    <g fill={i % 2 ? '#1C110B' : '#241710'}>
      <circle cx={x} cy={head} r={13} />
      <path d={`M${x - 27} 324 Q${x - 27} ${head + 16} ${x} ${head + 14} Q${x + 27} ${head + 16} ${x + 27} 324Z`} />
    </g>
  );
}

export function HeroScene() {
  return (
    <svg
      viewBox="0 0 516 370"
      role="img"
      aria-label="Illustration of a courtroom with a judge in a white wig, two tables, a jury box and spectators"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="hj-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#74424F" />
          <stop offset="0.6" stopColor="#55303A" />
          <stop offset="1" stopColor="#3A2228" />
        </linearGradient>
        <linearGradient id="hj-beam" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD9E8" stopOpacity="0.22" />
          <stop offset="1" stopColor="#FFD9E8" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Wall, paneling stripes, light beam */}
      <rect width="516" height="370" fill="url(#hj-wall)" />
      {Array.from({ length: 15 }).map((_, i) => (
        <rect key={i} x={i * 36} y={0} width={18} height={216} fill="#fff" opacity={0.035} />
      ))}
      <polygon points="30,0 150,0 340,250 190,250" fill="url(#hj-beam)" />

      {/* Wainscot and floor */}
      <rect y={214} width={516} height={38} fill="#4A2D1C" />
      <rect y={213} width={516} height={2} fill="#8A6A30" />
      <rect y={252} width={516} height={72} fill="#33201A" />

      {/* Arched window */}
      <path d="M47 214 V78 A28 28 0 0 1 103 78 V214 Z" fill="#3E5B8C" stroke="#2B1B12" strokeWidth={4} />
      <path d="M47 214 V78 A28 28 0 0 1 103 78 V214 Z" fill="none" stroke="#7A5A34" strokeWidth={1} />
      <line x1="75" y1="50" x2="75" y2="214" stroke="#2B1B12" strokeWidth={3} />
      <line x1="47" y1="124" x2="103" y2="124" stroke="#2B1B12" strokeWidth={3} />
      <line x1="47" y1="170" x2="103" y2="170" stroke="#2B1B12" strokeWidth={3} />

      {/* Judge medallion */}
      <circle cx="256" cy="62" r="38" fill="#3A2230" stroke="#C99A2E" strokeWidth={2} />
      <g stroke="#C99A2E" strokeWidth={1.1} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M257 44 V56 M251 56 H263 M250 48 H264 M250 48 l-2.5 5.5 a2.8 2.8 0 0 0 5 0z M264 48 l-2.5 5.5 a2.8 2.8 0 0 0 5 0z" />
      </g>

      {/* Judge: wig, face, robe */}
      <path d="M226 148 Q226 118 256 114 Q286 118 286 148 Z" fill="#1B1410" />
      <path d="M251 114 L244 130 L258 130 Z" fill="#F6EBD4" />
      {[
        [235, 88], [232, 99], [235, 110], [273, 88], [276, 99], [273, 110],
        [243, 77], [252, 73], [262, 77], [268, 80], [238, 80],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={8} fill="#F6EBD4" stroke="#CDBFA6" strokeWidth={0.7} />
      ))}
      <ellipse cx="254" cy="97" rx="14" ry="17" fill="#E9B98F" />
      <circle cx="248" cy="94" r="1.5" fill="#2B1B12" />
      <circle cx="260" cy="94" r="1.5" fill="#2B1B12" />
      <path d="M245 90 Q248 88 251 90 M257 90 Q260 88 263 90" stroke="#8A6A50" strokeWidth={1} fill="none" strokeLinecap="round" />
      <path d="M248 105 Q254 109 260 105" stroke="#7A3F30" strokeWidth={1.3} fill="none" strokeLinecap="round" />

      {/* Flag */}
      <rect x="327" y="62" width="3" height="90" fill="#C99A2E" />
      <circle cx="328.5" cy="60" r="2.6" fill="#C99A2E" />
      {Array.from({ length: 7 }).map((_, i) => (
        <rect key={i} x={330} y={64 + i * 3} width={31} height={3} fill={i % 2 ? '#F6EBD4' : '#B3261E'} />
      ))}
      <rect x="330" y="64" width="14" height="12" fill="#3F5B7A" />
      {[333, 337, 341].map((x) =>
        [67, 71, 74].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={0.7} fill="#F6EBD4" />),
      )}

      {/* Bench */}
      <rect x="150" y="150" width="216" height="86" fill="#3A2417" stroke="#6E5028" strokeWidth={1} />
      <rect x="160" y="160" width="196" height="66" fill="none" stroke="#8B6A2E" strokeWidth={1.2} />
      <rect x="140" y="142" width="236" height="9" rx="2" fill="#9A7633" />
      <rect x="140" y="150" width="236" height="2" fill="#6B4F20" />
      <rect x="195" y="184" width="118" height="12" rx="2" fill="#C99A2E" />
      <text x="254" y="192.6" textAnchor="middle" fontSize="5.6" letterSpacing="0.5" fill="#2B1B12" fontFamily="'IBM Plex Mono', monospace">
        THE HON. JUDGE JUDY-ISH
      </text>

      {/* Gavel on the bench */}
      <g transform="translate(182 143) rotate(-32)">
        <rect x="-10" y="-5" width="20" height="9" rx="2" fill="#F6EBD4" stroke="#9A8A64" strokeWidth={0.8} />
        <rect x="-2" y="3" width="4" height="17" rx="1.5" fill="#C99A2E" />
      </g>

      {/* Plaintiff and defendant bobbleheads (behind the tables) */}
      <circle cx="142" cy="190" r="22" fill="#F6EBD4" opacity={0.12} />
      <rect x="129" y="205" width="26" height="30" rx="7" fill="#2D3A55" />
      <circle cx="142" cy="190" r="17" fill="#E3B48A" stroke="#C99A2E" strokeWidth={2} />
      <path d="M126 187 Q142 168 158 187 Q142 178 126 187Z" fill="#3A2417" />
      <circle cx="137" cy="191" r="1.3" fill="#1B1410" />
      <circle cx="147" cy="191" r="1.3" fill="#1B1410" />

      <circle cx="336" cy="187" r="22" fill="#F6EBD4" opacity={0.12} />
      <rect x="323" y="202" width="26" height="30" rx="7" fill="#3D5A45" />
      <circle cx="336" cy="187" r="17" fill="#8D5A3C" stroke="#C99A2E" strokeWidth={2} />
      <path d="M320 184 Q336 165 352 184 Q336 175 320 184Z" fill="#1B1410" />
      <circle cx="331" cy="188" r="1.3" fill="#1B1410" />
      <circle cx="341" cy="188" r="1.3" fill="#1B1410" />

      {/* Tables with placards */}
      <rect x="78" y="246" width="128" height="9" rx="2" fill="#7A5236" stroke="#8A6A30" strokeWidth={0.8} />
      <rect x="82" y="255" width="120" height="30" fill="#3B2518" />
      <g transform="rotate(-3 143 263)">
        <rect x="117" y="256" width="52" height="15" rx="1.5" fill="#F6EBD4" stroke="#CDBFA6" strokeWidth={0.6} />
        <text x="143" y="266.4" textAnchor="middle" fontSize="8.5" fill="#1B1410" fontFamily="Lora, serif">
          Plaintiff
        </text>
      </g>

      <rect x="273" y="246" width="128" height="9" rx="2" fill="#7A5236" stroke="#8A6A30" strokeWidth={0.8} />
      <rect x="277" y="255" width="120" height="30" fill="#3B2518" />
      <g transform="rotate(2 337 266)">
        <rect x="309" y="258" width="56" height="15" rx="1.5" fill="#F6EBD4" stroke="#CDBFA6" strokeWidth={0.6} />
        <text x="337" y="268.4" textAnchor="middle" fontSize="8.5" fill="#1B1410" fontFamily="Lora, serif">
          Defendant
        </text>
      </g>

      {/* Jury box */}
      <rect x="366" y="142" width="138" height="78" rx="3" fill="#4A2C1E" opacity={0.7} />
      {JURY_X.map((x, i) => (
        <JuryHead key={x} x={x} y={157} i={i} />
      ))}
      <JuryHead x={379} y={202} i={6} />
      <JuryHead x={401} y={202} i={7} />
      {[423, 444, 466, 488].map((x) => (
        <circle key={x} cx={x} cy={202} r={8} fill="#1F130D" />
      ))}
      <rect x="366" y="216" width="138" height="20" fill="#5A3A25" stroke="#8A6A30" strokeWidth={0.8} />
      <text x="382" y="228" fontSize="5" letterSpacing="0.4" fill="#C99A2E" opacity={0.85} fontFamily="'IBM Plex Mono', monospace">
        JURY OF PUBLIC OPINION
      </text>
      <rect x="447" y="237" width="57" height="18" rx="9" fill="#1B1410" stroke="#F6EBD4" strokeOpacity={0.6} />
      <text x="475.5" y="249" textAnchor="middle" fontSize="7.6" fill="#F6EBD4" fontFamily="Inter, sans-serif">
        +2 watching
      </text>

      {/* Gallery silhouettes */}
      {GALLERY_X.map((x, i) => (
        <Silhouette key={x} x={x} i={i} />
      ))}

      {/* Bottom rail and footer line */}
      <rect y="322" width="516" height="48" fill="#2D1D14" />
      <rect y="322" width="516" height="2" fill="#5A3A25" />
      <rect y="356" width="516" height="1" fill="#6B4A2A" />
      <text x="258" y="344" textAnchor="middle" fontSize="5.5" letterSpacing="0.6" fill="#7A604A" fontFamily="'IBM Plex Mono', monospace">
        EST. FIVE MINUTES AGO
      </text>

      {/* Confetti */}
      <rect x="283" y="21" width="11" height="5" fill="#FF5DA2" transform="rotate(-40 288 24)" />
      <rect x="91" y="72" width="10" height="4" fill="#F6EBD4" transform="rotate(-18 96 74)" />
      <rect x="36" y="153" width="10" height="4" fill="#FF5DA2" transform="rotate(40 41 155)" />
      <rect x="178" y="252" width="9" height="4" fill="#F6EBD4" transform="rotate(-50 182 254)" />
      <rect x="474" y="339" width="11" height="4" fill="#FF5DA2" />
    </svg>
  );
}
