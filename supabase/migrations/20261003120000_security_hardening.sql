-- Security hardening. Idempotent: safe to apply more than once.

-- 1. Least privilege. RLS already limits each user to their own rows; these
--    grants were broader than any client needs (anon never touches them).
revoke all on table public.user_data, public.push_subscriptions, public.push_sent,
  public.scheduler_state from anon;
revoke truncate, trigger, references on table public.user_data, public.push_subscriptions
  from authenticated;
revoke all on table public.push_sent, public.scheduler_state from authenticated;
grant select on table public.push_sent to authenticated;

-- 2. user_data: only the app's own documents (caps storage per account), and
--    enforce the earlier NOT VALID checks on every row.
alter table public.user_data validate constraint user_data_key_format;
alter table public.user_data validate constraint user_data_value_size_limit;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_data_allowed_keys') then
    alter table public.user_data add constraint user_data_allowed_keys check (
      key in ('week168.v2', 'week168.timers.v1', 'week168.history.v1', 'week168.notify.v1')
    );
  end if;
end $$;

-- 3. push_subscriptions: endpoints must belong to a real browser push service,
--    so the server can never be pointed at arbitrary URLs (SSRF).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_endpoint_allowed') then
    alter table public.push_subscriptions add constraint push_subscriptions_endpoint_allowed check (
      char_length(endpoint) <= 1000 and endpoint ~ (
        '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com'
        || '|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
      )
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_fields_format') then
    alter table public.push_subscriptions add constraint push_subscriptions_fields_format check (
      p256dh ~ '^[A-Za-z0-9_-]{87}$'
      and auth ~ '^[A-Za-z0-9_-]{16,64}$'
      and char_length(time_zone) <= 64
      and (user_agent is null or char_length(user_agent) <= 300)
    );
  end if;
end $$;

-- At most 10 devices per account (re-saving an existing endpoint is allowed).
create or replace function public.limit_push_subscriptions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.push_subscriptions where endpoint = new.endpoint) then
    return new;
  end if;
  if (select count(*) from public.push_subscriptions where user_id = new.user_id) >= 10 then
    raise exception 'Too many push subscriptions' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.limit_push_subscriptions() from public, anon, authenticated;

create or replace trigger push_subscriptions_limit
  before insert on public.push_subscriptions
  for each row execute function public.limit_push_subscriptions();

-- 4. Scheduler throttle: the push dispatcher runs at most once every 50 s no
--    matter who calls the public notify-scheduler function.
alter table public.scheduler_state add column if not exists last_tick timestamptz;

create or replace function public.claim_scheduler_tick()
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  claimed boolean;
begin
  update public.scheduler_state
     set last_tick = now()
   where id = 1
     and (last_tick is null or last_tick < now() - interval '50 seconds')
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;
revoke all on function public.claim_scheduler_tick() from public, anon, authenticated;
grant execute on function public.claim_scheduler_tick() to service_role;
