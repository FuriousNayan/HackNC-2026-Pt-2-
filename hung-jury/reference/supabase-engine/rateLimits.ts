// Rate limit checks backed by simple DB counts, tuned from CONFIG.limits.
// Good enough for a hackathon's traffic; swap for a token bucket if this
// ever needs to survive real load.

import { CONFIG } from '@/contracts/config';
import { getServiceClient } from './db/client';

export async function checkFilingRateLimit(filerId: string): Promise<boolean> {
  const db = getServiceClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await db
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('filer_id', filerId)
    .gte('created_at', since);
  if (error) throw new Error(`rate limit check failed: ${error.message}`);
  return (count ?? 0) < CONFIG.limits.filingsPerHour;
}

export async function checkReactionCooldown(caseId: string, userId: string): Promise<boolean> {
  const db = getServiceClient();
  const since = new Date(Date.now() - CONFIG.limits.reactionCooldownMs).toISOString();
  const { count, error } = await db
    .from('reactions')
    .select('id', { count: 'exact', head: true })
    .eq('case_id', caseId)
    .eq('user_id', userId)
    .gte('created_at', since);
  if (error) throw new Error(`rate limit check failed: ${error.message}`);
  return (count ?? 0) === 0;
}
