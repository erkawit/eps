-- =====================================================================
--  00_auth_shim.sql — run FIRST on a new Neon database (safe to re-run)
--
--  The schema files (01, 06) were written for Supabase and use auth.users,
--  auth.uid() and the roles "authenticated" / "anon". Neon is plain
--  PostgreSQL, so this file provides small stand-ins:
--    • auth.users  — logins (email + bcrypt password hash, same format as
--                    Supabase, so migrated users keep their passwords)
--    • auth.uid()  — the signed-in user id, set by the API (api/db.js) per
--                    request with  set_config('app.user_id', '<uuid>', true)
--    • roles anon / authenticated — only so the GRANT / POLICY statements in
--      01 and 06 run unchanged (the API connects as the database owner and
--      checks permissions itself, like the PHP/MySQL version)
-- =====================================================================

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique,
  encrypted_password text not null,
  email_confirmed_at timestamptz,
  last_sign_in_at    timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

-- backup files (replaces the Supabase Storage bucket "backups")
create table if not exists public.backup_files (
  path       text primary key,                  -- e.g. 2569/10/23/backup_2569-10-23_103015_manual.json.gz
  data       bytea not null,                    -- gzip of the JSON export
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);
alter table public.backup_files enable row level security;
