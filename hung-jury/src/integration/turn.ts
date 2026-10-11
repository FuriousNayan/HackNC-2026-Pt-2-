import {
  CONFIG,
  nextDial,
  type JudgeInput,
  type JudgeOutput,
  type RoomEvent,
  type SafetyCategory,
  type SpeechKind,
} from '../contracts';
import { judgeTurn } from '../judge/engine';
import { judgeInputSchema } from '../judge/schema';
import { safetyOutput } from '../judge/safety';
import { preFilter, redact } from '../safety';
import { speak } from '../media/voice';

export function prepareText(
  raw: string,
): { ok: true; text: string } | { ok: false; category: SafetyCategory } {
  const result = preFilter(raw);
  return result.ok ? { ok: true, text: redact(raw) } : { ok: false, category: result.category! };
}
export function prepareJudgeInput(
  raw: JudgeInput,
): { ok: true; input: JudgeInput } | { ok: false; output: JudgeOutput } {
  // Reject malformed backend requests before producing any usable trial event.
  const input = judgeInputSchema.parse(raw);
  const texts = [
    input.caseTitle,
    input.grievance,
    ...(input.sentenceRequest ? [input.sentenceRequest] : []),
    ...input.transcript.map((m) => m.text),
    ...input.precedents.flatMap((p) => [p.title, p.summary]),
  ];
  for (const text of texts) {
    const result = preFilter(text);
    if (!result.ok)
      return { ok: false, output: safetyOutput(input, `Safety pre-filter: ${result.category}`) };
  }
  return {
    ok: true,
    input: judgeInputSchema.parse({
      ...input,
      caseTitle: redact(input.caseTitle),
      grievance: redact(input.grievance),
      ...(input.sentenceRequest ? { sentenceRequest: redact(input.sentenceRequest) } : {}),
      transcript: input.transcript.map((m) => ({ ...m, text: redact(m.text) })),
      precedents: input.precedents.map((p) => ({
        ...p,
        title: redact(p.title),
        summary: redact(p.summary),
      })),
    }),
  };
}
export interface TurnOptions {
  // Set true only once for a new statement/answer/rebuttal/closing message.
  isNewArguerMessage: boolean;
}
export type TurnResult =
  | { kind: 'safety'; output: JudgeOutput; event: Extract<RoomEvent, { type: 'safety' }> }
  | {
      kind: 'judge';
      output: JudgeOutput;
      toneDial: number;
      event: Extract<RoomEvent, { type: 'judge' }>;
    };
export interface TurnServices {
  judge(input: JudgeInput): Promise<JudgeOutput>;
  speak(text: string, dial: number, kind: SpeechKind): Promise<{ audioUrl: string }>;
  audioTimeoutMs: number;
}
const defaults: TurnServices = {
  judge: judgeTurn,
  speak,
  audioTimeoutMs: CONFIG.voice.ttsTimeoutMs,
};
function stopped(output: JudgeOutput): TurnResult {
  return {
    kind: 'safety',
    output,
    event: { type: 'safety', reason: 'This dispute has been paused for a safety concern.' },
  };
}
async function audioWithinBudget(
  task: () => Promise<{ audioUrl: string }>,
  timeoutMs: number,
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve()
        .then(task)
        .then((r) => r.audioUrl)
        .catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
// Pure preparation: no database writes, timers for trial phases, or broadcasts.
// The backend must recheck case status/version after awaiting and before committing.
export async function judgeTurnWithMedia(
  raw: JudgeInput,
  options: TurnOptions,
  overrides: Partial<TurnServices> = {},
): Promise<TurnResult> {
  const services = { ...defaults, ...overrides };
  if (
    !Number.isFinite(services.audioTimeoutMs) ||
    services.audioTimeoutMs < 0 ||
    services.audioTimeoutMs > CONFIG.voice.ttsTimeoutMs
  )
    throw new Error('Invalid audio wait budget');
  const prepared = prepareJudgeInput(raw);
  if (!prepared.ok) return stopped(prepared.output);
  const input = prepared.input;
  const isNewArguerMessage = options.isNewArguerMessage;
  const output = await services.judge(input);
  if (output.safety_flag) return stopped(output);
  const generated = [
    output.speech,
    ...(output.verdict
      ? [...output.verdict.findings, output.verdict.headline, output.verdict.sentence ?? '']
      : []),
  ];
  if (generated.some((text) => !preFilter(text).ok))
    return stopped(safetyOutput(prepared.input, 'Unsafe generated content'));
  // Defense in depth: no raw PII from generated fields reaches voice or broadcasts.
  const clean: JudgeOutput = {
    ...output,
    speech: redact(output.speech),
    safety_reason: output.safety_reason ? redact(output.safety_reason) : null,
    verdict: output.verdict
      ? {
          ...output.verdict,
          findings: output.verdict.findings.map(redact),
          headline: redact(output.verdict.headline),
          sentence: output.verdict.sentence ? redact(output.verdict.sentence) : null,
          cited_precedent: output.verdict.cited_precedent
            ? redact(output.verdict.cited_precedent)
            : null,
        }
      : null,
  };
  const canScore =
    input.phase === 'statements' ||
    input.phase === 'rebuttal' ||
    input.phase === 'closing' ||
    (input.phase === 'cross' && input.turnKind === 'reaction');
  const dial =
    isNewArguerMessage && canScore ? nextDial(input.toneDial, clean.tone_score) : input.toneDial;
  const audioUrl = await audioWithinBudget(
    () => services.speak(clean.speech, dial, clean.verdict ? 'verdict' : 'quick'),
    services.audioTimeoutMs,
  );
  return {
    kind: 'judge',
    output: clean,
    toneDial: dial,
    event: {
      type: 'judge',
      speech: clean.speech,
      face: clean.face,
      sfx: clean.sfx,
      toneDial: dial,
      audioUrl,
      verdict: clean.verdict,
    },
  };
}
