-- Music Memory App — Supabase Schema
-- Run this in the Supabase SQL Editor (supabase.com > your project > SQL Editor)

-- 1. Profiles table (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Moments table
create table public.moments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  song_title text not null,
  song_artist text not null,
  song_album_name text,
  song_artwork_url text,
  song_apple_music_id text not null,
  song_preview_url text,
  reflection_text text not null default '',
  photo_urls text[] default '{}',
  mood text,
  people text[] default '{}',
  location text,
  moment_date date not null default current_date,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.moments enable row level security;

create policy "Users can view their own moments"
  on public.moments for select
  using (auth.uid() = user_id);

create policy "Users can create their own moments"
  on public.moments for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own moments"
  on public.moments for update
  using (auth.uid() = user_id);

create policy "Users can delete their own moments"
  on public.moments for delete
  using (auth.uid() = user_id);

-- Indexes
create index moments_user_id_idx on public.moments (user_id);
create index moments_moment_date_idx on public.moments (moment_date desc);

-- Auto-update updated_at timestamp
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger moments_updated_at
  before update on public.moments
  for each row execute function public.update_updated_at();

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- 3. Storage bucket for moment photos
insert into storage.buckets (id, name, public)
values ('moment-photos', 'moment-photos', false);

create policy "Users can upload their own photos"
  on storage.objects for insert
  with check (
    bucket_id = 'moment-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can view their own photos"
  on storage.objects for select
  using (
    bucket_id = 'moment-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own photos"
  on storage.objects for delete
  using (
    bucket_id = 'moment-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
