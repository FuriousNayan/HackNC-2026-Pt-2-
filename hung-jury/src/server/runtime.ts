import { endVideoRoom, videoConfig } from './video';
import { CaseEngine, type EngineOptions } from './engine';
import { RoomBus } from './bus';
import { seedDemo, SEED_NEXT_CASE } from './seed';
import { stubServices } from './stubs/judge';
import { PostgresStore } from './pgStore';
import { InMemoryStore, type CaseStore } from './store';

/**
 * The process wide singleton. Kept on globalThis so Next's dev hot reload and separate route bundles share
 * one store, one bus and one set of timers. Everything is in memory: a restart wipes it.
 *
 * Env: USE_STUB_JUDGE=true (offline judge, no voice), HJ_TIMER_SCALE (0.1 = ten times faster),
 * HJ_CROSS_QUESTIONS (per side, default 1), HJ_SEED_DEMO=true (demo group and past cases).
 */
export interface Server {
  engine: CaseEngine;
  store: CaseStore;
  bus: RoomBus;
  ready: Promise<void>;
}

const KEY = Symbol.for('hungjury.server');

export function createServer(
  env: Record<string, string | undefined> = process.env,
  overrides: {
    services?: ConstructorParameters<typeof CaseEngine>[2];
    options?: Partial<EngineOptions>;
    store?: CaseStore;
  } = {},
): Server {
  const seed = env.HJ_SEED_DEMO === 'true';
  const usePostgres = !overrides.store && env.HJ_STORE === 'postgres';
  const store: CaseStore =
    overrides.store ?? (usePostgres ? postgresStore(env) : new InMemoryStore(seed ? SEED_NEXT_CASE : 1));
  const bus = new RoomBus();
  const options: Partial<EngineOptions> = {
    ...(env.HJ_TIMER_SCALE ? { timerScale: Number(env.HJ_TIMER_SCALE) } : {}),
    ...(env.HJ_CROSS_QUESTIONS ? { crossQuestionsPerSide: Number(env.HJ_CROSS_QUESTIONS) } : {}),
    ...overrides.options,
  };
  const video = env.HJ_VIDEO === 'livekit' ? videoConfig(env) : null;
  const services = {
    ...(env.USE_STUB_JUDGE === 'true' ? stubServices() : {}),
    ...(video ? { endVideo: (caseId: string) => endVideoRoom(video, caseId) } : {}),
    ...overrides.services,
  };
  const engine = new CaseEngine(store, bus, services, options);
  const ready = (async () => {
    // A restart loses every timer, so a trial that was live cannot continue. Close it instead of leaving it stuck.
    if (usePostgres || overrides.store) await closeInterrupted(store);
    if (seed) {
      await seedDemo(store);
      if (store instanceof PostgresStore) await store.ensureCaseSeqAtLeast(SEED_NEXT_CASE);
    }
  })();
  return { engine, store, bus, ready };
}

function postgresStore(env: Record<string, string | undefined>): PostgresStore {
  const url = env.DATABASE_URL;
  if (!url) throw new Error('HJ_STORE=postgres needs DATABASE_URL (Supabase: Project Settings, Database, Connection string)');
  // pg is loaded on first query, so the in-memory mode never needs the database driver.
  let pool: Promise<import('pg').Pool> | null = null;
  const getPool = () =>
    (pool ??= import('pg').then(({ default: pg }) => {
      const p = new pg.Pool({
        connectionString: url,
        max: Number(env.HJ_PG_POOL ?? 5),
        ssl: env.HJ_PG_SSL === 'false' || /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
      });
      p.on('error', (error) => console.warn('[hung-jury] database pool error', error));
      return p;
    }));
  return new PostgresStore({ query: async (sql, params) => (await (await getPool()).query(sql, params as never[])) as never });

}

/** Timers live in memory, so after a restart any live or verdict-stage case is closed without a ruling. */
export async function closeInterrupted(store: CaseStore): Promise<number> {
  let n = 0;
  for (const c of await store.listCases()) {
    if (c.status !== 'live' && c.status !== 'verdict') continue;
    await store.updateCase(c.id, {
      status: 'closed',
      ...(c.status === 'live' ? { listed: false } : {}),
      activeRole: null,
      timerEndsAt: null,
      juryLocked: true,
      epoch: c.epoch + 1,
      stepId: c.stepId + 1,
      closedAt: new Date().toISOString(),
    });
    n++;
  }
  return n;
}

export function getServer(): Server {
  const g = globalThis as unknown as Record<symbol, Server | undefined>;
  return (g[KEY] ??= createServer());
}
