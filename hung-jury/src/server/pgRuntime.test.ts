import { afterEach, describe, expect, it } from 'vitest';
import { closeInterrupted, createServer, type Server } from './runtime';
import { lazyPgliteStore } from './testPg';

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.engine.dispose();
});

describe('Postgres runtime', () => {
  it('seeds demo data, keeps case numbering above it, and serves memory from the database', async () => {
    const server = createServer({ HJ_SEED_DEMO: 'true' }, { store: lazyPgliteStore(), services: { log: () => {} } });
    servers.push(server);
    await server.ready;
    const dave = { handle: 'dave' };
    expect((await server.engine.leaderboard(dave, 'the-kitchen')).find((r) => r.handle === 'maya')?.guilty).toBe(1);
    const filed = await server.engine.fileCase(dave, { title: 'A case', grievance: 'Something small.', defendantHandle: 'maya' });
    expect(filed.number).toBe('HJ-0024');
  });

  it('closes cases that were live when the process restarted, and keeps finished verdicts shareable', async () => {
    const store = lazyPgliteStore();
    const base = {
      number: 'HJ-0001', groupId: 'g', title: 't', grievance: 'g', sentenceRequest: null, plaintiff: 'a_a', defendant: 'b_b',
      phase: 'statements' as const, activeRole: 'plaintiff' as const, timerEndsAt: null, toneDial: 0.5, listed: true,
      safetyClosed: false, declined: false, epoch: 1, stepId: 1, steps: [], stepIndex: 0, juryLocked: false,
      createdAt: 'x', startedAt: 'x', closedAt: null,
    };
    await store.createCase({ ...base, id: 'live1', status: 'live' });
    await store.createCase({ ...base, id: 'done1', status: 'verdict', phase: 'verdict', activeRole: null });
    await store.createCase({ ...base, id: 'filed1', status: 'filed' });
    expect(await closeInterrupted(store)).toBe(2);
    const live = await store.getCase('live1');
    expect([live?.status, live?.listed]).toEqual(['closed', false]);
    const done = await store.getCase('done1');
    expect([done?.status, done?.listed]).toEqual(['closed', true]);
    expect((await store.getCase('filed1'))?.status).toBe('filed');
  });

  it('HJ_STORE=postgres without DATABASE_URL fails loudly', () => {
    expect(() => createServer({ HJ_STORE: 'postgres' })).toThrow(/DATABASE_URL/);
  });
});
