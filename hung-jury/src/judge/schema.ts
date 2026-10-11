import { z } from 'zod';
import { CONFIG, JUDGE_CONFIG as C, type JudgeInput, type JudgeOutput } from '@/contracts';
const short = (max: number) => z.string().trim().min(1).max(max);
const handle = short(C.maxHandleChars);
const messageSchema = z
  .object({
    id: short(120),
    caseId: short(120),
    authorHandle: handle,
    role: z.enum(C.roles),
    kind: z.enum(C.messageKinds),
    text: short(CONFIG.limits.statementChars),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.kind === 'answer' && m.text.length > CONFIG.limits.answerChars)
      ctx.addIssue({ code: 'custom', message: 'Answer exceeds the shared limit', path: ['text'] });
    if (m.role === 'juror')
      ctx.addIssue({
        code: 'custom',
        message: 'Juror messages do not belong in judge input',
        path: ['role'],
      });
  });
export const precedentSchema = z
  .object({
    title: short(C.maxTitleChars),
    plaintiff: handle,
    defendant: handle,
    ruling: z.enum(C.rulings),
    summary: short(C.maxSummaryChars),
  })
  .strict();
export const judgeInputSchema = z
  .object({
    caseTitle: short(C.maxTitleChars),
    grievance: short(CONFIG.limits.grievanceChars),
    phase: z.enum(C.phases),
    transcript: z.array(messageSchema).max(C.maxTranscriptMessages),
    toneDial: z.number().finite().min(0).max(1),
    precedents: z.array(precedentSchema).max(CONFIG.limits.precedentsPerCall),
    guiltyCounts: z.record(handle, z.number().int().min(0).max(100000)),
    target: z.enum(['plaintiff', 'defendant']).optional(),
    parties: z.object({ plaintiff: handle, defendant: handle }).strict().optional(),
    turnKind: z.enum(['default', 'reaction']).optional(),
    sentenceRequest: short(100).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.phase === 'cross' && input.turnKind !== 'reaction' && !input.target)
      ctx.addIssue({
        code: 'custom',
        message: 'Cross-examination requires a target',
        path: ['target'],
      });
    if (input.turnKind === 'reaction' && input.phase !== 'cross')
      ctx.addIssue({
        code: 'custom',
        message: 'turnKind reaction is only for cross answers',
        path: ['turnKind'],
      });
    if (Object.keys(input.guiltyCounts).length > C.maxGuiltyHandles)
      ctx.addIssue({ code: 'custom', message: 'Too many guilty counts', path: ['guiltyCounts'] });
    const ids = input.transcript.map((m) => m.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate transcript message IDs',
        path: ['transcript'],
      });
    if (new Set(input.transcript.map((m) => m.caseId)).size > 1)
      ctx.addIssue({ code: 'custom', message: 'Transcript mixes cases', path: ['transcript'] });
    for (const m of input.transcript) {
      if (input.parties && m.authorHandle !== input.parties[m.role as 'plaintiff' | 'defendant'])
        ctx.addIssue({
          code: 'custom',
          message: 'Message author does not match parties',
          path: ['transcript'],
        });
    }
  });
export const verdictSchema = z
  .object({
    ruling: z.enum(C.rulings),
    findings: z.array(short(C.maxFindingChars)).min(2).max(3),
    sentence: short(C.maxSentenceChars).nullable(),
    headline: short(C.maxHeadlineChars),
    cited_precedent: short(C.maxTitleChars).nullable(),
  })
  .strict();
export const judgeOutputSchema = z
  .object({
    phase: z.enum(C.outputPhases),
    tone_score: z.number().finite().min(0).max(1),
    speech: short(C.maxSpeechChars),
    target: z.enum(C.targets).nullable(),
    face: z.enum(C.faces),
    sfx: z.enum(C.effects),
    verdict: verdictSchema.nullable(),
    safety_flag: z.boolean(),
    safety_reason: short(300).nullable(),
  })
  .strict();
export const responseJsonSchema = z.toJSONSchema(judgeOutputSchema, { target: 'draft-7' });
export function sentenceCount(text: string): number {
  return [
    ...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(
      text.replace(/\bv\.\s/gi, 'v '),
    ),
  ].filter((s) => s.segment.trim()).length;
}
export function expectedPhase(input: JudgeInput): JudgeOutput['phase'] {
  if (input.turnKind === 'reaction') return 'reaction';
  if (input.phase === 'statements' || input.phase === 'rebuttal' || input.phase === 'closing')
    return 'reaction';
  if (input.phase === 'cross') return 'question';
  return input.phase;
}
export function validateOutput(value: unknown, input: JudgeInput): JudgeOutput {
  const out = judgeOutputSchema.parse(value);
  if (sentenceCount(out.speech) > CONFIG.limits.judgeSpeechMaxSentences)
    throw new Error('Speech exceeds sentence limit');
  if (out.safety_flag) {
    if (
      !out.safety_reason ||
      out.verdict ||
      out.sfx !== 'none' ||
      out.face !== 'neutral' ||
      out.target !== 'room'
    )
      throw new Error('Invalid safety output');
    return out;
  }
  if (out.safety_reason !== null) throw new Error('Unflagged result has safety reason');
  const normalize = (text: string) => text.replaceAll('’', "'").replace(/\s+/g, ' ').toLowerCase();
  const record = normalize(
    [
      input.caseTitle,
      input.grievance,
      ...input.transcript.map((m) => m.text),
      ...input.precedents.flatMap((p) => [p.title, p.summary]),
    ].join('\n'),
  );
  const quotePattern = /“([^”]+)”|"([^"]+)"|(?<!\w)'((?:[^'\n]|(?<=\w)'(?=\w)){3,})'(?!\w)/g;
  for (const match of out.speech.matchAll(quotePattern)) {
    const quote = normalize((match[1] ?? match[2] ?? match[3]).trim().replace(/[.,!?;:]+$/, ''));
    if (quote.length >= 3 && !record.includes(quote))
      throw new Error('Quoted testimony is not grounded in the record');
  }
  const wanted = expectedPhase(input);
  const sentences = sentenceCount(out.speech);
  const phaseLimit =
    input.phase === 'closing'
      ? 1
      : wanted === 'reaction' || wanted === 'question'
        ? 2
        : wanted === 'opening'
          ? 3
          : CONFIG.limits.judgeSpeechMaxSentences;
  if (sentences > phaseLimit) throw new Error('Speech exceeds phase sentence limit');
  let references = [
    out.speech,
    ...(out.verdict?.findings ?? []),
    out.verdict?.sentence ?? '',
    out.verdict?.headline ?? '',
  ].join(' ');
  for (const title of [input.caseTitle, ...input.precedents.map((p) => p.title)])
    references = references.replaceAll(title, '');
  if (/\bv(?:s)?\.\s/iu.test(references))
    throw new Error('Possible invented case citation in speech');
  if (out.phase !== wanted) throw new Error('Unexpected output phase');
  if (wanted === 'question' && out.target !== input.target)
    throw new Error('Question has wrong target');
  if (wanted === 'verdict' && !out.verdict) throw new Error('Missing verdict');
  if (wanted !== 'verdict' && out.verdict) throw new Error('Premature verdict');
  if (out.verdict) {
    if (/[\r\n]/.test(out.verdict.headline)) throw new Error('Headline must be one line');
    if (
      out.verdict.cited_precedent &&
      !input.precedents.some((p) => p.title === out.verdict!.cited_precedent)
    )
      throw new Error('Invented precedent');
    if (
      (out.verdict.ruling === 'hung' || out.verdict.ruling === 'not_guilty') &&
      out.verdict.sentence !== null
    )
      throw new Error('No sentence for an unresolved or innocent case');
  }
  return out;
}

// Constrain the provider decoder to this task, rather than permitting every phase.
export function responseSchemaFor(input: JudgeInput) {
  const schema = structuredClone(responseJsonSchema);
  const phase = expectedPhase(input);
  schema.properties!.phase = { type: 'string', enum: [phase] };
  if (phase !== 'verdict') schema.properties!.verdict = { type: 'null' };
  if (phase === 'question')
    schema.properties!.target = { type: 'string', enum: [input.target!, 'room'] };
  const description =
    input.phase === 'closing'
      ? 'Exactly one short acknowledgement sentence. No ruling or verdict.'
      : phase === 'question'
        ? 'One pointed question grounded in the target testimony. At most two sentences.'
        : phase === 'reaction'
          ? 'A reaction in one or two sentences. No ruling. Quotes must be exact.'
          : phase === 'opening'
            ? 'An opening in two or three sentences. Introduce both sides without a ruling.'
            : 'A verdict in at most four sentences, using only supplied facts.';
  const speechSchema = schema.properties!.speech;
  schema.properties!.speech = {
    ...(typeof speechSchema === 'object' ? speechSchema : {}),
    description,
  };
  return schema;
}
