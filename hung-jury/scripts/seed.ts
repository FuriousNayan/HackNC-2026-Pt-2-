// npm run seed            -> prints what it would do (no --live), safe to re-run
// npm run seed -- --live  -> actually writes to Supabase
//
// Creates the demo group, handles, and two past cases from the Globals demo
// constants (DEMO in src/contracts/config.ts), so the judge can cite
// "Dave v. The Missing Pizza" on stage, and so there is a seeded, live case
// to run the Gate 1 test against: posting a message on it should store a
// real (or stub) judge reply.

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { DEMO, CONFIG } from '../src/contracts/config';

config({ path: '.env.local' });

const LIVE = process.argv.includes('--live');
const PASSWORD = 'hungjury-demo-password-2026';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env.local and fill it in first.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!LIVE) {
    console.log('Dry run (no --live passed). Would create:');
    console.log(`  - users: ${DEMO.plaintiffHandle}, ${DEMO.defendantHandle}`);
    console.log(`  - group: ${DEMO.groupName}`);
    console.log(`  - closed precedent case: ${DEMO.seededPrecedentTitle}`);
    console.log(`  - live seeded case: ${DEMO.caseTitle}`);
    console.log('\nRun again with: npm run seed -- --live');
    return;
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  async function upsertUser(handle: string) {
    const email = `${handle}@hungjury.demo`;
    const { data: list } = await db.auth.admin.listUsers();
    let user = list?.users.find((u) => u.email === email);
    if (!user) {
      const { data: created, error } = await db.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !created.user) throw new Error(`failed to create ${handle}: ${error?.message}`);
      user = created.user;
    }
    await db.from('profiles').upsert({ id: user.id, handle, avatar_kind: 'avatar' });
    return user;
  }

  const dave = await upsertUser(DEMO.plaintiffHandle);
  const maya = await upsertUser(DEMO.defendantHandle);
  console.log(`Users ready: ${DEMO.plaintiffHandle} (${dave.id}), ${DEMO.defendantHandle} (${maya.id})`);

  let { data: group } = await db.from('groups').select('id').eq('name', DEMO.groupName).maybeSingle();
  if (!group) {
    const { data: created, error } = await db.from('groups').insert({ name: DEMO.groupName }).select('id').single();
    if (error || !created) throw new Error(`failed to create group: ${error?.message}`);
    group = created;
  }
  await db
    .from('group_members')
    .upsert([
      { group_id: group.id, user_id: dave.id },
      { group_id: group.id, user_id: maya.id },
    ]);
  console.log(`Group ready: ${DEMO.groupName} (${group.id})`);

  // --- Seeded precedent: a closed, decided case the judge can cite. -------
  const { data: existingPrecedent } = await db
    .from('cases')
    .select('id')
    .eq('group_id', group.id)
    .eq('title', DEMO.seededPrecedentTitle)
    .maybeSingle();

  let precedentCaseId = existingPrecedent?.id as string | undefined;
  if (!precedentCaseId) {
    const { data: precedentCase, error } = await db
      .from('cases')
      .insert({
        group_id: group.id,
        title: DEMO.seededPrecedentTitle,
        grievance: 'The defendant ate the last slice of a shared pizza without asking.',
        filer_id: dave.id,
        defendant_id: maya.id,
        status: 'closed',
        tone_dial: 0.7,
        listed: false,
        closed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error || !precedentCase) throw new Error(`failed to create precedent case: ${error?.message}`);
    precedentCaseId = precedentCase.id;
    await db.from('verdicts').insert({
      case_id: precedentCaseId,
      ruling: 'guilty',
      findings: ['The last slice was eaten without consulting the group chat.'],
      sentence: 'One replacement pizza, delivered within the week.',
      headline: 'Guilty: one slice too far.',
      cited_precedent: null,
      jury_guilty_pct: 80,
    });
  }
  console.log(`Precedent ready: ${DEMO.seededPrecedentTitle} (${precedentCaseId})`);

  // --- Seeded live case: ready to receive a message for the Gate 1 test. -
  const { data: existingCase } = await db
    .from('cases')
    .select('id')
    .eq('group_id', group.id)
    .eq('title', DEMO.caseTitle)
    .neq('status', 'closed')
    .maybeSingle();

  let caseId = existingCase?.id as string | undefined;
  if (!caseId) {
    const { data: liveCase, error } = await db
      .from('cases')
      .insert({
        group_id: group.id,
        title: DEMO.caseTitle,
        grievance: 'The defendant finished the oat milk and did not replace it.',
        filer_id: dave.id,
        defendant_id: maya.id,
        status: 'live',
        phase: 'statements',
        tone_dial: CONFIG.tone.start,
        listed: true,
        started_at: new Date().toISOString(),
        timer_ends_at: new Date(Date.now() + CONFIG.timers.statementSec * 1000).toISOString(),
      })
      .select('id')
      .single();
    if (error || !liveCase) throw new Error(`failed to create seeded case: ${error?.message}`);
    caseId = liveCase.id;
    await db.from('participants').insert([
      { case_id: caseId, user_id: dave.id, role: 'plaintiff' },
      { case_id: caseId, user_id: maya.id, role: 'defendant' },
    ]);
  }
  console.log(`Seeded live case ready: ${DEMO.caseTitle} (${caseId})`);

  // Sign in as dave to get a bearer token for the curl command below.
  const anon = createClient(url, anonKey);
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email: `${DEMO.plaintiffHandle}@hungjury.demo`,
    password: PASSWORD,
  });
  if (signInErr || !signIn.session) {
    throw new Error(`failed to sign in as ${DEMO.plaintiffHandle}: ${signInErr?.message}`);
  }

  console.log('\nGate 1 check: run `npm run dev`, then:\n');
  console.log(
    `curl -X POST http://localhost:3000/api/cases/${caseId}/message \\\n` +
      `  -H "Authorization: Bearer ${signIn.session.access_token}" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '{"text":"He ate my leftovers and left no note","clientMessageId":"seed-test-1"}'\n`,
  );
  console.log('You pass when a judge_turns row for this case has valid raw_json (check in Supabase Studio).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
