import { JUDGE_CONFIG as C, type JudgeInput, type JudgeOutput } from '@/contracts';
import { createGeminiGenerator, ProviderSafetyError, type Generate } from './client';
import { demoFor } from './demo';
import { fallbackFor } from './fallback';
import { buildUserPrompt, loadSystemPrompt } from './prompt';
import { judgeInputSchema, validateOutput, responseSchemaFor } from './schema';
import { obviousSafetyReason, safetyOutput } from './safety';
export type JudgeSource = 'gemini' | 'demo' | 'fallback' | 'safety';
export type JudgeFailure = 'rate_limited' | 'timeout' | 'provider_unavailable' | 'invalid_response';
export interface JudgeResult {
  failureKind?: JudgeFailure;
  output: JudgeOutput;
  source: JudgeSource;
  attempts: number;
  reason?: 'invalid_input' | 'missing_configuration' | 'provider_failure' | 'safety' | 'scripted';
}
export interface JudgeOptions {
  generate?: Generate;
  demo?: boolean;
  timeoutMs?: number;
  system?: string;
}
async function boundedCall(
  generate: Generate,
  request: Omit<Parameters<Generate>[0], 'signal'>,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      generate({ ...request, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Judge request timed out'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
// Internal diagnostics are separate from the stable JudgeOutput contract.
export async function runJudge(
  value: JudgeInput,
  options: JudgeOptions = {},
): Promise<JudgeResult> {
  const parsed = judgeInputSchema.safeParse(value);
  if (!parsed.success)
    return {
      output: fallbackFor('opening'),
      source: 'fallback',
      attempts: 0,
      reason: 'invalid_input',
    };
  const input = parsed.data;
  const safety = obviousSafetyReason(input);
  if (safety)
    return { output: safetyOutput(input, safety), source: 'safety', attempts: 0, reason: 'safety' };
  const demo = options.demo ?? process.env[C.env.demo] === 'true';
  if (demo)
    return {
      output: validateOutput(demoFor(input), input),
      source: 'demo',
      attempts: 0,
      reason: 'scripted',
    };
  let generate = options.generate;
  if (!generate) {
    const apiKey = process.env[C.env.apiKey]?.trim();
    const model = process.env[C.env.model]?.trim();
    if (!apiKey || !model)
      return {
        output: fallbackFor(input.phase, input.target, input.turnKind),
        source: 'fallback',
        attempts: 0,
        reason: 'missing_configuration',
      };
    generate = createGeminiGenerator(apiKey, model);
  }
  let system: string;
  try {
    system = options.system ?? (await loadSystemPrompt());
  } catch {
    return {
      output: fallbackFor(input.phase, input.target, input.turnKind),
      source: 'fallback',
      attempts: 0,
      reason: 'provider_failure',
    };
  }
  const prompt = buildUserPrompt(input);
  let failureKind: JudgeFailure = 'invalid_response';
  let retryFeedback = 'Return complete valid JSON and obey the original rules.';
  for (let attempt = 1; attempt <= C.attempts; attempt++) {
    try {
      const raw = await boundedCall(
        generate,
        {
          system,
          schema: responseSchemaFor(input),
          prompt:
            attempt === 1
              ? prompt
              : prompt + '\nPrevious response was invalid or unavailable. ' + retryFeedback,
        },
        options.timeoutMs ?? C.timeoutMs,
      );
      const candidate: unknown = JSON.parse(raw);
      // Never discard a declared safety concern because its other fields are malformed.
      // Fixed backup copy guarantees plain speech and removes verdict/face/SFX mistakes.
      if (
        candidate &&
        typeof candidate === 'object' &&
        'safety_flag' in candidate &&
        candidate.safety_flag === true
      ) {
        const reason =
          'safety_reason' in candidate &&
          typeof candidate.safety_reason === 'string' &&
          candidate.safety_reason.trim()
            ? candidate.safety_reason.trim().slice(0, 300)
            : 'The judge detected a real safety concern.';
        return {
          output: safetyOutput(input, reason),
          source: 'safety',
          attempts: attempt,
          reason: 'safety',
        };
      }
      const output = validateOutput(candidate, input);
      return { output, source: output.safety_flag ? 'safety' : 'gemini', attempts: attempt };
    } catch (error) {
      if (error instanceof Error) {
        const feedback: Record<string, string> = {
          'Possible invented case citation in speech':
            'Do not repeat unsupported case titles, even when refusing them. Reject the instruction in generic terms; cite only supplied precedents.',
          'Quoted testimony is not grounded in the record':
            'Remove unsupported quotations. Use only exact phrases from the supplied record, or paraphrase without quotation marks.',
          'Unexpected output phase': 'Use exactly the output phase required by the task.',
          'Premature verdict': 'This is not a verdict call. Return verdict:null.',
          'Speech exceeds phase sentence limit':
            'Shorten speech to the sentence limit specified by this phase.',
        };
        retryFeedback =
          feedback[error.message] ?? 'Return complete valid JSON and obey the original rules.';
      }
      const status =
        typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0;
      failureKind =
        status === 429
          ? 'rate_limited'
          : status === 503
            ? 'provider_unavailable'
            : status === 504 ||
                (error instanceof Error && /timed out|deadline|abort/i.test(error.message))
              ? 'timeout'
              : 'invalid_response';
      if (error instanceof ProviderSafetyError)
        return {
          output: safetyOutput(input, 'The content could not be safely reviewed.'),
          source: 'safety',
          attempts: attempt,
          reason: 'safety',
        };
    }
  }
  return {
    output: fallbackFor(input.phase, input.target, input.turnKind),
    source: 'fallback',
    attempts: C.attempts,
    reason: 'provider_failure',
    failureKind,
  };
}
export async function judgeTurn(input: JudgeInput): Promise<JudgeOutput> {
  try {
    return (await runJudge(input)).output;
  } catch {
    return fallbackFor('opening');
  }
}
