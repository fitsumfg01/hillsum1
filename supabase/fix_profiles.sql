-- Run this in Supabase SQL Editor
-- Fixes profile creation for Google OAuth users + makes stats saving robust

-- 1. Fix the trigger — handle Google users who have no preferred_name
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  -- Prefer preferred_name, then full_name (Google), then email prefix
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'preferred_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    split_part(new.email, '@', 1)
  );

  -- Make unique if taken by appending part of the user id
  if exists (select 1 from public.profiles where preferred_name = v_name) then
    v_name := v_name || '_' || left(new.id::text, 4);
  end if;

  insert into public.profiles (id, preferred_name)
  values (new.id, v_name)
  on conflict (id) do nothing;  -- safe re-run

  return new;
end;
$$;

-- 2. Fix upsert_daily_stats — ensure profile row exists before updating
create or replace function public.upsert_daily_stats(
  p_user_id uuid,
  p_date date,
  p_focus bigint,
  p_break bigint
) returns void language plpgsql security definer as $$
begin
  -- Upsert daily record
  insert into public.daily_stats (user_id, stat_date, focus_seconds, break_seconds)
  values (p_user_id, p_date, p_focus, p_break)
  on conflict (user_id, stat_date)
  do update set
    focus_seconds = daily_stats.focus_seconds + excluded.focus_seconds,
    break_seconds = daily_stats.break_seconds + excluded.break_seconds;

  -- Update profile totals (only if profile exists)
  update public.profiles set
    total_focus_seconds = total_focus_seconds + p_focus,
    total_break_seconds = total_break_seconds + p_break
  where id = p_user_id;
end;
$$;

-- 3. Backfill any existing auth users who don't have a profile row yet
insert into public.profiles (id, preferred_name)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'preferred_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    split_part(u.email, '@', 1)
  )
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
