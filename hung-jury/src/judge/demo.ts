import { CONFIG, toneBand, type JudgeInput, type JudgeOutput } from '@/contracts';
import { FIXTURES } from './fixtures';
import { fallbackFor } from './fallback';
import { expectedPhase } from './schema';
function matchesKnownStory(input: JudgeInput): string | undefined {
  return Object.keys(FIXTURES).find((key) => {
    const f = FIXTURES[key];
    return (
      f.caseTitle === input.caseTitle &&
      f.grievance === input.grievance &&
      (!input.parties ||
        (input.parties.plaintiff === f.parties?.plaintiff &&
          input.parties.defendant === f.parties?.defendant)) &&
      input.transcript.every(
        (m, i) =>
          f.transcript[i]?.text === m.text &&
          f.transcript[i]?.role === m.role &&
          f.transcript[i]?.authorHandle === m.authorHandle &&
          f.transcript[i]?.kind === m.kind,
      )
    );
  });
}
export function demoFor(input: JudgeInput): JudgeOutput {
  const base = fallbackFor(input.phase, input.target, input.turnKind);
  const key = matchesKnownStory(input);
  if (!key || ['prompt-injection', 'long-messages', 'threat', 'stalking-text'].includes(key))
    return base;
  const band = toneBand(input.toneDial);
  const serious = band === 'leaning_serious';
  const absurd = band === 'absurd';
  const silly = band === 'silly';
  const latest = input.transcript.at(-1);
  // Scripted score reflects the last message, not the dial or the whole case.
  base.tone_score = !latest
    ? 0.5
    : key === 'money-12'
      ? 0.3
      : key === 'dishes'
        ? 0.55
        : /emotional backbone|breakfast peace/i.test(latest.text)
          ? 0.9
          : 0.7;
  base.face = serious ? 'neutral' : 'amused';
  switch (expectedPhase(input)) {
    case 'opening':
      base.speech =
        key === 'oat-milk'
          ? serious
            ? 'Dave alleges that Maya finished his oat milk without replacing it. Both sides will have a chance to explain what happened.'
            : absurd
              ? 'Order in the Breakfast Division! Dave brings a charge of oat milk disappearance against Maya, and both sides will be heard before this court spills anything further.'
              : 'Order in the court. Dave brings a breakfast dispute against Maya, and the court will hear both sides before reaching a ruling.'
          : `Order in the court. Dave and Maya will each explain the dispute about ${key === 'money-12' ? 'a shared grocery payment' : 'the shared sink'}.`;
      break;
    case 'reaction': {
      if (input.phase === 'closing') {
        base.speech = 'The court has received your closing statement.';
        break;
      }
      if (!latest) {
        base.speech = 'The court is ready to hear both sides.';
        break;
      }
      const quote = latest.text.split(/[.!?]/)[0].slice(0, 70);
      base.speech = serious
        ? `The court has noted your account: “${quote}.” We will consider it alongside the other testimony.`
        : absurd
          ? `“${quote}”—a dramatic development in the Breakfast Division! The court will inspect the facts before awarding anyone a cereal crown.`
          : silly
            ? `“${quote}”—the court invokes the ancient doctrine of Please Be Specific. Both accounts will be considered.`
            : `The court notes “${quote}.” A little clarity may do more than a lot of courtroom theater.`;
      break;
    }
    case 'question': {
      const own = input.transcript.filter((m) => m.role === input.target).at(-1);
      base.speech = !own
        ? 'What is your account of what happened?'
        : key === 'oat-milk'
          ? own.text.includes('a little')
            ? 'You said “a little”—how much did you pour, and how much was left?'
            : own.text.includes('finished')
              ? 'You said you finished the half carton—when will you replace it?'
              : 'You said there was half a carton left—when did you last check it?'
          : key === 'money-12'
            ? 'What amount was agreed, and when was it supposed to be paid?'
            : 'When did you leave the dishes in the sink, and when will you wash them?';
      base.target = input.target ?? 'plaintiff';
      break;
    }
    case 'verdict': {
      const admission = input.transcript.some(
        (m) =>
          m.role === 'defendant' &&
          (key === 'oat-milk'
            ? m.text.includes('I finished the half carton')
            : key === 'money-12'
              ? m.text.includes('I agreed to pay $12')
              : m.text.includes('I left them there')),
      );
      if (!admission) {
        base.speech =
          'The scripted review does not have a confirmed admission for this case. No finding of guilt is made.';
        base.verdict = {
          ruling: 'hung',
          findings: [
            'The case contains competing accounts.',
            'The scripted review has insufficient confirmed evidence.',
          ],
          sentence: null,
          headline: 'More evidence needed',
          cited_precedent: null,
        };
        break;
      }
      const candidate = input.precedents.find(
        (p) =>
          key === 'oat-milk' &&
          p.title === 'Dave v. The Missing Pizza' &&
          p.summary === FIXTURES['oat-milk'].precedents[0].summary,
      );
      const habitual =
        (input.guiltyCounts[input.parties?.defendant ?? 'maya'] ?? 0) >=
        CONFIG.limits.habitualOffenderGuilty;
      base.sfx = 'gavel';
      base.verdict = {
        ruling: 'guilty',
        findings:
          key === 'oat-milk'
            ? ['Maya admitted finishing the half carton.', 'Maya agreed to replace it today.']
            : key === 'money-12'
              ? ['Maya acknowledged the agreed $12 share.', 'Maya agreed to pay it today.']
              : [
                  'Maya admitted leaving the dishes in the sink.',
                  'Maya offered to wash them tonight.',
                ],
        sentence:
          key === 'oat-milk'
            ? 'Replace the same carton today.'
            : key === 'money-12'
              ? 'Pay the agreed $12 today.'
              : 'Wash the dishes tonight.',
        headline:
          key === 'oat-milk'
            ? 'Breakfast justice, served by the carton'
            : key === 'money-12'
              ? 'An agreement worth keeping'
              : 'The soak must end',
        cited_precedent: candidate?.title ?? null,
      };
      if (habitual) base.verdict.sentence += ' Add a brief sincere apology.';
      base.speech = serious
        ? 'The defendant acknowledged the disputed behavior and offered to put it right. The ruling is guilty, with the agreed remedy.'
        : absurd
          ? 'Under the entirely fictional Breakfast Restoration Act, this court finds the defendant guilty! Restore what was taken and let the kitchen return to peace.'
          : silly
            ? 'The doctrine of Replaceus Whatyouused applies. Guilty, with a modest remedy and no further kitchen theatrics.'
            : 'The court finds the defendant guilty on their own account. The remedy is simple: put it right as agreed.';
      if (candidate)
        base.speech += ` This follows the replacement principle in ${candidate.title}.`;
      break;
    }
  }
  return base;
}
