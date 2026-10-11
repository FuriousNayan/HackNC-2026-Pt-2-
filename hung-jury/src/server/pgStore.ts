import type {
  CaseRecord,
  CaseStore,
  GroupRecord,
  JudgeTurnRecord,
  ParticipantRecord,
  Profile,
  ReactionRecord,
  ReportRecord,
  StoredMessage,
  Vote,
  VerdictRecord,
} from './store';

/**
 * CaseStore on Postgres (Supabase). Tables are in supabase/migrations/0005_engine_store.sql.
 * It takes anything with a `query(sql, params)` method, so production passes a `pg` Pool built from
 * DATABASE_URL and tests pass PGlite (a real Postgres in process).
 */
export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

type Row = Record<string, unknown>;
const data = <T>(row: Row | undefined): T | undefined => (row ? (row.data as T) : undefined);
const json = (v: unknown) => JSON.stringify(v);

export class PostgresStore implements CaseStore {
  constructor(private readonly db: Queryable) {}

  /** Make the next case number start at `seq` (used after seeding, never lowers it). */
  async ensureCaseSeqAtLeast(seq: number): Promise<void> {
    await this.db.query(
      `select setval('hj_case_seq', greatest($1::bigint, (select last_value from hj_case_seq)), true)`,
      [seq - 1 < 1 ? 1 : seq - 1],
    );
  }

  async nextCaseSeq() {
    const { rows } = await this.db.query(`select nextval('hj_case_seq') as n`);
    return Number(rows[0].n);
  }

  async upsertProfile(p: Profile) {
    await this.db.query(
      `insert into hj_profiles (handle, data) values ($1, $2::jsonb)
       on conflict (handle) do update set data = excluded.data`,
      [p.handle, json(p)],
    );
  }
  async getProfile(handle: string) {
    const { rows } = await this.db.query(`select data from hj_profiles where handle = $1`, [handle]);
    return data<Profile>(rows[0]);
  }

  async findProfileByAuthId(authUserId: string) {
    const { rows } = await this.db.query(`select data from hj_profiles where data ->> 'authUserId' = $1 limit 1`, [authUserId]);
    return data<Profile>(rows[0]);
  }

  async upsertGroup(g: GroupRecord) {
    await this.db.query(
      `insert into hj_groups (id, data) values ($1, $2::jsonb)
       on conflict (id) do update set data = excluded.data`,
      [g.id, json(g)],
    );
  }
  async getGroup(id: string) {
    const { rows } = await this.db.query(`select data from hj_groups where id = $1`, [id]);
    return data<GroupRecord>(rows[0]);
  }
  async findGroupForPair(a: string, b: string) {
    const { rows } = await this.db.query(
      `select data from hj_groups
       where data -> 'members' ? $1 and data -> 'members' ? $2
       order by id limit 1`,
      [a, b],
    );
    return data<GroupRecord>(rows[0]);
  }

  async createCase(c: CaseRecord) {
    await this.db.query(`insert into hj_cases (id, data) values ($1, $2::jsonb)`, [c.id, json(c)]);
  }
  async getCase(id: string) {
    const { rows } = await this.db.query(`select data from hj_cases where id = $1`, [id]);
    return data<CaseRecord>(rows[0]);
  }
  async updateCase(id: string, patch: Partial<CaseRecord>) {
    // jsonb || merges top level keys atomically in one statement.
    const { rows } = await this.db.query(
      `update hj_cases set data = data || $2::jsonb where id = $1 returning data`,
      [id, json(patch)],
    );
    const out = data<CaseRecord>(rows[0]);
    if (!out) throw new Error('Unknown case');
    return out;
  }
  async listCases() {
    const { rows } = await this.db.query(`select data from hj_cases order by (data ->> 'createdAt'), id`);
    return rows.map((r) => r.data as CaseRecord);
  }

  async addParticipant(p: ParticipantRecord) {
    await this.db.query(
      `insert into hj_participants (case_id, handle, data) values ($1, $2, $3::jsonb)
       on conflict (case_id, handle) do nothing`,
      [p.caseId, p.handle, json(p)],
    );
  }
  async getParticipants(caseId: string) {
    const { rows } = await this.db.query(
      `select data from hj_participants where case_id = $1 order by (data ->> 'joinedAt'), handle`,
      [caseId],
    );
    return rows.map((r) => r.data as ParticipantRecord);
  }

  async addMessage(m: StoredMessage) {
    await this.db.query(`insert into hj_messages (case_id, data) values ($1, $2::jsonb)`, [m.caseId, json(m)]);
  }
  async getMessages(caseId: string) {
    const { rows } = await this.db.query(`select data from hj_messages where case_id = $1 order by seq`, [caseId]);
    return rows.map((r) => r.data as StoredMessage);
  }

  async addJudgeTurn(t: JudgeTurnRecord) {
    await this.db.query(`insert into hj_judge_turns (case_id, speech, data) values ($1, $2, $3::jsonb)`, [
      t.caseId,
      t.speech,
      json(t),
    ]);
  }
  async getJudgeTurns(caseId: string) {
    const { rows } = await this.db.query(`select data from hj_judge_turns where case_id = $1 order by seq`, [
      caseId,
    ]);
    return rows.map((r) => r.data as JudgeTurnRecord);
  }
  async findJudgeTurnsBySpeech(speech: string) {
    const { rows } = await this.db.query(
      `select data from hj_judge_turns where md5(speech) = md5($1) and speech = $1 order by seq`,
      [speech],
    );
    return rows.map((r) => r.data as JudgeTurnRecord);
  }

  async setVote(caseId: string, handle: string, vote: Vote) {
    await this.db.query(
      `insert into hj_votes (case_id, handle, vote) values ($1, $2, $3)
       on conflict (case_id, handle) do update set vote = excluded.vote`,
      [caseId, handle, vote],
    );
  }
  async getVotes(caseId: string) {
    const { rows } = await this.db.query(`select handle, vote from hj_votes where case_id = $1`, [caseId]);
    return Object.fromEntries(rows.map((r) => [r.handle as string, r.vote as Vote]));
  }

  async addReaction(r: ReactionRecord) {
    await this.db.query(`insert into hj_reactions (id, case_id, data) values ($1, $2, $3::jsonb)`, [
      r.id,
      r.caseId,
      json(r),
    ]);
  }

  async saveVerdict(v: VerdictRecord) {
    // A second verdict for the same case must fail, exactly like the in-memory store.
    await this.db.query(`insert into hj_verdicts (case_id, data) values ($1, $2::jsonb)`, [v.caseId, json(v)]);
  }
  async getVerdict(caseId: string) {
    const { rows } = await this.db.query(`select data from hj_verdicts where case_id = $1`, [caseId]);
    return data<VerdictRecord>(rows[0]);
  }

  async addReport(r: ReportRecord) {
    await this.db.query(`insert into hj_reports (id, case_id, data) values ($1, $2, $3::jsonb)`, [
      r.id,
      r.caseId,
      json(r),
    ]);
  }
  async getReports(caseId: string) {
    const { rows } = await this.db.query(`select data from hj_reports where case_id = $1 order by (data ->> 'createdAt'), id`, [
      caseId,
    ]);
    return rows.map((r) => r.data as ReportRecord);
  }
}
