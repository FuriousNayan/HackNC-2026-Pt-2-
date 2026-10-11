// Generates placeholder SVG art so the UI runs before the Figma exports land.
// Replace the files in public/art/ with the real exports (same names) when they are ready.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'art');
mkdirSync(join(root, 'avatars'), { recursive: true });
mkdirSync(join(root, 'judge'), { recursive: true });
mkdirSync(join(root, 'scene'), { recursive: true });

const skin = ['#F1C9A5', '#D9A57B', '#B67B52', '#8D5A3B', '#F6D7BF', '#C68E64'];
const hair = ['#2B1B12', '#5A3A25', '#1B1410', '#8A5A2B', '#3F5B7A', '#B3261E'];

skin.forEach((s, i) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="128" fill="${s}"/>
  <path d="M30 120 Q40 20 128 18 Q216 20 226 120 Q200 70 128 66 Q56 70 30 120Z" fill="${hair[i]}"/>
  <ellipse cx="92" cy="140" rx="12" ry="16" fill="#1B1410"/>
  <ellipse cx="164" cy="140" rx="12" ry="16" fill="#1B1410"/>
  <circle cx="96" cy="134" r="4" fill="#fff"/>
  <circle cx="168" cy="134" r="4" fill="#fff"/>
  <path d="M92 188 Q128 218 164 188" stroke="#1B1410" stroke-width="8" fill="none" stroke-linecap="round"/>
</svg>
`;
  writeFileSync(join(root, 'avatars', `a${i + 1}.svg`), svg);
});

const faces = {
  neutral: { brow: 'M78 112 L112 112 M144 112 L178 112', mouth: 'M104 190 L152 190', eyeR: 10 },
  amused: { brow: 'M78 106 Q95 96 112 108 M144 108 Q161 96 178 106', mouth: 'M96 182 Q128 214 160 182', eyeR: 10 },
  shocked: { brow: 'M78 98 L112 108 M144 108 L178 98', mouth: 'M116 184 Q128 214 140 184 Q128 176 116 184Z', eyeR: 15 },
  stern: { brow: 'M78 104 L112 118 M144 118 L178 104', mouth: 'M100 196 Q128 180 156 196', eyeR: 9 },
  speaking: { brow: 'M78 110 L112 110 M144 110 L178 110', mouth: 'M108 180 Q128 214 148 180 Q128 172 108 180Z', eyeR: 10 },
};

Object.entries(faces).forEach(([name, f]) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 280">
  <path d="M20 120 Q10 10 128 8 Q246 10 236 120 Q250 190 226 220 Q200 250 128 252 Q56 250 30 220 Q6 190 20 120Z" fill="#F6EBD4"/>
  <ellipse cx="128" cy="150" rx="82" ry="92" fill="#E9C29B"/>
  <path d="M44 120 Q48 40 128 38 Q208 40 212 120 Q190 70 128 66 Q66 70 44 120Z" fill="#F6EBD4"/>
  <circle cx="95" cy="138" r="${f.eyeR}" fill="#1B1410"/>
  <circle cx="161" cy="138" r="${f.eyeR}" fill="#1B1410"/>
  <path d="${f.brow}" stroke="#5A3A25" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="${f.mouth}" stroke="#1B1410" stroke-width="7" fill="${name === 'speaking' || name === 'shocked' ? '#7a1f1a' : 'none'}" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="96" y="246" width="64" height="26" rx="6" fill="#2B1B12"/>
</svg>
`;
  writeFileSync(join(root, 'judge', `${name}.svg`), svg);
});

// Bobblehead body with a clear head mask area (circle at the top).
writeFileSync(
  join(root, 'scene', 'bobblehead-body.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect x="30" y="20" width="60" height="80" rx="18" fill="#5A3A25"/>
  <rect x="48" y="14" width="24" height="14" rx="4" fill="#C99A2E"/>
</svg>
`,
);
console.log('art written to', root);
