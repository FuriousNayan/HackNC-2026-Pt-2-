import { CONFIG, type SafetyCategory } from '../contracts';
import { REDACTION_PATTERNS, SAFETY_PATTERNS } from './lists';
export function redact(text: string): string {
  return REDACTION_PATTERNS.reduce((s, p) => s.replace(p, CONFIG.app.redactionToken), text);
}
export function preFilter(text: string): { ok: boolean; category?: SafetyCategory } {
  const normalized = text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ');
  for (const category of ['self_harm', 'threat', 'harassment', 'other'] as const)
    if (SAFETY_PATTERNS[category].some((p) => p.test(normalized))) return { ok: false, category };
  return { ok: true };
}
