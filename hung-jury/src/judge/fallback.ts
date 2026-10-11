import { JUDGE_CONFIG as C, type JudgeInput, type JudgeOutput, type Phase } from '@/contracts';
import { expectedPhase } from './schema';
export function fallbackFor(
  phase: Phase,
  target?: JudgeInput['target'],
  turnKind?: JudgeInput['turnKind'],
): JudgeOutput {
  const input = { phase, target, turnKind } as JudgeInput;
  const outputPhase = expectedPhase(input);
  const lines: Record<JudgeOutput['phase'], string> = {
    opening: 'Order in the court. Each side will have a chance to explain this dispute.',
    reaction:
      phase === 'closing'
        ? 'The court has received your closing statement.'
        : 'The court has received this account and will consider both sides.',
    question: 'What happened, and which details can you confirm?',
    interjection: 'Please pause while the court reviews this issue.',
    verdict:
      'The court could not complete its review. No finding of guilt will be made from an unavailable judge.',
  };
  return {
    phase: outputPhase,
    tone_score: C.neutralScore,
    speech: lines[outputPhase],
    target: outputPhase === 'question' ? (target ?? 'plaintiff') : 'room',
    face: 'neutral',
    sfx: 'none',
    verdict:
      outputPhase === 'verdict'
        ? {
            ruling: 'hung',
            findings: [
              'The automated review could not be completed.',
              'No reliable final determination was generated.',
            ],
            sentence: null,
            headline: 'Review unavailable; no determination',
            cited_precedent: null,
          }
        : null,
    safety_flag: false,
    safety_reason: null,
  };
}
