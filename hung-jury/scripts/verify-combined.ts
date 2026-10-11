import { FIXTURES } from '../src/judge/fixtures';
import { runJudge } from '../src/judge/engine';
import { judgeTurnWithMedia } from '../src/integration/turn';
import { configureMedia } from '../src/media/runtime';
import { speak } from '../src/media/voice';
import { localStorage } from './local-storage';
configureMedia({ storage: localStorage() });
const input = structuredClone(FIXTURES['oat-milk']);
input.phase = 'verdict';
const original = process.env.DEMO_MODE;
let source = '';
const started = Date.now();
try {
  process.env.DEMO_MODE = 'false';
  const result = await judgeTurnWithMedia(
    input,
    { isNewArguerMessage: false },
    {
      judge: async (value) => {
        const generated = await runJudge(value, { demo: false });
        source = generated.source;
        if (source !== 'gemini') throw new Error('Live judge was unavailable');
        return generated.output;
      },
    },
  );
  if (result.kind !== 'judge' || !result.output.verdict) throw new Error('No live verdict');
  const eventMs = Date.now() - started;
  await speak(result.event.speech, result.toneDial, 'verdict');
  console.log(
    JSON.stringify({
      judgeSource: source,
      liveVoice: 'passed',
      ruling: result.output.verdict.ruling,
      eventMs,
      audioReadyWithinRoomBudget: result.event.audioUrl !== null,
    }),
  );
} catch {
  console.error('Combined provider check failed; no fallback is counted as a live pass.');
  process.exitCode = 1;
} finally {
  if (original === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = original;
}
