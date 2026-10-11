import type { CaseRecord, CaseStore, VerdictRecord } from './store';

/**
 * Demo data so the leaderboard, history and judge memory have something in them on first boot.
 * Profiles are left unclaimed (token null), so the demo handles can still be signed in by anyone.
 */
const PAST: Array<{
  n: number;
  title: string;
  plaintiff: string;
  defendant: string;
  ruling: VerdictRecord['ruling'];
  findings: string[];
}> = [
  {
    n: 22,
    title: 'Dave v. The Missing Pizza',
    plaintiff: 'dave',
    defendant: 'maya',
    ruling: 'guilty',
    findings: ['The last slice was labelled and was eaten anyway.', 'The defendant admitted being hungry.'],
  },
  {
    n: 23,
    title: 'The Dishwasher Detente',
    plaintiff: 'maya',
    defendant: 'dave',
    ruling: 'not_guilty',
    findings: ['The dishes were loaded on a clear schedule.', 'No agreement about rinsing was proven.'],
  },
];

export async function seedDemo(store: CaseStore): Promise<void> {
  if (await store.getGroup('the-kitchen')) return;
  const now = new Date().toISOString();
  for (const handle of ['dave', 'maya'])
    await store.upsertProfile({ handle, token: null, avatar: null, createdAt: now });
  await store.upsertGroup({ id: 'the-kitchen', name: 'The Kitchen', members: ['dave', 'maya'] });
  for (const p of PAST) {
    const id = `seed-${p.n}`;
    const record: CaseRecord = {
      id,
      number: `HJ-${String(p.n).padStart(4, '0')}`,
      groupId: 'the-kitchen',
      title: p.title,
      grievance: p.title,
      sentenceRequest: null,
      plaintiff: p.plaintiff,
      defendant: p.defendant,
      status: 'closed',
      phase: 'verdict',
      activeRole: null,
      timerEndsAt: null,
      toneDial: 0.6,
      listed: true,
      safetyClosed: false,
      declined: false,
      epoch: 1,
      stepId: 1,
      steps: [],
      stepIndex: 0,
      juryLocked: true,
      createdAt: now,
      startedAt: now,
      closedAt: now,
    };
    await store.createCase(record);
    await store.saveVerdict({
      caseId: id,
      ruling: p.ruling,
      findings: p.findings,
      sentence: null,
      headline: `${p.title}: ${p.ruling === 'guilty' ? 'Guilty' : 'Not guilty'}`,
      citedPrecedent: null,
      juryGuiltyPct: 50,
      kind: 'judge',
      createdAt: now,
    });
  }
}

export const SEED_NEXT_CASE = 24;
