-- ============================================================
-- hillsum1 — Supabase Schema
-- Run this in your Supabase project: SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES
-- Extends Supabase auth.users with app-specific data
-- ============================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  preferred_name text unique not null,          -- "What to be called", must be unique
  avatar_initials text generated always as (
    upper(left(preferred_name, 1))
  ) stored,                                      -- First letter of preferred_name
  total_focus_seconds  bigint not null default 0,
  total_break_seconds  bigint not null default 0,
  created_at    timestamptz not null default now()
);

-- Allow users to read all profiles (for live presence display)
alter table public.profiles enable row level security;
create policy "Profiles are viewable by everyone" on public.profiles
  for select using (true);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, preferred_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'preferred_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- DAILY STATS
-- One row per user per calendar day
-- ============================================================
create table public.daily_stats (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  stat_date     date not null default current_date,
  focus_seconds bigint not null default 0,
  break_seconds bigint not null default 0,
  unique (user_id, stat_date)
);

alter table public.daily_stats enable row level security;
create policy "Users can view own daily stats" on public.daily_stats
  for select using (auth.uid() = user_id);
create policy "Users can upsert own daily stats" on public.daily_stats
  for all using (auth.uid() = user_id);

-- ============================================================
-- SESSIONS
-- Tracks each pomodoro session a user runs
-- ============================================================
create table public.sessions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  focus_minutes   int not null,
  break_minutes   int not null,
  started_at      timestamptz not null default now(),
  focus_ended_at  timestamptz,
  break_ended_at  timestamptz,
  status          text not null default 'focus'  -- 'focus' | 'break' | 'done'
);

alter table public.sessions enable row level security;
create policy "Users can manage own sessions" on public.sessions
  for all using (auth.uid() = user_id);

-- ============================================================
-- CHAT MESSAGES
-- Simple text-only group chat, visible to all logged-in users
-- ============================================================
create table public.messages (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  content    text not null check (char_length(content) <= 500),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;
create policy "Messages viewable by authenticated users" on public.messages
  for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert messages" on public.messages
  for insert with check (auth.uid() = user_id);

-- Enable Realtime for live chat and presence
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.sessions;
