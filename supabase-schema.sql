create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  nickname text not null default 'Study player',
  avatar text not null default 'adventurer-01',
  language text not null default 'fr' check (language in ('fr', 'en')),
  xp integer not null default 0 check (xp >= 0),
  streak jsonb not null default '{"count":0,"lastDate":null,"activityDates":[]}'::jsonb,
  deck_name text not null default 'Space basics',
  deck jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_progress enable row level security;

drop policy if exists "Users can read their own progress" on public.user_progress;
create policy "Users can read their own progress"
  on public.user_progress for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own progress" on public.user_progress;
create policy "Users can insert their own progress"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own progress" on public.user_progress;
create policy "Users can update their own progress"
  on public.user_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.user_progress to authenticated;

create table if not exists public.gemini_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_date)
);

alter table public.gemini_usage enable row level security;

drop policy if exists "Users can read their own Gemini usage" on public.gemini_usage;
create policy "Users can read their own Gemini usage"
  on public.gemini_usage for select
  using (auth.uid() = user_id);

grant select on public.gemini_usage to authenticated;

create or replace function public.consume_gemini_quota(p_limit integer default 10)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  resulting_count integer;
begin
  if auth.uid() is null or p_limit < 1 then
    return false;
  end if;

  insert into public.gemini_usage (user_id, usage_date, request_count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, usage_date) do update
    set request_count = public.gemini_usage.request_count + 1
    where public.gemini_usage.request_count < p_limit
  returning request_count into resulting_count;

  return resulting_count is not null;
end;
$$;

revoke execute on function public.consume_gemini_quota(integer) from public;
grant execute on function public.consume_gemini_quota(integer) to authenticated;
