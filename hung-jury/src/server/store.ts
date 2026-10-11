import type {
  AvatarKind,
  CaseStatus,
  Face,
  Message,
  Phase,
  Reaction,
  Role,
  Ruling,
  Sfx,
} from '@/contracts';

/**
 * The repository boundary. Everything the engine persists goes through this interface, and every
 * method is async, so a database implementation (Supabase, SQLite) can replace the in-memory one
 * without touching the engine. Part 2 ships the in-memory implementation only.
 */

export type Vote = 'guilty' | 'not_guilty';

export interface Profile {
  handle: string;
  /** Secret that proves ownership of the handle. null means the handle is unclaimed. */
  token: string | null;
  avatar: { kind: AvatarKind; headImageUrl: string } | null;
  createdAt: string;
  /** Supabase Auth user id bound to this handle (only set when HJ_AUTH=supabase). */
  authUserId?: string;
}

export interface GroupRecord {
  id: string;
  name: string;
  members: string[];
}

export type StepKind = 'opening' | 'speak' | 'question' | 'answer' | 'verdict';
export interface Step {
  kind: StepKind;
  phase: Phase;
  /** speak and answer: who talks. question: who is asked. */
  role?: 'plaintiff' | 'defendant';
}

export interface CaseRecord {
  id: string;
  number: string;
  groupId: string;
  title: string;
  grievance: string;
  sentenceRequest: string | null;
  plaintiff: string;
  defendant: string;
  status: CaseStatus;
  phase: Phase | 'waiting';
  activeRole: Role | 'judge' | null;
  timerEndsAt: string | null;
  toneDial: number;
  listed: boolean;
  safetyClosed: boolean;
  declined: boolean;
  /** Bumps on every transition. Async judge results from an older epoch are discarded. */
  epoch: number;
  /** Bumps whenever the current speaker's turn changes, so a late timer cannot act on a newer turn. */
  stepId: number;
  steps: Step[];
  stepIndex: number;
  juryLocked: boolean;
  createdAt: string;
  startedAt: string | null;
  closedAt: string | null;
}

export interface ParticipantRecord {
  caseId: string;
  handle: string;
  role: Role;
  headImageUrl: string;
  joinedAt: string;
}

export interface StoredMessage extends Message {
  /** Held by the safety path. Visible only to the two arguers, never broadcast. */
  hidden: boolean;
  /** Created by the server (for example a silence note), not typed by the author. */
  system: boolean;
  clientId: string | null;
}

export interface JudgeTurnRecord {
  id: string;
  caseId: string;
  phase: string;
  toneScore: number;
  dialAfter: number;
  speech: string;
  target: string | null;
  face: Face;
  sfx: Sfx;
  hasVerdict: boolean;
  raw: unknown;
  createdAt: string;
}

export interface VerdictRecord {
  caseId: string;
  ruling: Ruling;
  findings: string[];
  sentence: string | null;
  headline: string;
  citedPrecedent: string | null;
  juryGuiltyPct: number;
  /** 'judge' is a real ruling. 'default' is a walk-out judgment and never counts for memory. */
  kind: 'judge' | 'default';
  createdAt: string;
}

export interface ReportRecord {
  id: string;
  caseId: string;
  reporter: string;
  reason: string;
  createdAt: string;
}

export interface ReactionRecord {
  id: string;
  caseId: string;
  handle: string;
  kind: Reaction;
  createdAt: string;
}

export interface CaseStore {
  nextCaseSeq(): Promise<number>;

  upsertProfile(profile: Profile): Promise<void>;
  getProfile(handle: string): Promise<Profile | undefined>;
  findProfileByAuthId(authUserId: string): Promise<Profile | undefined>;

  upsertGroup(group: GroupRecord): Promise<void>;
  getGroup(id: string): Promise<GroupRecord | undefined>;
  findGroupForPair(a: string, b: string): Promise<GroupRecord | undefined>;

  createCase(record: CaseRecord): Promise<void>;
  getCase(id: string): Promise<CaseRecord | undefined>;
  updateCase(id: string, patch: Partial<CaseRecord>): Promise<CaseRecord>;
  listCases(): Promise<CaseRecord[]>;

  addParticipant(p: ParticipantRecord): Promise<void>;
  getParticipants(caseId: string): Promise<ParticipantRecord[]>;

  addMessage(m: StoredMessage): Promise<void>;
  getMessages(caseId: string): Promise<StoredMessage[]>;

  addJudgeTurn(t: JudgeTurnRecord): Promise<void>;
  getJudgeTurns(caseId: string): Promise<JudgeTurnRecord[]>;
  /** Every stored judge turn whose speech equals `speech`, used to authorize voice requests. */
  findJudgeTurnsBySpeech(speech: string): Promise<JudgeTurnRecord[]>;

  setVote(caseId: string, handle: string, vote: Vote): Promise<void>;
  getVotes(caseId: string): Promise<Record<string, Vote>>;

  addReaction(r: ReactionRecord): Promise<void>;

  saveVerdict(v: VerdictRecord): Promise<void>;
  getVerdict(caseId: string): Promise<VerdictRecord | undefined>;

  addReport(r: ReportRecord): Promise<void>;
  getReports(caseId: string): Promise<ReportRecord[]>;
}

const clone = <T>(v: T): T => structuredClone(v);

export class InMemoryStore implements CaseStore {
  private seq: number;
  private profiles = new Map<string, Profile>();
  private groups = new Map<string, GroupRecord>();
  private cases = new Map<string, CaseRecord>();
  private participants = new Map<string, ParticipantRecord[]>();
  private messages = new Map<string, StoredMessage[]>();
  private turns = new Map<string, JudgeTurnRecord[]>();
  private votes = new Map<string, Map<string, Vote>>();
  private reactions: ReactionRecord[] = [];
  private verdicts = new Map<string, VerdictRecord>();
  private reports = new Map<string, ReportRecord[]>();

  constructor(startSeq = 1) {
    this.seq = startSeq;
  }

  async nextCaseSeq() {
    return this.seq++;
  }

  async upsertProfile(profile: Profile) {
    this.profiles.set(profile.handle, clone(profile));
  }
  async getProfile(handle: string) {
    const p = this.profiles.get(handle);
    return p ? clone(p) : undefined;
  }
  async findProfileByAuthId(authUserId: string) {
    for (const p of this.profiles.values()) if (p.authUserId === authUserId) return clone(p);
    return undefined;
  }

  async upsertGroup(group: GroupRecord) {
    this.groups.set(group.id, clone(group));
  }
  async getGroup(id: string) {
    const g = this.groups.get(id);
    return g ? clone(g) : undefined;
  }
  async findGroupForPair(a: string, b: string) {
    for (const g of this.groups.values())
      if (g.members.includes(a) && g.members.includes(b)) return clone(g);
    return undefined;
  }

  async createCase(record: CaseRecord) {
    if (this.cases.has(record.id)) throw new Error('Duplicate case id');
    this.cases.set(record.id, clone(record));
  }
  async getCase(id: string) {
    const c = this.cases.get(id);
    return c ? clone(c) : undefined;
  }
  async updateCase(id: string, patch: Partial<CaseRecord>) {
    const current = this.cases.get(id);
    if (!current) throw new Error('Unknown case');
    const next = { ...current, ...clone(patch) };
    this.cases.set(id, next);
    return clone(next);
  }
  async listCases() {
    return [...this.cases.values()].map(clone);
  }

  async addParticipant(p: ParticipantRecord) {
    const list = this.participants.get(p.caseId) ?? [];
    if (list.some((x) => x.handle === p.handle)) return;
    list.push(clone(p));
    this.participants.set(p.caseId, list);
  }
  async getParticipants(caseId: string) {
    return (this.participants.get(caseId) ?? []).map(clone);
  }

  async addMessage(m: StoredMessage) {
    const list = this.messages.get(m.caseId) ?? [];
    list.push(clone(m));
    this.messages.set(m.caseId, list);
  }
  async getMessages(caseId: string) {
    return (this.messages.get(caseId) ?? []).map(clone);
  }

  async addJudgeTurn(t: JudgeTurnRecord) {
    const list = this.turns.get(t.caseId) ?? [];
    list.push(clone(t));
    this.turns.set(t.caseId, list);
  }
  async getJudgeTurns(caseId: string) {
    return (this.turns.get(caseId) ?? []).map(clone);
  }
  async findJudgeTurnsBySpeech(speech: string) {
    const out: JudgeTurnRecord[] = [];
    for (const list of this.turns.values())
      for (const t of list) if (t.speech === speech) out.push(clone(t));
    return out;
  }

  async setVote(caseId: string, handle: string, vote: Vote) {
    const m = this.votes.get(caseId) ?? new Map<string, Vote>();
    m.set(handle, vote);
    this.votes.set(caseId, m);
  }
  async getVotes(caseId: string) {
    return Object.fromEntries(this.votes.get(caseId) ?? []);
  }

  async addReaction(r: ReactionRecord) {
    this.reactions.push(clone(r));
    if (this.reactions.length > 5000) this.reactions.splice(0, this.reactions.length - 5000);
  }

  async saveVerdict(v: VerdictRecord) {
    if (this.verdicts.has(v.caseId)) throw new Error('Verdict already written');
    this.verdicts.set(v.caseId, clone(v));
  }
  async getVerdict(caseId: string) {
    const v = this.verdicts.get(caseId);
    return v ? clone(v) : undefined;
  }

  async addReport(r: ReportRecord) {
    const list = this.reports.get(r.caseId) ?? [];
    list.push(clone(r));
    this.reports.set(r.caseId, list);
  }
  async getReports(caseId: string) {
    return (this.reports.get(caseId) ?? []).map(clone);
  }
}
