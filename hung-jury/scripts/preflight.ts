// npm run preflight  : checks every external service from your own machine and prints PASS or FAIL per item.
// Reads .env.local. Prints no secrets.
import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.local', quiet: true });
const env = process.env;
let failed = 0;
async function check(name: string, run: () => Promise<string>) {
  try {
    console.log(`PASS  ${name}: ${await run()}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
const need = (k: string) => {
  const v = env[k]?.trim();
  if (!v) throw new Error(`${k} is not set in .env.local`);
  return v;
};
const get = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, { headers, signal: AbortSignal.timeout(15000) });

await check('Gemini key', async () => {
  const r = await get(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(need('GEMINI_API_KEY'))}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const names: string[] = ((await r.json()) as { models?: { name: string }[] }).models?.map((m) => m.name) ?? [];
  const model = need('GEMINI_MODEL');
  return names.some((n) => n.endsWith(`/${model}`)) ? `model ${model} available` : `key works but model "${model}" not in list; check GEMINI_MODEL`;
});
await check('ElevenLabs key and voice', async () => {
  const h = { 'xi-api-key': need('ELEVENLABS_API_KEY') };
  const r = await get(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(need('ELEVENLABS_VOICE_ID'))}`, h);
  if (!r.ok) throw new Error(`HTTP ${r.status} (check key and voice id)`);
  return `voice "${((await r.json()) as { name?: string }).name ?? 'ok'}" found`;
});
await check('Database', async () => {
  const url = need('DATABASE_URL');
  const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    const { rows } = await client.query(`select count(*)::int as n from information_schema.tables where table_name like 'hj\\_%'`);
    return rows[0].n >= 10 ? `${rows[0].n} hj_ tables present` : `connected, but only ${rows[0].n} hj_ tables: run npm run db:migrate`;
  } finally {
    await client.end();
  }
});
// Optional: photo avatars. Presets work without these, so a miss is reported but does not fail the run.
let optional = 0;
async function optionalCheck(name: string, run: () => Promise<string>) {
  try {
    console.log(`PASS  ${name}: ${await run()}`);
  } catch (error) {
    optional++;
    console.log(`SKIP  ${name}: ${error instanceof Error ? error.message : String(error)} (photo avatars stay off; presets still work)`);
  }
}
await optionalCheck('Supabase Storage bucket', async () => {
  const base = need('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const key = need('SUPABASE_SERVICE_ROLE_KEY');
  const bucket = need('SUPABASE_MEDIA_BUCKET');
  const r = await get(`${base}/storage/v1/bucket/${encodeURIComponent(bucket)}`, { Authorization: `Bearer ${key}`, apikey: key });
  if (!r.ok) throw new Error(`HTTP ${r.status} (run npm run db:migrate to create the bucket, check the service role key)`);
  const b = (await r.json()) as { public?: boolean };
  if (b.public) throw new Error('bucket is public; it must be private');
  return `private bucket "${bucket}" found`;
});
await optionalCheck('Google Vision key', async () => {
  const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(need('GOOGLE_VISION_API_KEY'))}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [] }),
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 400 || r.ok) return 'key accepted';
  throw new Error(`HTTP ${r.status} (enable the Cloud Vision API and check the key)`);
});
console.log(optional ? `\n${optional} optional check(s) skipped` : '');
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
