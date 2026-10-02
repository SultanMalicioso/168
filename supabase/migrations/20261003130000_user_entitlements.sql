-- Plan of each user: the single source of truth for Free / Pro.
-- No row means Free. Clients can only read their own row; only the service
-- role (a future billing webhook) or an admin can write it.
create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  -- Where the plan comes from: granted by hand, project owner, or a billing provider.
  source text not null default 'manual' check (source in ('manual', 'owner', 'billing')),
  -- Null = no expiry. A billing provider sets the end of the paid period.
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_entitlements enable row level security;

revoke all on table public.user_entitlements from anon, authenticated;
grant select on table public.user_entitlements to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_entitlements'
      and policyname = 'Users read their own entitlement'
  ) then
    create policy "Users read their own entitlement"
      on public.user_entitlements for select to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;
