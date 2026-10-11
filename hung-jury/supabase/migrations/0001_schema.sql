-- 0001_schema.sql
-- Core tables for Hung Jury. Run first.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per user. The handle is public.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique,
  avatar_kind text not null default 'avatar' check (avatar_kind in ('avatar', 'photo', 'webcam')),
  avatar_ref text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- groups: a friend group. Auto-created when two users first face each other.
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- cases: the case state machine. Grievance is stored redacted.
create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  title text not null,
  grievance text not null,
  sentence_request text,
  filer_id uuid not null references profiles (id),
  defendant_id uuid references profiles (id),
  defendant_handle_or_invite text,
  status text not null default 'filed' check (status in ('filed', 'accepted', 'live', 'verdict', 'closed')),
  phase text check (phase in ('opening', 'statements', 'cross', 'rebuttal', 'closing', 'verdict')),
  tone_dial numeric not null default 0.5,
  turn_index integer not null default 0,
  active_role text check (active_role in ('plaintiff', 'defendant', 'judge')),
  timer_ends_at timestamptz,
  listed boolean not null default false,
  safety_closed boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  closed_at timestamptz
);

create index if not exists cases_group_id_idx on cases (group_id);
create index if not exists cases_status_idx on cases (status);
create index if not exists cases_listed_idx on cases (listed) where listed = true;

-- ---------------------------------------------------------------------------
-- participants: who is in the room and in what role.
create table if not exists participants (
  case_id uuid not null references cases (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null check (role in ('plaintiff', 'defendant', 'juror')),
  head_image_ref text,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (case_id, user_id, role)
);

create index if not exists participants_case_id_idx on participants (case_id);

-- ---------------------------------------------------------------------------
-- messages: statements, answers, and closings. Stored redacted.
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  author_id uuid not null references profiles (id),
  kind text not null check (kind in ('statement', 'answer', 'closing')),
  text text not null,
  client_message_id text, -- idempotency key, see src/contracts/api.ts PostMessageRequest
  created_at timestamptz not null default now(),
  unique (case_id, author_id, client_message_id)
);

create index if not exists messages_case_id_idx on messages (case_id, created_at);

-- ---------------------------------------------------------------------------
-- judge_turns: one row per Gemini call, for replay and debugging.
create table if not exists judge_turns (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  phase text not null,
  tone_score numeric not null,
  dial_after numeric not null,
  speech text not null,
  target text,
  face text not null,
  sfx text not null,
  raw_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists judge_turns_case_id_idx on judge_turns (case_id, created_at);

-- ---------------------------------------------------------------------------
-- votes: unique per case and user. Never read by the judge path.
create table if not exists votes (
  case_id uuid not null references cases (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  vote text not null check (vote in ('guilty', 'not_guilty')),
  created_at timestamptz not null default now(),
  primary key (case_id, user_id)
);

-- ---------------------------------------------------------------------------
-- reactions: rate limited from CONFIG.limits.reactionCooldownMs.
create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  kind text not null check (kind in ('gasp', 'gavel', 'objection', 'laugh', 'boo', 'order')),
  created_at timestamptz not null default now()
);

create index if not exists reactions_case_user_idx on reactions (case_id, user_id, created_at);

-- ---------------------------------------------------------------------------
-- verdicts: written once at the end.
create table if not exists verdicts (
  case_id uuid primary key references cases (id) on delete cascade,
  ruling text not null check (ruling in ('guilty', 'not_guilty', 'partly_guilty', 'hung')),
  findings text[] not null default '{}',
  sentence text,
  headline text not null,
  cited_precedent text,
  jury_guilty_pct numeric,
  card_url text,
  audio_url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- reports: feeds the safety path.
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  reporter_id uuid not null references profiles (id),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists reports_case_id_idx on reports (case_id);
