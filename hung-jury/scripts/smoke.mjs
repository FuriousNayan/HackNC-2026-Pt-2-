// Live smoke test against a running server: node scripts/smoke.mjs [baseUrl]
// Start the server with: USE_STUB_JUDGE=true HJ_TIMER_SCALE=0.02 npm start
const base = process.argv[2] ?? 'http://localhost:3000';
const jar = {};
async function call(who, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(jar[who] ? { cookie: jar[who] } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) jar[who] = set.split(';')[0];
  return { status: res.status, body: await res.json().catch(() => null) };
}
const must = (cond, msg) => { if (!cond) { console.error('FAIL', msg); process.exit(1); } console.log('ok  ', msg); };

must((await call('d', 'POST', '/api/session', { handle: 'smoke_dave' })).status === 200, 'dave signs in');
must((await call('m', 'POST', '/api/session', { handle: 'smoke_maya' })).status === 200, 'maya signs in');
must((await call('x', 'POST', '/api/session', { handle: 'smoke_dave' })).status === 409, 'handle cannot be stolen');
const filed = await call('d', 'POST', '/api/cases', { title: 'Smoke test', grievance: 'He ate my leftovers.', defendantHandle: 'smoke_maya' });
must(filed.status === 200, 'case filed');
const id = filed.body.id;
must((await call('m', 'POST', `/api/cases/${id}/accept`)).status === 200, 'maya accepts');

const events = [];
async function stream(who) {
  const res = await fetch(`${base}/api/cases/${id}/events`, { headers: { cookie: jar[who] } });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  (async () => { for (;;) { const { value, done } = await reader.read(); if (done) return; for (const line of dec.decode(value).split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6))); } })();
}
await stream('d'); await stream('m');
await new Promise((r) => setTimeout(r, 300));
must((await call('d', 'POST', `/api/cases/${id}/start`)).status === 200, 'dave starts the trial');
for (let i = 0; i < 400; i++) {
  await new Promise((r) => setTimeout(r, 100));
  const v = (await call('d', 'GET', `/api/cases/${id}`)).body;
  if (v.status !== 'live') break;
  if (v.activeRole === 'plaintiff') await call('d', 'POST', `/api/cases/${id}/message`, { text: 'That is what happened.' });
  if (v.activeRole === 'defendant') await call('m', 'POST', `/api/cases/${id}/message`, { text: 'That is not what happened.' });
}
const final = (await call('d', 'GET', `/api/cases/${id}`)).body;
must(final.status === 'verdict' || final.status === 'closed', `trial reached ${final.status}`);
must(events.some((e) => e.type === 'judge' && e.verdict), 'verdict was streamed over SSE');
must(events.filter((e) => e.type === 'state').length >= 6, 'phase changes were streamed');
process.exit(0);
