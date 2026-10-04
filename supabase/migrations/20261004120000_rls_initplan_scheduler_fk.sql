-- Idempotent: safe to run on the production database (where most of this
-- already exists) and on a fresh one.

/* ------------------------------------------------------------------ *
 * 1. RLS policies: evaluate auth.uid() once per query, not once per row.
 * ------------------------------------------------------------------ */

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_data'
             and policyname = 'Users manage their own data') then
    alter policy "Users manage their own data" on public.user_data
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions'
             and policyname = 'Users manage their own push subscriptions') then
    alter policy "Users manage their own push subscriptions" on public.push_subscriptions
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_sent'
             and policyname = 'Users read their own push ledger') then
    alter policy "Users read their own push ledger" on public.push_sent
      using ((select auth.uid()) = user_id);
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_entitlements'
             and policyname = 'Users read their own entitlement') then
    alter policy "Users read their own entitlement" on public.user_entitlements
      using ((select auth.uid()) = user_id);
  end if;
end $$;

/* ------------------------------------------------------------------ *
 * 2. Scheduler objects that existed only in the database.
 *    Definitions copied from production as of 2026-10-04.
 * ------------------------------------------------------------------ */

create table if not exists public.scheduler_state (
  id integer not null default 1,
  last_run timestamptz,
  last_tick timestamptz,
  constraint scheduler_state_pkey primary key (id),
  constraint only_one_row check (id = 1)
);
alter table public.scheduler_state add column if not exists last_tick timestamptz;
insert into public.scheduler_state (id) values (1) on conflict (id) do nothing;

alter table public.scheduler_state enable row level security;
revoke all on table public.scheduler_state from anon, authenticated;

create or replace function public.cleanup_old_push_sent()
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  delete from public.push_sent
  where sent_at < now() - interval '7 days';
end;
$function$;

create or replace function public.trigger_notification_scheduler()
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  last_run timestamp with time zone;
  now_time timestamp with time zone;
begin
  select last_run into last_run from public.scheduler_state where id = 1;
  now_time := now();

  -- Only run if 5 minutes have passed since last run
  if last_run is null or (now_time - last_run) > interval '5 minutes' then
    -- Update the last_run timestamp
    update public.scheduler_state set last_run = now_time where id = 1;

    -- Log that scheduler ran
    raise notice 'Notification scheduler triggered at %', now_time;
  end if;
end;
$function$;

revoke all on function public.cleanup_old_push_sent() from public, anon, authenticated;
revoke all on function public.trigger_notification_scheduler() from public, anon, authenticated;
grant execute on function public.cleanup_old_push_sent() to service_role;
grant execute on function public.trigger_notification_scheduler() to service_role;

/* ------------------------------------------------------------------ *
 * 3. user_data rows go away with their account.
 *    Stops (without changing anything) if orphan rows exist: production
 *    had none on 2026-10-04.
 * ------------------------------------------------------------------ */

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_data'::regclass and conname = 'user_data_user_id_fkey'
  ) then
    if exists (
      select 1 from public.user_data d
      where not exists (select 1 from auth.users u where u.id = d.user_id)
    ) then
      raise exception 'user_data has rows without a user: review them before adding the foreign key';
    end if;

    alter table public.user_data
      add constraint user_data_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end $$;
