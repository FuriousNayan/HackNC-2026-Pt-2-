-- 0005_engine_store.sql
-- Storage for the case engine in src/server (PostgresStore). Run after 0004.
--
-- Why separate tables: 0001 keys everything to auth.users uuids. The engine identifies people by public
-- handle (a secret session token proves ownership) and keeps its own turn state, so these tables mirror its
-- CaseStore interface one to one. Each row is the record as JSON in `data`, with the columns the engine
-- filters on generated from it. The old tables are untouched and stay available for a later move to Supabase Auth.
--
-- Access: the server connects with the database connection string (DATABASE_URL), which bypasses RLS. RLS is
-- enabled with NO policies, so the anon key and signed-in browsers can read and write nothing here.

create table if not exists hj_profiles (
  handle text primary key,
  data jsonb not null
);

create table if not exists hj_groups (
  id text primary key,
  data jsonb not null
);

create table if not exists hj_cases (
  id text primary key,
  data jsonb not null,
  group_id text generated always as (data ->> 'groupId') stored,
  status text generated always as (data ->> 'status') stored,
  listed boolean generated always as ((data ->> 'listed')::boolean) stored
);
create index if not exists hj_cases_group_idx on hj_cases (group_id);
create index if not exists hj_cases_status_idx on hj_cases (status);

create table if not exists hj_participants (
  case_id text not null references hj_cases (id) on delete cascade,
  handle text not null,
  data jsonb not null,
  primary key (case_id, handle)
);

create table if not exists hj_messages (
  seq bigserial primary key,
  case_id text not null references hj_cases (id) on delete cascade,
  data jsonb not null
);
create index if not exists hj_messages_case_idx on hj_messages (case_id, seq);

create table if not exists hj_judge_turns (
  seq bigserial primary key,
  case_id text not null references hj_cases (id) on delete cascade,
  speech text not null,
  data jsonb not null
);
create index if not exists hj_judge_turns_case_idx on hj_judge_turns (case_id, seq);
create index if not exists hj_judge_turns_speech_idx on hj_judge_turns (md5(speech));

create table if not exists hj_votes (
  case_id text not null references hj_cases (id) on delete cascade,
  handle text not null,
  vote text not null check (vote in ('guilty', 'not_guilty')),
  primary key (case_id, handle)
);

create table if not exists hj_reactions (
  id text primary key,
  case_id text not null references hj_cases (id) on delete cascade,
  data jsonb not null
);

create table if not exists hj_verdicts (
  case_id text primary key references hj_cases (id) on delete cascade,
  data jsonb not null
);

create table if not exists hj_reports (
  id text primary key,
  case_id text not null references hj_cases (id) on delete cascade,
  data jsonb not null
);
create index if not exists hj_reports_case_idx on hj_reports (case_id);

-- Human readable case numbers (HJ-0024). Start above any seeded cases.
create sequence if not exists hj_case_seq start 1;

alter table hj_profiles enable row level security;
alter table hj_groups enable row level security;
alter table hj_cases enable row level security;
alter table hj_participants enable row level security;
alter table hj_messages enable row level security;
alter table hj_judge_turns enable row level security;
alter table hj_votes enable row level security;
alter table hj_reactions enable row level security;
alter table hj_verdicts enable row level security;
alter table hj_reports enable row level security;
