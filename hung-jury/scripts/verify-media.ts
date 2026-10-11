import { FIXTURES } from '../src/judge/fixtures';
import { demoFor } from '../src/judge/demo';
import { judgeTurnWithMedia } from '../src/integration/turn';
import { configureMedia } from '../src/media/runtime';
import { localStorage } from './local-storage';
configureMedia({ storage: localStorage() });
const input = structuredClone(FIXTURES['oat-milk']);
input.phase = 'verdict';
const original = process.env.DEMO_MODE;
try {
  process.env.DEMO_MODE = 'false';
  const result = await judgeTurnWithMedia(
    input,
    { isNewArguerMessage: false },
    { judge: async (value) => demoFor(value) },
  );
  if (result.kind !== 'judge') throw new Error('Unexpected safety closure');
  // A live provider may exceed the room wait budget. Wait for its cache using speak.
  const { speak } = await import('../src/media/voice');
  const audio = await speak(result.event.speech, result.toneDial, 'verdict');
  process.env.DEMO_MODE = 'true';
  const replay = await judgeTurnWithMedia(input, { isNewArguerMessage: false });
  if (replay.kind !== 'judge' || replay.event.audioUrl !== audio.audioUrl)
    throw new Error('Cached demo replay mismatch');
  console.log(
    JSON.stringify({
      liveVoice: 'passed',
      cachedDemoReplay: 'passed',
      ruling: replay.output.verdict?.ruling,
      audioReadyWithinRoomBudget: result.event.audioUrl !== null,
    }),
  );
} catch {
  console.error('Live media verification failed. Check private voice credentials/provider access.');
  process.exitCode = 1;
} finally {
  if (original === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = original;
}
