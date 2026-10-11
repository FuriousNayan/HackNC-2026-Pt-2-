import { preFilter } from '../safety';
import type { JudgeInput, JudgeOutput } from '@/contracts';
import { expectedPhase } from './schema';
// Conservative backup for obvious hazards during outages/demo. This is not Part 4's
// preFilter and cannot replace contextual Gemini review or the backend safety pipeline.
const hazards: Array<[RegExp, string]> = [
  [/\b(?:kill|hurt|stab|shoot)\s+(?:you|him|her|them|myself)\b/i, 'Threat of physical harm'],
  [
    /\b(?:make (?:him|her|you|them) regret|break (?:his|her|your|their) (?:legs|neck))\b/i,
    'Threat of physical harm',
  ],
  [/\b(?:kill myself|end my life|suicid(?:e|al)|self[- ]harm)\b/i, 'Possible self-harm'],
  [/\b(?:stalk(?:ing|s|ed)?|tracking (?:her|him|their) location)\b/i, 'Possible stalking'],
  [
    /\b(?:texting|messaging|following|contacting)\b.{0,100}\b(?:told|asked)\b.{0,50}\b(?:stop|leave me alone)\b/i,
    'Unwanted repeated contact',
  ],
  [
    /\b(?:abuse|abusive|sexual assault|rape|blackmail|minor in danger)\b/i,
    'Possible abuse or coercion',
  ],
];
export function obviousSafetyReason(input: JudgeInput): string | null {
  const texts = [input.caseTitle, input.grievance, input.sentenceRequest ?? '', ...input.transcript.map((m) => m.text)];
  for (const text of texts) {
    const filtered = preFilter(text);
    if (!filtered.ok) return `Safety pre-filter: ${filtered.category}`;
    for (const [pattern, reason] of hazards) if (pattern.test(text)) return reason;
  }
  return null;
}
export function safetyOutput(input: JudgeInput, reason: string): JudgeOutput {
  return {
    phase: expectedPhase(input),
    tone_score: 0,
    speech:
      'This sounds like a real safety concern. Please pause this dispute and seek appropriate support if someone may be in danger.',
    target: 'room',
    face: 'neutral',
    sfx: 'none',
    verdict: null,
    safety_flag: true,
    safety_reason: reason,
  };
}
