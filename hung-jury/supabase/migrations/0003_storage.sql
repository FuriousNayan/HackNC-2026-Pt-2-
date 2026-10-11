-- 0003_storage.sql
-- Storage bucket. Run after 0002_access_rules.sql.
--
-- Part 4's default media storage adapter (src/media/storage.ts) uses ONE
-- private bucket, named by SUPABASE_MEDIA_BUCKET, with keys prefixed by
-- kind: heads/{userId}/{uuid}.png (cropped bobblehead heads, see
-- src/media/avatar.ts), cards/{hash}/{portrait|square}.png (verdict cards,
-- see src/media/cards.ts), and audio/{hash}.mp3 (cached ElevenLabs output,
-- see src/media/voice.ts). It is private: every read goes through a
-- one-hour signed URL (MEDIA_CONFIG.signedUrlSeconds), not a public URL, so
-- persist the stable object key/reference in your own tables and refresh
-- the signed URL when you load room state.
--
-- Bucket id/name below must match SUPABASE_MEDIA_BUCKET in .env.local.

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- Only the service role reads/writes (the Part 4 storage adapter always
-- uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS), so no policy here
-- grants anon/authenticated access to this bucket's objects.
