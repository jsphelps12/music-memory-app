-- Multi-mood support (ROADMAP feedback item 4), phase 1 of the multi-phase
-- migration pattern in docs/DEPLOY.md:
--   moods text[] is added alongside mood; app code dual-writes (mood = first
--   selected mood) because binaries <= build 22 still read and write the old
--   single-mood column. mood cannot be dropped until the fingerprint strands
--   those binaries anyway (phase 3, weeks away at minimum).
alter table public.moments add column if not exists moods text[];

-- Backfill existing single-mood rows so readers of moods see history.
update public.moments set moods = array[mood] where mood is not null and moods is null;

-- browse-by-mood filters with moods @> '{value}' (PostgREST "cs").
create index if not exists moments_moods_gin_idx on public.moments using gin (moods);

-- Old binaries write only the single mood column. Without this, an edit from
-- an old binary leaves moods stale (new mood not reflected in the array).
-- New clients always write both columns together, so when moods moved too the
-- trigger stays out of the way.
create or replace function public.sync_mood_to_moods()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if (tg_op = 'INSERT' and new.moods is null and new.mood is not null)
     or (tg_op = 'UPDATE' and new.mood is distinct from old.mood
         and new.moods is not distinct from old.moods) then
    new.moods := case when new.mood is null then '{}'::text[] else array[new.mood] end;
  end if;
  return new;
end;
$$;

drop trigger if exists moments_sync_mood_to_moods on public.moments;
create trigger moments_sync_mood_to_moods
before insert or update on public.moments
for each row execute function public.sync_mood_to_moods();
