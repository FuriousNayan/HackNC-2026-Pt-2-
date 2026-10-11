// npm run db:migrate            applies supabase/migrations/0005_engine_store.sql (safe to re-run)
// Needs DATABASE_URL (Supabase: Project Settings, Database, Connection string, "Session pooler" or Direct).
// 0001 to 0004 are the original Supabase tables and are applied with the Supabase CLI or SQL editor as before.
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.local' });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL in .env.local first.');
  process.exit(1);
}
const local = /localhost|127\.0\.0\.1/.test(url);
const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
await client.connect();
await client.query(readFileSync('supabase/migrations/0005_engine_store.sql', 'utf8'));
const { rows } = await client.query(
  `select count(*)::int as n from information_schema.tables where table_name like 'hj\\_%'`,
);
console.log(`ok: ${rows[0].n} hj_ tables present`);
await client.end();
