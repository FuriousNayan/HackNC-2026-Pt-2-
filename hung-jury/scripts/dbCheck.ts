// npm run db:check — a quick sanity pass over the schema and access rules.
// Not exhaustive; it's meant to catch "I forgot to run a migration" and
// "RLS is wide open" before you rely on them in a demo.

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env.local and fill it in first.`);
    process.exit(1);
  }
  return v;
}

const TABLES = [
  'profiles',
  'groups',
  'group_members',
  'cases',
  'participants',
  'messages',
  'judge_turns',
  'votes',
  'reactions',
  'verdicts',
  'reports',
];

async function main() {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  let failures = 0;

  console.log('Checking tables exist (service role)...');
  for (const table of TABLES) {
    const { error } = await service.from(table).select('*', { head: true, count: 'exact' }).limit(1);
    if (error) {
      console.error(`  FAIL ${table}: ${error.message}`);
      failures++;
    } else {
      console.log(`  ok   ${table}`);
    }
  }

  console.log('\nChecking the media storage bucket exists...');
  const { data: buckets, error: bucketErr } = await service.storage.listBuckets();
  if (bucketErr) {
    console.error(`  FAIL could not list buckets: ${bucketErr.message}`);
    failures++;
  } else {
    for (const name of [process.env.SUPABASE_MEDIA_BUCKET || 'media']) {
      if (buckets?.some((b) => b.id === name)) {
        console.log(`  ok   ${name}`);
      } else {
        console.error(`  FAIL bucket missing: ${name}`);
        failures++;
      }
    }
  }

  console.log('\nChecking an unauthenticated (anon) client cannot read an unlisted case...');
  const { data: unfiledCase } = await service
    .from('cases')
    .select('id')
    .eq('status', 'filed')
    .limit(1)
    .maybeSingle();
  if (unfiledCase) {
    const { data: leaked } = await anon.from('cases').select('id').eq('id', unfiledCase.id).maybeSingle();
    if (leaked) {
      console.error('  FAIL anon client could read an unaccepted case (RLS is not enforcing access rules)');
      failures++;
    } else {
      console.log('  ok   anon client cannot read an unaccepted case');
    }
  } else {
    console.log('  skip (no filed, unaccepted case to test against)');
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
