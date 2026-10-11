import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pgliteStore } from './testPg';
import { InMemoryStore, type CaseRecord, type CaseStore } from './store';

const baseCase = (id: string, over: Partial<CaseRecord> = {}): CaseRecord => ({
  id,
  number: 'HJ-0001',
  groupId: 'g1',
  title: 'T',
  grievance: 'G',
  sentenceRequest: null,
  plaintiff: 'dave',
  defendant: 'maya',
  status: 'filed',
  phase: 'waiting',
  activeRole: null,
  timerEndsAt: null,
  toneDial: 0.5,
  listed: false,
  safetyClosed: false,
  declined: false,
  epoch: 0,
  stepId: 0,
  steps: [],
  stepIndex: 0,
  juryLocked: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  startedAt: null,
  closedAt: null,
  ...over,
});

const factories: Array<[string, () => Promise<CaseStore>]> = [
  ['InMemoryStore', async () => new InMemoryStore()],
  ['PostgresStore (PGlite)', pgliteStore],
];

describe.each(factories)('CaseStore contract: %s', (_name, make) => {
  it('sequences, profiles, groups', async () => {
    const s = await make();
    const a = await s.nextCaseSeq();
    expect(await s.nextCaseSeq()).toBe(a + 1);
    await s.upsertProfile({ handle: 'dave', token: 't', avatar: null, createdAt: 'x' });
    await s.upsertProfile({ handle: 'dave', token: 't2', avatar: { kind: 'avatar', headImageUrl: '/a.svg' }, createdAt: 'x' });
    expect((await s.getProfile('dave'))?.token).toBe('t2');
    expect(await s.getProfile('nobody')).toBeUndefined();
    await s.upsertGroup({ id: 'g1', name: 'Kitchen', members: ['dave', 'maya'] });
    expect((await s.findGroupForPair('maya', 'dave'))?.id).toBe('g1');
    expect(await s.findGroupForPair('dave', 'zed')).toBeUndefined();
    expect((await s.getGroup('g1'))?.members).toEqual(['dave', 'maya']);
  });

  it('cases: create, merge update, list, duplicate rejected', async () => {
    const s = await make();
    await s.createCase(baseCase('c1'));
    await expect(s.createCase(baseCase('c1'))).rejects.toBeTruthy();
    const updated = await s.updateCase('c1', { status: 'live', listed: true, epoch: 3, steps: [{ kind: 'opening', phase: 'opening' }] });
    expect(updated.status).toBe('live');
    expect(updated.title).toBe('T');
    expect((await s.getCase('c1'))?.epoch).toBe(3);
    await expect(s.updateCase('missing', { epoch: 1 })).rejects.toBeTruthy();
    await s.createCase(baseCase('c2', { createdAt: '2026-01-02T00:00:00.000Z' }));
    expect((await s.listCases()).map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(await s.getCase('nope')).toBeUndefined();
  });

  it('participants, messages, judge turns, votes, reactions, reports, verdict', async () => {
    const s = await make();
    await s.createCase(baseCase('c1'));
    const p = { caseId: 'c1', handle: 'ann', role: 'juror' as const, headImageUrl: '/a', joinedAt: 'x' };
    await s.addParticipant(p);
    await s.addParticipant({ ...p, headImageUrl: '/other' });
    expect(await s.getParticipants('c1')).toHaveLength(1);

    for (const text of ['one', 'two', 'three'])
      await s.addMessage({ id: text, caseId: 'c1', authorHandle: 'dave', role: 'plaintiff', kind: 'statement', text, createdAt: 'x', hidden: false, system: false, clientId: null });
    expect((await s.getMessages('c1')).map((m) => m.text)).toEqual(['one', 'two', 'three']);

    const turn = { id: 't1', caseId: 'c1', phase: 'verdict', toneScore: 0.5, dialAfter: 0.5, speech: "It's \"quoted\" speech", target: null, face: 'neutral' as const, sfx: 'none' as const, hasVerdict: true, raw: { a: 1 }, createdAt: 'x' };
    await s.addJudgeTurn(turn);
    expect((await s.getJudgeTurns('c1'))[0].raw).toEqual({ a: 1 });
    expect(await s.findJudgeTurnsBySpeech(turn.speech)).toHaveLength(1);
    expect(await s.findJudgeTurnsBySpeech('other')).toHaveLength(0);

    await s.setVote('c1', 'ann', 'guilty');
    await s.setVote('c1', 'ann', 'not_guilty');
    await s.setVote('c1', 'bo', 'guilty');
    expect(await s.getVotes('c1')).toEqual({ ann: 'not_guilty', bo: 'guilty' });

    await s.addReaction({ id: 'r1', caseId: 'c1', handle: 'ann', kind: 'laugh', createdAt: 'x' });
    await s.addReport({ id: 'p1', caseId: 'c1', reporter: 'ann', reason: 'rude', createdAt: '2026-01-01' });
    expect((await s.getReports('c1'))[0].reporter).toBe('ann');

    const v = { caseId: 'c1', ruling: 'guilty' as const, findings: ['a', 'b'], sentence: null, headline: 'H', citedPrecedent: null, juryGuiltyPct: 50, kind: 'judge' as const, createdAt: 'x' };
    await s.saveVerdict(v);
    await expect(s.saveVerdict(v)).rejects.toBeTruthy();
    expect((await s.getVerdict('c1'))?.findings).toEqual(['a', 'b']);
    expect(await s.getVerdict('none')).toBeUndefined();
  });

  it('concurrent updates do not lose fields', async () => {
    const s = await make();
    await s.createCase(baseCase('c1'));
    await Promise.all([s.updateCase('c1', { epoch: 5 }), s.updateCase('c1', { stepId: 7 }), s.updateCase('c1', { listed: true })]);
    const c = await s.getCase('c1');
    expect([c?.epoch, c?.stepId, c?.listed]).toEqual([5, 7, true]);
  });
});

describe('PostgresStore extras', () => {
  it('RLS blocks anon style access by default (no policies)', async () => {
    const readme = readFileSync('supabase/migrations/0005_engine_store.sql', 'utf8');
    expect((readme.match(/enable row level security/g) ?? []).length).toBe(10);
    expect(readme).not.toMatch(/create policy/);
  });
});
