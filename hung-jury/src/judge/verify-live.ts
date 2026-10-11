import nextEnv from '@next/env';
import { JUDGE_CONFIG as C, type JudgeInput } from '@/contracts';
import { FIXTURES } from './fixtures';
import { runJudge } from './engine';
import hostile from '../../fixtures/transcripts/hostile-prompts.json';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env[C.env.apiKey]?.trim() || !process.env[C.env.model]?.trim())
    throw new Error('Live credentials are required.');
  let failures = 0;
  let lastCall = 0;
  const gap = process.env[C.env.model]?.includes('flash-lite') ? 5000 : 16000;
  async function paced(input: JudgeInput) {
    const remaining = gap - (Date.now() - lastCall);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    lastCall = Date.now();
    const started = Date.now();
    const r = await runJudge(input, { demo: false });
    if (r.attempts > 1) lastCall += gap;
    return { ...r, elapsedMs: Date.now() - started };
  }
  for (const phase of C.phases) {
    const input: JudgeInput = {
      ...structuredClone(FIXTURES['oat-milk']),
      phase,
      target: phase === 'cross' ? 'defendant' : undefined,
    };
    if (phase === 'opening') input.transcript = [];
    if (phase === 'cross' || phase === 'statements')
      input.transcript = input.transcript.slice(0, 2);
    const r = await paced(input);
    if (r.source !== 'gemini') failures++;
    console.log(
      JSON.stringify({
        phase,
        source: r.source,
        attempts: r.attempts,
        elapsedMs: r.elapsedMs,
        failureKind: r.failureKind,
        output: r.output,
      }),
    );
  }
  const input: JudgeInput = {
    ...structuredClone(FIXTURES['oat-milk']),
    phase: 'cross',
    turnKind: 'reaction',
    target: 'defendant',
    transcript: FIXTURES['oat-milk'].transcript.slice(0, 4),
  };
  const r = await paced(input);
  if (r.source !== 'gemini' || r.output.phase !== 'reaction') failures++;
  console.log(JSON.stringify({ phase: 'cross-answer', source: r.source, output: r.output }));
  for (const id of ['family', 'fake-precedent']) {
    const h = hostile.find((h) => h.id === id)!;
    const input = structuredClone(FIXTURES['prompt-injection']);
    input.transcript = [{ ...input.transcript[0], text: h.text }];
    const result = await paced(input);
    if (result.source === 'fallback') failures++;
    console.log(JSON.stringify({ regression: id, ...result }));
  }
  if (failures) process.exitCode = 1;
}
main().catch(() => {
  console.error('Live phase verification failed; check credentials and provider availability.');
  process.exitCode = 1;
});
