import oatMilk from '../../fixtures/transcripts/oat-milk.json';
import money from '../../fixtures/transcripts/money-12.json';
import dishes from '../../fixtures/transcripts/dishes.json';
import threat from '../../fixtures/transcripts/threat.json';
import stalking from '../../fixtures/transcripts/stalking-text.json';
import injection from '../../fixtures/transcripts/prompt-injection.json';
import long from '../../fixtures/transcripts/long-messages.json';
import type { JudgeInput } from '@/contracts';
export const FIXTURES: Record<string, JudgeInput> = {
  'oat-milk': oatMilk as JudgeInput,
  'money-12': money as JudgeInput,
  dishes: dishes as JudgeInput,
  threat: threat as JudgeInput,
  'stalking-text': stalking as JudgeInput,
  'prompt-injection': injection as JudgeInput,
  'long-messages': long as JudgeInput,
};
export const FIXTURE_LABELS: Record<string, string> = {
  'oat-milk': 'The missing oat milk',
  'money-12': 'The unpaid $12',
  dishes: 'The four-day soak',
  threat: 'A threat',
  'stalking-text': 'Unwanted contact',
  'prompt-injection': 'An instruction attack',
  'long-messages': 'Long testimony',
};
