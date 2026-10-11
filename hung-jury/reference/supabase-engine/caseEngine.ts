// The case state machine and the message pipeline. The server owns every
// phase change and every timer; clients only render RoomEvents. See
// Overview / Part 2 Backend docs for the spec, and docs/INTEGRATION.md for
// the Part 3/4 handoff this now wires in.

import { CONFIG } from '@/contracts/config';
import type { JudgeInput, Message, Phase, Role, RoomEvent } from '@/contracts/types';
import { prepareText, judgeTurnWithMedia, type TurnResult } from '@/integration';
import { getPrecedents, getGuiltyCounts } from '@/judge/memory';
import { getServiceClient } from './db/client';
import { broadcastEvent } from './realtime/broadcast';

const PHASE_ORDER: Phase[] = ['opening', 'statements', 'cross', 'rebuttal', 'closing', 'verdict'];

export function nextPhase(phase: Phase): Phase | null {
  const i = PHASE_ORDER.indexOf(phase);
  if (i === -1 || i === PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[i + 1];
}

export function timerSecondsFor(phase: Phase): number {
  switch (phase) {
    case 'opening':
      return CONFIG.timers.openingSec;
    case 'statements':
      return CONFIG.timers.statementSec;
    case 'cross':
      return CONFIG.timers.answerSec;
    case 'rebuttal':
      return CONFIG.timers.rebuttalSec;
    case 'closing':
      return CONFIG.timers.closingSec;
    case 'verdict':
      return CONFIG.timers.voteCountdownSec;
  }
}

function timerEndsAt(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

interface CaseRow {
  id: string;
  group_id: string;
  title: string;
  grievance: string;
  filer_id: string;
  defendant_id: string | null;
  status: string;
  phase: Phase | null;
  tone_dial: number;
  turn_index: number;
  active_role: Role | 'judge' | null;
  cross_question_index: number;
}

async function getCase(caseId: string): Promise<CaseRow> {
  const db = getServiceClient();
  const { data, error } = await db.from('cases').select('*').eq('id', caseId).single();
  if (error || !data) throw new Error(`case not found: ${caseId} (${error?.message ?? 'no row'})`);
  return data as CaseRow;
}

async function getParties(caseCase: CaseRow): Promise<{ plaintiff: string; defendant: string } | undefined> {
  if (!caseCase.defendant_id) return undefined;
  const db = getServiceClient();
  const { data } = await db
    .from('profiles')
    .select('id, handle')
    .in('id', [caseCase.filer_id, caseCase.defendant_id]);
  const byId = new Map((data ?? []).map((p) => [p.id, p.handle]));
  const plaintiff = byId.get(caseCase.filer_id);
  const defendant = byId.get(caseCase.defendant_id);
  if (!plaintiff || !defendant) return undefined;
  return { plaintiff, defendant };
}

async function getTranscript(caseCase: CaseRow): Promise<Message[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('messages')
    .select('id, case_id, author_id, kind, text, created_at, profiles:author_id(handle)')
    .eq('case_id', caseCase.id)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`failed to load transcript: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    caseId: row.case_id,
    authorHandle: row.profiles?.handle ?? 'unknown',
    role: row.author_id === caseCase.filer_id ? 'plaintiff' : 'defendant',
    kind: row.kind,
    text: row.text,
    createdAt: row.created_at,
  }));
}

async function buildJudgeInput(
  caseCase: CaseRow,
  phase: Phase,
  extra: { target?: 'plaintiff' | 'defendant'; turnKind?: 'default' | 'reaction' } = {},
): Promise<JudgeInput> {
  const db = getServiceClient();
  const [transcript, parties, precedents, guiltyCounts] = await Promise.all([
    getTranscript(caseCase),
    getParties(caseCase),
    getPrecedents(db, caseCase.group_id, []).catch(() => []),
    getGuiltyCounts(db, caseCase.group_id).catch(() => ({}) as Record<string, number>),
  ]);
  return {
    caseTitle: caseCase.title,
    grievance: caseCase.grievance,
    phase,
    transcript,
    toneDial: caseCase.tone_dial,
    precedents,
    guiltyCounts,
    parties,
    ...extra,
  };
}

/**
 * Runs one judge turn through the Part 3/4 integration helper
 * (judgeTurnWithMedia): filters/redacts the prepared input, calls the judge,
 * applies the tone dial only when isNewArguerMessage, requests voice within
 * budget, and never writes/broadcasts itself. This function does the
 * writing/broadcasting the helper deliberately leaves to the backend.
 */
async function applyTurn(caseCase: CaseRow, result: TurnResult): Promise<void> {
  const db = getServiceClient();

  if (result.kind === 'safety') {
    // Log the model's internal safety reason for replay/debugging; it is
    // never shown to users (docs/BACKEND-HANDOFF.md: "Do not use returned
    // internal safety_reason as public crisis copy"). RLS already restricts
    // judge_turns on a safety-closed case to the two arguers.
    await db.from('judge_turns').insert({
      case_id: caseCase.id,
      phase: caseCase.phase ?? 'statements',
      tone_score: result.output.tone_score,
      dial_after: caseCase.tone_dial,
      speech: result.output.speech,
      target: result.output.target,
      face: result.output.face,
      sfx: result.output.sfx,
      raw_json: result.output,
    });
    await closeForSafety(caseCase.id, result.output.safety_reason ?? 'flagged by the judge');
    return;
  }

  const { output, toneDial, event } = result;

  await db.from('judge_turns').insert({
    case_id: caseCase.id,
    phase: caseCase.phase ?? 'statements',
    tone_score: output.tone_score,
    dial_after: toneDial,
    speech: output.speech,
    target: output.target,
    face: output.face,
    sfx: output.sfx,
    raw_json: output,
  });

  if (output.verdict) {
    const juryGuiltyPct = await computeJuryTally(caseCase.id);
    await db.from('verdicts').upsert({
      case_id: caseCase.id,
      ruling: output.verdict.ruling,
      findings: output.verdict.findings,
      sentence: output.verdict.sentence,
      headline: output.verdict.headline,
      cited_precedent: output.verdict.cited_precedent,
      jury_guilty_pct: juryGuiltyPct,
    });
  }

  await db.from('cases').update({ tone_dial: toneDial }).eq('id', caseCase.id);
  await broadcastEvent(caseCase.id, event);

  if (output.verdict) {
    await db
      .from('cases')
      .update({ status: 'verdict', closed_at: new Date().toISOString() })
      .eq('id', caseCase.id);
    await broadcastEvent(caseCase.id, { type: 'state', phase: 'verdict', activeRole: null, timerEndsAt: null });
  }
}

/** Guilty share of votes cast so far, 0-100. Jury votes never reach the judge. */
async function computeJuryTally(caseId: string): Promise<number> {
  const db = getServiceClient();
  const { data: tally } = await db.from('votes').select('vote').eq('case_id', caseId);
  const total = tally?.length ?? 0;
  if (total === 0) return 0;
  const guilty = tally!.filter((v) => v.vote === 'guilty').length;
  return Math.round((guilty / total) * 100);
}

async function askCrossQuestion(caseCase: CaseRow, target: 'plaintiff' | 'defendant'): Promise<void> {
  const input = await buildJudgeInput(caseCase, 'cross', { target, turnKind: 'default' });
  const result = await judgeTurnWithMedia(input, { isNewArguerMessage: false });
  await applyTurn(caseCase, result);
  if (result.kind === 'judge') {
    const seconds = timerSecondsFor('cross');
    const endsAt = timerEndsAt(seconds);
    const db = getServiceClient();
    await db.from('cases').update({ active_role: target, timer_ends_at: endsAt }).eq('id', caseCase.id);
    await broadcastEvent(caseCase.id, { type: 'state', phase: 'cross', activeRole: target, timerEndsAt: endsAt });
  }
}

/** POST /api/cases/:id/start — runs the opening judge turn. */
export async function startTrial(caseCase: CaseRow): Promise<void> {
  const input = await buildJudgeInput(caseCase, 'opening');
  const result = await judgeTurnWithMedia(input, { isNewArguerMessage: false });
  await applyTurn(caseCase, result);
  if (result.kind === 'judge') {
    const upcoming = nextPhase('opening')!; // 'statements'
    const seconds = timerSecondsFor(upcoming);
    const endsAt = timerEndsAt(seconds);
    const db = getServiceClient();
    await db.from('cases').update({ phase: upcoming, active_role: 'plaintiff', timer_ends_at: endsAt }).eq('id', caseCase.id);
    await broadcastEvent(caseCase.id, { type: 'state', phase: upcoming, activeRole: 'plaintiff', timerEndsAt: endsAt });
  }
}

export async function closeForSafety(caseId: string, internalReason: string): Promise<void> {
  const db = getServiceClient();
  await db
    .from('cases')
    .update({ status: 'closed', safety_closed: true, closed_at: new Date().toISOString(), listed: false })
    .eq('id', caseId);
  // Fixed, pre-written copy only; the model's internal reason never reaches
  // users (see SAFETY_COPY in src/contracts/config.ts).
  const { SAFETY_COPY } = await import('@/contracts/config');
  await broadcastEvent(caseId, { type: 'safety', reason: SAFETY_COPY.threatOrAbuseMessage });
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`[safety] case ${caseId} closed: ${internalReason}`);
  }
}

/**
 * The POST /api/cases/:id/message pipeline (Part 2 Backend doc, "Message
 * pipeline"). Idempotent on clientMessageId so a double tap cannot create
 * two messages or two judge calls.
 */
export async function postMessage(params: {
  caseId: string;
  authorId: string;
  text: string;
  clientMessageId: string;
  kind: 'statement' | 'answer' | 'closing';
}): Promise<{ messageId: string; deduped: boolean }> {
  const { caseId, authorId, text, clientMessageId, kind } = params;
  const db = getServiceClient();

  const caseCase = await getCase(caseId);
  const charLimit = kind === 'answer' ? CONFIG.limits.answerChars : CONFIG.limits.statementChars;
  if (text.length > charLimit) {
    throw new Error(`message exceeds ${charLimit} characters`);
  }

  const prepared = prepareText(text);
  if (!prepared.ok) {
    await closeForSafety(caseId, `pre-filter: ${prepared.category}`);
    throw new SafetyHoldError(prepared.category);
  }
  const redacted = prepared.text;

  // Idempotent insert: a (case_id, author_id, client_message_id) unique
  // constraint means a retried request returns the existing row instead of
  // inserting a duplicate or calling the judge twice.
  const { data: existing } = await db
    .from('messages')
    .select('id')
    .eq('case_id', caseId)
    .eq('author_id', authorId)
    .eq('client_message_id', clientMessageId)
    .maybeSingle();

  if (existing) {
    return { messageId: existing.id, deduped: true };
  }

  const { data: inserted, error: insertErr } = await db
    .from('messages')
    .insert({ case_id: caseId, author_id: authorId, kind, text: redacted, client_message_id: clientMessageId })
    .select('id, created_at')
    .single();
  if (insertErr || !inserted) {
    throw new Error(`failed to store message: ${insertErr?.message ?? 'no row returned'}`);
  }

  const { data: profile } = await db.from('profiles').select('handle').eq('id', authorId).single();
  const role: Role = authorId === caseCase.filer_id ? 'plaintiff' : 'defendant';

  const messageEvent: RoomEvent = {
    type: 'message',
    message: {
      id: inserted.id,
      caseId,
      authorHandle: profile?.handle ?? 'unknown',
      role,
      kind,
      text: redacted,
      createdAt: inserted.created_at,
    },
  };
  await broadcastEvent(caseId, messageEvent);

  const phase = caseCase.phase ?? 'statements';

  if (phase === 'cross') {
    // The message is an answer to the judge's question: score it as a
    // reaction, then either ask the next cross question or advance.
    const input = await buildJudgeInput(caseCase, 'cross', { turnKind: 'reaction' });
    const result = await judgeTurnWithMedia(input, { isNewArguerMessage: true });
    await applyTurn(caseCase, result);
    if (result.kind === 'judge') {
      const nextIndex = caseCase.cross_question_index + 1;
      const totalQuestions = CONFIG.limits.followUpsPerSide * 2;
      await db.from('cases').update({ cross_question_index: nextIndex, tone_dial: result.toneDial }).eq('id', caseId);
      if (nextIndex < totalQuestions) {
        const target: 'plaintiff' | 'defendant' = nextIndex % 2 === 0 ? 'plaintiff' : 'defendant';
        const updated = await getCase(caseId);
        await askCrossQuestion(updated, target);
      } else {
        await advancePhase(await getCase(caseId));
      }
    }
    return { messageId: inserted.id, deduped: false };
  }

  // statements / rebuttal / closing: react to the new message, then advance.
  const input = await buildJudgeInput(caseCase, phase);
  const result = await judgeTurnWithMedia(input, { isNewArguerMessage: true });
  await applyTurn(caseCase, result);
  if (result.kind === 'judge') {
    await advancePhase(await getCase(caseId));
  }

  return { messageId: inserted.id, deduped: false };
}

/** Moves the case to the next phase, kicking off whatever that phase needs. */
async function advancePhase(caseCase: CaseRow): Promise<void> {
  const db = getServiceClient();
  const current = caseCase.phase ?? 'statements';
  const upcoming = nextPhase(current);
  if (!upcoming) return;

  if (upcoming === 'cross') {
    await db.from('cases').update({ phase: 'cross', cross_question_index: 0 }).eq('id', caseCase.id);
    await askCrossQuestion({ ...caseCase, phase: 'cross', cross_question_index: 0 }, 'plaintiff');
    return;
  }

  const seconds = timerSecondsFor(upcoming);
  const endsAt = timerEndsAt(seconds);
  const activeRole = upcoming === 'verdict' ? 'judge' : 'plaintiff';
  await db.from('cases').update({ phase: upcoming, active_role: activeRole, timer_ends_at: endsAt }).eq('id', caseCase.id);
  await broadcastEvent(caseCase.id, { type: 'state', phase: upcoming, activeRole, timerEndsAt: endsAt });

  if (upcoming === 'verdict') {
    // Jury voting stays open through CONFIG.timers.voteCountdownSec (the
    // state event above already told clients when it ends); only once that
    // window has passed does the server close voting and ask the judge for
    // the ruling, so the stored tally reflects the full vote.
    setTimeout(() => {
      deliverVerdict(caseCase.id).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[verdict] case ${caseCase.id} failed to deliver:`, err);
      });
    }, seconds * 1000);
  }
}

/** Runs after the vote countdown: asks the judge for the verdict and stores the final tally. */
async function deliverVerdict(caseId: string): Promise<void> {
  const db = getServiceClient();
  const caseCase = await getCase(caseId);
  if (caseCase.status === 'closed') return; // safety-closed while voting was open
  const { data: existingVerdict } = await db.from('verdicts').select('case_id').eq('case_id', caseId).maybeSingle();
  if (existingVerdict) return; // already delivered
  const input = await buildJudgeInput(caseCase, 'verdict');
  const result = await judgeTurnWithMedia(input, { isNewArguerMessage: false });
  await applyTurn(caseCase, result);
}

export class SafetyHoldError extends Error {
  category?: string;
  constructor(category?: string) {
    super(`message held by the pre-filter: ${category ?? 'unspecified'}`);
    this.category = category;
  }
}
