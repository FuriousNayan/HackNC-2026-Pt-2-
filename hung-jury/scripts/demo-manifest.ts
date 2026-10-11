import { FIXTURES } from '../src/judge/fixtures';
import { demoFor } from '../src/judge/demo';
import { fallbackFor } from '../src/judge/fallback';
import { validateOutput } from '../src/judge/schema';
import { JUDGE_CONFIG, voiceSettingsFor, type JudgeInput, type SpeechKind } from '../src/contracts';
export interface DemoAudioLine {
  text: string;
  kind: SpeechKind;
  toneDial: number;
}
// Speech uses the input dial; voice uses the subsequently smoothed dial.
// Cache every scripted speech/voice-band pairing, including exact band boundaries.
export function demoManifest(): DemoAudioLine[] {
  const steps: Array<{
    phase: JudgeInput['phase'];
    length: number;
    target?: JudgeInput['target'];
    turnKind?: JudgeInput['turnKind'];
  }> = [
    { phase: 'opening', length: 0 },
    { phase: 'statements', length: 1 },
    { phase: 'statements', length: 2 },
    { phase: 'cross', length: 2, target: 'plaintiff' },
    { phase: 'cross', length: 3, turnKind: 'reaction' },
    { phase: 'cross', length: 3, target: 'defendant' },
    { phase: 'cross', length: 4, turnKind: 'reaction' },
    { phase: 'rebuttal', length: 4 },
    { phase: 'closing', length: 5 },
    { phase: 'closing', length: 6 },
    { phase: 'verdict', length: 6 },
  ];
  const seen = new Set<string>(),
    lines: DemoAudioLine[] = [];
  function add(text: string, kind: SpeechKind) {
    for (const toneDial of [0.4, 0.55, 0.75, 0.9]) {
      const key = JSON.stringify([text, kind, voiceSettingsFor(toneDial)]);
      if (!seen.has(key)) {
        seen.add(key);
        lines.push({ text, kind, toneDial });
      }
    }
  }
  for (const toneDial of [0.4, 0.45, 0.55, 0.65, 0.75, 0.85, 0.9]) {
    for (const step of steps) {
      const fixture = structuredClone(FIXTURES['oat-milk']);
      const input: JudgeInput = {
        ...fixture,
        phase: step.phase,
        target: step.target,
        turnKind: step.turnKind,
        toneDial,
        transcript: fixture.transcript.slice(0, step.length),
      };
      const output = validateOutput(demoFor(input), input);
      add(output.speech, output.verdict ? 'verdict' : 'quick');
    }
  }
  // Outage and custom-case fallbacks must be playable offline too.
  for (const phase of JUDGE_CONFIG.phases) {
    const output = fallbackFor(phase, 'defendant');
    add(output.speech, output.verdict ? 'verdict' : 'quick');
  }
  return lines;
}
