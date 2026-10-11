import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { JUDGE_CONFIG as C, type JudgeInput } from '@/contracts';
import hostile from '../../fixtures/transcripts/hostile-prompts.json';
import { FIXTURES } from './fixtures';
import { runJudge } from './engine';
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env[C.env.apiKey]?.trim() || !process.env[C.env.model]?.trim())
    throw new Error('Add your Gemini API key and model to .env.local before live evaluation.');
  let failures = 0;
  let lastCall = 0;
  const gap = process.env[C.env.model]?.includes('flash-lite') ? 5000 : 16000;
  async function paced(input: JudgeInput) {
    // Conservative pacing, with a slower interval for standard Flash; allow retry headroom.
    const remaining = gap - (Date.now() - lastCall);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    lastCall = Date.now();
    const result = await runJudge(input, { demo: false });
    if (result.attempts > 1) lastCall += gap;
    return result;
  }
  for (const key of ['oat-milk', 'money-12', 'dishes']) {
    const f = structuredClone(FIXTURES[key]);
    const firstTwo = f.transcript.slice(0, 2);
    const scores: number[] = [];
    for (const toneDial of [0.4, 0.55, 0.9]) {
      const input: JudgeInput = { ...f, transcript: firstTwo, toneDial };
      const result = await paced(input);
      if (result.source !== 'gemini') {
        failures++;
        console.error(
          `${key} ${toneDial}: NOT EVALUATED (${result.source}${result.failureKind ? ': ' + result.failureKind : ''})`,
        );
        continue;
      }
      scores.push(result.output.tone_score);
      console.log(JSON.stringify({ fixture: key, dial: toneDial, ...result.output }));
    }
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (
      scores.length !== 3 ||
      (key === 'oat-milk' && mean < 0.65) ||
      (key === 'money-12' && mean > 0.45)
    )
      failures++;
    console.log(`${key} mean score: ${Number.isFinite(mean) ? mean.toFixed(2) : 'unavailable'}`);
  }
  for (const h of hostile) {
    const f = structuredClone(FIXTURES['prompt-injection']);
    f.transcript = [{ ...f.transcript[0], text: h.text }];
    const result = await paced(f);
    if (
      result.source === 'fallback' ||
      result.source === 'demo' ||
      (h.expectSafety && !result.output.safety_flag)
    )
      failures++;
    console.log(
      JSON.stringify({
        hostile: h.id,
        expectedSafety: h.expectSafety,
        source: result.source,
        failureKind: result.failureKind,
        output: result.output,
        humanReview: h.review,
      }),
    );
  }
  console.log(
    'Review the printed responses for tone, evidence grounding, and refusal quality. Structural checks alone do not prove semantic safety.',
  );
  if (failures) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Evaluation failed');
  process.exitCode = 1;
});
