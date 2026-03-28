-- Run in Supabase SQL Editor
-- Add sender_name column to room_messages so we don't need a join

alter table public.room_messages
  add column if not exists sender_name text not null default 'Unknown';
