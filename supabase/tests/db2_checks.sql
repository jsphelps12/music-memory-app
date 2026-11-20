-- DB-2 checks: who can read what, before and after
-- 20261122000000_db2_owner_only.sql.
--
-- Run with psql as the database owner (postgres) against a LOCAL stack or
-- staging, never production:
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/db2_checks.sql
--
-- (local: DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres)
--
-- Everything happens in one transaction that is rolled back: fixture users and
-- rows, helper functions, and the migration itself (included with \ir, so the
-- min-build guard is skipped for this session only). If DB-2 is already
-- applied, only the "after" checks run.
--
-- Each check runs a query as one person and compares the row count with what
-- that person should get before and after DB-2. -1 means "permission denied"
-- (no table or column grant), -2 means the call raised an error. Every probe
-- is undone after it runs, so writes don't leak between checks. Checks marked
-- KNOWN BREAK pass when the read stops working: they document reads that must
-- move to a function before DB-2 ships.
--
-- People: owner (has moments, owns shared album A), friend (was sent M1),
-- member (joined album A, added MB), stranger (signed in, no relationship),
-- anon (signed out). M1 has a share link; M2 is in album A; M3 is private;
-- MG is a guest's contribution to album A.

\set ON_ERROR_STOP on

begin;

-- ─── Fixtures (as postgres) ────────────────────────────────────────────────

insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('db200000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'db2-owner@test.invalid',    now(), now()),
  ('db200000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'db2-friend@test.invalid',   now(), now()),
  ('db200000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'db2-member@test.invalid',   now(), now()),
  ('db200000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 'db2-stranger@test.invalid', now(), now()),
  ('db200000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'db2-guest@test.invalid',    now(), now());

-- handle_new_user made the profile rows; give the owner known values.
update public.profiles
   set display_name = 'DB2 Owner',
       push_token = 'ExponentPushToken[db2-test]',
       friend_invite_token = 'db200000-0000-4000-8000-0000000004a0'
 where id = 'db200000-0000-4000-8000-00000000000a';

insert into public.moments (id, user_id, song_title, song_artist, song_artwork_url, reflection_text,
                            location, location_lat, location_lng, people, share_token, guest_uuid, guest_name) values
  ('db200000-0000-4000-8000-0000000001a1', 'db200000-0000-4000-8000-00000000000a', 'Song 1', 'Artist', 'https://example.invalid/1.jpg', 'm1',
   'Home', 1.5, 2.5, '{Alex}', 'db200000-0000-4000-8000-0000000003a1', null, null),
  ('db200000-0000-4000-8000-0000000001a2', 'db200000-0000-4000-8000-00000000000a', 'Song 2', 'Artist', 'https://example.invalid/2.jpg', 'm2',
   'Work', 3.5, 4.5, '{Sam}', null, null, null),
  ('db200000-0000-4000-8000-0000000001a3', 'db200000-0000-4000-8000-00000000000a', 'Song 3', 'Artist', 'https://example.invalid/3.jpg', 'm3',
   null, null, null, '{}', null, null, null),
  ('db200000-0000-4000-8000-0000000001b1', 'db200000-0000-4000-8000-00000000000c', 'Song B', 'Artist', 'https://example.invalid/b.jpg', 'mb',
   null, null, null, '{}', null, null, null),
  ('db200000-0000-4000-8000-0000000001e1', 'db200000-0000-4000-8000-00000000000e', 'Song G', 'Artist', 'https://example.invalid/g.jpg', 'mg',
   null, null, null, '{}', null, 'db2-guest', 'Guest');

insert into public.collections (id, user_id, name, invite_code, is_public)
values ('db200000-0000-4000-8000-0000000002a0', 'db200000-0000-4000-8000-00000000000a', 'DB2 album', 'db2-test-a', true);

insert into public.collection_members (collection_id, user_id)
values ('db200000-0000-4000-8000-0000000002a0', 'db200000-0000-4000-8000-00000000000c');

insert into public.collection_moments (collection_id, moment_id, added_by_user_id) values
  ('db200000-0000-4000-8000-0000000002a0', 'db200000-0000-4000-8000-0000000001a2', 'db200000-0000-4000-8000-00000000000a'),
  ('db200000-0000-4000-8000-0000000002a0', 'db200000-0000-4000-8000-0000000001b1', 'db200000-0000-4000-8000-00000000000c'),
  ('db200000-0000-4000-8000-0000000002a0', 'db200000-0000-4000-8000-0000000001e1', null);

insert into public.friendships (requester_id, addressee_id, status)
values ('db200000-0000-4000-8000-00000000000a', 'db200000-0000-4000-8000-00000000000b', 'accepted');

insert into public.moment_shares (moment_id, sender_id, recipient_id)
values ('db200000-0000-4000-8000-0000000001a1', 'db200000-0000-4000-8000-00000000000a', 'db200000-0000-4000-8000-00000000000b');

-- ─── Helpers (rolled back with everything else) ─────────────────────────────

-- Act as one of the fixture people (or 'admin' to go back to postgres).
create function public._db2_as(p_who text) returns void language plpgsql as $fn$
declare
  v_sub text := case p_who
    when 'owner'    then 'db200000-0000-4000-8000-00000000000a'
    when 'friend'   then 'db200000-0000-4000-8000-00000000000b'
    when 'member'   then 'db200000-0000-4000-8000-00000000000c'
    when 'stranger' then 'db200000-0000-4000-8000-00000000000d'
    else null end;
begin
  perform set_config('role', 'none', true);
  if p_who = 'admin' then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
  elsif p_who = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_sub, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_sub, true);
    perform set_config('role', 'authenticated', true);
  end if;
  perform set_config('db2.who', p_who, true);
end $fn$;

-- Run a query that returns one count, as the current role, then undo it.
create function public._db2_count(p_query text) returns bigint language plpgsql as $fn$
declare
  v_n bigint;
begin
  begin
    execute p_query into v_n;
    raise exception using errcode = 'P0D02', message = coalesce(v_n, 0)::text;
  exception
    when sqlstate 'P0D02' then return sqlerrm::bigint;
    when insufficient_privilege then return -1;
    when others then return -2;
  end;
end $fn$;

create function public._db2_check(p_label text, p_query text, p_before bigint, p_after bigint)
returns void language plpgsql as $fn$
declare
  v_phase text := current_setting('db2.phase');
  v_want bigint := case when v_phase = 'after' then p_after else p_before end;
  v_got bigint := public._db2_count(p_query);
  v_line text := format('[%s] %s: %s', current_setting('db2.who'), p_label, v_got);
begin
  if v_got = v_want then
    raise notice 'ok    %', v_line;
  else
    raise warning 'FAIL  % (want %)', v_line, v_want;
    perform set_config('db2.failures',
      current_setting('db2.failures', true) || format(E'\n  %s %s', v_phase, v_line), true);
  end if;
end $fn$;

create function public._db2_probes(p_phase text) returns void language plpgsql as $fn$
begin
  perform set_config('db2.phase', p_phase, true);

  -- Owner ------------------------------------------------------------------
  perform public._db2_as('owner');
  perform public._db2_check('own moments (timeline, search, browse)',
    $q$select count(*) from public.moments where user_id = 'db200000-0000-4000-8000-00000000000a'$q$, 3, 3);
  perform public._db2_check('own moment by id, all columns (edit, saveMoment read-back)',
    $q$select count(*) from (select * from public.moments where id = 'db200000-0000-4000-8000-0000000001a1') s$q$, 1, 1);
  perform public._db2_check('member''s moment in my album, direct',
    $q$select count(*) from public.moments where id = 'db200000-0000-4000-8000-0000000001b1'$q$, 1, 0);
  perform public._db2_check('guest moment in my album, direct',
    $q$select count(*) from public.moments where id = 'db200000-0000-4000-8000-0000000001e1'$q$, 1, 0);
  perform public._db2_check('get_shared_collection_moments(A)',
    $q$select count(*) from public.get_shared_collection_moments('db200000-0000-4000-8000-0000000002a0')$q$, 3, 3);
  perform public._db2_check('get_moment_view(member''s moment) as album owner',
    $q$select count(*) from (select public.get_moment_view('db200000-0000-4000-8000-0000000001b1') v) s where v is not null$q$, 1, 1);
  perform public._db2_check('open_shared_moment(own link) says is_owner',
    $q$select count(*) where (public.open_shared_moment('db200000-0000-4000-8000-0000000003a1')->>'is_owner')::boolean$q$, 1, 1);
  perform public._db2_check('get_random_moment()',
    $q$select count(*) from public.get_random_moment()$q$, 1, 1);
  perform public._db2_check('insert own moment returning * (saveMoment)',
    $q$with i as (insert into public.moments (user_id, song_title, song_artist)
                  values ('db200000-0000-4000-8000-00000000000a', 'New', 'Artist') returning *)
       select count(*) from i$q$, 1, 1);
  perform public._db2_check('update own moment (share link on)',
    $q$with u as (update public.moments set share_token = gen_random_uuid()
                  where id = 'db200000-0000-4000-8000-0000000001a3' and share_token is null returning id)
       select count(*) from u$q$, 1, 1);
  perform public._db2_check('delete own moment',
    $q$with d as (delete from public.moments where id = 'db200000-0000-4000-8000-0000000001a3' returning id)
       select count(*) from d$q$, 1, 1);
  perform public._db2_check('delete guest moment in my album, direct (edge function does this)',
    $q$with d as (delete from public.moments where id = 'db200000-0000-4000-8000-0000000001e1' returning id)
       select count(*) from d$q$, 1, 0);
  perform public._db2_check('get_my_profile() has private columns',
    $q$select count(*) from public.get_my_profile() p where p.push_token is not null$q$, 1, 1);
  perform public._db2_check('own private column, direct',
    $q$select count(*) from (select push_token from public.profiles where id = 'db200000-0000-4000-8000-00000000000a') s$q$, 1, -1);
  perform public._db2_check('own avatar_url, direct (storage.ts)',
    $q$select count(*) from (select avatar_url from public.profiles where id = 'db200000-0000-4000-8000-00000000000a') s$q$, 1, 1);
  perform public._db2_check('public columns of everyone (fetchProfilesByIds)',
    $q$select count(*) from (select id, display_name, avatar_url, username from public.profiles
       where id::text like 'db200000-0000-4000-8000-00000000000_') s$q$, 5, 5);
  perform public._db2_check('username check (checkUsernameAvailable)',
    $q$select count(*) from (select id from public.profiles where username ilike 'db2-nobody'
       and id <> 'db200000-0000-4000-8000-00000000000a') s$q$, 0, 0);
  perform public._db2_check('update own profile returning id (patchProfile)',
    $q$with u as (update public.profiles set display_name = 'Renamed'
                  where id = 'db200000-0000-4000-8000-00000000000a' returning id)
       select count(*) from u$q$, 1, 1);
  perform public._db2_check('update own push_token, no returning (notifications.ts)',
    $q$with u as (update public.profiles set push_token = null
                  where id = 'db200000-0000-4000-8000-00000000000a' returning 1)
       select count(*) from u$q$, 1, 1);

  -- Friend (was sent M1) ------------------------------------------------------
  perform public._db2_as('friend');
  perform public._db2_check('moment sent to me, direct',
    $q$select count(*) from public.moments where id = 'db200000-0000-4000-8000-0000000001a1'$q$, 1, 0);
  perform public._db2_check('any moment with a link, direct by token',
    $q$select count(*) from public.moments where share_token = 'db200000-0000-4000-8000-0000000003a1'$q$, 1, 0);
  perform public._db2_check('get_moment_view(sent to me), no place/people/token',
    $q$select count(*) from (select public.get_moment_view('db200000-0000-4000-8000-0000000001a1') v) s
       where v is not null and not (v ? 'share_token') and v->>'location' is null
         and v->>'location_lat' is null and v->'people' = '[]'::jsonb$q$, 1, 1);
  perform public._db2_check('get_shared_with_me() has it',
    $q$select count(*) from public.get_shared_with_me() r
       where r->'moments'->>'id' = 'db200000-0000-4000-8000-0000000001a1'$q$, 1, 1);
  perform public._db2_check('get_moment_view(private moment)',
    $q$select count(*) from (select public.get_moment_view('db200000-0000-4000-8000-0000000001a3') v) s where v is not null$q$, 0, 0);
  perform public._db2_check('update someone else''s moment',
    $q$with u as (update public.moments set reflection_text = 'x'
                  where id = 'db200000-0000-4000-8000-0000000001a1' returning id)
       select count(*) from u$q$, 0, 0);
  perform public._db2_check('owner''s public profile columns',
    $q$select count(*) from (select id, display_name, avatar_url, username from public.profiles
       where id = 'db200000-0000-4000-8000-00000000000a') s$q$, 1, 1);
  perform public._db2_check('owner''s private profile column',
    $q$select count(*) from (select friend_invite_token from public.profiles
       where id = 'db200000-0000-4000-8000-00000000000a') s$q$, 1, -1);
  perform public._db2_check('owner''s profile, all columns',
    $q$select count(*) from (select * from public.profiles where id = 'db200000-0000-4000-8000-00000000000a') s$q$, 1, -1);

  -- Album member ----------------------------------------------------------------
  perform public._db2_as('member');
  perform public._db2_check('owner''s moment in the album, direct',
    $q$select count(*) from public.moments where id = 'db200000-0000-4000-8000-0000000001a2'$q$, 1, 0);
  perform public._db2_check('own moment',
    $q$select count(*) from public.moments where id = 'db200000-0000-4000-8000-0000000001b1'$q$, 1, 1);
  perform public._db2_check('get_shared_collection_moments(A)',
    $q$select count(*) from public.get_shared_collection_moments('db200000-0000-4000-8000-0000000002a0')$q$, 3, 3);
  perform public._db2_check('get_shared_collection_moments(A): others'' rows shaped',
    $q$select count(*) from public.get_shared_collection_moments('db200000-0000-4000-8000-0000000002a0') r
       where r->>'id' = 'db200000-0000-4000-8000-0000000001a2'
         and r->>'location' is null and not (r ? 'share_token')$q$, 1, 1);
  perform public._db2_check('get_moment_view(owner''s album moment)',
    $q$select count(*) from (select public.get_moment_view('db200000-0000-4000-8000-0000000001a2') v) s where v is not null$q$, 1, 1);
  perform public._db2_check('album rows (collection_moments, unchanged)',
    $q$select count(*) from public.collection_moments where collection_id = 'db200000-0000-4000-8000-0000000002a0'$q$, 3, 3);
  perform public._db2_check('KNOWN BREAK album artwork via embed (app fetchAlbumArtworks)',
    $q$select count(m.id) from public.collection_moments cm left join public.moments m on m.id = cm.moment_id
       where cm.collection_id = 'db200000-0000-4000-8000-0000000002a0'$q$, 3, 1);

  -- Stranger (signed in) -----------------------------------------------------------
  perform public._db2_as('stranger');
  perform public._db2_check('moment with a link, direct by id',
    $q$select count(*) from public.moments where id = 'db200000-0000-4000-8000-0000000001a1'$q$, 1, 0);
  perform public._db2_check('get_moment_view(linked moment) - a link is not access',
    $q$select count(*) from (select public.get_moment_view('db200000-0000-4000-8000-0000000001a1') v) s where v is not null$q$, 0, 0);
  perform public._db2_check('open_shared_moment(link): read-only projection, no place',
    $q$select count(*) from (select public.open_shared_moment('db200000-0000-4000-8000-0000000003a1') v) s
       where (v->>'is_owner')::boolean = false and v->>'location' is null$q$, 1, 1);
  perform public._db2_check('get_shared_collection_moments(A) refused',
    $q$select count(*) from public.get_shared_collection_moments('db200000-0000-4000-8000-0000000002a0')$q$, -2, -2);
  perform public._db2_check('owner''s private profile column',
    $q$select count(*) from (select push_token from public.profiles
       where id = 'db200000-0000-4000-8000-00000000000a') s$q$, 1, -1);

  -- Signed out ---------------------------------------------------------------------
  perform public._db2_as('anon');
  perform public._db2_check('moment with a link, direct',
    $q$select count(*) from public.moments where id = 'db200000-0000-4000-8000-0000000001a1'$q$, 1, -1);
  perform public._db2_check('moment in a shared album, direct',
    $q$select count(*) from public.moments where id = 'db200000-0000-4000-8000-0000000001a2'$q$, 1, -1);
  perform public._db2_check('get_shared_moment(link) (/m page), no place',
    $q$select count(*) from (select public.get_shared_moment('db200000-0000-4000-8000-0000000003a1') v) s
       where v is not null and v->>'location' is null$q$, 1, 1);
  perform public._db2_check('profiles, direct',
    $q$select count(*) from (select id, display_name from public.profiles) s$q$, -1, -1);
  perform public._db2_check('get_public_profiles(owner)',
    $q$select count(*) from public.get_public_profiles(array['db200000-0000-4000-8000-00000000000a'::uuid])$q$, 1, 1);
  perform public._db2_check('get_profile_by_invite_token(owner''s token)',
    $q$select count(*) from public.get_profile_by_invite_token('db200000-0000-4000-8000-0000000004a0')$q$, 1, 1);
  perform public._db2_check('get_my_profile() not callable',
    $q$select count(*) from public.get_my_profile()$q$, -1, -1);
  perform public._db2_check('album rows of a shared album (collection_moments, unchanged)',
    $q$select count(*) from public.collection_moments where collection_id = 'db200000-0000-4000-8000-0000000002a0'$q$, 3, 3);
  perform public._db2_check('KNOWN BREAK web album page embed (/c, contribute, api/collection-moments)',
    $q$select count(m.id) from public.collection_moments cm left join public.moments m on m.id = cm.moment_id
       where cm.collection_id = 'db200000-0000-4000-8000-0000000002a0'$q$, 3, -1);

  perform public._db2_as('admin');
end $fn$;

grant execute on function public._db2_as(text), public._db2_count(text),
  public._db2_check(text, text, bigint, bigint), public._db2_probes(text) to public;

select set_config('db2.failures', '', true);

-- ─── Before ────────────────────────────────────────────────────────────────

select exists (
  select 1 from pg_policies
   where schemaname = 'public' and tablename = 'moments' and policyname = 'Owners can read their moments'
) as db2_applied \gset

\if :db2_applied
  \echo 'DB-2 is already applied here: running the after checks only.'
\else
  \echo '--- before DB-2 ---'
  select public._db2_probes('before');

  \echo '--- applying 20261122000000_db2_owner_only.sql (rolled back at the end) ---'
  select set_config('db2.skip_min_build_check', 'on', true);
  \ir ../migrations/20261122000000_db2_owner_only.sql
\endif

-- ─── After ─────────────────────────────────────────────────────────────────

\echo '--- after DB-2 ---'
select public._db2_probes('after');

-- Fails the run (and so the transaction) if any check didn't match.
do $$
begin
  if current_setting('db2.failures', true) <> '' then
    raise exception 'DB-2 checks failed:%', current_setting('db2.failures', true);
  end if;
  raise notice 'All DB-2 checks passed.';
end $$;

rollback;
