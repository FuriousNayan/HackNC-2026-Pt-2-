import type { RecordedEvent } from '@/contracts';
import oatMilk from '../../../fixtures/trials/oat-milk.json';
import dial040 from '../../../fixtures/trials/dial-040.json';
import dial055 from '../../../fixtures/trials/dial-055.json';
import dial090 from '../../../fixtures/trials/dial-090.json';
import safety from '../../../fixtures/trials/safety.json';
import waiting from '../../../fixtures/trials/waiting.json';

export const TRIAL_FIXTURES = {
  'oat-milk': oatMilk as RecordedEvent[],
  'dial-040': dial040 as RecordedEvent[],
  'dial-055': dial055 as RecordedEvent[],
  'dial-090': dial090 as RecordedEvent[],
  safety: safety as RecordedEvent[],
  waiting: waiting as RecordedEvent[],
};

export type FixtureName = keyof typeof TRIAL_FIXTURES;
