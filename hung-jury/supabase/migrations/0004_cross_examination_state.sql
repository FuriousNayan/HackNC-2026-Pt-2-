-- 0004_cross_examination_state.sql
-- Tracks progress through cross-examination's alternating question/answer
-- loop (up to CONFIG.limits.followUpsPerSide questions per side). Run after
-- 0003_storage.sql.

alter table cases add column if not exists cross_question_index integer not null default 0;
