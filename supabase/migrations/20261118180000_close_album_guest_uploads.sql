-- Close the pre-occasions album guest form (/c/{code}/contribute).
--
-- Before occasions, a shared album could take entries from people without
-- the app. Occasions replaced it and nothing in the app links to it, but the
-- switch defaulted to on, so every shared album still accepted anonymous
-- entries. Off for every album, and off by default. submit-guest-contribution
-- and both /contribute pages already refuse when it's off. Retiring the form,
-- the flag and the function entirely follows separately (docs/ROADMAP.md).
alter table public.collections alter column events_tier_unlocked set default false;
update public.collections set events_tier_unlocked = false where events_tier_unlocked;
