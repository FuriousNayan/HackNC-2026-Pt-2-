import { type JudgeInput, type JudgeOutput } from '@/contracts';
import { demoFor } from '../../judge/demo';
import { judgeTurnWithMedia } from '../../integration/turn';
import type { EngineServices } from '../engine';

/**
 * Offline judge for development. No Gemini, no ElevenLabs. Uses the scripted demo judge, then nudges the
 * tone score from the latest message (shouting, silly words) so the dial still moves. Voice always fails,
 * which is a supported state: events carry audioUrl null and the UI shows captions only.
 */
const SILLY = /(lol|lmao|bro|literally|stupid|dumb|ridiculous|banana|pizza|oat milk|!{2,})/i;
const SERIOUS = /(rent|contract|deposit|lawyer|legal|agreement|evidence|owed|\$\d)/i;

export function stubJudge(input: JudgeInput): JudgeOutput {
  const out = demoFor(input);
  const last = input.transcript.at(-1)?.text ?? '';
  if (SILLY.test(last)) out.tone_score = Math.max(out.tone_score, 0.85);
  else if (SERIOUS.test(last)) out.tone_score = Math.min(out.tone_score, 0.2);
  if (out.verdict && out.verdict.ruling === 'hung' && out.phase === 'verdict') {
    out.verdict = {
      ruling: 'guilty',
      findings: [
        'The plaintiff described the incident consistently.',
        'The defendant did not fully answer the central complaint.',
      ],
      sentence: 'A sincere apology, delivered in person.',
      headline: `${input.caseTitle}: Guilty`,
      cited_precedent: null,
    };
    out.speech = 'The court has heard enough. On the evidence presented, the ruling is guilty.';
    out.face = 'stern';
    out.sfx = 'gavel';
  }
  return out;
}

export function stubServices(): Partial<EngineServices> {
  return {
    judgeTurn: (input, options) =>
      judgeTurnWithMedia(input, options, {
        judge: async (i) => stubJudge(i),
        speak: async () => {
          throw new Error('voice disabled in stub mode');
        },
        audioTimeoutMs: 0,
      }),
    speak: async () => {
      throw new Error('voice disabled in stub mode');
    },
  };
}
