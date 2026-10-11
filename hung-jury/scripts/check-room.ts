// Gate 1 sanity check: replay every fixture through the reducer and assert the end states.
// Run with: npx tsx scripts/check-room.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toneBand, toneColor, nextDial, type RecordedEvent } from '../src/contracts';
import { replay } from '../src/ui/room/reducer';

const load = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fixtures', 'trials', `${name}.json`), 'utf8')) as RecordedEvent[];

let failed = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failed += 1;
};

const expectedBand = { 'oat-milk': 'silly', 'dial-040': 'leaning_serious', 'dial-055': 'medium', 'dial-090': 'absurd' } as const;

for (const name of Object.keys(expectedBand) as (keyof typeof expectedBand)[]) {
  const s = replay(load(name).map((r) => r.event));
  check(`${name}: ends in verdict with a ruling`, s.judge?.verdict?.ruling === 'guilty');
  check(`${name}: final dial band is ${expectedBand[name]}`, toneBand(s.toneDial) === expectedBand[name], `dial=${s.toneDial}`);
  check(`${name}: 6 messages stored in order`, s.messages.length === 6, `got ${s.messages.length}`);
  check(`${name}: jury tally comes straight from the event`, s.jury.guiltyPct === 30 && s.jury.notGuiltyPct === 70);
  check(`${name}: no safety`, s.safety === null);
}

const safety = replay(load('safety').map((r) => r.event));
check('safety: ends in the safety state', safety.safety?.reason === 'threat');

// Events after a safety event must not change anything.
const frozen = replay([...load('safety').map((r) => r.event), { type: 'jury', guiltyPct: 1, notGuiltyPct: 99, viewers: 5, jurors: [] }]);
check('safety: later events are ignored', frozen.jury.guiltyPct === 0);

// Duplicate message ids are ignored (safe against a retried broadcast).
const msgEvent = load('oat-milk').find((r) => r.event.type === 'message')!.event;
const twice = replay([msgEvent, msgEvent]);
check('duplicate message is ignored', twice.messages.length === 1);

check('toneColor floor is tone-serious', toneColor(0.35).toUpperCase() === '#3F5B7A');
check('toneColor ceiling is tone-silly', toneColor(1).toUpperCase() === '#FF5DA2');
check('nextDial smooths and clamps', Math.abs(nextDial(0.5, 1) - 0.7) < 1e-9 && nextDial(0.35, 0) === 0.35);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
