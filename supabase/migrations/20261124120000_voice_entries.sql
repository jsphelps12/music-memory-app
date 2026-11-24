-- Voice entries (docs/PLAN-1.5.md, decided 2026-11-23): a moment can keep a
-- recording of its owner saying what the song is doing for them.
--
-- A voice is more personal than a photo, so it gets stricter rules than
-- photos do:
--   - its own PRIVATE bucket (moment-photos is public), read through
--     short-lived signed URLs, with each person's files in {user_id}/;
--   - owner-only for now: the shared view leaves it out, so friends, album
--     members and link pages never see that a recording exists;
--   - deleted with the moment (app) and with the account (delete-account).
--
-- Additive and idempotent: two nullable columns, a bucket, four storage
-- policies on that bucket only, and the shared view naming the new columns.
-- Old builds never name the columns.

-- 1. The recording on the moment. Path inside moment-voice; length in ms,
--    capped at 3 minutes (plus a little slack for the encoder).
ALTER TABLE public.moments ADD COLUMN IF NOT EXISTS voice_path text;
ALTER TABLE public.moments ADD COLUMN IF NOT EXISTS voice_duration_ms integer;

ALTER TABLE public.moments DROP CONSTRAINT IF EXISTS moments_voice_duration_ms_check;
ALTER TABLE public.moments ADD CONSTRAINT moments_voice_duration_ms_check
  CHECK (voice_duration_ms IS NULL OR (voice_duration_ms >= 0 AND voice_duration_ms <= 185000));

-- A path always lives in its owner's folder.
ALTER TABLE public.moments DROP CONSTRAINT IF EXISTS moments_voice_path_owner_check;
ALTER TABLE public.moments ADD CONSTRAINT moments_voice_path_owner_check
  CHECK (voice_path IS NULL OR split_part(voice_path, '/', 1) = user_id::text);

-- 2. The bucket: private, audio only, 5 MB a file (3 minutes of mono AAC is
--    about 1.5 MB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('moment-voice', 'moment-voice', false, 5242880, ARRAY['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Only the owner reads, writes and deletes their own folder. Signed URLs
--    are created by the owner (createSignedUrl checks SELECT).
DROP POLICY IF EXISTS "Owners read their voice recordings" ON storage.objects;
CREATE POLICY "Owners read their voice recordings"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'moment-voice' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Owners upload their voice recordings" ON storage.objects;
CREATE POLICY "Owners upload their voice recordings"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'moment-voice' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Owners update their voice recordings" ON storage.objects;
CREATE POLICY "Owners update their voice recordings"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'moment-voice' AND (SELECT auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'moment-voice' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Owners delete their voice recordings" ON storage.objects;
CREATE POLICY "Owners delete their voice recordings"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'moment-voice' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]);

-- 4. The shared view leaves the recording out for everyone but its owner.
--    Same definition as 20261120120000_song_metadata.sql plus
--    "- 'voice_path' - 'voice_duration_ms'".
CREATE OR REPLACE FUNCTION public.moment_view_for(p_moment public.moments, p_viewer uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_viewer IS NOT NULL AND (p_moment).user_id = p_viewer THEN to_jsonb(p_moment)
    ELSE (to_jsonb(p_moment) - 'share_token' - 'capture_source' - 'voice_path' - 'voice_duration_ms')
      || jsonb_build_object(
        'location', NULL,
        'location_lat', NULL,
        'location_lng', NULL,
        'people', '[]'::jsonb,
        'media_refs',
        COALESCE(
          (SELECT jsonb_agg(
                    CASE WHEN jsonb_typeof(r.ref) = 'object'
                         THEN r.ref || '{"cloudId": ""}'::jsonb
                         ELSE r.ref END
                    ORDER BY r.ord)
             FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof((p_moment).media_refs) = 'array'
                         THEN (p_moment).media_refs ELSE '[]'::jsonb END
                  ) WITH ORDINALITY AS r(ref, ord)),
          '[]'::jsonb)
      )
      || COALESCE(
        (SELECT jsonb_build_object(
                  'owner_display_name', pr.display_name,
                  'owner_avatar_url', pr.avatar_url)
           FROM public.profiles pr
          WHERE pr.id = (p_moment).user_id),
        '{}'::jsonb)
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.moment_view_for(public.moments, uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
