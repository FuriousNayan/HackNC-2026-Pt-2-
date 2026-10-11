import JudgeBench from '@/ui/JudgeBench';
import { JUDGE_CONFIG as C } from '@/contracts';

export const dynamic = 'force-dynamic';

/** Local judge tester at /dev/judge. Backed by the loopback-only /api/dev/judge route. */
export default function DevJudgePage() {
  return (
    <JudgeBench
      liveConfigured={Boolean(process.env[C.env.apiKey]?.trim() && process.env[C.env.model]?.trim())}
      defaultDemo={process.env[C.env.demo] !== 'false'}
      development={process.env.NODE_ENV === 'development'}
    />
  );
}
