import { randomBytes } from 'node:crypto';
import {
  CONFIG,
  JUDGE_CONFIG,
  voiceSettingsFor,
  type JudgeInput,
  type JudgeOutput,
  type Juror,
  type Message,
  type Phase,
  type Reaction,
  type Role,
  type RoomEvent,
  type SpeechKind,
  type VerdictCardData,
} from '@/contracts';
import { judgeTurnWithMedia, prepareText, type TurnOptions, type TurnResult } from '../integration/turn';
import { fallbackFor } from '../judge/fallback';
import { getGuiltyCounts, getPrecedents, type MemoryCase, type MemoryStore } from '../judge/memory';
import { PRESET_AVATARS } from '../media/presets';
import { redact } from '../safety';
import { normalizeHandle, type User } from './auth';
import type { Frame, RoomBus } from './bus';
import {
  FILING_BLOCKED_MESSAGE,
  REACTIONS,
  SAFETY_REASON,
  SERVER_CONFIG,
  SILENCE_TEXT,
} from './constants';
import { ApiError, badRequest, conflict, forbidden, notFound, tooMany } from './errors';
import { RateLimiter } from './rateLimit';
import type {
  CaseRecord,
  CaseStore,
  JudgeTurnRecord,
  ParticipantRecord,
  Step,
  StoredMessage,
  Vote,
} from './store';

/**
 * Part 2's case engine. It owns the case state machine, every phase timer, the message pipeline and the
 * realtime events. Clients only render what it broadcasts.
 *
 * Concurrency model, the rules that keep it correct:
 * 1. Every state change for a case runs inside lock(caseId), one at a time.
 * 2. Slow work (Gemini, ElevenLabs) runs OUTSIDE the lock. When it returns, the engine takes the lock again and
 *    commits only if the case epoch is unchanged and the case is still live. Safety closes, default judgments
 *    and step advances all bump the epoch, so a stale judge result can never be broadcast.
 * 3. A turn is closed the moment its message is accepted (activeRole becomes 'judge'), so a double tap or a
 *    late timer cannot create a second message or a second judge call.
 */

export interface EngineServices {
  judgeTurn(input: JudgeInput, options: TurnOptions): Promise<TurnResult>;
  speak(text: string, dial: number, kind: SpeechKind): Promise<{ audioUrl: string }>;
  now(): number;
  log(message: string, error?: unknown): void;
  /** Optional: tear down live video for a case that closed (safety or normal). Best effort. */
  endVideo?(caseId: string): Promise<void>;
}

export interface EngineOptions {
  /** Cross-examination questions per arguer, clamped to CONFIG.limits.followUpsPerSide. */
  crossQuestionsPerSide: number;
  /** Multiplies every CONFIG.timers value. Use 0.1 to run a trial ten times faster in development. */
  timerScale: number;
  /** Require both arguers to be connected before the trial can start. */
  requireBothPresent: boolean;
  closeAfterMs: number;
  afterJudgeMs: number;
  presenceTtlMs: number;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  crossQuestionsPerSide: SERVER_CONFIG.crossQuestionsPerSide,
  timerScale: 1,
  requireBothPresent: true,
  closeAfterMs: SERVER_CONFIG.closeAfterMs,
  afterJudgeMs: SERVER_CONFIG.afterJudgeMs,
  presenceTtlMs: SERVER_CONFIG.presenceTtlMs,
};

export function defaultServices(
  overrides: Partial<EngineServices> = {},
): EngineServices {
  return {
    judgeTurn: (input, options) => judgeTurnWithMedia(input, options),
    speak: async (text, dial, kind) => {
      const { speak } = await import('../media/voice');
      return speak(text, dial, kind);
    },
    now: () => Date.now(),
    log: (message, error) => console.warn(`[hung-jury] ${message}`, error ?? ''),
    ...overrides,
  };
}

export interface Seat {
  handle: string;
  headImageUrl: string;
}

export interface CaseView {
  id: string;
  number: string;
  groupId: string;
  title: string;
  grievance: string;
  sentenceRequest: string | null;
  status: CaseRecord['status'];
  phase: CaseRecord['phase'];
  activeRole: CaseRecord['activeRole'];
  timerEndsAt: string | null;
  toneDial: number;
  listed: boolean;
  safetyClosed: boolean;
  plaintiff: Seat;
  defendant: Seat | null;
  present: { plaintiff: boolean; defendant: boolean };
  you: { handle: string; role: Role | null };
  jurors: Seat[];
  viewers: number;
  jury: { guiltyPct: number; notGuiltyPct: number };
  /** Only arguers see held messages, and only on a safety closed case. */
  heldMessages: Message[];
}

export interface DocketEntry {
  id: string;
  number: string;
  category: string;
  blurb: string;
  title: string;
  tone: number;
  viewers: number;
  status: 'live' | 'accepted';
  plaintiff: string;
  defendant: string;
}

interface TimerEntry {
  tag: string;
  cancel(): void;
}

type JudgeSpec = {
  phase: Phase;
  target?: 'plaintiff' | 'defendant';
  turnKind?: 'default' | 'reaction';
  isNew: boolean;
};

const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString('hex')}`;

export function buildSteps(questionsPerSide: number): Step[] {
  const sides = ['plaintiff', 'defendant'] as const;
  const steps: Step[] = [{ kind: 'opening', phase: 'opening' }];
  for (const role of sides) steps.push({ kind: 'speak', phase: 'statements', role });
  for (const role of sides)
    for (let i = 0; i < questionsPerSide; i++)
      steps.push({ kind: 'question', phase: 'cross', role }, { kind: 'answer', phase: 'cross', role });
  for (const role of sides) steps.push({ kind: 'speak', phase: 'rebuttal', role });
  for (const role of sides) steps.push({ kind: 'speak', phase: 'closing', role });
  steps.push({ kind: 'verdict', phase: 'verdict' });
  return steps;
}

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/\b(oat|milk|dish|dishes|fridge|food|ate|eat|pizza|leftover|snack|cereal|sink)\b/i, 'Kitchen crimes'],
  [/(\$|\b(owe|owes|pay|paid|venmo|rent|money|refund|bill)\b)/i, 'Money matters'],
  [/\b(thermostat|noise|loud|roommate|laundry|trash|clean)\b/i, 'Roommate justice'],
  [/\b(text|texted|reply|replied|read|group chat|seen|ghost|ignored)\b/i, 'Social offenses'],
];
export function categoryFor(text: string): string {
  return CATEGORY_RULES.find(([re]) => re.test(text))?.[1] ?? 'Everyday disputes';
}

function pct(guilty: number, notGuilty: number): { guiltyPct: number; notGuiltyPct: number } {
  const total = guilty + notGuilty;
  if (!total) return { guiltyPct: 0, notGuiltyPct: 0 };
  const guiltyPct = Math.round((guilty / total) * 100);
  return { guiltyPct, notGuiltyPct: 100 - guiltyPct };
}

function presetFor(handle: string): string {
  let h = 0;
  for (const ch of handle) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PRESET_AVATARS[h % PRESET_AVATARS.length].headImageUrl;
}

const toMessage = (m: StoredMessage): Message => ({
  id: m.id,
  caseId: m.caseId,
  authorHandle: m.authorHandle,
  role: m.role,
  kind: m.kind,
  text: m.text,
  createdAt: m.createdAt,
});

function cleanText(value: unknown, max: number, label: string, required = true): string {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${label} is required`, 'bad_text');
    return '';
  }
  if (typeof value !== 'string') throw badRequest(`${label} must be text`, 'bad_text');
  const text = value.replace(/\r\n/g, '\n').trim();
  if (required && !text) throw badRequest(`${label} is required`, 'bad_text');
  if (text.length > max) throw badRequest(`${label} must be at most ${max} characters`, 'too_long');
  return text;
}

export class CaseEngine {
  private locks = new Map<string, Promise<void>>();
  private timers = new Map<string, Set<TimerEntry>>();
  private tasks = new Map<string, Set<Promise<unknown>>>();
  private touched = new Map<string, number>();
  private limiter: RateLimiter;
  readonly options: EngineOptions;
  readonly services: EngineServices;
  /** Memory queries for the judge and the leaderboard. Reads the same store, so no database is needed. */
  readonly memory: MemoryStore;

  constructor(
    readonly store: CaseStore,
    readonly bus: RoomBus,
    services: Partial<EngineServices> = {},
    options: Partial<EngineOptions> = {},
  ) {
    this.services = defaultServices(services);
    this.options = { ...DEFAULT_ENGINE_OPTIONS, ...options };
    this.options.crossQuestionsPerSide = Math.max(
      0,
      Math.min(CONFIG.limits.followUpsPerSide, Math.floor(this.options.crossQuestionsPerSide)),
    );
    this.limiter = new RateLimiter(() => this.services.now());
    this.memory = { listCompletedCases: (groupId) => this.completedCases(groupId) };
    bus.onPresence = (caseId, handle, count) => this.handlePresence(caseId, handle, count);
  }

  // ---------------------------------------------------------------- plumbing

  private async lock<T>(caseId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(caseId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const tail = prev.then(() => gate);
    this.locks.set(caseId, tail);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(caseId) === tail) this.locks.delete(caseId);
    }
  }

  private ms(seconds: number): number {
    return Math.max(0, Math.round(seconds * 1000 * this.options.timerScale));
  }

  private iso(offsetMs = 0): string {
    return new Date(this.services.now() + offsetMs).toISOString();
  }

  /** A cancellable timer. Resolves true when it fires and false when it is cancelled. */
  private sleep(caseId: string, ms: number, tag: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const set = this.timers.get(caseId) ?? new Set<TimerEntry>();
      this.timers.set(caseId, set);
      const handle = setTimeout(() => {
        set.delete(entry);
        resolve(true);
      }, ms);
      (handle as { unref?: () => void }).unref?.();
      const entry: TimerEntry = {
        tag,
        cancel: () => {
          clearTimeout(handle);
          set.delete(entry);
          resolve(false);
        },
      };
      set.add(entry);
    });
  }

  private cancelTimers(caseId: string, tag?: string) {
    for (const entry of [...(this.timers.get(caseId) ?? [])])
      if (!tag || entry.tag === tag) entry.cancel();
  }

  private track(caseId: string, work: Promise<unknown>) {
    const set = this.tasks.get(caseId) ?? new Set<Promise<unknown>>();
    this.tasks.set(caseId, set);
    const wrapped: Promise<unknown> = work
      .catch((error) => this.services.log(`background step failed for ${caseId}`, error))
      .finally(() => set.delete(wrapped));
    set.add(wrapped);
  }

  /** Resolves when no background work (judge calls, timers handlers) is in flight. Used by tests and shutdown. */
  async settled(caseId: string): Promise<void> {
    while (this.tasks.get(caseId)?.size) {
      await Promise.allSettled([...(this.tasks.get(caseId) ?? [])]);
    }
  }

  /** Cancel every timer. Call from tests and on shutdown. */
  dispose() {
    for (const id of [...this.timers.keys()]) this.cancelTimers(id);
  }

  private async withTimeout<T>(task: Promise<T>, ms: number): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ------------------------------------------------------------------ access

  private roleOf(c: CaseRecord, handle: string): 'plaintiff' | 'defendant' | null {
    return handle === c.plaintiff ? 'plaintiff' : handle === c.defendant ? 'defendant' : null;
  }

  /** The case if this user may see it. Anything else is a 404 so existence is not leaked. */
  private async visibleCase(id: string, handle: string): Promise<CaseRecord> {
    const c = await this.store.getCase(id);
    if (!c) throw notFound('Case not found');
    if (this.roleOf(c, handle)) return c;
    if (c.listed && !c.safetyClosed) return c;
    throw notFound('Case not found');
  }

  private touch(id: string, handle: string) {
    this.touched.set(`${id}:${handle}`, this.services.now());
  }

  isPresent(c: CaseRecord, handle: string): boolean {
    if (this.bus.connections(c.id, handle) > 0) return true;
    const t = this.touched.get(`${c.id}:${handle}`);
    return t !== undefined && this.services.now() - t < this.options.presenceTtlMs;
  }

  private async headFor(handle: string): Promise<string> {
    const profile = await this.store.getProfile(handle);
    return profile?.avatar?.headImageUrl ?? presetFor(handle);
  }

  // ------------------------------------------------------------------ filing

  async fileCase(
    user: User,
    body: { title?: unknown; grievance?: unknown; defendantHandle?: unknown; sentenceRequest?: unknown },
  ): Promise<{ id: string; number: string }> {
    const title = cleanText(body.title, JUDGE_CONFIG.maxTitleChars, 'Title');
    const grievance = cleanText(body.grievance, CONFIG.limits.grievanceChars, 'Grievance');
    const sentence = cleanText(
      body.sentenceRequest,
      SERVER_CONFIG.maxSentenceRequestChars,
      'Sentence request',
      false,
    );
    const defendant = normalizeHandle(body.defendantHandle);
    if (defendant === user.handle) throw badRequest('You cannot file a case against yourself', 'self_case');
    if (title.includes('\n')) throw badRequest('Title must be one line', 'bad_text');

    const prepared = [title, grievance, sentence].map((t) => (t ? prepareText(t) : null));
    if (prepared.some((p) => p && !p.ok)) throw new ApiError(422, FILING_BLOCKED_MESSAGE, 'safety');

    if (!this.limiter.take(`file:${user.handle}`, CONFIG.limits.filingsPerHour, 3_600_000))
      throw tooMany('You can file at most three cases per hour');

    const text = (i: number, max: number) =>
      (prepared[i] && prepared[i]!.ok ? (prepared[i] as { text: string }).text : '').slice(0, max).trim();

    let group = await this.store.findGroupForPair(user.handle, defendant);
    if (!group) {
      group = {
        id: `pair-${[user.handle, defendant].sort().join('-')}`,
        name: `@${user.handle} and @${defendant}`,
        members: [user.handle, defendant],
      };
      await this.store.upsertGroup(group);
    }

    const seq = await this.store.nextCaseSeq();
    const now = this.iso();
    const record: CaseRecord = {
      id: newId('case'),
      number: `HJ-${String(seq).padStart(4, '0')}`,
      groupId: group.id,
      title: text(0, JUDGE_CONFIG.maxTitleChars),
      grievance: text(1, CONFIG.limits.grievanceChars),
      sentenceRequest: sentence ? text(2, SERVER_CONFIG.maxSentenceRequestChars) : null,
      plaintiff: user.handle,
      defendant,
      status: 'filed',
      phase: 'waiting',
      activeRole: null,
      timerEndsAt: null,
      toneDial: CONFIG.tone.start,
      listed: false,
      safetyClosed: false,
      declined: false,
      epoch: 0,
      stepId: 0,
      steps: [],
      stepIndex: -1,
      juryLocked: false,
      createdAt: now,
      startedAt: null,
      closedAt: null,
    };
    await this.store.createCase(record);
    await this.store.addParticipant({
      caseId: record.id,
      handle: user.handle,
      role: 'plaintiff',
      headImageUrl: await this.headFor(user.handle),
      joinedAt: now,
    });
    return { id: record.id, number: record.number };
  }

  async accept(user: User, id: string): Promise<{ ok: true }> {
    return this.lock(id, async () => {
      const c = await this.store.getCase(id);
      if (!c || !this.roleOf(c, user.handle)) throw notFound('Case not found');
      if (user.handle !== c.defendant) throw forbidden('Only the named defendant can accept');
      if (c.safetyClosed || c.declined || c.status === 'closed') throw conflict('This case is closed', 'closed');
      if (c.status !== 'filed') return { ok: true as const };
      await this.store.addParticipant({
        caseId: id,
        handle: user.handle,
        role: 'defendant',
        headImageUrl: await this.headFor(user.handle),
        joinedAt: this.iso(),
      });
      await this.store.updateCase(id, { status: 'accepted', listed: true, epoch: c.epoch + 1 });
      this.bus.publish(id, { type: 'state', phase: 'waiting', activeRole: null, timerEndsAt: null });
      return { ok: true as const };
    });
  }

  async decline(user: User, id: string): Promise<{ ok: true }> {
    return this.lock(id, async () => {
      const c = await this.store.getCase(id);
      if (!c || !this.roleOf(c, user.handle)) throw notFound('Case not found');
      if (user.handle !== c.defendant) throw forbidden('Only the named defendant can decline');
      if (c.status !== 'filed') throw conflict('This case can no longer be declined', 'not_filed');
      await this.store.updateCase(id, {
        status: 'closed',
        declined: true,
        listed: false,
        closedAt: this.iso(),
        epoch: c.epoch + 1,
      });
      return { ok: true as const };
    });
  }

  // ------------------------------------------------------------------- start

  async start(user: User, id: string): Promise<{ ok: true }> {
    return this.lock(id, async () => {
      const c = await this.store.getCase(id);
      if (!c || !this.roleOf(c, user.handle)) throw notFound('Case not found');
      if (user.handle !== c.plaintiff) throw forbidden('Only the filer can start the trial');
      if (c.safetyClosed || c.status === 'closed') throw conflict('This case is closed', 'closed');
      if (c.status === 'live') return { ok: true as const };
      if (c.status !== 'accepted') throw conflict('The defendant has not accepted yet', 'not_accepted');
      this.touch(id, user.handle);
      if (this.options.requireBothPresent) {
        const missing = [c.plaintiff, c.defendant].filter((h) => !this.isPresent(c, h));
        if (missing.length)
          throw conflict(`Waiting for ${missing.map((h) => '@' + h).join(' and ')} to enter court`, 'not_present');
      }
      const steps = buildSteps(this.options.crossQuestionsPerSide);
      const live = await this.store.updateCase(id, {
        status: 'live',
        steps,
        stepIndex: -1,
        startedAt: this.iso(),
        epoch: c.epoch + 1,
      });
      await this.beginStepLocked(live, 0);
      return { ok: true as const };
    });
  }

  // ----------------------------------------------------------- state machine

  private stepSeconds(step: Step): number | null {
    const t = CONFIG.timers;
    switch (step.kind) {
      case 'opening':
        return t.openingSec;
      case 'speak':
        return step.phase === 'statements'
          ? t.statementSec
          : step.phase === 'rebuttal'
            ? t.rebuttalSec
            : t.closingSec;
      case 'answer':
        return t.answerSec;
      case 'verdict':
        return t.voteCountdownSec;
      case 'question':
        return null;
    }
  }

  /** Move to step `index`, publish the state event and arm whatever the step needs. Caller holds the lock. */
  private async beginStepLocked(c: CaseRecord, index: number): Promise<void> {
    const step = c.steps[index];
    if (!step) return;
    const seconds = this.stepSeconds(step);
    const duration = seconds === null ? null : this.ms(seconds);
    const activeRole: CaseRecord['activeRole'] =
      step.kind === 'speak' || step.kind === 'answer' ? step.role! : 'judge';
    const next = await this.store.updateCase(c.id, {
      stepIndex: index,
      phase: step.phase,
      activeRole,
      timerEndsAt: duration === null ? null : this.iso(duration),
      epoch: c.epoch + 1,
      stepId: c.stepId + 1,
    });
    this.bus.publish(c.id, {
      type: 'state',
      phase: next.phase,
      activeRole: next.activeRole,
      timerEndsAt: next.timerEndsAt,
    });
    switch (step.kind) {
      case 'opening':
        this.track(c.id, this.runOpening(c.id, next.epoch, duration ?? 0));
        break;
      case 'speak':
      case 'answer':
        this.track(c.id, this.armSpeaker(c.id, next.stepId, duration ?? 0));
        break;
      case 'question':
        this.track(c.id, this.runQuestion(c.id, next.epoch, step.role!));
        break;
      case 'verdict':
        this.track(c.id, this.runVerdict(c.id, next.epoch, duration ?? 0));
        break;
    }
  }

  private async advance(id: string, epoch: number): Promise<void> {
    await this.lock(id, async () => {
      const c = await this.store.getCase(id);
      if (!c || c.epoch !== epoch || c.status !== 'live') return;
      await this.beginStepLocked(c, c.stepIndex + 1);
    });
  }

  private async pause(id: string): Promise<boolean> {
    if (this.options.afterJudgeMs <= 0) return true;
    return this.sleep(id, this.options.afterJudgeMs, 'step');
  }

  private async runOpening(id: string, epoch: number, durationMs: number) {
    const [judge, waited] = await Promise.all([
      this.judgeStep(id, { phase: 'opening', isNew: false }),
      this.sleep(id, durationMs, 'step'),
    ]);
    if (judge !== 'ok' || !waited) return;
    await this.advance(id, epoch);
  }

  private async runQuestion(id: string, epoch: number, target: 'plaintiff' | 'defendant') {
    const result = await this.judgeStep(id, { phase: 'cross', target, isNew: false });
    if (result !== 'ok' || !(await this.pause(id))) return;
    await this.advance(id, epoch);
  }

  private async armSpeaker(id: string, stepId: number, durationMs: number) {
    const fired = await this.sleep(id, durationMs, 'step');
    if (!fired) return;
    await this.onSpeakerTimeout(id, stepId);
  }

  private async runVerdict(id: string, epoch: number, durationMs: number) {
    if (!(await this.sleep(id, durationMs, 'step'))) return;
    const locked = await this.lock(id, async () => {
      const c = await this.store.getCase(id);
      if (!c || c.epoch !== epoch || c.status !== 'live') return false;
      await this.store.updateCase(id, { juryLocked: true, timerEndsAt: null });
      this.bus.publish(id, { type: 'state', phase: 'verdict', activeRole: 'judge', timerEndsAt: null });
      await this.publishJury({ ...c, juryLocked: true });
      return true;
    });
    if (!locked) return;
    await this.judgeStep(id, { phase: 'verdict', isNew: false });
  }

  /** After a turn's message was stored: one judge reaction, then the next step. Closings get no judge call. */
  private async afterTurn(id: string, epoch: number, step: Step, isNew: boolean) {
    if (step.kind === 'speak' && step.phase === 'closing') {
      await this.advance(id, epoch);
      return;
    }
    const spec: JudgeSpec =
      step.kind === 'answer'
        ? { phase: 'cross', turnKind: 'reaction', isNew }
        : { phase: step.phase, isNew };
    const result = await this.judgeStep(id, spec);
    if (result !== 'ok' || !(await this.pause(id))) return;
    await this.advance(id, epoch);
  }

  private async onSpeakerTimeout(id: string, stepId: number) {
    const held: { epoch: number; step: Step } | { none: true } = await this.lock(id, async () => {
      const c = await this.store.getCase(id);
      if (!c || c.status !== 'live' || c.stepId !== stepId) return { none: true as const };
      const step = c.steps[c.stepIndex];
      const role = step.role;
      if (!role || c.activeRole !== role) return { none: true as const };
      await this.addSilenceLocked(c, step, role);
      return { epoch: c.epoch, step };
    });
    if ('none' in held) return;
    await this.afterTurn(id, held.epoch, held.step, false);
  }

  private async addSilenceLocked(c: CaseRecord, step: Step, role: 'plaintiff' | 'defendant') {
    const message: StoredMessage = {
      id: newId('msg'),
      caseId: c.id,
      authorHandle: c[role],
      role,
      kind: step.kind === 'answer' ? 'answer' : step.phase === 'closing' ? 'closing' : 'statement',
      text: SILENCE_TEXT,
      createdAt: this.iso(),
      hidden: false,
      system: true,
      clientId: null,
    };
    await this.store.addMessage(message);
    await this.store.updateCase(c.id, { activeRole: 'judge', timerEndsAt: null, stepId: c.stepId + 1 });
    this.bus.publish(c.id, { type: 'message', message: toMessage(message) });
    this.bus.publish(c.id, { type: 'state', phase: c.phase, activeRole: 'judge', timerEndsAt: null });
  }

  // ---------------------------------------------------------------- messages

  async submitMessage(
    user: User,
    id: string,
    rawText: unknown,
    clientId?: unknown,
  ): Promise<{ ok: true; id?: string; duplicate?: boolean; closed?: boolean }> {
    if (typeof rawText !== 'string') throw badRequest('Message text is required', 'bad_text');
    const text = rawText.replace(/\r\n/g, '\n').trim();
    if (!text) throw badRequest('Message text is required', 'bad_text');
    if (text.length > Math.max(CONFIG.limits.statementChars, CONFIG.limits.answerChars))
      throw badRequest('Message is too long', 'too_long');
    const cid = typeof clientId === 'string' && clientId.length <= 80 ? clientId : null;

    const outcome = await this.lock(id, async () => {
      const c = await this.store.getCase(id);
      if (!c || !this.roleOf(c, user.handle)) {
        if (c && c.listed && !c.safetyClosed) throw forbidden('Only the two arguers can speak');
        throw notFound('Case not found');
      }
      const role = this.roleOf(c, user.handle)!;
      if (cid) {
        const prior = (await this.store.getMessages(id)).find(
          (m) => m.clientId === cid && m.authorHandle === user.handle,
        );
        if (prior) return { result: { ok: true as const, id: prior.id, duplicate: true } };
      }
      if (c.safetyClosed || c.status !== 'live') throw conflict('This case is not in session', 'not_live');
      if (c.activeRole !== role) throw conflict('It is not your turn', 'not_your_turn');
      const step = c.steps[c.stepIndex];
      const kind: StoredMessage['kind'] =
        step.kind === 'answer' ? 'answer' : step.phase === 'closing' ? 'closing' : 'statement';
      const limit = kind === 'answer' ? CONFIG.limits.answerChars : CONFIG.limits.statementChars;
      if (text.length > limit) throw badRequest(`Keep it under ${limit} characters`, 'too_long');

      const prepared = prepareText(text);
      const base = {
        id: newId('msg'),
        caseId: id,
        authorHandle: user.handle,
        role,
        kind,
        createdAt: this.iso(),
        system: false,
        clientId: cid,
      };
      if (!prepared.ok) {
        // Held privately: stored redacted, visible only to the arguers, never broadcast.
        await this.store.addMessage({ ...base, text: redact(text), hidden: true });
        await this.safetyCloseLocked(c, 'filter');
        return { result: { ok: true as const, closed: true } };
      }
      const message: StoredMessage = { ...base, text: prepared.text, hidden: false };
      await this.store.addMessage(message);
      this.cancelTimers(id, 'step');
      await this.store.updateCase(id, { activeRole: 'judge', timerEndsAt: null, stepId: c.stepId + 1 });
      this.bus.publish(id, { type: 'message', message: toMessage(message) });
      this.bus.publish(id, { type: 'state', phase: c.phase, activeRole: 'judge', timerEndsAt: null });
      return { result: { ok: true as const, id: message.id }, next: { epoch: c.epoch, step } };
    });
    if ('next' in outcome && outcome.next)
      this.track(id, this.afterTurn(id, outcome.next.epoch, outcome.next.step, true));
    return outcome.result;
  }

  // ------------------------------------------------------------------- judge

  private async buildInput(c: CaseRecord, spec: JudgeSpec): Promise<JudgeInput> {
    const transcript = (await this.store.getMessages(c.id)).filter((m) => !m.hidden).map(toMessage);
    let precedents: JudgeInput['precedents'] = [];
    let guiltyCounts: Record<string, number> = {};
    try {
      const [p, g] = await Promise.all([
        getPrecedents(this.memory, c.groupId, [c.plaintiff, c.defendant]),
        getGuiltyCounts(this.memory, c.groupId),
      ]);
      precedents = p;
      guiltyCounts = Object.fromEntries(
        Object.entries(g).filter(([h]) => h === c.plaintiff || h === c.defendant),
      );
    } catch (error) {
      // A failed memory read means no citations. It never blocks the trial or invents a precedent.
      this.services.log('memory lookup failed, continuing without precedents', error);
    }
    // Votes and reactions are deliberately absent. The jury is entertainment only.
    return {
      caseTitle: c.title,
      grievance: c.grievance,
      phase: spec.phase,
      transcript,
      toneDial: c.toneDial,
      precedents,
      guiltyCounts,
      parties: { plaintiff: c.plaintiff, defendant: c.defendant },
      ...(spec.target ? { target: spec.target } : {}),
      ...(spec.turnKind ? { turnKind: spec.turnKind } : {}),
      ...(c.sentenceRequest ? { sentenceRequest: c.sentenceRequest } : {}),
    };
  }

  private fallbackTurn(c: CaseRecord, spec: JudgeSpec): TurnResult {
    const output = fallbackFor(spec.phase, spec.target, spec.turnKind);
    return {
      kind: 'judge',
      output,
      toneDial: c.toneDial,
      event: {
        type: 'judge',
        speech: output.speech,
        face: output.face,
        sfx: output.sfx,
        toneDial: c.toneDial,
        audioUrl: null,
        verdict: output.verdict,
      },
    };
  }

  /** Run one judge turn and commit it only if the case has not moved on. Never throws. */
  private async judgeStep(id: string, spec: JudgeSpec): Promise<'ok' | 'stale' | 'safety'> {
    const c = await this.store.getCase(id);
    if (!c || c.status !== 'live') return 'stale';
    const epoch = c.epoch;
    let turn: TurnResult;
    try {
      turn = await this.services.judgeTurn(await this.buildInput(c, spec), {
        isNewArguerMessage: spec.isNew,
      });
    } catch (error) {
      this.services.log('judge turn failed, using the scripted fallback', error);
      turn = this.fallbackTurn(c, spec);
    }
    return this.lock(id, async () => {
      const cur = await this.store.getCase(id);
      if (!cur || cur.epoch !== epoch || cur.status !== 'live' || cur.safetyClosed) return 'stale' as const;
      if (turn.kind === 'safety') {
        await this.safetyCloseLocked(cur, 'judge');
        return 'safety' as const;
      }
      await this.commitJudgeLocked(cur, turn, spec);
      return 'ok' as const;
    });
  }

  private async commitJudgeLocked(c: CaseRecord, turn: Extract<TurnResult, { kind: 'judge' }>, spec: JudgeSpec) {
    const out = turn.output;
    await this.store.addJudgeTurn({
      id: newId('turn'),
      caseId: c.id,
      phase: out.phase,
      toneScore: out.tone_score,
      dialAfter: turn.toneDial,
      speech: out.speech,
      target: out.target,
      face: out.face,
      sfx: out.sfx,
      hasVerdict: out.verdict !== null,
      raw: out,
      createdAt: this.iso(),
    });
    await this.store.updateCase(c.id, { toneDial: turn.toneDial });
    if (spec.phase === 'verdict') {
      await this.commitVerdictLocked(c, turn, out.verdict);
      return;
    }
    this.bus.publish(c.id, turn.event);
  }

  private async commitVerdictLocked(
    c: CaseRecord,
    turn: Extract<TurnResult, { kind: 'judge' }>,
    verdict: JudgeOutput['verdict'],
  ) {
    const final = verdict ?? fallbackFor('verdict').verdict!;
    const tally = await this.tally(c);
    this.cancelTimers(c.id);
    await this.store.saveVerdict({
      caseId: c.id,
      ruling: final.ruling,
      findings: final.findings,
      sentence: final.sentence,
      headline: final.headline,
      citedPrecedent: final.cited_precedent,
      juryGuiltyPct: tally.guiltyPct,
      kind: 'judge',
      createdAt: this.iso(),
    });
    await this.store.updateCase(c.id, {
      status: 'verdict',
      phase: 'verdict',
      activeRole: null,
      timerEndsAt: null,
      juryLocked: true,
      epoch: c.epoch + 1,
      closedAt: this.iso(),
    });
    await this.publishJury({ ...c, juryLocked: true });
    this.bus.publish(c.id, { ...turn.event, verdict: final });
    this.bus.publish(c.id, { type: 'state', phase: 'verdict', activeRole: null, timerEndsAt: null });
    this.closeLaterUntracked(c.id);
  }

  /** The auto close wait is long lived, so it must not be tracked (settled() would wait for it). */
  private closeLaterUntracked(id: string) {
    this.closeLater(id).catch((error) => this.services.log(`auto close failed for ${id}`, error));
  }

  private async closeLater(id: string) {
    if (!(await this.sleep(id, this.options.closeAfterMs, 'close'))) return;
    await this.lock(id, async () => {
      const c = await this.store.getCase(id);
      if (c && c.status === 'verdict') {
        await this.store.updateCase(id, { status: 'closed' });
        void this.services.endVideo?.(id);
      }
    });
  }

  // ------------------------------------------------------------------ safety

  /** Close a case privately. Caller holds the lock. Idempotent. */
  private async safetyCloseLocked(c: CaseRecord, source: 'filter' | 'judge' | 'report') {
    if (c.safetyClosed) return;
    this.cancelTimers(c.id);
    await this.store.updateCase(c.id, {
      status: 'closed',
      safetyClosed: true,
      listed: false,
      activeRole: null,
      timerEndsAt: null,
      juryLocked: true,
      epoch: c.epoch + 1,
      stepId: c.stepId + 1,
      closedAt: this.iso(),
    });
    this.services.log(`case ${c.number} closed for safety (${source})`);
    void this.services.endVideo?.(c.id);
    // The fixed copy only. The judge's internal safety reason is never public.
    this.bus.publish(c.id, { type: 'safety', reason: SAFETY_REASON });
    this.bus.closeWhere(c.id, (h) => h !== c.plaintiff && h !== c.defendant);
  }

  async report(user: User, id: string, rawReason: unknown): Promise<{ ok: true }> {
    const reason = redact(
      cleanText(rawReason ?? 'not_funny', SERVER_CONFIG.maxReasonChars, 'Reason', false) || 'not_funny',
    );
    return this.lock(id, async () => {
      const c = await this.store.getCase(id);
      if (!c) throw notFound('Case not found');
      const arguer = this.roleOf(c, user.handle);
      if (!arguer && !(c.listed && !c.safetyClosed)) throw notFound('Case not found');
      if (c.safetyClosed) return { ok: true as const };
      const reports = await this.store.getReports(id);
      if (!reports.some((r) => r.reporter === user.handle))
        await this.store.addReport({
          id: newId('report'),
          caseId: id,
          reporter: user.handle,
          reason,
          createdAt: this.iso(),
        });
      const reporters = new Set([...reports.map((r) => r.reporter), user.handle]);
      if (arguer || reporters.size >= CONFIG.limits.reportsToClose) await this.safetyCloseLocked(c, 'report');
      return { ok: true as const };
    });
  }

  // -------------------------------------------------------------- default judgment

  private handlePresence(caseId: string, handle: string, connections: number) {
    this.track(
      caseId,
      (async () => {
        const c = await this.store.getCase(caseId);
        if (!c || c.safetyClosed) return;
        if (!this.roleOf(c, handle)) {
          if (c.listed && c.status !== 'closed') await this.publishJury(c);
          return;
        }
        // Tell the room when an arguer drops or comes back, so the bobblehead can grey out.
        const arguer = this.roleOf(c, handle);
        if (arguer && c.status !== 'closed')
          this.bus.publish(caseId, { type: 'presence', role: arguer, present: connections > 0 });
        if (c.status !== 'live') return;
        if (connections > 0) {
          this.cancelTimers(caseId, `grace:${handle}`);
          return;
        }
        await this.armGrace(caseId, handle);
      })(),
    );
  }

  private async armGrace(id: string, handle: string) {
    const fired = await this.sleep(id, this.ms(CONFIG.timers.disconnectGraceSec), `grace:${handle}`);
    if (!fired) return;
    const first = await this.store.getCase(id);
    if (!first || first.status !== 'live' || this.isPresent(first, handle)) return;
    const gone = this.roleOf(first, handle)!;
    const winner = gone === 'plaintiff' ? first.defendant : first.plaintiff;
    const seconds = CONFIG.timers.disconnectGraceSec;
    const speech = `The court waited ${seconds} seconds for @${handle} to return. @${handle} did not, so judgment by default goes to @${winner}. Court is adjourned.`;
    const audioUrl = await this.withTimeout(
      this.services.speak(speech, first.toneDial, 'verdict').then((r) => r.audioUrl),
      CONFIG.voice.ttsTimeoutMs,
    ).catch(() => null);
    await this.lock(id, async () => {
      const c = await this.store.getCase(id);
      if (!c || c.epoch !== first.epoch || c.status !== 'live' || this.isPresent(c, handle)) return;
      const verdict: NonNullable<JudgeOutput['verdict']> = {
        ruling: gone === 'defendant' ? 'guilty' : 'not_guilty',
        findings: [
          `@${handle} left the courtroom and did not return within ${seconds} seconds.`,
          'The court made no finding on the underlying dispute.',
        ],
        sentence: null,
        headline: `Default judgment for @${winner}`,
        cited_precedent: null,
      };
      this.cancelTimers(id);
      const tally = await this.tally(c);
      await this.store.addJudgeTurn({
        id: newId('turn'),
        caseId: id,
        phase: 'verdict',
        toneScore: c.toneDial,
        dialAfter: c.toneDial,
        speech,
        target: 'room',
        face: 'amused',
        sfx: 'gavel',
        hasVerdict: true,
        raw: { default: true },
        createdAt: this.iso(),
      });
      await this.store.saveVerdict({
        caseId: id,
        ruling: verdict.ruling,
        findings: verdict.findings,
        sentence: null,
        headline: verdict.headline,
        citedPrecedent: null,
        juryGuiltyPct: tally.guiltyPct,
        kind: 'default',
        createdAt: this.iso(),
      });
      await this.store.updateCase(id, {
        status: 'verdict',
        phase: 'verdict',
        activeRole: null,
        timerEndsAt: null,
        juryLocked: true,
        epoch: c.epoch + 1,
        stepId: c.stepId + 1,
        closedAt: this.iso(),
      });
      await this.publishJury({ ...c, juryLocked: true });
      this.bus.publish(id, {
        type: 'judge',
        speech,
        face: 'amused',
        sfx: 'gavel',
        toneDial: c.toneDial,
        audioUrl,
        verdict,
      });
      this.bus.publish(id, { type: 'state', phase: 'verdict', activeRole: null, timerEndsAt: null });
      this.closeLaterUntracked(id);
    });
  }

  // --------------------------------------------------------------- jury, votes

  private async jurors(c: CaseRecord): Promise<ParticipantRecord[]> {
    return (await this.store.getParticipants(c.id)).filter((p) => p.role === 'juror');
  }

  private async tally(c: CaseRecord) {
    const jurorHandles = new Set((await this.jurors(c)).map((j) => j.handle));
    const votes = await this.store.getVotes(c.id);
    let guilty = 0;
    let notGuilty = 0;
    for (const [handle, vote] of Object.entries(votes)) {
      if (!jurorHandles.has(handle)) continue;
      if (vote === 'guilty') guilty++;
      else notGuilty++;
    }
    return { guilty, notGuilty, ...pct(guilty, notGuilty) };
  }

  private async juryEvent(c: CaseRecord): Promise<Extract<RoomEvent, { type: 'jury' }>> {
    const seated = await this.jurors(c);
    const tally = await this.tally(c);
    const jurors: Juror[] = seated
      .slice(0, CONFIG.limits.jurySeats)
      .map((j) => ({ handle: j.handle, headImageUrl: j.headImageUrl }));
    const watching = this.bus.viewers(c.id, [c.plaintiff, c.defendant]).length;
    return {
      type: 'jury',
      guiltyPct: tally.guiltyPct,
      notGuiltyPct: tally.notGuiltyPct,
      viewers: Math.max(watching, seated.length),
      jurors,
    };
  }

  private async publishJury(c: CaseRecord) {
    this.bus.publish(c.id, await this.juryEvent(c));
  }

  async join(user: User, id: string): Promise<{ ok: true; seated: boolean; seat: number | null }> {
    return this.lock(id, async () => {
      const c = await this.visibleCase(id, user.handle);
      if (this.roleOf(c, user.handle)) throw conflict('Arguers already have a seat', 'arguer');
      if (c.status !== 'accepted' && c.status !== 'live')
        throw conflict('This trial is not taking jurors right now', 'not_open');
      const jurors = await this.jurors(c);
      const existing = jurors.findIndex((j) => j.handle === user.handle);
      if (existing >= 0) return { ok: true as const, seated: true, seat: existing + 1 };
      if (jurors.length >= CONFIG.limits.jurySeats) return { ok: true as const, seated: false, seat: null };
      await this.store.addParticipant({
        caseId: id,
        handle: user.handle,
        role: 'juror',
        headImageUrl: await this.headFor(user.handle),
        joinedAt: this.iso(),
      });
      await this.publishJury(c);
      return { ok: true as const, seated: true, seat: jurors.length + 1 };
    });
  }

  async vote(user: User, id: string, vote: unknown): Promise<{ ok: true }> {
    if (vote !== 'guilty' && vote !== 'not_guilty') throw badRequest('Vote guilty or not_guilty', 'bad_vote');
    return this.lock(id, async () => {
      const c = await this.visibleCase(id, user.handle);
      if (!(await this.jurors(c)).some((j) => j.handle === user.handle))
        throw forbidden('Take a jury seat to vote');
      if (c.status !== 'live' || c.juryLocked) throw conflict('Voting is closed', 'voting_closed');
      await this.store.setVote(id, user.handle, vote as Vote);
      await this.publishJury(c);
      return { ok: true as const };
    });
  }

  async react(user: User, id: string, kind: unknown): Promise<{ ok: true }> {
    if (typeof kind !== 'string' || !(REACTIONS as readonly string[]).includes(kind))
      throw badRequest('Unknown reaction', 'bad_reaction');
    const c = await this.visibleCase(id, user.handle);
    if (c.safetyClosed || c.status === 'closed' || c.status === 'filed')
      throw conflict('Reactions are closed', 'not_open');
    if (!this.limiter.cooldown(`react:${id}:${user.handle}`, CONFIG.limits.reactionCooldownMs))
      throw tooMany('One reaction every couple of seconds');
    await this.store.addReaction({
      id: newId('react'),
      caseId: id,
      handle: user.handle,
      kind: kind as Reaction,
      createdAt: this.iso(),
    });
    this.bus.publish(id, { type: 'reaction', kind: kind as Reaction, fromHandle: user.handle });
    return { ok: true };
  }

  // -------------------------------------------------------------------- reads

  async view(user: User, id: string): Promise<CaseView> {
    const c = await this.visibleCase(id, user.handle);
    this.touch(id, user.handle);
    const role = this.roleOf(c, user.handle);
    const base = {
      id: c.id,
      number: c.number,
      groupId: c.groupId,
      you: { handle: user.handle, role },
    };
    if (c.safetyClosed) {
      // Verdict free summary, arguers only (visibleCase already hid it from everyone else).
      const held = role
        ? (await this.store.getMessages(id)).filter((m) => m.hidden).map(toMessage)
        : [];
      return {
        ...base,
        title: '',
        grievance: '',
        sentenceRequest: null,
        status: 'closed',
        phase: c.phase,
        activeRole: null,
        timerEndsAt: null,
        toneDial: c.toneDial,
        listed: false,
        safetyClosed: true,
        plaintiff: { handle: c.plaintiff, headImageUrl: '' },
        defendant: { handle: c.defendant, headImageUrl: '' },
        present: { plaintiff: false, defendant: false },
        jurors: [],
        viewers: 0,
        jury: { guiltyPct: 0, notGuiltyPct: 0 },
        heldMessages: held,
      };
    }
    const participants = await this.store.getParticipants(id);
    const seat = (handle: string): Seat => ({
      handle,
      headImageUrl: participants.find((p) => p.handle === handle)?.headImageUrl ?? presetFor(handle),
    });
    const jury = await this.juryEvent(c);
    return {
      ...base,
      title: c.title,
      grievance: c.grievance,
      sentenceRequest: role ? c.sentenceRequest : null,
      status: c.status,
      phase: c.phase,
      activeRole: c.activeRole,
      timerEndsAt: c.timerEndsAt,
      toneDial: c.toneDial,
      listed: c.listed,
      safetyClosed: false,
      plaintiff: seat(c.plaintiff),
      defendant: participants.some((p) => p.handle === c.defendant) ? seat(c.defendant) : null,
      present: { plaintiff: this.isPresent(c, c.plaintiff), defendant: this.isPresent(c, c.defendant) },
      jurors: jury.jurors,
      viewers: jury.viewers,
      jury: { guiltyPct: jury.guiltyPct, notGuiltyPct: jury.notGuiltyPct },
      heldMessages: [],
    };
  }

  async docket(): Promise<DocketEntry[]> {
    const cases = (await this.store.listCases()).filter(
      (c) => c.listed && !c.safetyClosed && (c.status === 'accepted' || c.status === 'live'),
    );
    const entries = cases.map((c) => {
      const viewers = this.bus.viewers(c.id, [c.plaintiff, c.defendant]).length;
      const firstSentence = c.grievance.split(/(?<=[.!?])\s/)[0] ?? c.grievance;
      return {
        sortKey: c.createdAt,
        entry: {
          id: c.id,
          number: c.number,
          category: categoryFor(`${c.title} ${c.grievance}`),
          blurb: firstSentence.length > 110 ? `${firstSentence.slice(0, 107)}...` : firstSentence,
          title: c.title,
          tone: c.toneDial,
          viewers,
          status: (c.status === 'live' ? 'live' : 'accepted') as 'live' | 'accepted',
          plaintiff: c.plaintiff,
          defendant: c.defendant,
        },
      };
    });
    return entries
      .sort((a, b) => b.entry.viewers - a.entry.viewers || b.sortKey.localeCompare(a.sortKey))
      .map((e) => e.entry);
  }

  /** The events a new subscriber needs to draw the room. Audio and effects are stripped so nothing replays. */
  private async snapshotEvents(c: CaseRecord): Promise<RoomEvent[]> {
    if (c.safetyClosed) return [{ type: 'safety', reason: SAFETY_REASON }];
    const events: RoomEvent[] = [
      { type: 'state', phase: c.phase, activeRole: c.activeRole, timerEndsAt: c.timerEndsAt },
    ];
    for (const m of (await this.store.getMessages(c.id)).filter((m) => !m.hidden))
      events.push({ type: 'message', message: toMessage(m) });
    events.push(await this.juryEvent(c));
    if (c.status === 'live')
      for (const role of ['plaintiff', 'defendant'] as const)
        if (!this.isPresent(c, role === 'plaintiff' ? c.plaintiff : c.defendant))
          events.push({ type: 'presence', role, present: false });
    const turns = await this.store.getJudgeTurns(c.id);
    const last = turns.at(-1);
    if (last) {
      const v = last.hasVerdict ? await this.store.getVerdict(c.id) : undefined;
      events.push({
        type: 'judge',
        speech: last.speech,
        face: last.face,
        sfx: 'none',
        toneDial: last.dialAfter,
        audioUrl: null,
        verdict: v
          ? {
              ruling: v.ruling,
              findings: v.findings,
              sentence: v.sentence,
              headline: v.headline,
              cited_precedent: v.citedPrecedent,
            }
          : null,
      });
    }
    return events;
  }

  /**
   * Attach a realtime subscriber. Returns a function that detaches it. `lastEventId` resumes a dropped
   * stream without a gap. Without it the subscriber first receives a snapshot of the room.
   */
  async openStream(
    user: User,
    id: string,
    sink: { send(frame: Frame): void; close(): void },
    lastEventId?: number,
  ): Promise<() => void> {
    const c = await this.visibleCase(id, user.handle);
    if (this.bus.connections(id, user.handle) >= SERVER_CONFIG.maxConnectionsPerUserPerCase)
      throw tooMany('Too many open connections to this case');
    this.touch(id, user.handle);
    const attachment = this.bus.attach(id, { handle: user.handle, send: sink.send, close: sink.close });
    try {
      const replay = lastEventId === undefined ? null : this.bus.replaySince(id, lastEventId);
      if (replay && !c.safetyClosed) {
        attachment.ready(replay);
      } else {
        const seq = this.bus.currentSeq(id);
        const fresh = (await this.store.getCase(id)) ?? c;
        attachment.ready((await this.snapshotEvents(fresh)).map((event) => ({ id: seq, event })));
      }
    } catch (error) {
      attachment.detach();
      throw error;
    }
    return attachment.detach;
  }

  // ----------------------------------------------------------- groups, memory

  private async completedCases(groupId: string): Promise<MemoryCase[]> {
    const out: MemoryCase[] = [];
    for (const c of await this.store.listCases()) {
      if (c.groupId !== groupId || c.safetyClosed) continue;
      if (c.status !== 'verdict' && c.status !== 'closed') continue;
      const v = await this.store.getVerdict(c.id);
      // Walk-out defaults carry no real finding, so they never become precedent or leaderboard points.
      if (!v || v.kind !== 'judge') continue;
      out.push({
        id: c.id,
        groupId: c.groupId,
        title: c.title,
        plaintiff: c.plaintiff,
        defendant: c.defendant,
        ruling: v.ruling,
        summary: v.findings.join(' ').slice(0, JUDGE_CONFIG.maxSummaryChars),
        closedAt: c.closedAt,
        safetyClosed: false,
      });
    }
    return out;
  }

  private async memberGroup(user: User, groupId: string) {
    const g = await this.store.getGroup(groupId);
    if (!g || !g.members.includes(user.handle)) throw notFound('Group not found');
    return g;
  }

  /** The groups this user has a case in (a group is created the first time two people face each other). */
  async myGroups(user: User): Promise<Array<{ id: string; name: string }>> {
    const ids = new Set<string>();
    for (const c of await this.store.listCases())
      if (c.plaintiff === user.handle || c.defendant === user.handle) ids.add(c.groupId);
    const out: Array<{ id: string; name: string }> = [];
    for (const id of ids) {
      const g = await this.store.getGroup(id);
      if (g && g.members.includes(user.handle)) out.push({ id: g.id, name: g.name });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async history(user: User, groupId: string) {
    await this.memberGroup(user, groupId);
    const cases = await this.completedCases(groupId);
    const verdicts = await Promise.all(cases.map((c) => this.store.getVerdict(c.id)));
    return cases
      .map((c, i) => ({
        id: c.id,
        title: c.title,
        plaintiff: c.plaintiff,
        defendant: c.defendant,
        ruling: c.ruling,
        headline: verdicts[i]?.headline ?? '',
        summary: c.summary,
        closedAt: c.closedAt,
      }))
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
  }

  async leaderboard(user: User, groupId: string) {
    await this.memberGroup(user, groupId);
    const counts = await getGuiltyCounts(this.memory, groupId);
    return Object.entries(counts)
      .map(([handle, guilty]) => ({
        handle,
        guilty,
        habitualOffender: guilty >= CONFIG.limits.habitualOffenderGuilty,
      }))
      .sort((a, b) => b.guilty - a.guilty || a.handle.localeCompare(b.handle));
  }

  // -------------------------------------------------------------- media hooks

  /**
   * Data for Part 4's verdict card. Throws unless the case has a final judge ruling, is not safety closed and
   * was public (listed). The media adapter has no request, so access is decided by the case state alone.
   */
  async verdictCardData(caseId: string): Promise<VerdictCardData> {
    const c = await this.store.getCase(caseId);
    if (!c || c.safetyClosed || !c.listed || (c.status !== 'verdict' && c.status !== 'closed'))
      throw notFound('Verdict not available');
    const v = await this.store.getVerdict(caseId);
    if (!v) throw notFound('Verdict not available');
    return {
      caseId: c.id,
      caseNumber: c.number,
      title: c.title,
      plaintiff: c.plaintiff,
      defendant: c.defendant,
      ruling: v.ruling,
      headline: v.headline,
      sentence: v.sentence,
      toneDial: c.toneDial,
      juryGuiltyPct: v.juryGuiltyPct,
      safetyClosed: false,
    };
  }

  /** True only for speech that was actually spoken by the judge in a case this user may see. */
  async authorizeSpeech(user: User, speech: { text: string; toneDial: number; kind: SpeechKind }) {
    if (!this.limiter.take(`tts:${user.handle}`, SERVER_CONFIG.ttsPerMinute, 60_000)) return false;
    const band = voiceSettingsFor(speech.toneDial).upTo;
    for (const turn of await this.store.findJudgeTurnsBySpeech(speech.text)) {
      if ((turn.hasVerdict ? 'verdict' : 'quick') !== speech.kind) continue;
      if (voiceSettingsFor(turn.dialAfter).upTo !== band) continue;
      try {
        await this.visibleCase(turn.caseId, user.handle);
        return true;
      } catch {
        // not visible to this user, try the next match
      }
    }
    return false;
  }

  /** Who may join the video room: the two arguers, while the case is waiting or live. Everyone else gets a 404. */
  async videoAccess(user: User, id: string): Promise<{ role: 'plaintiff' | 'defendant' }> {
    const c = await this.store.getCase(id);
    const role = c ? this.roleOf(c, user.handle) : null;
    if (!c || !role) throw notFound('Case not found');
    if (c.safetyClosed || (c.status !== 'accepted' && c.status !== 'live'))
      throw conflict('Video is only available while court is in session', 'closed');
    if (!this.limiter.take(`video:${user.handle}`, 10, 60_000)) throw tooMany();
    return { role };
  }

  allowAvatarUpload(user: User): boolean {
    return this.limiter.take(`avatar:${user.handle}`, SERVER_CONFIG.avatarPerMinute, 60_000);
  }

  /** Test and ops helper. */
  async getJudgeTurns(id: string): Promise<JudgeTurnRecord[]> {
    return this.store.getJudgeTurns(id);
  }
}
