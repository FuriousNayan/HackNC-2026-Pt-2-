import { configureMedia } from '../src/media/runtime';
import { speak } from '../src/media/voice';
import { localStorage } from './local-storage';
configureMedia({ storage: localStorage() });
try {
  const result = await speak('Order in the court. The court is now in session.', 0.5);
  console.log('Voice generated:', result.audioUrl);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Voice failed');
  process.exitCode = 1;
}
