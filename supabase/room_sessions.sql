-- Run in Supabase SQL Editor
-- Shared timer state per room — one active session at a time

create table if not exists public.room_sessions (
  id              uuid primary key default uuid_generate_v4(),
  room_name       text not null unique references public.rooms(name) on delete cascade,
  phase           text not null default 'focus',   -- 'focus' | 'break' | 'done' | 'idle'
  focus_minutes   int not null default 25,
  break_minutes   int not null default 5,
  end_time        timestamptz,                      -- when current phase ends (null = not started)
  started_by      uuid references auth.users(id),
  updated_at      timestamptz not null default now()
);

alter table public.room_sessions enable row level security;
create policy "Authenticated users can read room sessions" on public.room_sessions
  for select using (auth.role() = 'authenticated');
create policy "Authenticated users can upsert room sessions" on public.room_sessions
  for all using (auth.role() = 'authenticated');

alter publication supabase_realtime add table public.room_sessions;
