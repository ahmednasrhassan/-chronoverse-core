-- Chronoverse authentication identity foundation.
-- Keep app_private out of the Supabase Data API exposed-schema list.

create schema if not exists app_private;

revoke all privileges on schema app_private from public, anon, authenticated;

create type app_private.chronoverse_role as enum ('user', 'admin', 'owner');

create table app_private.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  role app_private.chronoverse_role not null default 'user',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

alter table app_private.users enable row level security;

revoke all privileges on table app_private.users
  from public, anon, authenticated;

alter default privileges in schema app_private
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges in schema app_private
  revoke all privileges on functions from public, anon, authenticated;

comment on table app_private.users is
  'Trusted Chronoverse identity and role state; email is never an authorization key.';

create function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

revoke all privileges on function app_private.set_updated_at()
  from public, anon, authenticated;

create trigger set_chronoverse_user_updated_at
before update on app_private.users
for each row execute function app_private.set_updated_at();

create function app_private.bootstrap_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app_private.users (auth_user_id)
  values (new.id)
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

revoke all privileges on function app_private.bootstrap_auth_user()
  from public, anon, authenticated;

create trigger bootstrap_chronoverse_auth_user
after insert on auth.users
for each row execute function app_private.bootstrap_auth_user();

insert into app_private.users (auth_user_id)
select existing_auth_user.id
from auth.users as existing_auth_user
on conflict (auth_user_id) do nothing;

create function public.resolve_my_access()
returns table (
  user_id uuid,
  auth_user_id uuid,
  role text,
  access_state text,
  can_access_vip boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    chronoverse_user.id,
    chronoverse_user.auth_user_id,
    chronoverse_user.role::text,
    case chronoverse_user.role
      when 'owner' then 'owner'
      when 'admin' then 'admin'
      else 'authenticated_free'
    end,
    chronoverse_user.role in ('owner', 'admin')
  from app_private.users as chronoverse_user
  where chronoverse_user.auth_user_id = (select auth.uid())
  limit 1;
$$;

revoke all privileges on function public.resolve_my_access()
  from public, anon;
grant execute on function public.resolve_my_access() to authenticated;

comment on function public.resolve_my_access() is
  'Returns the authenticated caller identity and trusted role-derived access only.';
