import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PostgresStore } from './pgStore';

/** Test helpers: a real Postgres in process with the engine migration applied. */
export async function pgliteStore(): Promise<PostgresStore> {
  const db = new PGlite();
  await db.exec(readFileSync('supabase/migrations/0005_engine_store.sql', 'utf8'));
  return new PostgresStore({ query: (sql, params) => db.query(sql, params) as never });
}

/** A PostgresStore that is usable immediately: queries wait for the in process database to finish starting. */
export function lazyPgliteStore(): PostgresStore {
  const ready = (async () => {
    const db = new PGlite();
    await db.exec(readFileSync('supabase/migrations/0005_engine_store.sql', 'utf8'));
    return db;
  })();
  return new PostgresStore({ query: async (sql, params) => (await (await ready).query(sql, params)) as never });
}
