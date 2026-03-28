-- ============================================================
-- DROP & RECREATE rooms with correct column name
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop old tables if they exist (safe re-run)
drop table if exists public.room_messages cascade;
drop table if exists public.rooms cascade;

-- ROOMS
create table public.rooms (
  id          uuid primary key default uuid_generate_v4(),
  name        text unique not null,               -- catchy slug e.g. "focus-squad"
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  is_active   boolean not null default true
);

alter table public.rooms enable row level security;
create policy "Anyone authenticated can view rooms" on public.rooms
  for select using (auth.role() = 'authenticated');
create policy "Authenticated users can create rooms" on public.rooms
  for insert with check (auth.uid() = created_by);
create policy "Creator can update room" on public.rooms
  for update using (auth.uid() = created_by);

-- ROOM MESSAGES
create table public.room_messages (
  id         uuid primary key default uuid_generate_v4(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  content    text not null check (char_length(content) <= 500),
  created_at timestamptz not null default now()
);

alter table public.room_messages enable row level security;
create policy "Room messages viewable by authenticated" on public.room_messages
  for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert room messages" on public.room_messages
  for insert with check (auth.uid() = user_id);

-- Enable Realtime
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_messages;

-- ============================================================
-- After running this SQL, reset the schema cache:
--   Option A (easiest): Supabase Dashboard → Settings →
--     API → scroll down → click "Reload schema cache"
--   Option B: restart your Next.js dev server (npm run dev)
--     The JS client always fetches fresh schema on init.
--   Option C: in your browser, hard-refresh (Ctrl+Shift+R)
--     to clear any cached Supabase client state.
-- ============================================================
