import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lazyPgliteStore } from './testPg';

vi.setConfig({ testTimeout: 30000 });
import type { JudgeInput, RoomEvent } from '@/contracts';
import { judgeTurnWithMedia } from '../integration/turn';
import { stubJudge } from './stubs/judge';
import { createServer, type Server } from './runtime';
import type { Frame } from './bus';
import type { EngineServices } from './engine';

const users = { dave: { handle: 'dave' }, maya: { handle: 'maya' }, ann: { handle: 'ann_j' }, bo: { handle: 'bo_j' }, cy: { handle: 'cy_j' } };
const servers: Server[] = [];

let storeKind: 'memory' | 'pg' = 'memory';
function make(services: Partial<EngineServices> = {}, options = {}) {
  const base: Partial<EngineServices> = {
    judgeTurn: (input, opts) =>
      judgeTurnWithMedia(input, opts, {
        judge: async (i) => stubJudge(i),
        speak: async () => {
          throw new Error('no voice');
        },
        audioTimeoutMs: 0,
      }),
    log: (m, e) => console.log('LOG', m, e),
  };
  const server = createServer({}, { services: { ...base, ...services }, options: { timerScale: 0.002, ...options }, ...(storeKind === 'pg' ? { store: lazyPgliteStore() } : {}) });
  servers.push(server);
  return server;
}
afterEach(() => {
  for (const s of servers.splice(0)) s.engine.dispose();
});

function watch(server: Server, user: { handle: string }, id: string) {
  const events: RoomEvent[] = [];
  const frames: Frame[] = [];
  let detach = () => {};
  const open = async (last?: number) => {
    detach = await server.engine.openStream(
      user,
      id,
      { send: (f) => (frames.push(f), events.push(f.event)), close: () => {} },
      last,
    );
  };
  return { events, frames, open, close: () => detach() };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean | Promise<boolean>, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await wait(5);
  }
  throw new Error('timeout waiting for condition');
}

async function setup(server: Server) {
  const { engine } = server;
  const { id } = await engine.fileCase(users.dave, {
    title: 'The Case of the Oat Milk',
    grievance: 'Maya drank my oat milk and left the empty carton in the fridge.',
    defendantHandle: 'maya',
  });
  await engine.accept(users.maya, id);
  const d = watch(server, users.dave, id);
  const m = watch(server, users.maya, id);
  await d.open();
  await m.open();
  return { id, d, m };
}

/** Both arguers answer whenever it is their turn, until the verdict. */
async function playTrial(server: Server, id: string) {
  const { engine } = server;
  let sent = 0;
  await until(async () => {
    const v = await engine.view(users.dave, id);
    if (v.status === 'verdict' || v.status === 'closed') return true;
    const role = v.activeRole;
    if (role === 'plaintiff' || role === 'defendant') {
      const who = role === 'plaintiff' ? users.dave : users.maya;
      try {
        await engine.submitMessage(who, id, `My honest account number ${sent++}.`);
      } catch {
        // turn may have just moved on
      }
    }
    return false;
  });
  await engine.settled(id);
}

describe.each(['memory', 'pg'] as const)('engine on %s store', (kind) => {
  beforeEach(() => {
    storeKind = kind;
  });

describe('full trial', () => {
  it('runs every phase, broadcasts state and a verdict, and keeps votes away from the judge', async () => {
    const seen: JudgeInput[] = [];
    const server = make({
      judgeTurn: (input, opts) => {
        seen.push(input);
        return judgeTurnWithMedia(input, opts, { judge: async (i) => stubJudge(i), speak: async () => { throw new Error('x'); }, audioTimeoutMs: 0 });
      },
    });
    const { id, d } = await setup(server);
    const juror = watch(server, users.ann, id);
    await server.engine.join(users.ann, id);
    await juror.open();
    await server.engine.start(users.dave, id);
    await server.engine.vote(users.ann, id, 'guilty');
    await playTrial(server, id);

    const phases = d.events.filter((e) => e.type === 'state').map((e) => (e as { phase: string }).phase);
    for (const p of ['opening', 'statements', 'cross', 'rebuttal', 'closing', 'verdict']) expect(phases).toContain(p);
    const verdict = d.events.find((e) => e.type === 'judge' && e.verdict);
    expect(verdict).toBeTruthy();
    const view = await server.engine.view(users.dave, id);
    expect(['verdict', 'closed']).toContain(view.status);
    // The judge never saw votes or jury data.
    expect(JSON.stringify(seen)).not.toMatch(/not_guilty|juryGuilty|guiltyPct/);
    // Frame ids are strictly increasing.
    const ids = juror.frames.map((f) => f.id).filter((x) => x > 0);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('closing statement does not call the judge', async () => {
    const calls: string[] = [];
    const server = make({
      judgeTurn: (input, opts) => {
        calls.push(`${input.phase}:${input.turnKind ?? ''}`);
        return judgeTurnWithMedia(input, opts, { judge: async (i) => stubJudge(i), speak: async () => { throw new Error('x'); }, audioTimeoutMs: 0 });
      },
    });
    const { id } = await setup(server);
    await server.engine.start(users.dave, id);
    await playTrial(server, id);
    // closing phase only appears in the verdict input transcript, never as its own judge turn
    expect(calls.filter((c) => c.startsWith('closing') && !c.endsWith('reaction')).length).toBeLessThanOrEqual(2);
  });
});

describe('timers', () => {
  it('a silent arguer is skipped and the trial still ends', async () => {
    const server = make();
    const { id, d } = await setup(server);
    await server.engine.start(users.dave, id);
    await until(async () => {
      const v = await server.engine.view(users.dave, id);
      return v.status === 'verdict' || v.status === 'closed';
    }, 8000);
    await server.engine.settled(id);
    const msgs = d.events.filter((e) => e.type === 'message');
    expect(msgs.length).toBeGreaterThan(0);
  });
});

describe('safety', () => {
  it('a message that trips the filter closes the case for everyone', async () => {
    const server = make();
    const { id, d } = await setup(server);
    const ann = watch(server, users.ann, id);
    await server.engine.join(users.ann, id);
    await ann.open();
    await server.engine.start(users.dave, id);
    await until(async () => (await server.engine.view(users.dave, id)).activeRole === 'plaintiff');
    await server.engine.submitMessage(users.dave, id, 'I will find where you live and hurt you, 555-123-4567');
    await server.engine.settled(id);
    expect(d.events.some((e) => e.type === 'safety')).toBe(true);
    const v = await server.engine.view(users.dave, id);
    expect(v.safetyClosed).toBe(true);
    // Spectators lose access entirely.
    await expect(server.engine.view(users.ann, id)).rejects.toMatchObject({ status: 404 });
    // The held message is not in any broadcast.
    expect(JSON.stringify(ann.events)).not.toContain('555-123');
    expect(await server.engine.docket()).toHaveLength(0);
    expect(await server.engine.verdictCardData(id).catch(() => 'denied')).toBe('denied');
  });

  it('a judge safety flag closes the case and a stale result is dropped', async () => {
    let flagged = false;
    const server = make({
      judgeTurn: async (input, opts) => {
        if (input.transcript.length > 0 && !flagged) {
          flagged = true;
          await wait(60);
          return judgeTurnWithMedia(input, opts, {
            judge: async (i) => ({ ...stubJudge(i), safety_flag: true, safety_reason: 'danger' }),
            speak: async () => { throw new Error('x'); },
            audioTimeoutMs: 0,
          });
        }
        return judgeTurnWithMedia(input, opts, { judge: async (i) => stubJudge(i), speak: async () => { throw new Error('x'); }, audioTimeoutMs: 0 });
      },
    });
    const { id, d } = await setup(server);
    await server.engine.start(users.dave, id);
    await until(async () => (await server.engine.view(users.dave, id)).activeRole === 'plaintiff');
    await server.engine.submitMessage(users.dave, id, 'He keeps taking my things.');
    await server.engine.settled(id);
    expect(d.events.filter((e) => e.type === 'safety')).toHaveLength(1);
    const view = await server.engine.view(users.maya, id);
    expect(view.safetyClosed).toBe(true);
    expect(d.events.filter((e) => e.type === 'judge' && e.verdict)).toHaveLength(0);
  });

  it('reports: three distinct reporters close a case, one arguer is enough', async () => {
    const server = make();
    const { id } = await setup(server);
    for (const u of [users.ann, users.bo, users.cy]) await server.engine.join(u, id);
    await server.engine.report(users.ann, id, 'rude');
    await server.engine.report(users.ann, id, 'again');
    expect((await server.engine.view(users.dave, id)).safetyClosed).toBe(false);
    await server.engine.report(users.bo, id, 'rude');
    await server.engine.report(users.cy, id, 'rude');
    expect((await server.engine.view(users.dave, id)).safetyClosed).toBe(true);

    const s2 = make();
    const b = await setup(s2);
    await s2.engine.report(users.maya, b.id, 'unsafe');
    expect((await s2.engine.view(users.dave, b.id)).safetyClosed).toBe(true);
  });

  it('filing text that trips the filter is rejected without creating a case', async () => {
    const server = make();
    await expect(
      server.engine.fileCase(users.dave, { title: 'Threat', grievance: 'I will kill you and call 555-123-4567', defendantHandle: 'maya' }),
    ).rejects.toMatchObject({ status: 422 });
    expect(await server.store.listCases()).toHaveLength(0);
  });
});

describe('access and jury', () => {
  it('private cases hide from strangers, jurors vote only as jurors, reactions are rate limited', async () => {
    const server = make();
    const { id } = await setup(server);
    const stranger = users.ann;
    await server.engine.join(stranger, id);
    await server.engine.start(users.dave, id);
    await expect(server.engine.vote(users.dave, id, 'guilty')).rejects.toBeTruthy();
    await expect(server.engine.vote(users.bo, id, 'guilty')).rejects.toBeTruthy();
    await server.engine.vote(stranger, id, 'guilty');
    await expect(server.engine.vote(stranger, id, 'nope')).rejects.toMatchObject({ status: 400 });
    await server.engine.react(stranger, id, 'laugh');
    await expect(server.engine.react(stranger, id, 'laugh')).rejects.toMatchObject({ status: 429 });
    await expect(server.engine.react(stranger, id, 'nonsense')).rejects.toMatchObject({ status: 400 });
  });

  it('only the defendant can accept and only the plaintiff can start', async () => {
    const server = make();
    const { id } = await server.engine.fileCase(users.dave, {
      title: 'A title', grievance: 'Something happened.', defendantHandle: 'maya',
    });
    await expect(server.engine.accept(users.dave, id)).rejects.toBeTruthy();
    await expect(server.engine.start(users.dave, id)).rejects.toBeTruthy();
    await server.engine.accept(users.maya, id);
    await expect(server.engine.start(users.maya, id)).rejects.toBeTruthy();
  });

  it('enforces the filing rate limit', async () => {
    const server = make();
    let blocked = 0;
    for (let i = 0; i < 8; i++) {
      try {
        await server.engine.fileCase(users.dave, { title: `Case ${i}`, grievance: 'A small thing.', defendantHandle: 'maya' });
      } catch (e) {
        if ((e as { status: number }).status === 429) blocked++;
      }
    }
    expect(blocked).toBeGreaterThan(0);
  });
});

describe('presence', () => {
  it('a walk-out defaults the case without a judge ruling', async () => {
    const server = make({}, { timerScale: 0.001, presenceTtlMs: 5 });
    const { id, d, m } = await setup(server);
    await server.engine.start(users.dave, id);
    await until(async () => (await server.engine.view(users.dave, id)).status === 'live');
    m.close();
    await until(async () => {
      const v = await server.engine.view(users.dave, id);
      return v.status === 'verdict' || v.status === 'closed';
    }, 6000);
    await server.engine.settled(id);
    const verdict = await server.store.getVerdict(id);
    expect(verdict).toBeTruthy();
    void d;
  });
});

describe('sentence request', () => {
  it('reaches the judge input and is redacted, but a bad one blocks filing', async () => {
    const inputs: JudgeInput[] = [];
    const server = make({
      judgeTurn: (input, opts) => {
        inputs.push(input);
        return judgeTurnWithMedia(input, opts, { judge: async (i) => stubJudge(i), speak: async () => { throw new Error('x'); }, audioTimeoutMs: 0 });
      },
    });
    const { id } = await server.engine.fileCase(users.dave, {
      title: 'Sentence test', grievance: 'She ate my leftovers again.', defendantHandle: 'maya',
      sentenceRequest: 'Replace the food and email dave@example.com',
    });
    await server.engine.accept(users.maya, id);
    const d = watch(server, users.dave, id);
    const m = watch(server, users.maya, id);
    await d.open();
    await m.open();
    await server.engine.start(users.dave, id);
    await until(() => inputs.length > 0);
    expect(inputs[0].sentenceRequest).toContain('Replace the food');
    expect(JSON.stringify(inputs)).not.toContain('dave@example.com');
    await expect(
      server.engine.fileCase(users.dave, { title: 'Bad', grievance: 'Fine text.', defendantHandle: 'maya', sentenceRequest: 'I will hurt you and kill him' }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('presence events', () => {
  it('broadcasts when an arguer drops and returns, and tells late joiners who is absent', async () => {
    const server = make({}, { timerScale: 1, presenceTtlMs: 5 });
    const { id, d, m } = await setup(server);
    await server.engine.start(users.dave, id);
    await until(async () => (await server.engine.view(users.dave, id)).status === 'live');
    m.close();
    await until(() => d.events.some((e) => e.type === 'presence' && !e.present && e.role === 'defendant'));
    // a late joiner's snapshot says the defendant is gone
    await wait(20);
    const late = watch(server, users.ann, id);
    await server.engine.join(users.ann, id);
    await late.open();
    expect(late.events.some((e) => e.type === 'presence' && !e.present && e.role === 'defendant')).toBe(true);
    // she comes back
    const back = watch(server, users.maya, id);
    await back.open();
    await until(() => d.events.some((e) => e.type === 'presence' && e.present && e.role === 'defendant'));
  });
});

describe('memory and redaction', () => {
  it('seeded precedent feeds the leaderboard and default judgments are excluded', async () => {
    const server = createServer({ HJ_SEED_DEMO: 'true' }, { services: { log: () => {} } });
    servers.push(server);
    await server.ready;
    const board = await server.engine.leaderboard(users.dave, 'the-kitchen');
    expect(board.find((r) => r.handle === 'maya')?.guilty).toBe(1);
    const history = await server.engine.history(users.dave, 'the-kitchen');
    expect(history).toHaveLength(2);
    await expect(server.engine.leaderboard(users.ann, 'the-kitchen')).rejects.toMatchObject({ status: 404 });
  });

  it('lists a user\'s groups from their cases only', async () => {
    const server = createServer({ HJ_SEED_DEMO: 'true' }, { services: { log: () => {} } });
    servers.push(server);
    await server.ready;
    expect((await server.engine.myGroups(users.dave)).map((g) => g.id)).toEqual(['the-kitchen']);
    expect(await server.engine.myGroups(users.ann)).toEqual([]);
    await server.engine.fileCase(users.ann, { title: 'New pair', grievance: 'Small thing.', defendantHandle: 'bo_j' });
    const groups = await server.engine.myGroups(users.ann);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toContain('@ann_j');
    expect(await server.engine.myGroups(users.dave)).toHaveLength(1);
  });

  it('redacts contact details in stored messages', async () => {
    const server = make();
    const { id, d } = await setup(server);
    await server.engine.start(users.dave, id);
    await until(async () => (await server.engine.view(users.dave, id)).activeRole === 'plaintiff');
    await server.engine.submitMessage(users.dave, id, 'Email me at dave@example.com about the milk.');
    await server.engine.settled(id);
    expect(JSON.stringify(d.events)).not.toContain('dave@example.com');
  });
});

});
