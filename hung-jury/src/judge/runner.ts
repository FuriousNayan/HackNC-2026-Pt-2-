import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { JUDGE_CONFIG as C, type JudgeInput } from '@/contracts';
import { judgeInputSchema } from './schema';
import { runJudge } from './engine';
loadEnvConfig(process.cwd());
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      phase: { type: 'string' },
      dial: { type: 'string' },
      target: { type: 'string' },
      demo: { type: 'boolean' },
      live: { type: 'boolean' },
      reaction: { type: 'boolean' },
    },
  });
  if (!positionals[0] || (values.demo && values.live))
    throw new Error(
      'Usage: npm run judge -- <fixture.json> [--phase cross --dial 0.5 --target defendant] [--demo | --live] [--reaction]',
    );
  if (values.phase === 'question')
    throw new Error('Use --phase cross. question is an output phase.');
  const data = JSON.parse(await readFile(positionals[0], 'utf8'));
  const input = judgeInputSchema.parse({
    ...data,
    ...(values.phase ? { phase: values.phase } : {}),
    ...(values.dial ? { toneDial: Number(values.dial) } : {}),
    ...(values.target ? { target: values.target } : {}),
    ...(values.reaction ? { turnKind: 'reaction' } : {}),
  }) as JudgeInput;
  if (values.live && (!process.env[C.env.apiKey]?.trim() || !process.env[C.env.model]?.trim()))
    throw new Error('Live mode requires GEMINI_API_KEY and GEMINI_MODEL in .env.local.');
  const result = await runJudge(input, {
    demo: values.live ? false : values.demo ? true : undefined,
  });
  process.stdout.write(JSON.stringify(result.output, null, 2) + '\n');
  process.stderr.write(
    `Source: ${result.source}; attempts: ${result.attempts}${result.reason ? '; ' + result.reason : ''}${result.failureKind ? '; ' + result.failureKind : ''}\n`,
  );
  if (values.live && result.source === 'fallback') process.exitCode = 1;
}
main().catch(() => {
  console.error(
    'Judge runner failed. Check the fixture, phase, target, and server configuration; use README.md for examples.',
  );
  process.exitCode = 1;
});
