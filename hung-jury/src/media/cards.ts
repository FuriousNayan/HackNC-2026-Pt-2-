import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { CONFIG, TOKENS, toneColor, type CardFormat, type VerdictCardData } from '../contracts';
import { adapter } from './runtime';
import { storage } from './storage';
import { redact } from '../safety';
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
function lines(text: string, max: number, count: number): string[] {
  const result: string[] = [];
  let current = '';
  for (const word of Array.from(redact(text)).join('').split(/\s+/)) {
    for (let i = 0; i < word.length; i += max) {
      const piece = word.slice(i, i + max);
      if (current.length + piece.length + 1 > max) {
        result.push(current);
        current = piece;
      } else current += (current ? ' ' : '') + piece;
    }
  }
  if (current) result.push(current);
  const out = result.slice(0, count);
  if (result.length > count) out[count - 1] = out[count - 1].slice(0, max - 3) + '...';
  return out;
}
export async function verdictCardPng(data: VerdictCardData, format: CardFormat): Promise<Buffer> {
  if (data.safetyClosed !== false) throw new Error('Safety-closed cases cannot have verdict cards');
  if (format !== 'portrait' && format !== 'square') throw new Error('Invalid card format');
  if (
    !Number.isFinite(data.toneDial) ||
    data.toneDial < 0 ||
    data.toneDial > 1 ||
    !Number.isFinite(data.juryGuiltyPct) ||
    data.juryGuiltyPct < 0 ||
    data.juryGuiltyPct > 100
  )
    throw new Error('Invalid verdict card data');
  const labels = {
    guilty: 'GUILTY',
    not_guilty: 'NOT GUILTY',
    partly_guilty: 'PARTLY GUILTY',
    hung: 'HUNG',
  };
  if (!Object.hasOwn(labels, data.ruling)) throw new Error('Invalid ruling');
  const [w, h] = CONFIG.card[format],
    stamp = labels[data.ruling],
    color =
      data.ruling === 'guilty'
        ? TOKENS.verdictRed
        : data.ruling === 'not_guilty'
          ? TOKENS.verdictGreen
          : TOKENS.brass500;
  const runs: Array<{ s: string; x: number; y: number; size: number; font: string; fill: string }> =
    [];
  const text = (
    s: string,
    x: number,
    y: number,
    size: number,
    font: string = TOKENS.bodyFont,
    fill: string = TOKENS.ink900,
  ) => {
    const placeholder = `__CARD_TEXT_${runs.length}__`;
    runs.push({ s, x, y, size, font, fill });
    return placeholder;
  };
  const group = (
    s: string,
    y: number,
    size: number,
    max: number,
    count: number,
    font: string = TOKENS.bodyFont,
  ) =>
    lines(s, max, count)
      .map((line, i) => text(line, 80, y + i * (size + 16), size, font))
      .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
 <rect width="100%" height="100%" fill="${TOKENS.parchment100}"/><rect x="24" y="24" width="${w - 48}" height="${h - 48}" rx="24" fill="none" stroke="${toneColor(data.toneDial)}" stroke-width="8"/>
 ${text(CONFIG.app.name.toUpperCase(), 80, 110, 30, TOKENS.displayFont)}${text('CASE ' + redact(data.caseNumber).slice(0, 36), 80, 157, 22, TOKENS.monoFont)}
 ${group(data.title, 235, 48, 30, 2, TOKENS.displayFont)}
 <rect x="80" y="345" width="920" height="120" rx="12" fill="none" stroke="${color}" stroke-width="5"/>${text(stamp, 110, 425, stamp.length > 12 ? 58 : 70, TOKENS.displayFont, color)}
 ${group(data.headline, 535, 34, 45, 2)}${group(data.sentence ? 'Sentence: ' + data.sentence : 'No sentence imposed.', 650, 28, 56, 3)}
 ${text('Judge: ' + stamp.replaceAll('_', ' '), 80, h - 260, 25)}${text('Jury: ' + Math.round(data.juryGuiltyPct) + '% guilty / ' + Math.round(100 - data.juryGuiltyPct) + '% not guilty', 80, h - 215, 25)}
 ${text(redact(data.plaintiff).slice(0, 28) + ' v. ' + redact(data.defendant).slice(0, 28), 80, h - 155, 24)}
 <path d="M80 ${h - 120} H1000" stroke="${TOKENS.brass500}"/>${text(CONFIG.app.disclaimer, 80, h - 75, 22)}
 </svg>`;
  // Character counts alone do not bound pixel width (e.g. a long string of W's).
  // Measure with the same renderer/fonts and compress only lines that would overflow.
  const measures = new Map<string, Promise<number>>();
  let fitted = svg;
  for (const [index, run] of runs.entries()) {
    const key = JSON.stringify([run.s, run.font, run.size]);
    let measured = measures.get(key);
    if (!measured) {
      const width = Math.ceil(Array.from(run.s).length * run.size * 2 + 32),
        height = Math.ceil(run.size * 4);
      const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><text x="16" y="${run.size * 2}" font-family="${escape(run.font)}" font-size="${run.size}" fill="black">${escape(run.s)}</text></svg>`;
      measured = sharp(Buffer.from(probe))
        .trim({ background: '#ffffff' })
        .png()
        .toBuffer({ resolveWithObject: true })
        .then(({ info }) => info.width);
      measures.set(key, measured);
    }
    const inkWidth = await measured,
      available = w - 80 - run.x;
    const scale = Math.min(1, (available - 8) / Math.max(1, inkWidth));
    const node = `<g transform="translate(${run.x},${run.y}) scale(${scale},1)"><text x="0" y="0" font-family="${escape(run.font)}" font-size="${run.size}" fill="${run.fill}">${escape(run.s)}</text></g>`;
    fitted = fitted.replace(`__CARD_TEXT_${index}__`, node);
  }
  return sharp(Buffer.from(fitted)).png().toBuffer();
}
export async function renderVerdictCard(caseId: string, format: CardFormat): Promise<string> {
  if (!caseId || caseId.length > 200) throw new Error('Invalid case ID');
  if (format !== 'portrait' && format !== 'square') throw new Error('Invalid card format');
  const data = await adapter('loadVerdict')(caseId, format);
  if (data.caseId !== caseId || data.safetyClosed !== false)
    throw new Error('Verdict card unavailable');
  const hash = createHash('sha256').update(caseId).digest('hex'),
    path = `cards/${hash}/${format}.png`,
    store = storage();
  // Always check current visibility before serving a cache hit.
  if (!(await store.read(path)))
    await store.write(path, await verdictCardPng(data, format), 'image/png');
  return store.url(path);
}
