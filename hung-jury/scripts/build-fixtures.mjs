// Generates fixtures/trials/*.json: arrays of { atMs, event } matching RoomEvent in src/contracts.
// timerEndsAt values written as "+<ms>" are resolved to now + ms by the mock player at replay time.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'fixtures', 'trials');
mkdirSync(outDir, { recursive: true });

const CASE_ID = 'demo-oat-milk';
const heads = {
  dave: '/art/avatars/a1.svg',
  maya: '/art/avatars/a2.svg',
  jo: '/art/avatars/a3.svg',
  sam: '/art/avatars/a4.svg',
  lee: '/art/avatars/a5.svg',
  ana: '/art/avatars/a6.svg',
};

let msgN = 0;
const msg = (role, handle, kind, text) => ({
  type: 'message',
  message: {
    id: `m${(msgN += 1)}`,
    caseId: CASE_ID,
    authorHandle: handle,
    role,
    kind,
    text,
    createdAt: new Date(Date.UTC(2026, 9, 10, 19, 0, msgN)).toISOString(),
  },
});

const state = (phase, activeRole, sec) => ({
  type: 'state',
  phase,
  activeRole,
  timerEndsAt: sec == null ? null : `+${sec * 1000}`,
});

const judge = (speech, face, sfx, toneDial, verdict = null) => ({
  type: 'judge',
  speech,
  face,
  sfx,
  toneDial,
  audioUrl: null,
  verdict,
});

const jury = (guilty, notGuilty, viewers, jurorHandles) => ({
  type: 'jury',
  guiltyPct: guilty,
  notGuiltyPct: notGuilty,
  viewers,
  jurors: jurorHandles.map((h) => ({ handle: h, headImageUrl: heads[h] })),
});

const BANDS = {
  serious: {
    open: 'The court is in session. We are here to settle a matter between dave and maya. Please be concise.',
    react1: 'The court notes the carton was finished without a replacement. That is a fact, and it is not yet a crime.',
    q: 'You said you bought it "recently." How recent, exactly, and do you have a receipt?',
    react2: 'So the answer is Tuesday, and there is no receipt. The court has noted it.',
    verdict: 'The court finds the defendant guilty. The oat milk was finished without being replaced, and no notice was given. Sentence: replace the carton by Friday.',
  },
  medium: {
    open: 'Order in the court. We are gathered over a carton of oat milk, which is apparently now a matter of national importance.',
    react1: 'Let the record show the carton was empty and the fridge was not told. The court raises an eyebrow.',
    q: 'You said you bought it "recently." How many days is recently, defendant?',
    react2: 'Tuesday. With no receipt. The court finds this suspiciously unverifiable.',
    verdict: 'Guilty. The court finds the carton was finished and no replacement arrived. Sentence: one carton, and one sincere apology, by Friday.',
  },
  silly: {
    open: 'Order! ORDER! We convene on the matter of the Missing Oat Milk, a case of grave and mildly dairy-adjacent consequence.',
    react1: 'Res ipsa loquitur, ladies and gentlemen: the carton speaks for itself, and it says "empty."',
    q: 'You said you bought it "recently." Recently, in the legal sense, or recently in the sense of the Cretaceous?',
    react2: 'A Tuesday with no receipt! The court gasps. The court recovers. The court takes notes.',
    verdict: 'Guilty, by the ancient doctrine of Lactus Interruptus. Sentence: one apology, read dramatically, to the entire kitchen.',
  },
  absurd: {
    open: 'ORDER! ORDER IN THE COURT! Tonight, the Great Oat Milk Heist goes to trial, and the whole kitchen is on the edge of its seat!',
    react1: 'AND THERE IT IS, folks, the empty carton, a stunning play from the defense that is NOT working!',
    q: 'You said "recently." Is that Tuesday-recently or dinosaur-recently? The nation needs to know!',
    react2: 'TUESDAY! No receipt! The crowd goes wild! The court is physically unable to stay seated!',
    verdict: 'GUILTY under the sacred statute of Lactus Interruptus! Sentence: one apology in the voice of a pirate, to the entire kitchen. The jury is dismissed for having opinions!',
  },
};

function buildTrial({ dials, band, tailSafety = false }) {
  msgN = 0;
  const b = BANDS[band];
  const [d0, d1, d2, d3, dv] = dials;
  const ev = [];
  const at = (atMs, event) => ev.push({ atMs, event });

  at(0, state('waiting', null, null));
  at(0, jury(0, 0, 0, []));
  at(600, jury(0, 0, 3, ['jo']));
  at(1200, jury(0, 0, 6, ['jo', 'sam', 'lee']));

  at(2000, state('opening', 'judge', 20));
  at(2200, judge(b.open, 'stern', 'gavel', d0));

  at(6000, state('statements', 'plaintiff', 60));
  at(7500, msg('plaintiff', 'dave', 'statement', 'I bought the oat milk on Sunday and it was gone by Monday. Nobody told me, nobody replaced it, and I had dry cereal.'));
  at(8500, judge(b.react1, 'amused', 'none', d1));

  at(11000, state('statements', 'defendant', 60));
  at(12500, msg('defendant', 'maya', 'statement', 'I used a little. I bought a new one recently, it is in the other fridge. Dave never checks the other fridge.'));
  at(13500, judge('The defendant claims there is an "other fridge." The court is intrigued and slightly alarmed.', 'shocked', 'gasp', d1));

  at(16000, state('cross', 'judge', null));
  at(16200, judge(b.q, 'stern', 'none', d2));
  at(16400, state('cross', 'defendant', 45));
  at(18500, msg('defendant', 'maya', 'answer', 'Tuesday. I do not have the receipt, but I swear it exists.'));
  at(19500, judge(b.react2, 'amused', 'gasp', d3));

  at(22000, state('rebuttal', 'plaintiff', 30));
  at(23500, msg('plaintiff', 'dave', 'statement', 'There is no other fridge. I checked. I checked twice.'));
  at(25000, state('closing', 'plaintiff', 30));
  at(26000, msg('plaintiff', 'dave', 'closing', 'Justice for the cereal.'));
  at(27500, state('closing', 'defendant', 30));
  at(28500, msg('defendant', 'maya', 'closing', 'I regret nothing about the other fridge.'));

  at(31000, state('verdict', 'judge', 15));
  at(31500, jury(40, 60, 8, ['jo', 'sam', 'lee', 'ana']));
  at(34000, jury(30, 70, 9, ['jo', 'sam', 'lee', 'ana']));
  at(46000, judge(
    b.verdict,
    band === 'serious' ? 'stern' : band === 'medium' ? 'amused' : 'shocked',
    'gavel',
    dv,
    {
      ruling: 'guilty',
      findings: [
        'The oat milk was finished without notice.',
        'No receipt was produced for the claimed replacement.',
      ],
      sentence:
        band === 'serious'
          ? 'Replace the carton by Friday.'
          : band === 'medium'
            ? 'One carton and one sincere apology by Friday.'
            : 'One dramatic apology, read to the entire kitchen.',
      headline: 'The Case of the Missing Oat Milk: Guilty',
      cited_precedent: 'Dave v. The Missing Pizza',
    },
  ));
  at(47000, state('verdict', null, null));

  if (tailSafety) {
    at(48000, { type: 'safety', reason: 'threat' });
  }
  return ev;
}

function buildSafety() {
  msgN = 0;
  const ev = [];
  const at = (atMs, event) => ev.push({ atMs, event });
  at(0, state('waiting', null, null));
  at(0, jury(0, 0, 2, ['jo', 'sam']));
  at(1500, state('opening', 'judge', 20));
  at(1700, judge(BANDS.medium.open, 'stern', 'gavel', 0.5));
  at(4000, state('statements', 'plaintiff', 60));
  at(5500, msg('plaintiff', 'dave', 'statement', 'She keeps texting me after I told her to stop.'));
  at(6500, judge('The court will pause here and ask a plain question: are you safe?', 'neutral', 'none', 0.4));
  at(9000, state('statements', 'defendant', 60));
  at(10500, { type: 'safety', reason: 'threat' });
  return ev;
}

function buildWaiting() {
  const ev = [];
  const at = (atMs, event) => ev.push({ atMs, event });
  at(0, state('waiting', null, null));
  at(0, jury(0, 0, 0, []));
  at(1500, jury(0, 0, 1, ['jo']));
  at(3000, jury(0, 0, 2, ['jo', 'sam']));
  at(4500, jury(0, 0, 4, ['jo', 'sam', 'lee']));
  at(6000, jury(0, 0, 5, ['jo', 'sam', 'lee', 'ana']));
  return ev;
}

const write = (name, data) => {
  writeFileSync(join(outDir, name), JSON.stringify(data, null, 2) + '\n');
  console.log('wrote', name, data.length, 'events');
};

write('oat-milk.json', buildTrial({ dials: [0.5, 0.55, 0.62, 0.7, 0.75], band: 'silly' }));
write('dial-040.json', buildTrial({ dials: [0.5, 0.42, 0.4, 0.38, 0.4], band: 'serious' }));
write('dial-055.json', buildTrial({ dials: [0.5, 0.52, 0.55, 0.55, 0.55], band: 'medium' }));
write('dial-090.json', buildTrial({ dials: [0.5, 0.7, 0.85, 0.9, 0.92], band: 'absurd' }));
write('safety.json', buildSafety());
write('waiting.json', buildWaiting());
