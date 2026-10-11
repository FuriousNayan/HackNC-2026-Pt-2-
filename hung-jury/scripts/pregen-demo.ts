import { writeFile } from 'node:fs/promises';
import { configureMedia } from '../src/media/runtime';
import { speak } from '../src/media/voice';
import { localStorage } from './local-storage';
import { demoManifest } from './demo-manifest';
const lines = demoManifest();
await writeFile(
  new URL('../fixtures/media/demo-lines.json', import.meta.url),
  JSON.stringify(lines, null, 2) + '\n',
);
if (process.argv.includes('--manifest-only')) {
  console.log(`Wrote ${lines.length} exact scripted audio entries; no provider calls.`);
} else {
  if (process.env.DEMO_MODE === 'true')
    throw new Error('Set DEMO_MODE=false when generating demo audio');
  if (!process.env.SUPABASE_MEDIA_BUCKET) configureMedia({ storage: localStorage() });
  for (const line of lines) {
    const result = await speak(line.text, line.toneDial, line.kind);
    console.log(`${line.toneDial} ${line.kind}: ${result.audioUrl}`);
  }
}
