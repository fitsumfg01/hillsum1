-- Add this function in Supabase SQL Editor after running schema.sql
-- It safely increments daily stats without race conditions

create or replace function public.upsert_daily_stats(
  p_user_id uuid,
  p_date date,
  p_focus bigint,
  p_break bigint
) returns void language plpgsql security definer as $$
begin
  insert into public.daily_stats (user_id, stat_date, focus_seconds, break_seconds)
  values (p_user_id, p_date, p_focus, p_break)
  on conflict (user_id, stat_date)
  do update set
    focus_seconds = daily_stats.focus_seconds + excluded.focus_seconds,
    break_seconds = daily_stats.break_seconds + excluded.break_seconds;

  -- Also update profile totals
  update public.profiles set
    total_focus_seconds = total_focus_seconds + p_focus,
    total_break_seconds = total_break_seconds + p_break
  where id = p_user_id;
end;
$$;
