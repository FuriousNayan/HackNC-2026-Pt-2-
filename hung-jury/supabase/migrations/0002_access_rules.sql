-- 0002_access_rules.sql
-- Row level security. Run after 0001_schema.sql.
--
-- Rules from the spec (Overview / Part 2 Backend, "Access rules"):
--   * Before acceptance, only the filer and the named defendant can read the case.
--   * Listed live cases are readable by any signed-in user (messages, judge
--     turns, tally).
--   * Only participants with the juror role can write a vote.
--   * Safety closed cases are readable only by the two arguers, and only the
--     verdict-free summary.
--   * The judge service role is the only writer of judge_turns and verdicts.
--
-- All writes from clients go through API routes using the service role key,
-- which bypasses RLS by design (routes enforce their own authorization,
-- rate limits, and length limits from CONFIG). RLS here mainly protects
-- direct reads (Realtime subscriptions, client-side selects) and gives a
-- second line of defense if a route ever forgets a check.
--
-- Note: Postgres RLS is row-level, not column-level. "Only the verdict-free
-- summary" for safety-closed cases is enforced by the application (the
-- /api/cases/:id routes and GET /api/docket omit verdict fields whenever
-- cases.safety_closed = true), not by hiding columns here.

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table cases enable row level security;
alter table participants enable row level security;
alter table messages enable row level security;
alter table judge_turns enable row level security;
alter table votes enable row level security;
alter table reactions enable row level security;
alter table verdicts enable row level security;
alter table reports enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: handles are public.
create policy profiles_select_all on profiles for select using (true);
create policy profiles_insert_self on profiles for insert with check (auth.uid() = id);
create policy profiles_update_self on profiles for update using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- groups / group_members: readable by members only.
create policy group_members_select_own on group_members for select
  using (user_id = auth.uid());

create policy groups_select_member on groups for select
  using (exists (select 1 from group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- helper: is this case listed and visible to any signed-in user?
create or replace function is_publicly_listed(c cases) returns boolean as $$
  select c.listed and c.status <> 'filed' and not c.safety_closed;
$$ language sql stable;

create or replace function is_case_party(c cases, uid uuid) returns boolean as $$
  select c.filer_id = uid or c.defendant_id = uid;
$$ language sql stable;

-- ---------------------------------------------------------------------------
-- cases
create policy cases_select on cases for select
  using (
    is_case_party(cases, auth.uid())
    or is_publicly_listed(cases)
    or (safety_closed and is_case_party(cases, auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- participants: visible to anyone who can see the case.
create policy participants_select on participants for select
  using (
    exists (
      select 1 from cases c
      where c.id = participants.case_id
        and (is_case_party(c, auth.uid()) or is_publicly_listed(c))
    )
  );

-- ---------------------------------------------------------------------------
-- messages: visible to anyone who can see the case, hidden once safety closed
-- except to the two arguers (the offending message is hidden from everyone
-- else per the spec).
create policy messages_select on messages for select
  using (
    exists (
      select 1 from cases c
      where c.id = messages.case_id
        and (
          (not c.safety_closed and (is_case_party(c, auth.uid()) or is_publicly_listed(c)))
          or (c.safety_closed and is_case_party(c, auth.uid()))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- judge_turns: same visibility as messages. Only the service role writes.
create policy judge_turns_select on judge_turns for select
  using (
    exists (
      select 1 from cases c
      where c.id = judge_turns.case_id
        and (
          (not c.safety_closed and (is_case_party(c, auth.uid()) or is_publicly_listed(c)))
          or (c.safety_closed and is_case_party(c, auth.uid()))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- votes: only a juror participant may insert their own vote. No client select
-- policy is defined, since the tally is broadcast as a jury event rather than
-- queried directly (votes are "never read by the judge path").
create policy votes_insert_juror on votes for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from participants p
      where p.case_id = votes.case_id and p.user_id = auth.uid() and p.role = 'juror'
    )
  );

-- ---------------------------------------------------------------------------
-- reactions: visible to anyone who can see the case.
create policy reactions_select on reactions for select
  using (
    exists (
      select 1 from cases c
      where c.id = reactions.case_id
        and (is_case_party(c, auth.uid()) or is_publicly_listed(c))
    )
  );

-- ---------------------------------------------------------------------------
-- verdicts: same visibility as cases, minus safety-closed detail (enforced by
-- the application, see note above). Only the service role writes.
create policy verdicts_select on verdicts for select
  using (
    exists (
      select 1 from cases c
      where c.id = verdicts.case_id
        and (is_case_party(c, auth.uid()) or is_publicly_listed(c))
    )
  );

-- ---------------------------------------------------------------------------
-- reports: only the reporter can see their own report. Writes happen through
-- the API route (service role) so it can run the safety threshold logic.
create policy reports_select_own on reports for select
  using (reporter_id = auth.uid());
