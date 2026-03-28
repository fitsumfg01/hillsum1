-- Run this in Supabase SQL Editor
-- Drop and recreate cleanly

drop table if exists public.room_sessions cascade;

create table public.room_sessions (
  room_name           text primary key references public.rooms(name) on delete cascade,
  phase               text not null default 'idle',
  focus_minutes       int  not null default 25,
  break_minutes       int  not null default 5,
  end_time            timestamptz,
  paused              boolean not null default false,
  paused_seconds_left int,
  started_by          uuid references auth.users(id),
  updated_at          timestamptz not null default now()
);

alter table public.room_sessions enable row level security;
create policy "Authenticated users can read" on public.room_sessions for select using (auth.role() = 'authenticated');
create policy "Authenticated users can write" on public.room_sessions for all using (auth.role() = 'authenticated');

-- CRITICAL: add to realtime publication
alter publication supabase_realtime add table public.room_sessions;
