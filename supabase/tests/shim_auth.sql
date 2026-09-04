-- A stand-in for the parts of Supabase that the migrations lean on, so the
-- schema and its policies can be exercised against a bare Postgres 15+ with
-- no Docker in sight. Never applied to a real project: it lives outside
-- supabase/migrations for that reason.

create extension if not exists "pgcrypto";

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- Supabase reads the JWT out of a request-local GUC. So does this.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;

-- Supabase grants table privileges to these roles as tables are created; RLS
-- is what actually decides who sees what.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
