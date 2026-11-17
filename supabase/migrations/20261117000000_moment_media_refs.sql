-- Linked photos and video (1.4, Josh's call 2026-11-17).
--
-- A moment's photos and videos can be kept as references to the owner's own
-- Photos library instead of uploaded files. Each entry lines up with the same
-- index in photo_thumbnails / photo_urls:
--   { "cloudId": "<PHCloudIdentifier>", "kind": "photo" | "video",
--     "durationMs": 12000, "full": false }
-- - photo_thumbnails[i] is always uploaded (small), so lists, the PDF and
--   other devices show something;
-- - photo_urls[i] holds the thumbnail as a stand-in until the full file is
--   uploaded, which happens when the moment is shared (then full = true), so
--   1.3.1 apps and the web keep working;
-- - a video's thumbnail is its poster frame; it plays on the owner's devices
--   through Photos.
-- Existing moments have no entries: everything in them is uploaded.
-- Additive and backward compatible; RLS on moments already covers it.

ALTER TABLE public.moments
  ADD COLUMN IF NOT EXISTS media_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.moments.media_refs IS
  'Linked media (1.4): per photo_thumbnails index, {cloudId, kind photo|video, durationMs?, full}. Empty for fully uploaded moments.';
